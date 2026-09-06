"use client";

/**
 * Seva — the customer-service module (Dr Raghu, 30 Aug 2026):
 * "Seva - customer service. follow same genie database. import annual
 * maintenance. issues. add fields as needed. all masters in settings.
 * access to those that need to be given in users."
 *
 * Four doors: the Dashboard (what is owed today), Issues (what the customer
 * says is wrong, driven to a resolution), AMC (the annual-maintenance
 * register, imported from the Excel or typed), and Settings — where EVERY
 * dropdown in the module is a row somebody can edit, not a constant in code.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { swallow } from "@/lib/swallow";
import { APP_VERSION } from "@/lib/version";
import ModuleMenu from "@/components/ModuleMenu";
import { dmy as fmtD, rupee } from "@/lib/fmt";
const money = (n: unknown) => rupee(n);

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A", RED = "#B3261E", GREEN = "#0D7A3F", TEAL = "#0F766E";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "issues", label: "Issues", icon: "⚠" },
  { key: "amc", label: "Annual Maintenance", icon: "📅" },
  { key: "push", label: "Push — 1:1", icon: "⇢" },
  { key: "settings", label: "Settings — masters", icon: "⚙" },
];

type Row = Record<string, unknown> & { id: string };
type Master = { id: string; kind: string; label: string; sort_order: number };

const S = (v: unknown) => String(v ?? "");

const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Days from today to a date — negative means it has already gone by. */
const daysTo = (d: unknown) => {
  const s = S(d).slice(0, 10);
  if (!/^\d{4}/.test(s)) return null;
  return Math.round((new Date(s).getTime() - new Date(TODAY()).getTime()) / 86400000);
};

function useReg(kind: string): [Row[] | null, Master[], boolean, () => void] {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const [installed, setInstalled] = useState(true);
  const load = useCallback(() => {
    fetch(`/api/seva/reg?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setMasters(j.masters || []); setInstalled(j.installed !== false); })
      .catch(() => setRows([]));
  }, [kind]);
  useEffect(() => { load(); }, [load]);
  return [rows, masters, installed, load];
}
async function saveReg(kind: string, action: string, id: string | undefined, row: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/seva/reg", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, action, id, row }),
  });
  if (!r.ok) return (await r.json()).error || "Could not save";
  return "";
}
/** The labels of one master kind, in the order Settings put them. */
const pick = (masters: Master[], kind: string) =>
  masters.filter((m) => m.kind === kind).map((m) => m.label);

// ---------------------------------------------------------------- furniture
const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{children}</th>
);
const Shell = ({ title, blurb, onAdd, addLabel = "+ Add", extra, children, installed }: {
  title: string; blurb: string; onAdd?: () => void; addLabel?: string;
  extra?: React.ReactNode; children: React.ReactNode; installed: boolean;
}) => (
  <div style={{ maxWidth: 1180 }}>
    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
      <div>
        <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
        <div className="text-sm" style={{ color: "#5A6672", maxWidth: 720, lineHeight: 1.5 }}>{blurb}</div>
      </div>
      <div className="flex gap-2 items-center">
        {extra}
        {onAdd && <button onClick={onAdd} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>{addLabel}</button>}
      </div>
    </div>
    {!installed && (
      <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
        Run migration 0107 first — Seva&apos;s tables don&apos;t exist yet.
      </div>
    )}
    {children}
  </div>
);
const Box = ({ children, min = 900 }: { children: React.ReactNode; min?: number }) => (
  <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh" }}>
    <table className="w-full text-xs" style={{ minWidth: min, borderCollapse: "separate", borderSpacing: 0 }}>{children}</table>
  </div>
);
const Modal = ({ onClose, children, width = 640 }: { onClose: () => void; children: React.ReactNode; width?: number }) => (
  <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: width, maxHeight: "90vh", overflow: "auto" }}>
      {children}
    </div>
  </div>
);
const L = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>{children}</span>
);
const inputCss = { borderColor: BORDER } as const;
const Chip = ({ s, colour }: { s: string; colour: string }) => (
  <span className="rounded px-2 py-0.5 text-xs font-bold text-white whitespace-nowrap" style={{ background: colour }}>{s || "—"}</span>
);
/** Status colours by meaning rather than by name, since the names are masters. */
const statusColour = (s: string) => {
  const t = s.toLowerCase();
  // The ERP's own AMC words first — they are what the register actually says.
  if (/valid|paid/.test(t)) return GREEN;
  if (/lapse|expired/.test(t)) return RED;
  if (/cancelled/.test(t)) return "#5A6672";
  if (/warranty/.test(t)) return "#1B6B93";
  if (/chargable|chargeable/.test(t)) return "#D97706";
  if (/closed|resolved|complete|done/.test(t)) return GREEN;
  if (/progress|active/.test(t)) return "#1B6B93";
  if (/waiting|hold|renewal|due/.test(t)) return "#D97706";
  if (/open|breakdown/.test(t)) return RED;
  return MUTED;
};
/** A field the masters fill: a picker when there are options, free text otherwise. */
const MasterPick = ({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) => (
  options.length > 0 ? (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm bg-white" style={inputCss}>
      <option value="">—</option>
      {options.map((o) => (<option key={o}>{o}</option>))}
      {value && !options.includes(value) && <option value={value}>{value} (retired)</option>}
    </select>
  ) : (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="add options in Settings" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} />
  )
);

// ============================ ISSUES ============================
function IssuesScreen() {
  const [rows, masters, installed, load] = useReg("issue");
  const [open, setOpen] = useState<Row | "new" | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("open");

  const closedish = (s: string) => /closed|resolved/i.test(s);
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((r) => {
    if (statusF === "open" && closedish(S(r.status))) return false;
    if (statusF !== "open" && statusF !== "all" && S(r.status) !== statusF) return false;
    return !needle || `${S(r.title)} ${S(r.customer)} ${S(r.machine)} ${S(r.serial_no)} ${S(r.owner)}`.toLowerCase().includes(needle);
  });

  return (
    <Shell installed={installed} title="Issues" onAdd={() => setOpen("new")} addLabel="+ Log an issue"
      blurb="What the customer says is wrong — logged the hour it arrives, owned by a name, and closed only when the resolution is written down."
      extra={
        <>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-white font-semibold" style={{ borderColor: statusF === "all" ? BORDER : ORANGE }}>
            <option value="open">Open only</option>
            <option value="all">All statuses</option>
            {pick(masters, "issue_status").map((s) => (<option key={s}>{s}</option>))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 customer, machine, serial…" className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 220 }} />
        </>
      }>
      <Box min={1020}>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>Issue</Th><Th>Customer</Th><Th>Machine / serial</Th><Th>Category</Th><Th>Owner</Th><Th>Due</Th><Th>Logged</Th>
        </tr></thead>
        <tbody>
          {rows && shown.length === 0 && (<tr><td colSpan={8} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {rows.length ? "Nothing matches the filter." : "No issues logged — the first call from a customer belongs here."}</td></tr>)}
          {!rows && (<tr><td colSpan={8} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {shown.map((r, i) => {
            const late = daysTo(r.due);
            const overdue = late != null && late < 0 && !closedish(S(r.status));
            return (
              <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
                <td className="px-2 py-1.5"><Chip s={S(r.status)} colour={statusColour(S(r.status))} /></td>
                <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.title)}</td>
                <td className="px-2 py-1.5">{S(r.customer) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.machine)}{r.serial_no ? ` · ${S(r.serial_no)}` : ""}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.category) || "—"}</td>
                <td className="px-2 py-1.5">{S(r.owner) || "—"}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: overdue ? RED : MUTED, fontWeight: overdue ? 700 : 400 }}>
                  {fmtD(r.due)}{overdue ? ` · ${-late!}d late` : ""}
                </td>
                <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{fmtD(r.at)}</td>
              </tr>
            );
          })}
        </tbody>
      </Box>
      {open && <IssueBox row={open === "new" ? null : open} masters={masters} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}

function IssueBox({ row, masters, onClose, onSaved }: { row: Row | null; masters: Master[]; onClose: () => void; onSaved: () => void }) {
  const statuses = pick(masters, "issue_status");
  const [f, setF] = useState(() => ({
    title: S(row?.title), customer: S(row?.customer), machine: S(row?.machine), serial_no: S(row?.serial_no),
    category: S(row?.category), reported_via: S(row?.reported_via),
    status: S(row?.status) || statuses[0] || "Open", owner: S(row?.owner),
    due: S(row?.due).slice(0, 10), description: S(row?.description),
    resolution: S(row?.resolution), resolved_at: S(row?.resolved_at).slice(0, 10),
  }));
  const [err, setErr] = useState("");
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const save = async () => {
    if (!f.title.trim()) { setErr("An issue needs its one line."); return; }
    // Closing an issue stamps the day it closed, unless a day is already given.
    const payload = { ...f, resolved_at: f.resolved_at || (/closed|resolved/i.test(f.status) ? TODAY() : "") };
    const e = await saveReg("issue", row ? "update" : "add", row?.id, payload);
    if (e) setErr(e); else onSaved();
  };
  return (
    <Modal onClose={onClose} width={720}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The issue" : "Log an issue"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div><L>What is wrong, in one line</L>
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 200px" }}><L>Customer</L>
            <input value={f.customer} onChange={(e) => set({ customer: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div style={{ flex: "1 1 160px" }}><L>Machine</L>
            <input value={f.machine} onChange={(e) => set({ machine: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div style={{ flex: "1 1 130px" }}><L>Serial no.</L>
            <input value={f.serial_no} onChange={(e) => set({ serial_no: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 150px" }}><L>Category</L>
            <MasterPick value={f.category} options={pick(masters, "issue_category")} onChange={(v) => set({ category: v })} /></div>
          <div style={{ flex: "1 1 150px" }}><L>Reported via</L>
            <MasterPick value={f.reported_via} options={pick(masters, "reported_via")} onChange={(v) => set({ reported_via: v })} /></div>
          <div style={{ flex: "1 1 150px" }}><L>Owner — the engineer</L>
            <MasterPick value={f.owner} options={pick(masters, "engineer")} onChange={(v) => set({ owner: v })} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 150px" }}><L>Status</L>
            <MasterPick value={f.status} options={statuses} onChange={(v) => set({ status: v })} /></div>
          <div><L>Due</L>
            <input type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} className="border rounded px-2 py-1.5 text-sm tnum" style={inputCss} /></div>
          <div><L>Resolved on</L>
            <input type="date" value={f.resolved_at} onChange={(e) => set({ resolved_at: e.target.value })} className="border rounded px-2 py-1.5 text-sm tnum" style={inputCss} /></div>
        </div>
        <div><L>What happened — the customer&apos;s words, and what was seen</L>
          <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div><L>The resolution — what was actually done</L>
          <textarea value={f.resolution} onChange={(e) => set({ resolution: e.target.value })} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1 flex-wrap items-start">
          <button onClick={save} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          {row && <PushFrom kind="issue" id={row.id} subject={f.title} />}
          {row && <button onClick={async () => { if (window.confirm("Remove this issue?")) { await saveReg("issue", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============================ AMC ============================
function AmcScreen() {
  const [rows, masters, installed, load] = useReg("amc");
  const [open, setOpen] = useState<Row | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !needle
    || `${S(r.customer)} ${S(r.machine)} ${S(r.serial_no)} ${S(r.contract_no)} ${S(r.location)} ${S(r.engineer)}`.toLowerCase().includes(needle));

  return (
    <Shell installed={installed} title="Annual Maintenance" onAdd={() => setOpen("new")} addLabel="+ Add a contract"
      blurb="Every AMC on one register — who it covers, from when to when, how many visits are owed and how many have been made. Import the Excel once, then keep it here."
      extra={
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 customer, serial, contract…" className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 220 }} />
          <button onClick={() => setPulling(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "#1B3A5C", color: "#1B3A5C" }}
            title="Read the Annual Maintenance Contracts straight off nandanerp">⇩ Pull from ERP</button>
          <button onClick={() => setImporting(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: TEAL, color: TEAL }}>⇪ Import</button>
        </>
      }>
      <Box min={1180}>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>Customer</Th><Th>Machine / serial</Th><Th>Contract</Th><Th>From</Th><Th>To</Th><Th right>Visits</Th><Th right>Value</Th><Th>Engineer</Th>
        </tr></thead>
        <tbody>
          {rows && shown.length === 0 && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {rows.length ? "Nothing matches the search." : "The register is empty — ⇪ Import brings the Excel in, or add one contract by hand."}</td></tr>)}
          {!rows && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {shown.map((r, i) => {
            const left = daysTo(r.end_date);
            const ending = left != null && left >= 0 && left <= 60;
            const gone = left != null && left < 0;
            return (
              <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
                <td className="px-2 py-1.5"><Chip s={S(r.status)} colour={statusColour(S(r.status))} /></td>
                <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.customer)}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.machine)}{r.serial_no ? ` · ${S(r.serial_no)}` : ""}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.contract_no) || "—"}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{fmtD(r.start_date)}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: gone ? RED : ending ? "#B26A00" : MUTED, fontWeight: gone || ending ? 700 : 400 }}
                  title={r.dates_derived ? "The ERP holds no end date for this contract — this is one year from its contract date" : undefined}>
                  {r.dates_derived ? "≈" : ""}{fmtD(r.end_date)}{gone ? " · over" : ending ? ` · ${left}d` : ""}
                </td>
                <td className="px-2 py-1.5 text-right tnum">{S(r.visits_done) || 0}{r.visits_planned != null ? ` / ${S(r.visits_planned)}` : ""}</td>
                <td className="px-2 py-1.5 text-right tnum">{money(r.value)}</td>
                <td className="px-2 py-1.5">{S(r.engineer) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </Box>
      {open && <AmcBox row={open === "new" ? null : open} masters={masters} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {importing && <AmcImport onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
      {pulling && <AmcErpPull onClose={() => setPulling(false)} onDone={load} />}
    </Shell>
  );
}

function AmcBox({ row, masters, onClose, onSaved }: { row: Row | null; masters: Master[]; onClose: () => void; onSaved: () => void }) {
  const statuses = pick(masters, "amc_status");
  const [f, setF] = useState(() => ({
    customer: S(row?.customer), machine: S(row?.machine), serial_no: S(row?.serial_no),
    contract_no: S(row?.contract_no), location: S(row?.location),
    start_date: S(row?.start_date).slice(0, 10), end_date: S(row?.end_date).slice(0, 10),
    visits_planned: row?.visits_planned == null ? "" : S(row.visits_planned),
    visits_done: row?.visits_done == null ? "" : S(row.visits_done),
    value: row?.value == null ? "" : S(row.value),
    engineer: S(row?.engineer), status: S(row?.status) || statuses[0] || "AMC valid paid", notes: S(row?.notes),
    territory: S(row?.territory), billed: row?.billed == null ? "" : S(row.billed),
  }));
  const [err, setErr] = useState("");
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const save = async () => {
    if (!f.customer.trim()) { setErr("A contract needs its customer."); return; }
    const e = await saveReg("amc", row ? "update" : "add", row?.id, f);
    if (e) setErr(e); else onSaved();
  };
  return (
    <Modal onClose={onClose} width={720}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The contract" : "Add a contract"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 240px" }}><L>Customer</L>
            <input value={f.customer} onChange={(e) => set({ customer: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div style={{ flex: "1 1 160px" }}><L>Location / site</L>
            <input value={f.location} onChange={(e) => set({ location: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 180px" }}><L>Machine</L>
            <input value={f.machine} onChange={(e) => set({ machine: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div style={{ flex: "1 1 130px" }}><L>Serial no.</L>
            <input value={f.serial_no} onChange={(e) => set({ serial_no: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div style={{ flex: "1 1 130px" }}><L>Contract no.</L>
            <input value={f.contract_no} onChange={(e) => set({ contract_no: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div><L>From</L>
            <input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} className="border rounded px-2 py-1.5 text-sm tnum" style={inputCss} /></div>
          <div><L>To</L>
            <input type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} className="border rounded px-2 py-1.5 text-sm tnum" style={inputCss} /></div>
          <div><L>Visits owed</L>
            <input value={f.visits_planned} onChange={(e) => set({ visits_planned: e.target.value.replace(/[^0-9]/g, "") })} className="border rounded px-2 py-1.5 text-sm tnum text-right" style={{ ...inputCss, width: 80 }} /></div>
          <div><L>Visits made</L>
            <input value={f.visits_done} onChange={(e) => set({ visits_done: e.target.value.replace(/[^0-9]/g, "") })} className="border rounded px-2 py-1.5 text-sm tnum text-right" style={{ ...inputCss, width: 80 }} /></div>
          <div><L>Value ₹</L>
            <input value={f.value} onChange={(e) => set({ value: e.target.value.replace(/[^0-9.]/g, "") })} className="border rounded px-2 py-1.5 text-sm tnum text-right" style={{ ...inputCss, width: 110 }} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div style={{ flex: "1 1 180px" }}><L>Engineer</L>
            <MasterPick value={f.engineer} options={pick(masters, "engineer")} onChange={(v) => set({ engineer: v })} /></div>
          <div style={{ flex: "1 1 180px" }}><L>Status</L>
            <MasterPick value={f.status} options={statuses} onChange={(v) => set({ status: v })} /></div>
          <div><L>Billed ₹</L>
            <input value={f.billed} onChange={(e) => set({ billed: e.target.value.replace(/[^0-9.]/g, "") })} className="border rounded px-2 py-1.5 text-sm tnum text-right" style={{ ...inputCss, width: 110 }} /></div>
          <div style={{ flex: "1 1 140px" }}><L>Territory</L>
            <input value={f.territory} onChange={(e) => set({ territory: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        {row?.erp_name != null && S(row.erp_name) !== "" && (
          <div className="text-xs rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
            From the ERP as <b>{S(row.erp_name)}</b>{row.pulled_at ? `, last read ${stamp(row.pulled_at)}` : ""}.
            {row.dates_derived ? " Its end date is ≈ — one year from the contract date, because the ERP holds none." : ""}
            {" "}A re-pull refreshes the ERP&apos;s own columns; the visits made, notes, serial and location stay yours.
          </div>
        )}
        <div><L>Notes</L>
          <textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1 flex-wrap items-start">
          <button onClick={save} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          {row && <PushFrom kind="amc" id={row.id} subject={`AMC — ${f.customer}${f.machine ? ` · ${f.machine}` : ""}`} />}
          {row && <button onClick={async () => { if (window.confirm("Remove this contract?")) { await saveReg("amc", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

/**
 * ⇩ PULL FROM ERP (Dr Raghu, 30 Aug 2026, handing over the AMC report link).
 *
 * The statuses are counted off the ERP first and shown with their numbers, so
 * the choice is made against the real register rather than a remembered one —
 * his link filtered to "AMC valid paid", and this opens on exactly that,
 * with the lapsed ones one tick away because 280 lapsed contracts are 280
 * renewal conversations.
 */
function AmcErpPull({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [survey, setSurvey] = useState<{ total: number; statuses: { status: string; count: number }[] } | null>(null);
  const [chosen, setChosen] = useState<string[]>(["AMC valid paid"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch("/api/seva/erp-amc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "survey" }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "The ERP would not answer"); return j; })
      .then((j) => setSurvey({ total: j.total, statuses: j.statuses || [] }))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const toggle = (s: string) => setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const picked = (survey?.statuses || []).filter((s) => chosen.includes(s.status)).reduce((a, b) => a + b.count, 0);

  const run = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/seva/erp-amc", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pull", statuses: chosen }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "The pull was refused"); return; }
    setDone(j); onDone();
  };

  return (
    <Modal onClose={onClose} width={620}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>Pull the AMC register from the ERP</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      {!survey && !err && <div className="text-sm" style={{ color: MUTED }}>Counting what the ERP holds…</div>}
      {survey && !done && (
        <>
          <div className="text-xs mb-2 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.6 }}>
            <b>{survey.total}</b> Annual Maintenance Contracts stand on nandanerp. Pick which to bring.
            The ERP is <b>read only</b> — nothing there is touched. A contract already here is refreshed rather
            than duplicated, and the visits made, notes, serial and location your team typed are left alone.
          </div>
          {survey.statuses.map((s) => (
            <label key={s.status} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
              <input type="checkbox" checked={chosen.includes(s.status)} onChange={() => toggle(s.status)} style={{ accentColor: TEAL, width: 14, height: 14 }} />
              <Chip s={s.status} colour={statusColour(s.status)} />
              <span className="tnum" style={{ color: MUTED }}>{s.count}</span>
            </label>
          ))}
          <div className="text-xs mt-2 rounded p-2" style={{ background: "#FCF6E8", color: "#8A6D1A", lineHeight: 1.6 }}>
            <b>About the dates.</b> The ERP keeps the machine and the contract dates in a child table that is
            empty on 349 of its 362 contracts. Where it is filled, it is believed. Where it is not, the end date
            is taken as one year from the contract date and marked <b>≈</b> on the register — so a renewal view
            exists, and nobody mistakes the inference for the ERP&apos;s word.
          </div>
          {err && <div className="text-xs font-bold mt-2" style={{ color: RED }}>{err}</div>}
          <div className="flex gap-2 mt-3">
            <button onClick={run} disabled={busy || !chosen.length} className="rounded px-4 py-1.5 text-sm font-bold text-white"
              style={{ background: busy || !chosen.length ? "#B9BEC4" : "#1B3A5C" }}>
              {busy ? "Reading the ERP…" : `⇩ Pull ${picked} contract${picked === 1 ? "" : "s"}`}
            </button>
            <button onClick={onClose} className="rounded px-3 py-1.5 text-sm font-bold" style={{ color: MUTED }}>Cancel</button>
          </div>
        </>
      )}
      {done && (
        <>
          <div className="text-sm" style={{ color: INK, lineHeight: 1.8 }}>
            <b style={{ color: GREEN }}>Done.</b> {done.found} read from the ERP — <b>{done.added}</b> new, <b>{done.updated}</b> refreshed
            {done.failed ? <>, <b style={{ color: RED }}>{done.failed}</b> the ERP would not give</> : null}.
            <div className="text-xs mt-1" style={{ color: MUTED }}>
              Dates: {done.datesFromItem} read from the ERP&apos;s own item row, {done.datesDerived} derived to a year (shown ≈)
              {done.datesMissing ? `, ${done.datesMissing} with no date at all` : ""}.
            </div>
          </div>
          <button onClick={onClose} className="rounded px-4 py-1.5 text-sm font-bold text-white mt-3" style={{ background: ORANGE }}>Close</button>
        </>
      )}
      {err && !survey && <div className="text-xs font-bold mt-2" style={{ color: RED }}>{err}</div>}
    </Modal>
  );
}

/**
 * THE AMC IMPORT (Dr Raghu, 30 Aug 2026: "import annual maintenance").
 *
 * Paste the sheet — headers and all — straight out of Excel. The columns are
 * matched by their NAMES rather than their positions, because no two exports
 * put them in the same order; anything unrecognised is ignored and said so
 * before a single row is written. Nothing is saved until the preview is seen.
 */
const COLUMN_ALIASES: [string, RegExp][] = [
  ["customer", /^(customer|client|party|company)( name)?$/i],
  ["machine", /^(machine|equipment|product|model)( name| type)?$/i],
  ["serial_no", /^(serial|sr|s\.?no|machine no|serial number|serial no\.?)$/i],
  ["contract_no", /^(contract|amc|contract no\.?|amc no\.?|agreement)( number)?$/i],
  ["location", /^(location|site|city|place|address)$/i],
  ["start_date", /^(start|from|start date|amc start|commencement)( date)?$/i],
  ["end_date", /^(end|to|end date|expiry|amc end|valid till|due)( date)?$/i],
  ["visits_planned", /^(visits|visits planned|planned visits|no of visits|total visits)$/i],
  ["visits_done", /^(visits done|completed visits|done|visits completed)$/i],
  ["value", /^(value|amount|amc value|contract value|₹|rs\.?)$/i],
  ["engineer", /^(engineer|service engineer|owner|assigned to|technician)$/i],
  ["status", /^(status|amc status|state)$/i],
  ["notes", /^(notes?|remarks?|comments?)$/i],
];
const NUMERIC = new Set(["visits_planned", "visits_done", "value"]);
const DATEY = new Set(["start_date", "end_date"]);

/** Excel writes dates six ways; these are the ones that actually turn up. */
function toISO(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    const [, a, b, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    // Indian sheets are day-first; a first number above 12 settles it either way.
    return `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA");
}

function AmcImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) return null;
    const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    const head = split(lines[0]);
    const map = head.map((h) => COLUMN_ALIASES.find(([, re]) => re.test(h.trim()))?.[0] ?? null);
    const unknown = head.filter((h, i) => !map[i] && h.trim() !== "");
    const rows = lines.slice(1).map((l) => {
      const cells = split(l);
      const row: Record<string, string> = {};
      map.forEach((field, i) => {
        if (!field) return;
        const raw = cells[i] ?? "";
        row[field] = DATEY.has(field) ? toISO(raw) : NUMERIC.has(field) ? raw.replace(/[^0-9.]/g, "") : raw;
      });
      return row;
    }).filter((r) => (r.customer || "").trim() !== "");
    return { matched: map.filter(Boolean) as string[], unknown, rows };
  }, [text]);

  const run = async () => {
    if (!parsed || parsed.rows.length === 0) { setErr("Nothing to import yet."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/seva/reg", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "amc", action: "import", rows: parsed.rows }),
    });
    setBusy(false);
    if (!r.ok) { setErr((await r.json()).error || "The import was refused"); return; }
    onDone();
  };

  return (
    <Modal onClose={onClose} width={780}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>Import annual maintenance</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="text-xs mb-2 rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.6 }}>
        Copy the sheet in Excel — <b>including the header row</b> — and paste it below. Columns are matched by
        name, in any order: Customer, Machine, Serial, Contract, Location, Start, End, Visits, Visits done,
        Value, Engineer, Status, Notes. A row with no customer is skipped. Nothing is written until you press Import.
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
        placeholder="Customer&#9;Machine&#9;Serial&#9;Start&#9;End&#9;Visits&#9;Value…"
        className="w-full border rounded px-2 py-1.5 text-xs" style={{ ...inputCss, fontFamily: "ui-monospace, monospace" }} />
      {parsed && (
        <div className="mt-2">
          <div className="text-xs mb-1" style={{ color: MUTED }}>
            <b style={{ color: parsed.rows.length ? GREEN : RED }}>{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}</b>
            {" · "}columns read: {parsed.matched.join(", ") || "none"}
            {parsed.unknown.length > 0 && <span style={{ color: "#B26A00" }}> · ignored: {parsed.unknown.join(", ")}</span>}
          </div>
          <div className="border rounded overflow-auto" style={{ borderColor: BORDER, maxHeight: 200 }}>
            <table className="text-xs w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead><tr style={{ background: "#22303C", color: "#fff" }}>
                {parsed.matched.map((c) => (<th key={c} className="px-2 py-1 text-left whitespace-nowrap">{c}</th>))}
              </tr></thead>
              <tbody>
                {parsed.rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    {parsed.matched.map((c) => (<td key={c} className="px-2 py-1 whitespace-nowrap">{r[c] || "—"}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 20 && <div className="text-xs mt-1" style={{ color: MUTED }}>…and {parsed.rows.length - 20} more.</div>}
        </div>
      )}
      {err && <div className="text-xs font-bold mt-2" style={{ color: RED }}>{err}</div>}
      <div className="flex gap-2 mt-3">
        <button onClick={run} disabled={busy || !parsed?.rows.length}
          className="rounded px-4 py-1.5 text-sm font-bold text-white"
          style={{ background: busy || !parsed?.rows.length ? "#B9BEC4" : TEAL }}>
          {busy ? "Importing…" : `⇪ Import ${parsed?.rows.length || 0} contracts`}
        </button>
        <button onClick={onClose} className="rounded px-3 py-1.5 text-sm font-bold" style={{ color: MUTED }}>Cancel</button>
      </div>
    </Modal>
  );
}

// ============================ THE 1:1 PUSH ============================
/**
 * "build a 1:1 push system here" (Dr Raghu, 30 Aug 2026).
 *
 * ONE SENDER, ONE RECIPIENT — never a group. A push has two names on it, and
 * a message with two names cannot be left for somebody else to pick up. The
 * answer comes back on the same row: sent → seen → replied → closed, each
 * step stamped with the minute it happened.
 */
type Push = {
  id: string; from_email: string; to_email: string; subject: string; body: string;
  ref_kind: string; ref_id: string | null; priority: string; status: string;
  reply: string; seen_at: string | null; replied_at: string | null; at: string;
};
const PUSH_COLOUR: Record<string, string> = { sent: RED, seen: "#D97706", replied: "#1B6B93", closed: GREEN };
const stamp = (at: unknown) =>
  at ? new Date(S(at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function usePush(ref?: { kind: string; id: string }) {
  const [data, setData] = useState<{ installed: boolean; inbox: Push[]; sent: Push[]; people: { email: string; name: string }[]; me: string } | null>(null);
  const load = useCallback(() => {
    const qs = ref ? `?ref_kind=${ref.kind}&ref_id=${ref.id}` : "";
    fetch(`/api/seva/push${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData({ installed: j.installed !== false, inbox: j.inbox || [], sent: j.sent || [], people: j.people || [], me: j.me || "" }))
      .catch(() => setData({ installed: true, inbox: [], sent: [], people: [], me: "" }));
  }, [ref?.kind, ref?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return [data, load] as const;
}
async function pushAct(payload: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/seva/push", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) return (await r.json()).error || "The push did not go";
  return "";
}

function PushScreen() {
  const [data, load] = usePush();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [compose, setCompose] = useState(false);
  const [open, setOpen] = useState<Push | null>(null);

  const rows = tab === "inbox" ? data?.inbox || [] : data?.sent || [];
  const awaiting = (data?.inbox || []).filter((p) => p.status === "sent" || p.status === "seen").length;
  const unanswered = (data?.sent || []).filter((p) => p.status === "sent" || p.status === "seen").length;

  return (
    <Shell installed={data?.installed !== false} title="Push — 1:1" onAdd={() => setCompose(true)} addLabel="⇢ Push to someone"
      blurb="One person to one person. A push carries a name at each end, so it cannot be left for somebody else to pick up — and the answer comes back on the same row."
      extra={
        <div className="flex rounded border overflow-hidden" style={{ borderColor: BORDER }}>
          <button onClick={() => setTab("inbox")} className="px-3 py-1.5 text-sm font-bold"
            style={tab === "inbox" ? { background: INK, color: "#fff" } : { color: "#5A6672", background: "#fff" }}>
            To me{awaiting > 0 ? ` · ${awaiting}` : ""}
          </button>
          <button onClick={() => setTab("sent")} className="px-3 py-1.5 text-sm font-bold"
            style={tab === "sent" ? { background: INK, color: "#fff" } : { color: "#5A6672", background: "#fff" }}>
            From me{unanswered > 0 ? ` · ${unanswered}` : ""}
          </button>
        </div>
      }>
      <Box min={880}>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>{tab === "inbox" ? "From" : "To"}</Th><Th>Subject</Th><Th>About</Th><Th>Pushed</Th><Th>Answered</Th>
        </tr></thead>
        <tbody>
          {data && rows.length === 0 && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {tab === "inbox" ? "Nothing has been pushed to you." : "You have pushed nothing yet — ⇢ Push to someone hands one person one thing."}</td></tr>)}
          {!data && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {rows.map((p, i) => (
            <tr key={p.id} className="border-t" onClick={() => setOpen(p)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
              <td className="px-2 py-1.5"><Chip s={p.status} colour={PUSH_COLOUR[p.status] || MUTED} /></td>
              <td className="px-2 py-1.5">{(tab === "inbox" ? p.from_email : p.to_email).split("@")[0]}</td>
              <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.priority === "urgent" && <span style={{ color: RED }}>❗ </span>}{p.subject}
              </td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{p.ref_kind === "issue" ? "an issue" : p.ref_kind === "amc" ? "a contract" : "—"}</td>
              <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{stamp(p.at)}</td>
              <td className="px-2 py-1.5 tnum" style={{ color: p.replied_at ? GREEN : MUTED }}>{p.replied_at ? stamp(p.replied_at) : "awaited"}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      {compose && <PushBox people={data?.people || []} onClose={() => setCompose(false)} onSent={() => { setCompose(false); load(); }} />}
      {open && <PushRead p={open} me={data?.me || ""} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}

/** Compose — one recipient, and the field will not take a second. */
function PushBox({ people, ref_, onClose, onSent }: {
  people: { email: string; name: string }[];
  ref_?: { kind: string; id: string; subject: string };
  onClose: () => void; onSent: () => void;
}) {
  const [f, setF] = useState({ to: "", subject: ref_?.subject ?? "", body: "", priority: "normal" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setErr("");
    const e = await pushAct({ action: "send", ...f, ref_kind: ref_?.kind, ref_id: ref_?.id });
    setBusy(false);
    if (e) setErr(e); else onSent();
  };
  return (
    <Modal onClose={onClose} width={600}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>Push it to one person</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div><L>To — one person, and only one</L>
          <input list="seva-people" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}
            placeholder="start typing a name or an email…" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} />
          <datalist id="seva-people">{people.map((p) => (<option key={p.email} value={p.email}>{p.name}</option>))}</datalist></div>
        <div className="flex gap-2">
          <div className="flex-1"><L>What you need, in one line</L>
            <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div><L>Priority</L>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white" style={{ ...inputCss, color: f.priority === "urgent" ? RED : INK, fontWeight: 700 }}>
              <option value="normal">normal</option><option value="urgent">urgent</option>
            </select></div>
        </div>
        <div><L>The detail</L>
          <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        {ref_ && <div className="text-xs" style={{ color: MUTED }}>Attached to {ref_.kind === "issue" ? "this issue" : "this contract"} — the push opens beside it.</div>}
        <div className="text-xs rounded p-2" style={{ background: "#F4F2EC", color: "#5A6672", lineHeight: 1.5 }}>
          It rings their bell at once, and their answer rings yours. If they have no Genie account yet, the push
          waits on their name until they sign in.
        </div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={send} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
            {busy ? "Pushing…" : "⇢ Push"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Read one push — and, if it came to you, answer it. */
function PushRead({ p, me, onClose, onChanged }: { p: Push; me: string; onClose: () => void; onChanged: () => void }) {
  const toMe = p.to_email.toLowerCase() === me;
  const [reply, setReply] = useState(p.reply || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  // Opening what came to you IS seeing it — no separate button to forget.
  useEffect(() => {
    if (toMe && p.status === "sent") void pushAct({ action: "seen", id: p.id });
  }, [toMe, p.status, p.id]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true); setErr("");
    const e = await pushAct({ ...payload, id: p.id });
    setBusy(false);
    if (e) setErr(e); else onChanged();
  };

  return (
    <Modal onClose={onClose} width={640}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="font-bold text-sm" style={{ color: INK }}>
          {p.priority === "urgent" && <span style={{ color: RED }}>❗ </span>}{p.subject}
        </div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.7 }}>
        <b style={{ color: INK }}>{p.from_email}</b> → <b style={{ color: INK }}>{p.to_email}</b><br />
        pushed {stamp(p.at)}{p.seen_at ? ` · seen ${stamp(p.seen_at)}` : " · not opened yet"}{p.replied_at ? ` · answered ${stamp(p.replied_at)}` : ""}
      </div>
      {p.body && (
        <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, color: INK }}>{p.body}</div>
      )}
      <div className="mt-3">
        <L>{toMe ? "Your answer" : "The answer"}</L>
        {toMe ? (
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3}
            placeholder="What you did, or what you need to do it" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} />
        ) : (
          <div className="rounded border p-3 text-sm" style={{ borderColor: p.reply ? GREEN : BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, color: p.reply ? INK : MUTED }}>
            {p.reply || "Awaited — they have it."}
          </div>
        )}
      </div>
      {err && <div className="text-xs font-bold mt-1" style={{ color: RED }}>{err}</div>}
      <div className="flex gap-2 mt-3 flex-wrap">
        {toMe && <button disabled={busy} onClick={() => void act({ action: "reply", reply })} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>↩ Answer</button>}
        {p.status !== "closed" && <button disabled={busy} onClick={() => void act({ action: "close" })} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: GREEN, color: GREEN }}>✓ Close it</button>}
        <span className="ml-auto"><Chip s={p.status} colour={PUSH_COLOUR[p.status] || MUTED} /></span>
      </div>
    </Modal>
  );
}

/** The ⇢ Push button that sits on a saved issue or contract. */
function PushFrom({ kind, id, subject }: { kind: "issue" | "amc"; id: string; subject: string }) {
  const [data, load] = usePush({ kind, id });
  const [compose, setCompose] = useState(false);
  const [open, setOpen] = useState<Push | null>(null);
  const threads = [...(data?.inbox || []), ...(data?.sent || [])]
    .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  return (
    <>
      <button onClick={() => setCompose(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: TEAL, color: TEAL }}
        title="Hand this to one person — their bell rings, their answer comes back here">
        ⇢ Push{threads.length > 0 ? ` · ${threads.length}` : ""}
      </button>
      {threads.length > 0 && (
        <div className="w-full mt-1">
          {threads.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="block w-full text-left text-xs py-0.5" style={{ color: MUTED }}>
              <b style={{ color: PUSH_COLOUR[p.status] || MUTED }}>{p.status}</b>
              {" · "}{p.from_email.split("@")[0]} → {p.to_email.split("@")[0]}{" · "}{p.subject}
            </button>
          ))}
        </div>
      )}
      {compose && <PushBox people={data?.people || []} ref_={{ kind, id, subject }} onClose={() => setCompose(false)} onSent={() => { setCompose(false); load(); }} />}
      {open && <PushRead p={open} me={data?.me || ""} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </>
  );
}

// ============================ SETTINGS — THE MASTERS ============================
/** Every dropdown in Seva is a row here (Dr Raghu: "all masters in settings"). */
const MASTER_KINDS: { kind: string; title: string; blurb: string }[] = [
  { kind: "issue_category", title: "Issue categories", blurb: "What kind of thing went wrong." },
  { kind: "issue_status", title: "Issue statuses", blurb: "The road from logged to closed." },
  { kind: "amc_status", title: "AMC statuses", blurb: "Where each contract stands." },
  { kind: "engineer", title: "Service engineers", blurb: "The names an issue or a contract can be owned by." },
  { kind: "reported_via", title: "Reported via", blurb: "How the customer reached us." },
];

function SettingsScreen() {
  const [rows, , installed, load] = useReg("master");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const add = async (kind: string) => {
    const label = (draft[kind] || "").trim();
    if (!label) return;
    const inKind = (rows || []).filter((r) => S(r.kind) === kind);
    const next = Math.max(0, ...inKind.map((r) => Number(r.sort_order) || 0)) + 1;
    const e = await saveReg("master", "add", undefined, { kind, label, sort_order: next });
    if (e) { setErr(e); return; }
    setErr(""); setDraft({ ...draft, [kind]: "" }); load();
  };
  const move = async (r: Row, dir: -1 | 1) => {
    const inKind = (rows || []).filter((x) => S(x.kind) === S(r.kind));
    const i = inKind.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= inKind.length) return;
    // Swap the two orders — the only thing that decides how a picker reads.
    await saveReg("master", "update", r.id, { sort_order: Number(inKind[j].sort_order) || j });
    await saveReg("master", "update", inKind[j].id, { sort_order: Number(r.sort_order) || i });
    load();
  };

  return (
    <Shell installed={installed} title="Settings — the masters"
      blurb="Every dropdown Seva offers lives here, not in the code. Add a category, retire a status, put an engineer's name on the list — the pickers follow at once.">
      {err && <div className="text-xs font-bold mb-2" style={{ color: RED }}>{err}</div>}
      <div className="flex flex-wrap gap-3" style={{ alignItems: "flex-start" }}>
        {MASTER_KINDS.map((mk) => {
          const list = (rows || []).filter((r) => S(r.kind) === mk.kind);
          return (
            <div key={mk.kind} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER, flex: "1 1 300px", maxWidth: 360 }}>
              <div className="font-bold text-sm" style={{ color: INK }}>{mk.title}</div>
              <div className="text-xs mb-2" style={{ color: MUTED }}>{mk.blurb}</div>
              {list.length === 0 && <div className="text-xs mb-2" style={{ color: MUTED }}>Empty — the field stays free text until something stands here.</div>}
              {list.map((r, i) => (
                <div key={r.id} className="flex items-center gap-1 border-t py-1" style={{ borderColor: "#EFEDE7" }}>
                  <span className="text-sm flex-1">{S(r.label)}</span>
                  <button onClick={() => void move(r, -1)} disabled={i === 0} title="Move up" style={{ color: i === 0 ? "#D5D2C8" : INK, fontWeight: 700 }}>↑</button>
                  <button onClick={() => void move(r, 1)} disabled={i === list.length - 1} title="Move down" style={{ color: i === list.length - 1 ? "#D5D2C8" : INK, fontWeight: 700 }}>↓</button>
                  <button title="Remove" style={{ color: MUTED }}
                    onClick={async () => {
                      if (!window.confirm(`Remove "${S(r.label)}"? Rows already carrying it keep the words.`)) return;
                      await saveReg("master", "delete", r.id, {}); load();
                    }}>✕</button>
                </div>
              ))}
              <div className="flex gap-1 mt-2">
                <input value={draft[mk.kind] || ""} onChange={(e) => setDraft({ ...draft, [mk.kind]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(mk.kind); }}
                  placeholder="add one…" className="flex-1 border rounded px-2 py-1 text-sm" style={{ ...inputCss, minWidth: 0 }} />
                <button onClick={() => void add(mk.kind)} className="rounded px-2 py-1 text-sm font-bold text-white" style={{ background: ORANGE }}>＋</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs mt-3" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 720 }}>
        Removing a master takes it off the pickers but never rewrites history — an issue closed under a status
        that has since been retired still reads the way it was closed.
      </div>
    </Shell>
  );
}

// ============================ DASHBOARD ============================
function SevaDashboard({ go }: { go: (k: string) => void }) {
  const [issues] = useReg("issue");
  const [amcs] = useReg("amc");
  const [pushes] = usePush();
  const today = TODAY();
  const owed = (pushes?.inbox || []).filter((p) => p.status === "sent" || p.status === "seen");

  const openIssues = (issues || []).filter((r) => !/closed|resolved/i.test(S(r.status)));
  const overdue = openIssues.filter((r) => S(r.due) && S(r.due).slice(0, 10) < today);
  const expiring = (amcs || []).filter((r) => { const d = daysTo(r.end_date); return d != null && d >= 0 && d <= 60; });
  const expired = (amcs || []).filter((r) => { const d = daysTo(r.end_date); return d != null && d < 0; });
  const visitsOwed = (amcs || []).reduce((s, r) => {
    const p = Number(r.visits_planned) || 0, d = Number(r.visits_done) || 0;
    return s + Math.max(0, p - d);
  }, 0);

  const Card = ({ label, value, sub, colour, onClick }: { label: string; value: string; sub: string; colour: string; onClick: () => void }) => (
    <button onClick={onClick} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color: colour }}>{value}</div>
      <div className="text-xs" style={{ color: MUTED }}>{sub}</div>
    </button>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Card label="PUSHED TO YOU" value={String(owed.length)} sub="waiting on your answer, by name" colour={owed.length ? RED : GREEN} onClick={() => go("push")} />
        <Card label="OPEN ISSUES" value={String(openIssues.length)} sub={`${overdue.length} past their due date`} colour={openIssues.length ? RED : GREEN} onClick={() => go("issues")} />
        <Card label="AMC EXPIRING" value={String(expiring.length)} sub="within 60 days — renewal talks start here" colour={expiring.length ? "#D97706" : GREEN} onClick={() => go("amc")} />
        <Card label="AMC EXPIRED" value={String(expired.length)} sub="past their end date, not yet closed off" colour={expired.length ? RED : GREEN} onClick={() => go("amc")} />
        <Card label="VISITS OWED" value={String(visitsOwed)} sub={`across ${(amcs || []).length} contracts`} colour={TEAL} onClick={() => go("amc")} />
      </div>

      {expiring.length > 0 && (
        <div className="bg-white rounded-lg border mb-3 overflow-auto" style={{ borderColor: BORDER, maxWidth: 760 }}>
          <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>RENEWALS INSIDE 60 DAYS</div>
          <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-1.5 text-left">Customer</th><th className="px-2 py-1.5 text-left">Machine</th>
              <th className="px-2 py-1.5 text-left">Ends</th><th className="px-2 py-1.5 text-right">Days</th>
            </tr></thead>
            <tbody>
              {expiring.sort((a, b) => S(a.end_date).localeCompare(S(b.end_date))).slice(0, 10).map((r, i) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1 font-semibold">{S(r.customer)}</td>
                  <td className="px-2 py-1" style={{ color: MUTED }}>{S(r.machine) || "—"}</td>
                  <td className="px-2 py-1 tnum">{fmtD(r.end_date)}</td>
                  <td className="px-2 py-1 text-right tnum font-bold" style={{ color: "#B26A00" }}>{daysTo(r.end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-lg border p-4" style={{ borderColor: BORDER, maxWidth: 760 }}>
        <div className="text-sm font-bold mb-2" style={{ color: INK }}>How this room works</div>
        <div className="text-sm" style={{ color: "#5A6672", lineHeight: 1.7 }}>
          A customer calls, and it goes into <b>Issues</b> the same hour — with a name against it and a date it is
          owed by. <b>Annual Maintenance</b> holds every contract: what is covered, until when, and how many visits
          are still owed; the Excel comes in once through ⇪ Import and lives here after that.
          <b> Push</b> hands one thing to one person — two names on it, an answer back on the same row.
          <b> Settings</b> holds every dropdown the module offers, so the words the team uses stay the team&apos;s
          to change. Who may open this door at all is a tick on Admin → Users.
        </div>
      </div>
    </div>
  );
}

// ============================ THE SHELL ============================
export default function Seva({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(true);
  useEffect(() => {
    try { setNavOpen(localStorage.getItem("seva.nav") !== "0"); } catch (e) { swallow("Seva", e); /* fine */ }
  }, []);
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && SECTIONS.some((s) => s.key === h)) setOpenKey(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const go = (key: string) => {
    setOpenKey(key);
    try { window.history.replaceState(null, "", `#${key}`); } catch (e) { swallow("Seva", e); /* SSR */ }
  };
  const toggleNav = () => setNavOpen((v) => {
    try { localStorage.setItem("seva.nav", v ? "0" : "1"); } catch (e) { swallow("Seva", e); /* fine */ }
    return !v;
  });

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      <div style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest" style={{ fontSize: 11, color: "#F5B32B" }}>
                🛎 NANDAN SEVA GENIE
              </span>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#22303C", color: "#8FA1B3" }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              Customer service — every issue owned, every contract kept
            </div>
          </div>
          <span className="ml-auto" />
          <ModuleMenu current="seva" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        <nav style={{ width: navOpen ? 236 : 54, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 6px", transition: "width .15s ease" }}>
          <button onClick={toggleNav} className="w-full rounded px-2 py-1.5 text-xs font-bold mb-1 text-left" style={{ color: MUTED }}
            title={navOpen ? "Fold the sidebar to icons" : "Open the sidebar"}>
            {navOpen ? "« fold" : "»"}
          </button>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => go(s.key)}
              className="w-full text-left rounded px-2 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5"
              title={navOpen ? undefined : s.label}
              style={openKey === s.key ? { background: "#16232F", color: "#fff" } : { color: "#5A6672" }}>
              <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
              {navOpen && s.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-5" style={{ minWidth: 0 }}>
          {openKey === "dashboard" && <SevaDashboard go={go} />}
          {openKey === "issues" && <IssuesScreen />}
          {openKey === "amc" && <AmcScreen />}
          {openKey === "push" && <PushScreen />}
          {openKey === "settings" && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}
