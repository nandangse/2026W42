"use client";

/**
 * MRP AS PER REORDER LEVEL — THE KANBAN (Dr Raghu, 3 Oct 2026).
 *
 * The class C shelf: bolts, nuts, small sections, the things a job should
 * never wait for. Each has a buffer (its reorder level); stock below a third
 * of it is red, below two-thirds yellow, above green. One button reads six
 * months of consumption off the ERP's stock ledger and sets the buffers
 * (dynamic buffer management — see the route); one raises the purchase
 * requisition for everything red, to one of the purchase hands. A cap on
 * the whole shelf's value is kept beside the total, so the Kanban never
 * quietly becomes a warehouse.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, INK, MUTED, BORDER, GREEN, AMBER, RED, NAVY, post } from "@/components/ims/ui";
import { PURCHASE_HANDS } from "@/lib/saamaan-hands";

interface Row {
  item_code: string; item_name: string; item_group: string; item_class: string; uom: string; lead_days: number | null; erp_reorder: number;
  buffer: number; reorder: number; basis: string; consumption_6m: number | null; monthly_avg: number | null; months_seen: number | null;
  stock: number | null; ordered: number | null; rate: number | null; zone: "red" | "yellow" | "green" | ""; to_order: number; to_order_value: number | null; buffer_value: number | null; stock_value: number | null;
  dbm_at: string | null; dbm_note: string; note: string; red_runs: number; green_runs: number; updated_by: string;
}
interface Run { id: string; at: string; by: string; items: number; red: number; yellow: number; green: number; buffer_value: number | null; stock_value: number | null; to_order_value: number | null; note: string }
interface Pic { rows: Row[]; stockLive: boolean; cap: number; totals: { items: number; red: number; yellow: number; green: number; unread: number; buffer_value: number; stock_value: number; to_order_value: number }; runs: Run[] }

const rupee = (n: number | null | undefined) => (n === null || n === undefined ? "·" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const lakh = (n: number | null | undefined) => (n === null || n === undefined ? "·" : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(2)} L`);
const qty = (n: number | null | undefined) => (n === null || n === undefined ? "·" : Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(1));
const fmtAt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "·");
const ZONE: Record<string, { bg: string; fg: string; label: string }> = {
  red: { bg: "#FBEAE8", fg: "#B3392E", label: "RED · order" },
  yellow: { bg: "#FFF3E8", fg: "#8A5B00", label: "yellow · watch" },
  green: { bg: "#E6F4EA", fg: "#0D7A3F", label: "green" },
  "": { bg: "#F2F2EE", fg: "#8A8A8A", label: "not read" },
};

export default function Kanban() {
  const [pic, setPic] = useState<Pic | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [zone, setZone] = useState<"" | "red" | "yellow" | "green" | "unread">("");
  const [to, setTo] = useState("");
  const [capBox, setCapBox] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const r = await fetch("/api/saamaan/kanban", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `The server answered ${r.status}.`); setPic(null); return; }
    setPic(j); setCapBox(String(j.cap || ""));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label); setMsg("");
    const r = await post("/api/saamaan/kanban", body);
    setBusy("");
    if (!r.ok) { setMsg(r.error || "Could not."); return null; }
    await load();
    return r;
  };
  const seed = async () => {
    if (!window.confirm("Bring every class C item in the mirror onto the Kanban? Items already on it are left as they are; the ERP's own reorder level is the first buffer where there is one.")) return;
    const r = await act({ action: "seed" }, "seed");
    if (r) setMsg(`${r.added} item${r.added === 1 ? "" : "s"} added · ${r.had} already on the Kanban · ${r.classC} class C in the mirror.`);
  };
  const dbm = async () => {
    const note = window.prompt("Run DBM — reads six months of consumption and today's stock off the ERP, sets the untyped buffers and moves the ones the rule says to. Why this run? (one line, kept on record)", "scheduled review");
    if (note === null) return;
    const r = await act({ action: "dbm", note }, "dbm");
    if (r) setMsg(`DBM ran on ${r.items} items: ${r.red} red · ${r.yellow} yellow · ${r.green} green — ${r.firstSet} first buffers set, ${r.grown} grown, ${r.shrunk} shrunk.`);
  };
  const requisition = async (yellow: boolean) => {
    if (!to) { setMsg("Say who the requisition goes to."); return; }
    const r = await act({ action: "requisition", to_email: to, yellow }, "req");
    if (r) { const s = r.slip as { slip_no: string }; setMsg(`${s.slip_no} raised to ${to.split("@")[0]} — ${r.lines} line${r.lines === 1 ? "" : "s"}, ${rupee(r.value as number)}. See Issue slips.`); }
  };
  const setField = async (row: Row, k: "buffer_qty" | "reorder_qty" | "note", v: string) => {
    const body: Record<string, unknown> = { action: "set", item_code: row.item_code };
    body[k] = k === "note" ? v : Number(v.replace(/,/g, "")) || 0;
    if (k === "buffer_qty") body.why = "typed on the Kanban";
    await act(body, row.item_code);
  };
  const saveCap = async () => { const r = await act({ action: "cap", value: Number(capBox.replace(/,/g, "")) || 0 }, "cap"); if (r) setMsg(`Cap kept at ${lakh(r.cap as number)}.`); };

  const rows = useMemo(() => {
    const all = pic?.rows ?? [];
    const f = zone === "" ? all : zone === "unread" ? all.filter((r) => !r.zone) : all.filter((r) => r.zone === zone);
    const rank = { red: 0, yellow: 1, green: 2, "": 3 };
    return [...f].sort((a, b) => rank[a.zone] - rank[b.zone] || (b.to_order_value ?? 0) - (a.to_order_value ?? 0) || a.item_code.localeCompare(b.item_code));
  }, [pic, zone]);
  const t = pic?.totals;
  const overCap = !!(t && pic && t.buffer_value > pic.cap);
  const hands = PURCHASE_HANDS;

  return (
    <Screen title="MRP as per reorder level — Kanban" blurb="The class C shelf: bolts, nuts, small sections — what a job should never wait for. Every item has a buffer (its reorder level); below a third of it is red and goes on a requisition, below two-thirds is yellow. DBM reads six months of consumption off the ERP and sets the buffers; it gets better each run."
      action={<>
        <Btn onClick={seed} disabled={!!busy} title="Every class C item in the mirror, onto the Kanban">{busy === "seed" ? "Seeding…" : "+ Seed class C items"}</Btn>
        <Btn kind="primary" onClick={dbm} disabled={!!busy || !pic?.rows.length} title="Six months of consumption from the ERP's stock ledger, today's stock from Bin — the buffers follow">{busy === "dbm" ? "Reading the ERP…" : "▶ Run DBM"}</Btn>
      </>}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="warn">{msg}</Note>}
      {pic && !pic.stockLive && <Note kind="warn">The ERP could not be read just now — stock shows as it was at the last DBM run.</Note>}

      {t && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[
            ["ON THE KANBAN", `${t.items}`, `${t.unread} not read yet`, INK],
            ["RED — ORDER NOW", `${t.red}`, lakh(t.to_order_value) + " to order", t.red ? "#B3392E" : MUTED],
            ["YELLOW — WATCH", `${t.yellow}`, "between a third and two-thirds", t.yellow ? "#8A5B00" : MUTED],
            ["GREEN", `${t.green}`, "above two-thirds of the buffer", GREEN],
            ["BUFFER VALUE", lakh(t.buffer_value), `cap ${lakh(pic!.cap)}${overCap ? " — OVER" : ""}`, overCap ? "#B3392E" : INK],
            ["STOCK VALUE", lakh(t.stock_value), "class C on the shelf today", INK],
          ].map(([l, v, s, c]) => (
            <div key={l} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{l}</div>
              <div className="text-xl font-bold tnum" style={{ color: c }}>{v}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>{s}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        <select value={zone} onChange={(e) => setZone(e.target.value as typeof zone)} className="rounded border px-2 py-1.5 bg-white" style={{ borderColor: BORDER }}>
          <option value="">every zone</option><option value="red">red only</option><option value="yellow">yellow only</option><option value="green">green only</option><option value="unread">not read yet</option>
        </select>
        <span className="ml-auto flex items-center gap-1 flex-wrap">
          <span style={{ color: MUTED }}>cap</span>
          <input value={capBox} onChange={(e) => setCapBox(e.target.value)} onBlur={saveCap} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="rounded border px-1.5 py-1 tnum text-right" style={{ borderColor: BORDER, width: 110 }} title="the most the whole Kanban's buffers may be worth — ₹1 Cr to begin with" />
          <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-1.5 py-1 bg-white" style={{ borderColor: BORDER }} title="purchase — Mukesh, Pradip, Akshay or Shailaja">
            <option value="">requisition → who?</option>
            {hands.map((h) => <option key={h.email} value={h.email}>{h.name}</option>)}
          </select>
          <Btn kind="primary" onClick={() => requisition(false)} disabled={!!busy || !to || !t?.red} title="One purchase requisition for every red item's to-order quantity">Requisition · red →</Btn>
          <Btn onClick={() => requisition(true)} disabled={!!busy || !to || !(t && (t.red + t.yellow))} title="Red and yellow both">red + yellow →</Btn>
        </span>
      </div>

      <GenieTable<Row>
        rows={rows}
        minWidth={1400}
        maxHeight="62vh"
        search={(r, q) => `${r.item_code} ${r.item_name} ${r.item_group}`.toLowerCase().includes(q)}
        searchPlaceholder="🔍 code, name, group"
        empty={pic?.rows.length ? "Nothing in this zone." : "Nothing on the Kanban yet — seed the class C items, then run DBM."}
        columns={[
          { key: "zone", label: "Zone", align: "left", sort: (r) => ({ red: 0, yellow: 1, green: 2, "": 3 })[r.zone], render: (r) => <span className="rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap" style={{ background: ZONE[r.zone].bg, color: ZONE[r.zone].fg }}>{ZONE[r.zone].label}</span> },
          { key: "code", label: "Code", align: "left", sort: (r) => r.item_code, render: (r) => <a href={`/saamaan/items?item=${encodeURIComponent(r.item_code)}`} className="font-bold hover:underline" style={{ color: NAVY }}>{r.item_code}</a> },
          { key: "name", label: "Item", align: "left", sort: (r) => r.item_name, render: (r) => <span style={{ whiteSpace: "normal" }}>{r.item_name}<div className="text-xs" style={{ color: MUTED }}>{r.item_group}{r.item_class ? ` · class ${r.item_class}` : ""}</div></span> },
          { key: "stock", label: "Stock", align: "right", sort: (r) => r.stock ?? -1, render: (r) => <span className="tnum font-bold" style={{ color: r.zone === "red" ? "#B3392E" : INK }}>{qty(r.stock)} <span style={{ color: MUTED, fontWeight: 400 }}>{r.uom}</span></span> },
          { key: "ordered", label: "On order", align: "right", sort: (r) => r.ordered ?? -1, render: (r) => <span className="tnum" style={{ color: r.ordered ? INK : MUTED }}>{qty(r.ordered)}</span> },
          { key: "buffer", label: "Buffer (reorder level)", align: "right", sort: (r) => r.buffer, render: (r) => (
            <span className="flex items-center justify-end gap-1">
              <input defaultValue={r.buffer || ""} key={`${r.item_code}|${r.buffer}`} inputMode="decimal" placeholder="·"
                onBlur={(e) => { const v = e.target.value.trim(); if ((Number(v) || 0) !== r.buffer) void setField(r, "buffer_qty", v); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="rounded border px-1 py-0.5 text-xs tnum text-right" style={{ width: 64, borderColor: r.basis === "typed" ? AMBER : BORDER }}
                title={r.basis === "typed" ? "typed by hand — DBM will not move it" : r.basis === "consumption" ? "set by DBM from consumption — type to override" : r.basis === "erp" ? "the ERP's own reorder level — DBM will set it from consumption" : "not set yet — run DBM, or type"} />
              <span className="text-xs" style={{ color: MUTED, width: 14 }}>{r.basis === "typed" ? "✎" : r.basis === "consumption" ? "⟳" : r.basis === "erp" ? "E" : ""}</span>
            </span>
          ) },
          { key: "reorder", label: "Reorder qty", align: "right", sort: (r) => r.reorder, render: (r) => (
            <input defaultValue={r.reorder || ""} key={`${r.item_code}|rq|${r.reorder}`} inputMode="decimal" placeholder="to buffer"
              onBlur={(e) => { const v = e.target.value.trim(); if ((Number(v) || 0) !== r.reorder) void setField(r, "reorder_qty", v); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="rounded border px-1 py-0.5 text-xs tnum text-right" style={{ width: 64, borderColor: BORDER }} title="what to order when red — blank means back up to the buffer" />
          ) },
          { key: "cons", label: "6-mo consumption", align: "right", sort: (r) => r.consumption_6m ?? -1, render: (r) => <span className="tnum" style={{ color: r.consumption_6m ? INK : MUTED }}>{qty(r.consumption_6m)}{r.monthly_avg != null ? <span style={{ color: MUTED }}> · {qty(r.monthly_avg)}/mo{r.months_seen && r.months_seen < 6 ? ` (${r.months_seen} mo)` : ""}</span> : null}</span> },
          { key: "toorder", label: "To order", align: "right", sort: (r) => r.to_order, render: (r) => <span className="tnum font-bold" style={{ color: r.to_order ? "#B3392E" : MUTED }}>{r.to_order ? qty(r.to_order) : "·"}</span> },
          { key: "rate", label: "Rate", align: "right", sort: (r) => r.rate ?? -1, render: (r) => <span className="tnum" style={{ color: MUTED }}>{rupee(r.rate)}</span> },
          { key: "bval", label: "Buffer value", align: "right", sort: (r) => r.buffer_value ?? -1, render: (r) => <span className="tnum">{rupee(r.buffer_value)}</span> },
          { key: "note", label: "DBM says", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED, whiteSpace: "normal", maxWidth: 320, display: "inline-block" }}>{r.dbm_note || (r.erp_reorder ? `ERP reorder level ${r.erp_reorder}` : "·")}{r.dbm_at ? <span> · {fmtAt(r.dbm_at)}</span> : null}</span> },
          { key: "x", label: "", align: "right", render: (r) => <button onClick={() => { if (window.confirm(`Take ${r.item_code} off the Kanban?`)) void act({ action: "remove", item_code: r.item_code }, "rm"); }} className="text-xs" style={{ color: MUTED }} title="off the Kanban — the item stays in the master">×</button> },
        ]}
      />

      {!!pic?.runs.length && (
        <div className="mt-3 rounded-lg border p-2" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>DBM runs — on record, newest first</div>
          {pic.runs.map((x) => (
            <div key={x.id} className="text-xs py-0.5" style={{ color: MUTED }}>
              <span className="tnum" style={{ color: INK }}>{fmtAt(x.at)}</span> · <b style={{ color: INK }}>{x.by.split("@")[0]}</b> · {x.items} items — <span style={{ color: "#B3392E" }}>{x.red} red</span>, <span style={{ color: "#8A5B00" }}>{x.yellow} yellow</span>, <span style={{ color: GREEN }}>{x.green} green</span> · buffers {lakh(x.buffer_value)} · to order {lakh(x.to_order_value)}{x.note ? <> — <i>{x.note}</i></> : null}
            </div>
          ))}
        </div>
      )}
      <div className="text-xs mt-3" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 900 }}>
        <b>How the buffer moves.</b> The first buffer is one month&apos;s consumption, or the ERP&apos;s own reorder level if larger. After that, dynamic buffer management: an item red for two runs running was buffered too small and grows by a third; one green for three runs with nothing on order was buffered too large and shrinks by a third, never below half a month&apos;s consumption. A buffer you type (✎) is never moved by the rule — the rule&apos;s own number is written beside it. The BOM still wins for the big draws: a job needing 2,000 bolts shows short on its MRP run as before; the Kanban is for the 200 that must always be on the shelf. Run DBM monthly and it gets better each time.
      </div>
    </Screen>
  );
}
