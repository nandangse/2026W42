"use client";

/**
 * SAAMAAN → INVENTORY (Dr Raghu, 6 Oct 2026). Internal to Saamaan.
 *
 *   "I need to create a module called Inventory, with the following
 *    sub-modules: Items, Warehouses, Stock Reconciliation ... one for By Item
 *    Group and one for Random PI ... put a suspense entry ... put a Genie
 *    suggestion ... for Rameez's account ... consult Genie ... in real time."
 *   "when it is clicked, it should, by default, show the RM stock as of
 *    today, the WIP stock as of today, the total inventory up to now ...
 *    also show stock class A, class B, and class C."
 *
 * The tab lives in the address (#dashboard, #random, #sheet/<id> …) so a
 * refresh lands on the same screen and a sheet can be sent as a link.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Empty, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, RED, post, useLoad } from "@/components/ims/ui";
import Items from "./Items";
import type { Summary } from "./Dashboard";

const ORANGE = "#E8600A";
const cr = (v: number) => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`);
const qn = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v).toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const dmy = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const TABS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "items", label: "Items" },
  { key: "warehouses", label: "Warehouses" },
  { key: "group", label: "Reconciliation · by item group" },
  { key: "random", label: "Reconciliation · random PI" },
  { key: "suspense", label: "Suspense" },
  { key: "suggestions", label: "Genie suggestions" },
  { key: "ask", label: "✨ Ask Genie" },
];

interface Meta { people: { email: string; name: string; store: boolean }[]; groups: { group: string; items: number }[]; warehouses: { warehouse: string; kind: string }[]; me: { email: string; lead: boolean; consult: boolean } }

export default function Inventory({ summary, email, isOwner }: { summary: Summary; email: string; isOwner: boolean }) {
  const read = () => (typeof window === "undefined" ? "dashboard" : window.location.hash.replace(/^#/, "") || "dashboard");
  const [route, setRoute] = useState(read);
  useEffect(() => { const f = () => setRoute(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (r: string) => { window.location.hash = r; setRoute(r); };
  const [meta] = useLoad<Meta>("/api/saamaan/inventory?view=meta");
  const [tab, arg] = route.split("/");
  const tabs = TABS.filter((t) => t.key !== "ask" || meta?.me.consult);

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {tabs.map((t) => {
          const on = tab === t.key || (tab === "sheet" && (t.key === "random" || t.key === "group") && false);
          return (
            <button key={t.key} onClick={() => go(t.key)} className="px-3 py-2 text-sm font-bold"
              style={{ color: on ? NAVY : MUTED, borderBottom: `3px solid ${on ? ORANGE : "transparent"}` }}>{t.label}</button>
          );
        })}
      </div>
      {tab === "items" ? <Items summary={summary} initialGroup="" email={email} isOwner={isOwner} />
        : tab === "warehouses" ? <Warehouses wh={arg ? decodeURIComponent(arg) : ""} go={go} />
        : tab === "group" || tab === "random" ? <Reconciliation kind={tab} meta={meta} go={go} />
        : tab === "sheet" && arg ? <Sheet id={arg} go={go} meta={meta} />
        : tab === "suspense" ? <Suspense lead={!!meta?.me.lead} />
        : tab === "suggestions" ? <Suggestions meta={meta} />
        : tab === "ask" ? (meta?.me.consult ? <AskGenie /> : <Empty>Ask Genie is Rameez&apos;s and Dr Raghu&apos;s for now.</Empty>)
        : <Dash go={go} />}
    </div>
  );
}

/* ================================================================ dashboard */
interface DashData {
  readAt: string; rm: Agg; wip: Agg; total: Agg; finished: number; vendor: number; untyped: { value: number; warehouses: string[] }; ignored?: { value: number; warehouses: string[] };
  classes: { cls: string; inClass: number; holding: number; qty: number; value: number }[];
  warehouses: { warehouse: string; kind: string; value: number; qty: number; items: number }[];
}
interface Agg { value: number; qty: number; items: number }

function Tile({ label, a, tone, hint }: { label: string; a?: Agg; tone: string; hint: string }) {
  return (
    <div className="rounded-lg border p-4 bg-white" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>{label}</div>
      <div className="font-bold tnum" style={{ fontSize: 30, color: tone, lineHeight: 1.15 }}>{a ? cr(a.value) : "…"}</div>
      <div className="text-sm mt-1" style={{ color: INK }}>{a ? <><b>{a.items.toLocaleString("en-IN")}</b> items · <b>{qn(a.qty)}</b> in quantity</> : " "}</div>
      <div className="text-xs mt-1" style={{ color: MUTED }}>{hint}</div>
    </div>
  );
}

function Dash({ go }: { go: (r: string) => void }) {
  const [d, busy, reload, err] = useLoad<DashData>("/api/saamaan/inventory?view=dashboard");
  const rmValue = d?.rm.value || 0;
  return (
    <Screen title="Inventory — today" blurb="Read live off the ERP's Bin, every warehouse, this minute. RM is the warehouses Masters types Stock; WIP the ones typed WIP; total is everything the ERP holds."
      action={<Btn onClick={reload} disabled={busy}>{busy ? "Reading…" : "↻ Re-read"}</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Tile label="RM stock as of today" a={d?.rm} tone={GREEN} hint="Stock warehouses only — the closing stock that counts" />
        <Tile label="WIP stock as of today" a={d?.wip} tone={AMBER} hint="Material already issued into the works" />
        <Tile label="Total inventory up to now" a={d?.total} tone={NAVY} hint={d?.ignored?.warehouses.length ? "Every warehouse but those typed Ignore" : "Every warehouse the ERP has, typed or not"} />
      </div>
      {d && (
        <div className="text-xs mb-4" style={{ color: MUTED, lineHeight: 1.7 }}>
          Of the total, finished goods <b style={{ color: INK }}>{cr(d.finished)}</b> · at vendors <b style={{ color: INK }}>{cr(d.vendor)}</b>
          {d.untyped.warehouses.length > 0 && <> · <b style={{ color: AMBER }}>{cr(d.untyped.value)}</b> sits in {d.untyped.warehouses.length} warehouse{d.untyped.warehouses.length === 1 ? "" : "s"} nobody has typed yet — <button onClick={() => (window.location.href = "/saamaan/masters")} style={{ color: NAVY, textDecoration: "underline" }}>type them in Masters</button></>}
          {d.ignored && d.ignored.warehouses.length > 0 && <> · <b style={{ color: MUTED }}>{cr(d.ignored.value)}</b> in {d.ignored.warehouses.length} warehouse{d.ignored.warehouses.length === 1 ? "" : "s"} typed Ignore is left out of every figure</>}
          {" "}· read {new Date(d.readAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>RM stock by class</div>
      <GenieTable rows={d ? d.classes : null} minWidth={640}
        columns={[
          { key: "c", label: "Class", align: "left", sort: (c) => c.cls, render: (c) => <b style={{ color: c.cls === "A" ? RED : c.cls === "B" ? AMBER : c.cls === "C" ? GREEN : MUTED }}>{c.cls === "—" ? "No class" : `Class ${c.cls}`}</b> },
          { key: "n", label: "Items in the class", align: "right", sort: (c) => c.inClass, render: (c) => <span className="tnum">{c.inClass.toLocaleString("en-IN")}</span> },
          { key: "h", label: "Items holding stock", align: "right", sort: (c) => c.holding, render: (c) => <span className="tnum">{c.holding.toLocaleString("en-IN")}</span> },
          { key: "q", label: "Total quantity", align: "right", sort: (c) => c.qty, render: (c) => <span className="tnum">{qn(c.qty)}</span> },
          { key: "v", label: "Total value", align: "right", sort: (c) => c.value, render: (c) => <b className="tnum">{cr(c.value)}</b> },
          { key: "s", label: "Share of RM", align: "right", sort: (c) => c.value, render: (c) => <span className="tnum" style={{ color: MUTED }}>{rmValue ? `${((c.value / rmValue) * 100).toFixed(1)}%` : "·"}</span> },
        ]} />

      <div className="text-xs font-bold uppercase mt-5 mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Warehouses, largest first</div>
      <GenieTable rows={d ? d.warehouses.slice(0, 12) : null} minWidth={640}
        columns={[
          { key: "w", label: "Warehouse", align: "left", sort: (w) => w.warehouse, render: (w) => <button onClick={() => go(`warehouses/${encodeURIComponent(w.warehouse)}`)} className="font-bold text-left" style={{ color: NAVY }}>{w.warehouse}</button> },
          { key: "k", label: "Type", align: "left", sort: (w) => w.kind, render: (w) => <span style={{ color: w.kind ? INK : AMBER }}>{w.kind || "untyped"}</span> },
          { key: "i", label: "Items in stock", align: "right", sort: (w) => w.items, render: (w) => <span className="tnum">{w.items.toLocaleString("en-IN")}</span> },
          { key: "v", label: "Value", align: "right", sort: (w) => w.value, render: (w) => <b className="tnum">{cr(w.value)}</b> },
        ]} />
      <Note kind="info">Non-moving parts, ageing and slow movers come next on this dashboard.</Note>
    </Screen>
  );
}

/* =============================================================== warehouses */
interface Bin { item_code: string; item_name: string; item_group: string; cls: string; uom: string; qty: number; rate: number; value: number; reserved: number; ordered: number; inMirror: boolean }

function Warehouses({ wh, go }: { wh: string; go: (r: string) => void }) {
  const [list, busy, reload, err] = useLoad<{ warehouses: DashData["warehouses"]; readAt: string }>("/api/saamaan/inventory?view=warehouses");
  const [bins, binBusy, , binErr] = useLoad<{ rows: Bin[] }>(wh ? `/api/saamaan/inventory?view=warehouse&wh=${encodeURIComponent(wh)}` : "/api/saamaan/inventory?view=meta");
  if (wh) {
    const rows = (bins as { rows?: Bin[] } | null)?.rows ?? null;
    const total = (rows ?? []).reduce((a, r) => a + r.value, 0);
    return (
      <Screen title={wh} blurb="Every item with a non-zero quantity here on the ERP, now — largest value first."
        action={<Btn onClick={() => go("warehouses")}>← All warehouses</Btn>}>
        {binErr && <Note kind="error">{binErr}</Note>}
        {rows && <div className="text-sm mb-2" style={{ color: INK }}><b>{rows.length.toLocaleString("en-IN")}</b> items in stock · <b>{cr(total)}</b></div>}
        <GenieTable<Bin> rows={binBusy ? null : rows} minWidth={980}
          search={(r, q) => `${r.item_code} ${r.item_name} ${r.item_group}`.toLowerCase().includes(q)} searchPlaceholder="🔍 code, name, group"
          columns={[
            { key: "c", label: "Code", align: "left", sort: (r) => r.item_code, render: (r) => <b style={{ color: NAVY }}>{r.item_code}</b> },
            { key: "n", label: "Name", align: "left", sort: (r) => r.item_name, render: (r) => r.item_name || <span style={{ color: MUTED }}>not in the RM mirror</span> },
            { key: "g", label: "Group", align: "left", sort: (r) => r.item_group, render: (r) => <span style={{ color: MUTED }}>{r.item_group || "·"}</span> },
            { key: "k", label: "Class", align: "center", sort: (r) => r.cls, render: (r) => r.cls || "·" },
            { key: "q", label: "Qty", align: "right", sort: (r) => r.qty, render: (r) => <span className="tnum" style={{ color: r.qty < 0 ? RED : INK }}>{qn(r.qty)} <span style={{ color: MUTED }}>{r.uom}</span></span> },
            { key: "r", label: "Rate", align: "right", sort: (r) => r.rate, render: (r) => <span className="tnum">{cr(r.rate)}</span> },
            { key: "v", label: "Value", align: "right", sort: (r) => r.value, render: (r) => <b className="tnum">{cr(r.value)}</b> },
          ]} />
      </Screen>
    );
  }
  const rows = list?.warehouses ?? null;
  return (
    <Screen title="Warehouses" blurb="Every warehouse holding stock on the ERP: its type (set in Masters), how many items it holds with a non-zero quantity, and their value. Click one for its items."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {rows && <div className="text-sm mb-2" style={{ color: INK }}><b>{rows.filter((w) => w.kind !== "Ignore").reduce((a, w) => a + w.items, 0).toLocaleString("en-IN")}</b> item-locations in stock · <b>{cr(rows.filter((w) => w.kind !== "Ignore").reduce((a, w) => a + w.value, 0))}</b>{rows.some((w) => w.kind === "Ignore") && <span style={{ color: MUTED }}> · warehouses typed Ignore are listed but left out of these totals</span>}</div>}
      <GenieTable rows={rows} minWidth={760} search={(w, q) => `${w.warehouse} ${w.kind}`.toLowerCase().includes(q)} searchPlaceholder="🔍 warehouse or type"
        columns={[
          { key: "w", label: "Warehouse", align: "left", sort: (w) => w.warehouse, render: (w) => <button onClick={() => go(`warehouses/${encodeURIComponent(w.warehouse)}`)} className="font-bold text-left" style={{ color: NAVY }}>{w.warehouse}</button> },
          { key: "k", label: "Type", align: "left", sort: (w) => w.kind, render: (w) => <span style={{ color: w.kind ? INK : AMBER }}>{w.kind || "untyped"}</span> },
          { key: "i", label: "Items in stock", align: "right", sort: (w) => w.items, render: (w) => <span className="tnum">{w.items.toLocaleString("en-IN")}</span> },
          { key: "q", label: "Quantity", align: "right", sort: (w) => w.qty, render: (w) => <span className="tnum">{qn(w.qty)}</span> },
          { key: "v", label: "Value", align: "right", sort: (w) => w.value, render: (w) => <b className="tnum">{cr(w.value)}</b> },
        ]} />
    </Screen>
  );
}

/* =========================================================== reconciliation */
interface Count { id: string; kind: string; title: string; warehouse: string; item_group: string | null; assigned_email: string; assigned_name: string; status: string; due_on: string | null; created_at: string; submitted_at: string | null; lines: number; counted: number; variances: number; value: number }

function Reconciliation({ kind, meta, go }: { kind: "group" | "random"; meta: Meta | null; go: (r: string) => void }) {
  const [data, busy, reload, err] = useLoad<{ counts: Count[]; installed?: boolean; error?: string }>("/api/saamaan/inventory?view=counts");
  /* the "By" date starts at today (Dr Raghu, 6 Oct 2026) — a count is meant to be done the day it is given */
  const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [f, setF] = useState({ warehouse: "", n: "10", who: "", due_on: todayIst() });
  const [groups, setGroups] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [making, setMaking] = useState(false);
  const lead = !!meta?.me.lead;
  const stockWh = (meta?.warehouses ?? []).filter((w) => w.kind === "Stock");
  const otherWh = (meta?.warehouses ?? []).filter((w) => w.kind !== "Stock");
  const make = async () => {
    setMsg(""); setMaking(true);
    const p = (meta?.people ?? []).find((x) => x.email === f.who);
    const r = await post("/api/saamaan/inventory", { action: "create_count", kind, warehouse: f.warehouse, item_groups: groups, n: Number(f.n), assigned_email: f.who, assigned_name: p?.name || "", due_on: f.due_on });
    setMaking(false);
    if (!r.ok) { setMsg(r.error || "Could not make the sheet."); return; }
    go(`sheet/${r.id}`);
  };
  const rows = (data?.counts ?? []).filter((c) => c.kind === kind);
  return (
    <Screen title={kind === "random" ? "Stock reconciliation — random PI" : "Stock reconciliation — by item group"}
      blurb={kind === "random"
        ? "One person, one location, ten or twenty items Genie picks at random from what the ERP says is there. They see the ERP's figure, count the shelf, and write why it differs. A variance opens a suspense entry so the books can be read as the shelf says."
        : "A whole item group in one location, counted by one person. Same sheet, same variance, same suspense."}
      action={<Btn onClick={reload} disabled={busy}>↻</Btn>}>
      {err && <Note kind={/0201/.test(err) ? "warn" : "error"}>{err}</Note>}
      {lead && (
        <div className="rounded-lg border p-3 mb-4 bg-white flex gap-3 flex-wrap items-end" style={{ borderColor: BORDER }}>
          {/* TYPED, NOT SCROLLED (Dr Raghu, 6 Oct 2026: "let us type it so that it comes in") */}
          <label className="text-xs font-bold" style={{ color: MUTED }}>Location<br />
            <input list="inv-wh" value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} placeholder="type a warehouse…"
              className="rounded border px-2 py-1.5 text-sm bg-white" style={{ borderColor: f.warehouse && !(meta?.warehouses ?? []).some((w) => w.warehouse === f.warehouse) ? RED : BORDER, minWidth: 260 }} />
            <datalist id="inv-wh">{[...stockWh, ...otherWh].map((w) => <option key={w.warehouse} value={w.warehouse}>{w.kind || "untyped"}</option>)}</datalist></label>
          {kind === "group" ? (
            <GroupPicker all={meta?.groups ?? []} chosen={groups} onChange={setGroups} />
          ) : (
            <label className="text-xs font-bold" style={{ color: MUTED }}>Items<br />
              <select value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} className="rounded border px-2 py-1.5 text-sm bg-white" style={{ borderColor: BORDER }}>
                <option value="10">10 items</option><option value="20">20 items</option>
              </select></label>
          )}
          <label className="text-xs font-bold" style={{ color: MUTED }}>Who counts<br />
            <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} className="rounded border px-2 py-1.5 text-sm bg-white" style={{ borderColor: BORDER, minWidth: 200 }}>
              <option value="">— choose —</option>{(meta?.people ?? []).map((p) => <option key={p.email} value={p.email}>{p.name}{p.store ? " · store" : ""}</option>)}
            </select></label>
          <label className="text-xs font-bold" style={{ color: MUTED }}>By<br /><input type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} /></label>
          <Btn kind="primary" onClick={make} disabled={making || !(meta?.warehouses ?? []).some((w) => w.warehouse === f.warehouse) || !f.who || (kind === "group" && !groups.length)}>{making ? "Picking…" : kind === "random" ? "🎲 Make the sheet" : "Make the sheet"}</Btn>
          {msg && <span className="text-sm font-bold" style={{ color: RED }}>{msg}</span>}
        </div>
      )}
      <GenieTable<Count> rows={data ? rows : null} minWidth={900} empty={lead ? "No sheets yet — make one above." : "No sheets given to you yet."}
        columns={[
          { key: "t", label: "Sheet", align: "left", sort: (c) => c.created_at, render: (c) => <button onClick={() => go(`sheet/${c.id}`)} className="font-bold text-left" style={{ color: NAVY }}>{c.title}</button> },
          { key: "w", label: "Who", align: "left", sort: (c) => c.assigned_name, render: (c) => c.assigned_name || c.assigned_email.split("@")[0] },
          { key: "s", label: "Status", align: "left", sort: (c) => c.status, render: (c) => <b style={{ color: c.status === "submitted" ? GREEN : c.status === "open" ? AMBER : MUTED }}>{c.status}</b> },
          { key: "p", label: "Counted", align: "right", sort: (c) => c.counted, render: (c) => <span className="tnum">{c.counted}/{c.lines}</span> },
          { key: "v", label: "Variances", align: "right", sort: (c) => c.variances, render: (c) => <span className="tnum" style={{ color: c.variances ? RED : MUTED }}>{c.variances}</span> },
          { key: "x", label: "Variance value", align: "right", sort: (c) => c.value, render: (c) => <b className="tnum" style={{ color: c.value < 0 ? RED : c.value > 0 ? GREEN : MUTED }}>{c.value ? cr(c.value) : "·"}</b> },
          { key: "d", label: "Made", align: "right", sort: (c) => c.created_at, render: (c) => <span style={{ color: MUTED }}>{dmy(c.created_at)}</span> },
        ]} />
    </Screen>
  );
}

/**
 * ITEM GROUPS, TYPED AND SEVERAL (Dr Raghu, 6 Oct 2026: "let us type it so
 * that it comes in, and also in item groups, let us choose multiple so that
 * they all come in there"). Type a few letters, pick from what matches —
 * Enter takes the first — and each pick becomes a chip; × takes it off.
 */
function GroupPicker({ all, chosen, onChange }: { all: { group: string; items: number }[]; chosen: string[]; onChange: (g: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const hits = all.filter((g) => !chosen.includes(g.group) && (!needle || g.group.toLowerCase().includes(needle))).slice(0, 40);
  const take = (g: string) => { onChange([...chosen, g]); setQ(""); };
  const items = all.filter((g) => chosen.includes(g.group)).reduce((a, g) => a + g.items, 0);
  return (
    <div className="text-xs font-bold" style={{ color: MUTED, position: "relative", minWidth: 300, flex: "1 1 300px" }}>
      Item groups{chosen.length ? <span style={{ fontWeight: 400 }}> · {chosen.length} chosen · {items.toLocaleString("en-IN")} items in the master</span> : null}<br />
      <div className="rounded border px-1.5 py-1 bg-white flex flex-wrap gap-1 items-center" style={{ borderColor: BORDER, minHeight: 36 }} onClick={() => setOpen(true)}>
        {chosen.map((g) => (
          <span key={g} className="rounded px-1.5 py-0.5 text-xs font-bold flex items-center gap-1" style={{ background: NAVY_SOFT, color: NAVY }}>
            {g}<button onClick={(e) => { e.stopPropagation(); onChange(chosen.filter((x) => x !== g)); }} style={{ color: MUTED }} aria-label={`Remove ${g}`}>×</button>
          </span>
        ))}
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); take(hits[0].group); } if (e.key === "Backspace" && !q && chosen.length) onChange(chosen.slice(0, -1)); }}
          placeholder={chosen.length ? "add another…" : "type a group…"} className="text-sm font-normal outline-none" style={{ flex: 1, minWidth: 120, color: INK }} />
      </div>
      {open && hits.length > 0 && (
        <div className="absolute rounded border bg-white shadow-lg" style={{ borderColor: BORDER, zIndex: 30, left: 0, right: 0, top: "100%", maxHeight: 280, overflowY: "auto" }}>
          {hits.map((g) => (
            <button key={g.group} onMouseDown={(e) => { e.preventDefault(); take(g.group); }} className="w-full text-left px-2 py-1.5 text-sm font-normal hover:bg-gray-50 flex justify-between" style={{ color: INK }}>
              <span>{g.group}</span><span style={{ color: MUTED }}>{g.items}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Line { id: string; item_code: string; item_name: string; item_group: string; uom: string; warehouse: string; erp_qty: number | null; erp_rate: number | null; erp_qty_at_count: number | null; physical_qty: number | null; remark: string; counted_at: string | null }

function Sheet({ id, go, meta }: { id: string; go: (r: string) => void; meta: Meta | null }) {
  const [data, busy, reload, err] = useLoad<{ count: Count & { note: string }; lines: Line[]; canEdit: boolean }>(`/api/saamaan/inventory?view=count&id=${id}`);
  const [draft, setDraft] = useState<Record<string, { q: string; r: string }>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState("");
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.lines.map((l) => [l.id, { q: l.physical_qty === null ? "" : String(l.physical_qty), r: l.remark || "" }])));
  }, [data]);
  if (err) return <Note kind="error">{err}</Note>;
  if (!data) return <Empty>Opening the sheet…</Empty>;
  const { count: c, lines, canEdit } = data;
  const erpOf = (l: Line) => Number(l.erp_qty_at_count ?? l.erp_qty ?? 0);
  const varOf = (l: Line) => { const d = draft[l.id]; if (!d || d.q === "") return null; return Number(d.q) - erpOf(l); };
  const save = async (l: Line) => {
    const d = draft[l.id]; if (!d) return;
    if (String(l.physical_qty ?? "") === d.q && l.remark === d.r) return;
    setSaving(l.id);
    const r = await post("/api/saamaan/inventory", { action: "save_line", line_id: l.id, physical_qty: d.q === "" ? null : Number(d.q), remark: d.r });
    setSaving(""); if (!r.ok) setMsg(r.error || "Not saved.");
  };
  const submit = async () => {
    if (!confirm("Submit the count? The ERP is read once more, every variance is fixed, and each one opens a suspense entry.")) return;
    setMsg("");
    const r = await post("/api/saamaan/inventory", { action: "submit_count", id });
    if (!r.ok) { setMsg(r.error || "Not submitted."); return; }
    setMsg(`Submitted — ${r.variances} variance${r.variances === 1 ? "" : "s"} went to suspense.`); reload();
  };
  const totalVar = lines.reduce((a, l) => a + (varOf(l) ?? 0) * (Number(l.erp_rate) || 0), 0);
  const counted = lines.filter((l) => (draft[l.id]?.q ?? "") !== "").length;
  return (
    <Screen title={c.title} blurb={`${c.warehouse} · counted by ${c.assigned_name || c.assigned_email}${c.due_on ? ` · by ${dmy(c.due_on)}` : ""} · ${c.status}`}
      action={<><Btn onClick={() => go(c.kind)}>← Sheets</Btn>{canEdit && <Btn kind="primary" onClick={submit} disabled={busy}>Submit count</Btn>}{meta?.me.lead && c.status === "open" && <Btn kind="danger" onClick={async () => { if (confirm("Cancel this sheet?")) { await post("/api/saamaan/inventory", { action: "cancel_count", id }); reload(); } }}>Cancel</Btn>}</>}>
      {msg && <Note kind={/Submitted/.test(msg) ? "info" : "error"}>{msg}</Note>}
      <div className="text-sm mb-2" style={{ color: INK }}>Counted <b>{counted}</b> of <b>{lines.length}</b> · variance so far <b style={{ color: totalVar < 0 ? RED : totalVar > 0 ? GREEN : INK }}>{cr(totalVar)}</b>
        <span style={{ color: MUTED }}> · a nought is a count; leave it blank only if you have not counted it</span></div>
      <GenieTable<Line> rows={lines} minWidth={1000}
        columns={[
          { key: "c", label: "Code", align: "left", sort: (l) => l.item_code, render: (l) => <b style={{ color: NAVY }}>{l.item_code}</b> },
          { key: "n", label: "Item", align: "left", sort: (l) => l.item_name, render: (l) => <span>{l.item_name}<div className="text-xs" style={{ color: MUTED }}>{l.item_group}</div></span> },
          { key: "e", label: c.status === "submitted" ? "ERP at the count" : "ERP says", align: "right", sort: (l) => erpOf(l), render: (l) => <span className="tnum">{qn(erpOf(l))} <span style={{ color: MUTED }}>{l.uom}</span></span> },
          { key: "p", label: "On the shelf", align: "right", render: (l) => canEdit
              ? <input value={draft[l.id]?.q ?? ""} inputMode="decimal" onChange={(e) => setDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] || { q: "", r: "" }), q: e.target.value.replace(/[^0-9.]/g, "") } }))} onBlur={() => save(l)}
                  className="rounded border px-2 py-1 text-sm tnum text-right" style={{ borderColor: saving === l.id ? ORANGE : BORDER, width: 90 }} />
              : <b className="tnum">{l.physical_qty === null ? "·" : qn(Number(l.physical_qty))}</b> },
          { key: "v", label: "Variance", align: "right", sort: (l) => varOf(l) ?? 0, render: (l) => { const v = varOf(l); return v === null ? <span style={{ color: MUTED }}>·</span> : <b className="tnum" style={{ color: Math.abs(v) < 1e-9 ? GREEN : RED }}>{v > 0 ? "+" : ""}{qn(v)}</b>; } },
          { key: "x", label: "Value", align: "right", sort: (l) => (varOf(l) ?? 0) * (Number(l.erp_rate) || 0), render: (l) => { const v = varOf(l); return v === null || Math.abs(v) < 1e-9 ? <span style={{ color: MUTED }}>·</span> : <span className="tnum">{cr(v * (Number(l.erp_rate) || 0))}</span>; } },
          { key: "r", label: "Remark", align: "left", render: (l) => canEdit
              ? <input value={draft[l.id]?.r ?? ""} placeholder={varOf(l) ? "why it differs" : ""} onChange={(e) => setDraft((d) => ({ ...d, [l.id]: { ...(d[l.id] || { q: "", r: "" }), r: e.target.value } }))} onBlur={() => save(l)}
                  className="rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER, width: "100%", minWidth: 200 }} />
              : <span>{l.remark || "·"}</span> },
        ]} />
    </Screen>
  );
}

/* ================================================================= suspense */
interface Susp { id: string; item_code: string; item_name: string; uom: string; warehouse: string; qty: number; rate: number | null; released_qty: number; status: string; counted_at: string; remark: string; synced_at: string | null }
interface Rel { id: string; suspense_id: string; qty: number; reason: string; voucher_type: string | null; voucher_no: string | null; note: string; by_email: string; at: string }
const REASONS = ["WIP", "Consumption", "Unrecorded receipt", "Scrap", "UOM", "ERP corrected", "Other"];

function Suspense({ lead }: { lead: boolean }) {
  const [data, busy, reload, err] = useLoad<{ suspense: Susp[]; releases: Rel[] }>("/api/saamaan/inventory?view=suspense");
  const [show, setShow] = useState<"open" | "released" | "all">("open");
  const [rel, setRel] = useState<Susp | null>(null);
  const [rf, setRf] = useState({ qty: "", reason: "WIP", note: "", voucher_no: "" });
  const [msg, setMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const rows = (data?.suspense ?? []).filter((s) => show === "all" || s.status === show);
  const open = (s: Susp) => Number(s.qty) - Number(s.released_qty);
  const totals = (data?.suspense ?? []).filter((s) => s.status === "open").reduce((a, s) => ({ n: a.n + 1, plus: a.plus + Math.max(0, open(s) * (s.rate || 0)), minus: a.minus + Math.min(0, open(s) * (s.rate || 0)) }), { n: 0, plus: 0, minus: 0 });
  const sync = async (id?: string) => {
    setSyncing(true); setMsg("");
    const r = await post("/api/saamaan/inventory", { action: "sync_suspense", id });
    setSyncing(false);
    setMsg(r.ok ? `Checked ${r.checked} against the ERP — ${r.releases} release${r.releases === 1 ? "" : "s"} found.` : r.error || "Sync failed.");
    reload();
  };
  const doRelease = async () => {
    if (!rel) return;
    const r = await post("/api/saamaan/inventory", { action: "release", suspense_id: rel.id, qty: Number(rf.qty), reason: rf.reason, note: rf.note, voucher_no: rf.voucher_no });
    if (!r.ok) { setMsg(r.error || "Not released."); return; }
    setRel(null); setRf({ qty: "", reason: "WIP", note: "", voucher_no: "" }); reload();
  };
  return (
    <Screen title="Suspense" blurb="What the shelf says minus what the ERP says, item by location, from every submitted count. It is Genie's ledger, not the ERP's: the books read as the shelf says until each difference is explained. Sync with the ERP releases what a back-dated entry or a stock reconciliation has since put right; anything else is released by hand, with the reason."
      action={<>{lead && <Btn kind="primary" onClick={() => sync()} disabled={syncing}>{syncing ? "Reading the ERP…" : "⇄ Sync with ERP"}</Btn>}<Btn onClick={reload} disabled={busy}>↻</Btn></>}>
      {err && <Note kind={/0201/.test(err) ? "warn" : "error"}>{err}</Note>}
      {msg && <Note kind="info">{msg}</Note>}
      <div className="flex gap-4 flex-wrap text-sm mb-2 items-center" style={{ color: INK }}>
        <span><b>{totals.n}</b> open</span>
        <span>more on the shelf <b style={{ color: GREEN }}>{cr(totals.plus)}</b></span>
        <span>less on the shelf <b style={{ color: RED }}>{cr(totals.minus)}</b></span>
        <span style={{ flex: 1 }} />
        {(["open", "released", "all"] as const).map((k) => <button key={k} onClick={() => setShow(k)} className="text-xs font-bold rounded px-2 py-1" style={{ background: show === k ? NAVY : "#fff", color: show === k ? "#fff" : INK, border: `1px solid ${BORDER}` }}>{k}</button>)}
      </div>
      <GenieTable<Susp> rows={data ? rows : null} minWidth={1100} search={(s, q) => `${s.item_code} ${s.item_name} ${s.warehouse}`.toLowerCase().includes(q)} searchPlaceholder="🔍 item or location"
        columns={[
          { key: "c", label: "Item", align: "left", sort: (s) => s.item_code, render: (s) => <span><b style={{ color: NAVY }}>{s.item_code}</b> {s.item_name}</span> },
          { key: "w", label: "Location", align: "left", sort: (s) => s.warehouse, render: (s) => <span style={{ color: MUTED }}>{s.warehouse}</span> },
          { key: "d", label: "Counted", align: "right", sort: (s) => s.counted_at, render: (s) => <span style={{ color: MUTED }}>{dmy(s.counted_at)}</span> },
          { key: "q", label: "Variance", align: "right", sort: (s) => s.qty, render: (s) => <span className="tnum">{s.qty > 0 ? "+" : ""}{qn(s.qty)} {s.uom}</span> },
          { key: "r", label: "Released", align: "right", sort: (s) => s.released_qty, render: (s) => <span className="tnum" style={{ color: MUTED }}>{s.released_qty ? qn(s.released_qty) : "·"}</span> },
          { key: "o", label: "Open", align: "right", sort: (s) => open(s), render: (s) => <b className="tnum" style={{ color: Math.abs(open(s)) < 1e-9 ? GREEN : open(s) > 0 ? GREEN : RED }}>{Math.abs(open(s)) < 1e-9 ? "✓" : qn(open(s))}</b> },
          { key: "v", label: "Open value", align: "right", sort: (s) => open(s) * (s.rate || 0), render: (s) => <span className="tnum">{Math.abs(open(s)) < 1e-9 ? "·" : cr(open(s) * (s.rate || 0))}</span> },
          { key: "m", label: "Why, so far", align: "left", render: (s) => {
              const rs = (data?.releases ?? []).filter((r) => r.suspense_id === s.id);
              return <span className="text-xs">{s.remark && <i>{s.remark}</i>}{rs.map((r) => <div key={r.id}>{qn(r.qty)} · {r.reason}{r.voucher_no ? ` · ${r.voucher_no}` : ""}{r.note && r.reason !== "ERP corrected" ? ` — ${r.note}` : ""}</div>)}</span>;
            } },
          { key: "a", label: "", align: "right", render: (s) => lead && s.status === "open" ? <span className="flex gap-1 justify-end"><button onClick={() => sync(s.id)} className="text-xs font-bold" style={{ color: NAVY }}>sync</button><button onClick={() => { setRel(s); setRf({ ...rf, qty: String(Math.abs(open(s))) }); }} className="text-xs font-bold" style={{ color: ORANGE }}>release…</button></span> : null },
        ]} />
      {rel && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(22,35,47,.5)", zIndex: 70 }} onClick={() => setRel(null)}>
          <div className="bg-white rounded-lg p-4" style={{ width: "min(480px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1" style={{ color: INK }}>Release — {rel.item_code} {rel.item_name}</div>
            <div className="text-xs mb-3" style={{ color: MUTED }}>{rel.warehouse} · open {qn(open(rel))} {rel.uom}. Say how much of it is explained, and by what.</div>
            <div className="grid gap-2">
              <label className="text-xs font-bold" style={{ color: MUTED }}>Quantity explained<input value={rf.qty} onChange={(e) => setRf({ ...rf, qty: e.target.value })} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} /></label>
              <label className="text-xs font-bold" style={{ color: MUTED }}>Because<select value={rf.reason} onChange={(e) => setRf({ ...rf, reason: e.target.value })} className="w-full rounded border px-2 py-1.5 text-sm bg-white" style={{ borderColor: BORDER }}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className="text-xs font-bold" style={{ color: MUTED }}>ERP document, if there is one<input value={rf.voucher_no} onChange={(e) => setRf({ ...rf, voucher_no: e.target.value })} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} /></label>
              <label className="text-xs font-bold" style={{ color: MUTED }}>Note<input value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} /></label>
              <div className="flex gap-2 mt-1"><Btn kind="primary" onClick={doRelease}>Release</Btn><Btn onClick={() => setRel(null)}>Cancel</Btn></div>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

/* ============================================================== suggestions */
interface Sug { id: string; title: string; body: string; source: string; priority: string; status: string; owner_email: string | null; note: string; by_email: string; created_at: string }

function Suggestions({ meta }: { meta: Meta | null }) {
  const [data, busy, reload, err] = useLoad<{ suggestions: Sug[] }>("/api/saamaan/inventory?view=suggestions");
  const [f, setF] = useState({ title: "", body: "", priority: "normal" });
  const [msg, setMsg] = useState("");
  const [asking, setAsking] = useState(false);
  const [show, setShow] = useState<"live" | "all">("live");
  const lead = !!meta?.me.lead;
  const add = async () => { const r = await post("/api/saamaan/inventory", { action: "suggestion_add", ...f }); if (!r.ok) { setMsg(r.error || "Not added."); return; } setF({ title: "", body: "", priority: "normal" }); reload(); };
  const upd = async (id: string, patch: Record<string, unknown>) => { await post("/api/saamaan/inventory", { action: "suggestion_update", id, ...patch }); reload(); };
  const askGenie = async () => {
    setAsking(true); setMsg("");
    const r = await post("/api/saamaan/inventory/suggest", {});
    setAsking(false); setMsg(r.ok ? `Genie added ${r.added} suggestion${r.added === 1 ? "" : "s"}.` : r.error || "Genie could not suggest.");
    reload();
  };
  const rows = (data?.suggestions ?? []).filter((s) => show === "all" || ["open", "doing"].includes(s.status));
  const pc = (p: string) => (p === "high" ? RED : p === "low" ? MUTED : AMBER);
  return (
    <Screen title="Genie suggestions" blurb="What to do next about the inventory — Genie's, read off the stock, the counts and the suspense, and anybody's. Each is worked to done with an owner."
      action={<>{lead && <Btn kind="primary" onClick={askGenie} disabled={asking}>{asking ? "Genie is reading the stock…" : "✨ Ask Genie for suggestions"}</Btn>}<Btn onClick={reload} disabled={busy}>↻</Btn></>}>
      {err && <Note kind={/0201/.test(err) ? "warn" : "error"}>{err}</Note>}
      {msg && <Note kind="info">{msg}</Note>}
      <div className="rounded-lg border p-3 mb-3 bg-white grid gap-2" style={{ borderColor: BORDER }}>
        <div className="flex gap-2 flex-wrap">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="A suggestion, in one line" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, flex: "1 1 320px" }} />
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="rounded border px-2 py-1.5 text-sm bg-white" style={{ borderColor: BORDER }}><option value="high">high</option><option value="normal">normal</option><option value="low">low</option></select>
          <Btn onClick={add} disabled={f.title.trim().length < 3}>Add</Btn>
        </div>
        <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Why, and what to do (optional)" rows={2} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
      </div>
      <div className="flex gap-1 mb-2">{(["live", "all"] as const).map((k) => <button key={k} onClick={() => setShow(k)} className="text-xs font-bold rounded px-2 py-1" style={{ background: show === k ? NAVY : "#fff", color: show === k ? "#fff" : INK, border: `1px solid ${BORDER}` }}>{k === "live" ? "open and doing" : "all"}</button>)}</div>
      <div className="grid gap-2">
        {rows.length === 0 && <Empty>{data ? "Nothing open." : "Loading…"}</Empty>}
        {rows.map((s) => (
          <div key={s.id} className="rounded-lg border p-3 bg-white" style={{ borderColor: BORDER, borderLeft: `4px solid ${pc(s.priority)}`, opacity: ["done", "dismissed"].includes(s.status) ? 0.6 : 1 }}>
            <div className="flex gap-2 items-start flex-wrap">
              <span className="text-xs font-bold rounded px-1.5" style={{ background: s.source === "genie" ? NAVY_SOFT : "#F4F2EC", color: s.source === "genie" ? NAVY : INK }}>{s.source === "genie" ? "✨ Genie" : (s.by_email || "").split("@")[0]}</span>
              <b className="text-sm" style={{ color: INK, flex: 1 }}>{s.title}</b>
              <select value={s.status} onChange={(e) => upd(s.id, { status: e.target.value })} className="rounded border px-1.5 py-0.5 text-xs bg-white" style={{ borderColor: BORDER }}>{["open", "doing", "done", "dismissed"].map((x) => <option key={x}>{x}</option>)}</select>
              <select value={s.owner_email || ""} onChange={(e) => upd(s.id, { owner_email: e.target.value })} className="rounded border px-1.5 py-0.5 text-xs bg-white" style={{ borderColor: BORDER, maxWidth: 160 }}><option value="">— owner —</option>{(meta?.people ?? []).map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select>
            </div>
            {s.body && <div className="text-sm mt-1" style={{ color: INK, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{s.body}</div>}
            <div className="text-xs mt-1" style={{ color: MUTED }}>{dmy(s.created_at)} · {s.priority}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

/* ================================================================ ask genie */
interface Turn { role: "user" | "assistant"; text: string; tools?: string[] }

function AskGenie() {
  const [chats, , reloadChats] = useLoad<{ chats: { id: string; title: string; turns: number; updated_at: string }[] }>("/api/saamaan/inventory/ask");
  const [id, setId] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);
  const open = useCallback(async (cid: string) => {
    setId(cid); setErr("");
    if (!cid) { setTurns([]); return; }
    const r = await fetch(`/api/saamaan/inventory/ask?id=${cid}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setTurns(r?.turns ?? []);
  }, []);
  const ask = async () => {
    const q = text.trim(); if (!q || busy) return;
    setText(""); setErr(""); setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }, { role: "assistant", text: "", tools: [] }]);
    try {
      const res = await fetch("/api/saamaan/inventory/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, text: q }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `The server answered ${res.status}.`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; d?: string; id?: string; name?: string; ok?: boolean; error?: string };
          if (ev.t === "chat" && ev.id) setId(ev.id);
          if (ev.t === "text" && ev.d) setTurns((t) => { const c = [...t]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, text: last.text + ev.d }; return c; });
          if (ev.t === "tool" && ev.name && ev.ok === undefined) setTurns((t) => { const c = [...t]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, tools: [...(last.tools || []), ev.name!] }; return c; });
          if (ev.t === "error") setErr(ev.error || "Genie stopped.");
        }
      }
      reloadChats();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const TOOL_WORDS: Record<string, string> = { inventory_summary: "reading the stock", search_items: "searching items", item_stock: "reading an item's stock", warehouse_items: "reading a warehouse", count_sheets: "reading the counts", suspense_list: "reading the suspense" };
  const starters = ["What is our RM stock today, and how much of it is class A?", "Which warehouses are untyped, and how much sits in them?", "Show me the open suspense, largest first.", "Where is ISMC 75 and how much do we have?"];
  return (
    <div className="flex gap-3" style={{ alignItems: "stretch" }}>
      <div className="hidden md:block rounded-lg border bg-white p-2" style={{ borderColor: BORDER, width: 230, flexShrink: 0, maxHeight: "72vh", overflowY: "auto" }}>
        <button onClick={() => open("")} className="w-full text-left text-sm font-bold rounded px-2 py-1.5 mb-1" style={{ background: !id ? NAVY_SOFT : "transparent", color: NAVY }}>+ New conversation</button>
        {(chats?.chats ?? []).map((c) => (
          <button key={c.id} onClick={() => open(c.id)} className="w-full text-left text-xs rounded px-2 py-1.5" style={{ background: id === c.id ? NAVY_SOFT : "transparent", color: INK }}>
            <div className="font-bold truncate">{c.title || "Untitled"}</div><div style={{ color: MUTED }}>{dmy(c.updated_at)} · {c.turns} turn{c.turns === 1 ? "" : "s"}</div>
          </button>
        ))}
      </div>
      <div className="flex-1 rounded-lg border bg-white flex flex-col" style={{ borderColor: BORDER, minHeight: "64vh", maxHeight: "76vh" }}>
        <div className="flex-1 p-3" style={{ overflowY: "auto" }}>
          {turns.length === 0 && (
            <div className="text-sm" style={{ color: MUTED }}>
              <div className="font-bold mb-2" style={{ color: INK }}>Ask Genie about the inventory</div>
              Every answer is read live — the ERP&apos;s stock, the counts, the suspense. Genie reads; it changes nothing.
              <div className="flex gap-2 flex-wrap mt-3">{starters.map((s) => <button key={s} onClick={() => setText(s)} className="text-xs rounded border px-2 py-1" style={{ borderColor: BORDER, color: NAVY }}>{s}</button>)}</div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="mb-3" style={{ display: "flex", justifyContent: t.role === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-lg px-3 py-2 text-sm" style={{ maxWidth: "86%", background: t.role === "user" ? NAVY : "#F7F5EF", color: t.role === "user" ? "#fff" : INK, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                {t.tools && t.tools.length > 0 && <div className="text-xs mb-1" style={{ color: MUTED }}>{[...new Set(t.tools)].map((x) => TOOL_WORDS[x] || x).join(" · ")}…</div>}
                {t.text || (busy && i === turns.length - 1 ? <span style={{ color: MUTED }}>thinking…</span> : "")}
              </div>
            </div>
          ))}
          {err && <Note kind="error">{err}</Note>}
          <div ref={end} />
        </div>
        <div className="p-2 flex gap-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            rows={2} placeholder="Ask about stock, an item, a warehouse, the counts, the suspense…" className="flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, resize: "none" }} />
          <Btn kind="primary" onClick={ask} disabled={busy || !text.trim()}>{busy ? "…" : "Ask"}</Btn>
        </div>
      </div>
    </div>
  );
}

void useMemo;
