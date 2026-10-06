"use client";

/**
 * THE KANBAN — REBUILT ON DYNAMIC BUFFER MANAGEMENT (Dr Raghu, 6 Oct 2026:
 * "Show the colours on the top. Also, the DBM has a fourth colour, too,
 * that is blue, which is generally overstocked. Go with the best practises
 * of the DBM … rebuild this from scratch so that Rameez and Mukesh can use
 * it properly to decide. Purchase can then start working on Kanban so that
 * they always maintain an MOQ and a reorder-level stock … an intelligence
 * layer, which will auto-populate the reorder level and the MOQs").
 *
 * Top: the colours, each a count and its money, clickable. Then the three
 * decisions in order — accept Genie's proposals, raise the requisition,
 * deal with the blue. Then the shelf, worst first. The rules live in
 * src/lib/kanban-dbm.ts; the page only shows them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, INK, MUTED, BORDER, NAVY, post } from "@/components/ims/ui";
import { PURCHASE_HANDS } from "@/lib/saamaan-hands";

type Zone = "black" | "red" | "yellow" | "green" | "blue" | "none";
interface Proposed { target: number | null; moq: number | null; rlt: number | null; adu: number | null; at: string; note: string; state: string }
interface Row {
  item_code: string; item_name: string; item_group: string; item_class: string; uom: string;
  target: number; moq: number; basis: string; moq_basis: string; rlt: number | null; rlt_basis: string; adu: number | null;
  on_hand: number | null; on_order: number; virtual: number | null; rate: number | null; zone: Zone; penetration: number | null; virtual_zone: Zone;
  to_order: number; to_order_value: number | null; target_value: number | null; stock_value: number | null; excess_value: number | null;
  red_days: number; green_days: number; last_change_at: string | null; dbm_note: string; note: string; proposed: Proposed | null;
}
interface ZoneSum { n: number; stock_value: number; to_order_value: number; excess_value: number }
interface Run { id: string; at: string; by: string; kind: string; items: number; black: number; red: number; yellow: number; green: number; blue: number; no_demand: number; to_order_value: number | null; note: string }
interface Pic {
  rows: Row[]; stockLive: boolean; settings: { cap: number; paranoia: number; review: number }; zones: Record<Zone, ZoneSum>;
  totals: { items: number; target_value: number; stock_value: number; to_order_value: number; on_order_value: number; excess_value: number; pending_proposals: number };
  runs: Run[];
}

const lakh = (n: number | null | undefined) => (n === null || n === undefined ? "·" : Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const qty = (n: number | null | undefined) => (n === null || n === undefined ? "·" : Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const fmtAt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "·");

/* the five DBM colours, and the items with no usage */
const Z: Record<Zone, { bg: string; fg: string; solid: string; label: string; says: string }> = {
  black: { bg: "#1F2328", fg: "#FFFFFF", solid: "#1F2328", label: "Black", says: "nothing on hand — a job may be waiting" },
  red: { bg: "#FBEAE8", fg: "#B3392E", solid: "#D64535", label: "Red", says: "under a third — expedite, order now" },
  yellow: { bg: "#FFF5DB", fg: "#8A5B00", solid: "#E8B020", label: "Yellow", says: "a third to two-thirds — order in the normal run" },
  green: { bg: "#E6F4EA", fg: "#0D7A3F", solid: "#2E9E5B", label: "Green", says: "two-thirds to full — leave it" },
  blue: { bg: "#E3EEFB", fg: "#1D4E89", solid: "#3478C6", label: "Blue", says: "over the target — overstocked, stop buying" },
  none: { bg: "#F2F2EE", fg: "#7A7A72", solid: "#C9C7BF", label: "No usage", says: "nothing used in six months — no target" },
};
const ORDER: Zone[] = ["black", "red", "yellow", "green", "blue", "none"];

function Chip({ z, pen }: { z: Zone; pen?: number | null }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap" style={{ background: Z[z].bg, color: Z[z].fg }}>
      {Z[z].label}{pen !== null && pen !== undefined && z !== "none" ? ` ${Math.round(100 - pen)}%` : ""}
    </span>
  );
}

/** How full the target is, as a bar cut in thirds — the DBM picture of one item. */
function Fill({ r }: { r: Row }) {
  if (r.target <= 0 || r.on_hand === null) return <span style={{ color: MUTED }}>·</span>;
  const full = Math.max(0, r.on_hand / r.target);
  const v = Math.max(0, (r.virtual ?? r.on_hand) / r.target);
  const w = 90;
  return (
    <div title={`in hand ${qty(r.on_hand)} of ${qty(r.target)} (${Math.round(full * 100)}%) · with what is on order ${Math.round(v * 100)}%`} style={{ width: w, height: 10, position: "relative", borderRadius: 3, overflow: "hidden", background: "#EEE" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        <div style={{ flex: 1, background: "#F6D5D1" }} /><div style={{ flex: 1, background: "#FBECC2" }} /><div style={{ flex: 1, background: "#D3EBDB" }} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(1, v) * 100}%`, borderRight: "2px dashed #555" }} />
      <div style={{ position: "absolute", left: 0, top: 3, bottom: 3, width: `${Math.min(1, full) * 100}%`, background: Z[r.zone].solid }} />
    </div>
  );
}

export default function Kanban() {
  const [pic, setPic] = useState<Pic | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [zone, setZone] = useState<Zone | "" | "proposals" | "order">("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const r = await fetch("/api/saamaan/kanban", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `The server answered ${r.status}.`); return; }
    setPic(j);
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
  const propose = async () => {
    const r = await act({ action: "propose" }, "propose");
    if (r) setMsg(`Genie read the ERP for ${r.items} items: ${r.withTarget} with usage get a target, the rest used nothing in six months. ${r.pending} proposal${r.pending === 1 ? "" : "s"} differ from today — look them over, then accept.`);
  };
  const acceptAll = async () => {
    if (!pic) return;
    if (!window.confirm(`Accept Genie's ${pic.totals.pending_proposals} pending proposal${pic.totals.pending_proposals === 1 ? "" : "s"}? Targets and MOQs anyone has TYPED are kept. Every change is logged.`)) return;
    const r = await act({ action: "accept" }, "accept");
    if (r) setMsg(`${r.accepted} proposal${r.accepted === 1 ? "" : "s"} accepted.`);
  };
  const acceptOne = async (row: Row) => { const r = await act({ action: "accept", codes: [row.item_code] }, row.item_code); if (r) setMsg(`${row.item_code}: Genie's target and MOQ taken.`); };
  const dbm = async () => {
    const r = await act({ action: "dbm" }, "dbm");
    if (r) setMsg(`Today's DBM step read ${r.items} items: ${r.black} black · ${r.red} red · ${r.yellow} yellow · ${r.green} green · ${r.blue} blue · ${r.none} no usage. ${r.moved} target${r.moved === 1 ? "" : "s"} moved by the rule. (It also runs by itself every morning at 6:30.)`);
  };
  const seed = async () => {
    if (!window.confirm("Bring every class C item in the mirror onto the Kanban? Items already on it are left as they are; new ones get a target once Genie proposes and it is accepted.")) return;
    const r = await act({ action: "seed" }, "seed");
    if (r) setMsg(`${r.added} item${r.added === 1 ? "" : "s"} added · ${r.had} already on the Kanban.`);
  };
  const requisition = async (yellow: boolean) => {
    if (!to) { setMsg("Say who the requisition goes to."); return; }
    const r = await act({ action: "requisition", to_email: to, yellow }, "req");
    if (r) { const s = r.slip as { slip_no: string }; setMsg(`${s.slip_no} raised to ${to.split("@")[0]} — ${r.lines} line${r.lines === 1 ? "" : "s"} in whole MOQs, ${lakh(r.value as number)}. See Issue slips.`); }
  };
  const setField = async (row: Row, k: "target" | "moq", v: string) => {
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n)) return;
    if ((k === "target" ? row.target : row.moq) === n) return;
    await act({ action: "set", item_code: row.item_code, [k]: n, why: "typed on the Kanban" }, row.item_code);
  };
  const saveSetting = async (k: "cap" | "paranoia" | "review", v: string) => { const n = Number(v.replace(/,/g, "")); if (Number.isFinite(n)) await act({ action: "settings", [k]: n }, k); };

  const rows = useMemo(() => {
    const all = pic?.rows ?? [];
    const needle = q.trim().toLowerCase();
    let f = all;
    if (zone === "proposals") f = all.filter((r) => r.proposed?.state === "pending");
    else if (zone === "order") f = all.filter((r) => r.to_order > 0);
    else if (zone) f = all.filter((r) => r.zone === zone);
    if (needle) f = f.filter((r) => `${r.item_code} ${r.item_name} ${r.item_group}`.toLowerCase().includes(needle));
    /* worst first: black, red, yellow… and inside a colour the deepest into its target */
    const rank = Object.fromEntries(ORDER.map((z, i) => [z, i])) as Record<Zone, number>;
    return [...f].sort((a, b) => rank[a.zone] - rank[b.zone] || (b.penetration ?? -999) - (a.penetration ?? -999) || (b.to_order_value ?? 0) - (a.to_order_value ?? 0));
  }, [pic, zone, q]);

  const t = pic?.totals;
  const zs = pic?.zones;
  const total = pic?.rows.length || 1;
  const orderable = pic ? pic.rows.filter((r) => r.to_order > 0 && (r.zone === "black" || r.zone === "red")) : [];
  const orderableY = pic ? pic.rows.filter((r) => r.to_order > 0 && r.zone === "yellow") : [];
  const overCap = !!(t && pic && t.target_value > pic.settings.cap);

  return (
    <Screen title="Kanban — reorder levels on dynamic buffer management"
      blurb="Every class C item holds a target — the most it can need between ordering and receiving. The colour says where the stock in hand sits against it; what is already on order is counted before anything more is bought, in whole MOQs. Each morning the zones are recorded and the targets move themselves: up a third after a lead time of red, down a third after three lead times of green."
      action={<>
        <Btn onClick={seed} disabled={!!busy} title="Every class C item in the mirror, onto the Kanban">{busy === "seed" ? "Seeding…" : "+ Seed class C"}</Btn>
        <Btn onClick={dbm} disabled={!!busy || !pic?.rows.length} title="Record today's zones and let the rule move the targets — it runs by itself every morning">{busy === "dbm" ? "Reading…" : "↻ Today's DBM"}</Btn>
        <Btn kind="primary" onClick={propose} disabled={!!busy || !pic?.rows.length} title="Genie reads usage, lead times and order sizes off the ERP and proposes every target and MOQ">{busy === "propose" ? "Genie is reading the ERP…" : "✨ Genie proposes"}</Btn>
      </>}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="info">{msg}</Note>}
      {pic && !pic.stockLive && <Note kind="warn">The ERP could not be read just now — stock shows as it was at the last DBM step.</Note>}

      {/* ---- THE COLOURS, ON TOP ---- */}
      {zs && (
        <>
          <div className="flex rounded overflow-hidden mb-2" style={{ height: 14 }} title="the whole Kanban, by colour">
            {ORDER.map((z) => zs[z].n ? <div key={z} style={{ width: `${(zs[z].n / total) * 100}%`, background: Z[z].solid }} title={`${Z[z].label}: ${zs[z].n}`} /> : null)}
          </div>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {ORDER.map((z) => {
              const s = zs[z];
              const on = zone === z;
              const money = z === "blue" ? `${lakh(s.excess_value)} over target` : z === "none" ? `${lakh(s.stock_value)} on the shelf` : z === "green" ? `${lakh(s.stock_value)} on the shelf` : `${lakh(s.to_order_value)} to order`;
              return (
                <button key={z} onClick={() => setZone(on ? "" : z)} className="text-left rounded-lg border p-2.5"
                  style={{ background: Z[z].bg, borderColor: on ? Z[z].solid : BORDER, borderWidth: on ? 2 : 1 }}>
                  <div className="text-xs font-bold uppercase" style={{ color: Z[z].fg, letterSpacing: 0.6 }}>{Z[z].label}</div>
                  <div className="tnum" style={{ color: Z[z].fg, fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{s.n.toLocaleString("en-IN")}</div>
                  <div className="text-xs font-bold tnum" style={{ color: Z[z].fg }}>{money}</div>
                  <div className="text-xs mt-0.5" style={{ color: z === "black" ? "#C9CDD2" : MUTED, lineHeight: 1.3 }}>{Z[z].says}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {t && pic && (
        <div className="flex gap-4 flex-wrap text-xs mb-3" style={{ color: MUTED }}>
          <span>{t.items.toLocaleString("en-IN")} items</span>
          <span>targets worth <b style={{ color: overCap ? "#B3392E" : INK }}>{lakh(t.target_value)}</b> of a cap of {lakh(pic.settings.cap)}{overCap ? " — OVER" : ""}</span>
          <span>in hand <b style={{ color: INK }}>{lakh(t.stock_value)}</b></span>
          <span>on order <b style={{ color: INK }}>{lakh(t.on_order_value)}</b></span>
          <span>to order <b style={{ color: INK }}>{lakh(t.to_order_value)}</b></span>
          <span>overstock <b style={{ color: Z.blue.fg }}>{lakh(t.excess_value)}</b></span>
        </div>
      )}

      {/* ---- THE THREE DECISIONS ---- */}
      {pic && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
            <div className="text-sm font-bold" style={{ color: INK }}>1 · Genie&apos;s proposals</div>
            <div className="text-xs mb-2" style={{ color: MUTED }}>{t?.pending_proposals ? `${t.pending_proposals} target${t.pending_proposals === 1 ? "" : "s"} and MOQ${t.pending_proposals === 1 ? "" : "s"} waiting — read off six months of usage and a year of buying.` : "Nothing waiting. Press ✨ Genie proposes to read the ERP again — weekly is a good habit."}</div>
            <div className="flex gap-2 flex-wrap">
              <Btn onClick={() => setZone("proposals")} disabled={!t?.pending_proposals}>See them</Btn>
              <Btn kind="primary" onClick={acceptAll} disabled={!!busy || !t?.pending_proposals}>{busy === "accept" ? "Accepting…" : "Accept all"}</Btn>
              <Btn onClick={async () => { if (window.confirm("Set aside every pending proposal?")) { const r = await act({ action: "dismiss" }, "dismiss"); if (r) setMsg(`${r.dismissed} set aside.`); } }} disabled={!!busy || !t?.pending_proposals}>Set aside</Btn>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
            <div className="text-sm font-bold" style={{ color: INK }}>2 · The requisition</div>
            <div className="text-xs mb-2" style={{ color: MUTED }}>{orderable.length} black and red to order ({lakh(orderable.reduce((a, r) => a + (r.to_order_value ?? 0), 0))}){orderableY.length ? `, ${orderableY.length} yellow (${lakh(orderableY.reduce((a, r) => a + (r.to_order_value ?? 0), 0))})` : ""} — back to target, in whole MOQs, after what is on order.</div>
            <div className="flex gap-2 flex-wrap items-center">
              <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-1.5 py-1 text-sm bg-white" style={{ borderColor: BORDER }}>
                <option value="">to whom?</option>{PURCHASE_HANDS.map((h) => <option key={h.email} value={h.email}>{h.name}</option>)}
              </select>
              <Btn kind="primary" onClick={() => requisition(false)} disabled={!!busy || !to || !orderable.length}>Black + red →</Btn>
              <Btn onClick={() => requisition(true)} disabled={!!busy || !to || !(orderable.length + orderableY.length)}>+ yellow →</Btn>
              <Btn onClick={() => setZone("order")}>See the list</Btn>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
            <div className="text-sm font-bold" style={{ color: INK }}>3 · The blue</div>
            <div className="text-xs mb-2" style={{ color: MUTED }}>{zs?.blue.n ?? 0} items hold more than their target — {lakh(zs?.blue.excess_value ?? 0)} over. Stop ordering them, use them first, or move them to a job.</div>
            <Btn onClick={() => setZone("blue")} disabled={!zs?.blue.n}>See the blue</Btn>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        {zone && <button onClick={() => setZone("")} className="rounded px-2 py-1 font-bold" style={{ background: NAVY, color: "#fff" }}>{zone === "proposals" ? "Proposals waiting" : zone === "order" ? "To order" : Z[zone].label} ✕</button>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 item, code or group" className="rounded border px-2 py-1.5 bg-white" style={{ borderColor: BORDER, minWidth: 220 }} />
        <span className="ml-auto flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>
          safety ×<input defaultValue={pic?.settings.paranoia ?? 1.5} key={`p${pic?.settings.paranoia}`} onBlur={(e) => saveSetting("paranoia", e.target.value)} className="rounded border px-1 py-0.5 tnum text-right" style={{ borderColor: BORDER, width: 40 }} title="how much more than the average a target holds — 1.5 is the usual" />
          · review <input defaultValue={pic?.settings.review ?? 7} key={`r${pic?.settings.review}`} onBlur={(e) => saveSetting("review", e.target.value)} className="rounded border px-1 py-0.5 tnum text-right" style={{ borderColor: BORDER, width: 36 }} title="days between purchase looking at the Kanban" /> days
          · cap <input defaultValue={pic?.settings.cap ?? 10000000} key={`c${pic?.settings.cap}`} onBlur={(e) => saveSetting("cap", e.target.value)} className="rounded border px-1 py-0.5 tnum text-right" style={{ borderColor: BORDER, width: 96 }} title="the most every target together may be worth" />
        </span>
      </div>

      <GenieTable<Row> rows={pic ? rows : null} minWidth={1600} maxHeight="70vh" empty={zone ? "Nothing in this view." : "Nothing on the Kanban yet — seed the class C items."}
        columns={[
          { key: "z", label: "Colour", align: "left", sort: (r) => ORDER.indexOf(r.zone), render: (r) => <Chip z={r.zone} pen={r.penetration} /> },
          { key: "c", label: "Code", align: "left", sort: (r) => r.item_code, render: (r) => <b style={{ color: NAVY }}>{r.item_code}</b> },
          { key: "n", label: "Item", align: "left", sort: (r) => r.item_name, render: (r) => <span style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 260 }}>{r.item_name}<div className="text-xs" style={{ color: MUTED }}>{r.item_group.replace(/^RM - /, "")}</div></span> },
          { key: "f", label: "Buffer", align: "left", render: (r) => <Fill r={r} /> },
          { key: "h", label: "In hand", align: "right", sort: (r) => r.on_hand ?? -1, render: (r) => <b className="tnum">{qty(r.on_hand)} <span style={{ color: MUTED, fontWeight: 400 }}>{r.uom}</span></b> },
          { key: "o", label: "On order", align: "right", sort: (r) => r.on_order, render: (r) => <span className="tnum" style={{ color: r.on_order ? INK : MUTED }}>{qty(r.on_order)}</span> },
          { key: "t", label: "Target (reorder level)", align: "right", sort: (r) => r.target, render: (r) => (
              <span className="inline-flex items-center gap-1">
                <input defaultValue={r.target || ""} key={`t${r.item_code}${r.target}`} onBlur={(e) => setField(r, "target", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="rounded border px-1.5 py-0.5 tnum text-right" style={{ borderColor: r.basis === "typed" ? NAVY : BORDER, width: 70 }} placeholder="·" />
                {r.basis === "typed" && <span title="typed by hand — the rule never moves it" style={{ color: NAVY }}>✎</span>}
              </span>) },
          { key: "m", label: "MOQ", align: "right", sort: (r) => r.moq, render: (r) => (
              <input defaultValue={r.moq || ""} key={`m${r.item_code}${r.moq}`} onBlur={(e) => setField(r, "moq", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="rounded border px-1.5 py-0.5 tnum text-right" style={{ borderColor: r.moq_basis === "typed" ? NAVY : BORDER, width: 64 }} placeholder="·" title={r.moq_basis === "typed" ? "typed by hand" : r.moq_basis === "proposed" ? "from Genie's proposal" : "no MOQ — ordered back to target exactly"} />) },
          { key: "q", label: "To order", align: "right", sort: (r) => r.to_order_value ?? r.to_order, render: (r) => r.to_order ? <span className="tnum"><b>{qty(r.to_order)}</b><div className="text-xs" style={{ color: MUTED }}>{lakh(r.to_order_value)}</div></span> : <span style={{ color: MUTED }}>·</span> },
          { key: "u", label: "Usage /month", align: "right", sort: (r) => r.adu ?? -1, render: (r) => <span className="tnum">{r.adu === null ? "·" : qty(Math.round(r.adu * 30.4 * 10) / 10)}</span> },
          { key: "l", label: "Lead days", align: "right", sort: (r) => r.rlt ?? -1, render: (r) => <span className="tnum" title={r.rlt_basis ? `from ${r.rlt_basis}` : ""}>{r.rlt === null ? "·" : r.rlt}</span> },
          { key: "p", label: "Genie proposes", align: "left", sort: (r) => (r.proposed?.state === "pending" ? 0 : 1), render: (r) => {
              const p = r.proposed;
              if (!p) return <span style={{ color: MUTED }}>·</span>;
              const differs = p.state === "pending";
              return (
                <span className="inline-flex items-center gap-1.5" title={p.note}>
                  <span className="tnum text-xs" style={{ color: differs ? INK : MUTED }}>target <b>{qty(p.target)}</b> · MOQ <b>{p.moq ? qty(p.moq) : "·"}</b></span>
                  {differs && <button onClick={() => acceptOne(r)} disabled={!!busy} className="rounded px-1.5 text-xs font-bold" style={{ background: "#0D7A3F", color: "#fff" }} title="take Genie's target and MOQ for this item">✓</button>}
                  {p.state === "accepted" && <span className="text-xs" style={{ color: "#0D7A3F" }}>taken</span>}
                  {p.state === "dismissed" && <span className="text-xs" style={{ color: MUTED }}>set aside</span>}
                </span>
              );
            } },
          { key: "d", label: "DBM says", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED, whiteSpace: "normal", display: "inline-block", maxWidth: 320 }}>{r.dbm_note || "·"}</span> },
        ]} />

      {pic && pic.runs.length > 0 && (
        <div className="bg-white rounded-lg border p-3 mt-3 text-xs" style={{ borderColor: BORDER }}>
          <div className="font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>On record, newest first</div>
          {pic.runs.map((r) => (
            <div key={r.id} style={{ color: INK, lineHeight: 1.7 }}>
              {fmtAt(r.at)} · <b>{r.by.split("@")[0]}</b> · {r.kind === "propose" ? "Genie proposed" : r.kind === "daily" ? "morning DBM" : "DBM"} ·{" "}
              {r.kind !== "propose" && <>{ORDER.map((z) => { const n = z === "none" ? r.no_demand : (r as unknown as Record<string, number>)[z]; return n ? <span key={z} style={{ color: Z[z].fg, fontWeight: 700 }}>{n} {Z[z].label.toLowerCase()} </span> : null; })}· to order {lakh(r.to_order_value)} · </>}
              <span style={{ color: MUTED }}>{r.note}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs mt-3" style={{ color: MUTED, lineHeight: 1.7, maxWidth: 1000 }}>
        <b style={{ color: INK }}>How it works.</b> The target is usage per day × (lead time + the review gap) × the safety factor. Lead time is the item&apos;s own PO-to-GRN days over the last year, else its group&apos;s; usage is six months of the ERP&apos;s stock ledger; the MOQ is the quantity purchase usually orders it in.
        The colour is the stock in hand against the target. An order is suggested once in hand plus on order falls under two-thirds of the target, back up to it in whole MOQs. Every morning the zone is written down: a lead time&apos;s worth of red or black days grows the target by a third, three lead times of green or blue shrinks it by a third, and after any move it is left alone for one lead time.
        A target or MOQ you type (✎) is never moved by the rule or by Genie. The BOM still covers a job&apos;s big draws on its MRP run; the Kanban keeps what must always be on the shelf.
      </div>
    </Screen>
  );
}
