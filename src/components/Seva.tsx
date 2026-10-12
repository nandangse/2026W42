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
import GenieShell from "@/components/GenieShell";
import SevaAnalytics from "@/components/SevaAnalytics";
import SevaLocations from "@/components/SevaLocations";
import SevaPlan from "@/components/seva/SevaPlan";
import SevaQuotes from "@/components/seva/SevaQuotes";
import FieldAttendanceDesk from "@/components/seva/FieldAttendanceDesk";
import { swallow } from "@/lib/swallow";
import { dmy as fmtD, rupee } from "@/lib/fmt";
const money = (n: unknown) => rupee(n);

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", RED = "var(--red)", GREEN = "var(--green)", TEAL = "#0F766E";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "issues", label: "Support Tickets", icon: "⚠" },
  { key: "analytics", label: "Ticket Analytics", icon: "📊" },
  { key: "locations", label: "Locations", icon: "📍" },
  { key: "discuss", label: "Discussion points", icon: "🗣" },
  { key: "amc", label: "Annual Maintenance", icon: "📅" },
  { key: "plan", label: "Team Plan Deployment", icon: "🗓" },
  { key: "quotes", label: "Quotation", icon: "🧾" },
  { key: "attendance", label: "Field attendance", icon: "📍" },
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

function useReg(kind: string, extra = ""): [Row[] | null, Master[], boolean, () => void] {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const [installed, setInstalled] = useState(true);
  const load = useCallback(() => {
    fetch(`/api/seva/reg?kind=${kind}${extra}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setMasters(j.masters || []); setInstalled(j.installed !== false); })
      .catch(() => setRows([]));
  }, [kind, extra]);
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
  <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{children}</th>
);
const Shell = ({ title, blurb, onAdd, addLabel = "+ Add", extra, children, installed }: {
  title: string; blurb: string; onAdd?: () => void; addLabel?: string;
  extra?: React.ReactNode; children: React.ReactNode; installed: boolean;
}) => (
  <div style={{ maxWidth: 1180 }}>
    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
      <div>
        <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
        <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 720, lineHeight: 1.5 }}>{blurb}</div>
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
    <table className="w-full text-xs genie-table" style={{ minWidth: min, borderCollapse: "separate", borderSpacing: 0 }}>{children}</table>
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
  if (/cancelled/.test(t)) return "var(--dim)";
  if (/warranty/.test(t)) return "#1B6B93";
  if (/chargable|chargeable/.test(t)) return "var(--warn)";
  if (/closed|resolved|complete|done/.test(t)) return GREEN;
  if (/progress|active/.test(t)) return "#1B6B93";
  if (/waiting|hold|renewal|due/.test(t)) return "var(--warn)";
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
/**
 * THE TICKETS, TAGGED (Dr Raghu, 3 Oct 2026: "issue - tagged to a job -
 * customer - location - product. then we can do the issue by type,
 * resolution, etc"). Every ticket off the ERP carries the job it belongs
 * to, the customer, the site and the machine; the columns say so, and the
 * search and status run on the server, because twelve thousand tickets do
 * not travel to a browser.
 */
function IssuesScreen({ isOwner = false }: { isOwner?: boolean }) {
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("open");
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 350); return () => clearTimeout(t); }, [typed]);
  const [rows, masters, installed, load] = useReg("issue", `&q=${encodeURIComponent(q)}&status=${encodeURIComponent(statusF)}`);
  const [open, setOpen] = useState<Row | "new" | null>(null);
  const [pulling, setPulling] = useState(false);

  const closedish = (s: string) => /closed|resolved/i.test(s);
  const shown = rows || [];
  const erpStatuses = Array.from(new Set(["Open", "Replied", "On Hold", "Resolved", "Closed", ...pick(masters, "issue_status")]));

  return (
    <Shell installed={installed} title="Support Tickets" onAdd={() => setOpen("new")} addLabel="+ Log a ticket"
      blurb="Every Issue off the ERP, every field, refreshed by the hour — tagged to its job, customer, site and machine. What the customer says is wrong, owned by a name, closed only when the resolution is written down."
      extra={
        <>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="border rounded px-2 py-1.5 text-sm bg-white font-semibold" style={{ borderColor: statusF === "all" ? BORDER : ORANGE }}>
            <option value="open">Open only</option>
            <option value="all">All statuses</option>
            {erpStatuses.map((s) => (<option key={s}>{s}</option>))}
          </select>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="🔍 ticket, customer, job, site, machine, words…" className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: q ? ORANGE : BORDER, width: 260 }} />
          {isOwner && <button onClick={() => setPulling(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "var(--blue)", color: "var(--blue)" }} title="The hour does this by itself — this is for the whole history, now">⇩ Pull from ERP</button>}
        </>
      }>
      <Box min={1240}>
        <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
          <Th>Status</Th><Th>Ticket</Th><Th>Customer</Th><Th>Job</Th><Th>Site</Th><Th>Machine</Th><Th>Type</Th><Th>Problem</Th><Th>Owner</Th><Th>Opened</Th>
        </tr></thead>
        <tbody>
          {rows && shown.length === 0 && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {q || statusF !== "all" ? "Nothing matches the filter." : "No tickets yet — the hourly pull brings them from the ERP; the first call from a customer belongs here."}</td></tr>)}
          {!rows && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {shown.map((r, i) => {
            const late = daysTo(r.due);
            const overdue = late != null && late < 0 && !closedish(S(r.status));
            return (
              <tr key={r.id} className="border-t" role="button" tabIndex={0} onClick={() => setOpen(r)} style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
                <td className="px-2 py-1.5"><Chip s={S(r.status)} colour={statusColour(S(r.status))} /></td>
                <td className="px-2 py-1.5" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {S(r.erp_name) && <span className="tnum text-xs font-bold mr-1" style={{ color: "var(--blue)" }}>{S(r.erp_name)}</span>}
                  <span className="font-semibold">{S(r.title)}</span>
                </td>
                <td className="px-2 py-1.5" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.customer) || "—"}</td>
                <td className="px-2 py-1.5 tnum font-semibold">{S(r.job_number) || S(r.job_numbers) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.location) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.machine)}{r.serial_no ? ` · ${S(r.serial_no)}` : ""}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.type_of_support) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.problem_type) || S(r.category) || "—"}</td>
                <td className="px-2 py-1.5">{S(r.owner) || "—"}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: overdue ? RED : MUTED, fontWeight: overdue ? 700 : 400 }}>{fmtD(r.issue_date || r.at)}{overdue ? ` · ${-late!}d late` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </Box>
      {open && <IssueBox row={open === "new" ? null : open} masters={masters} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {pulling && <TicketPullBox onClose={() => { setPulling(false); load(); }} />}
    </Shell>
  );
}

/** The whole history off the ERP, now — tickets, then the files hanging off them, then the FRF forms into the Drive. */
function TicketPullBox({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (l: string) => setLines((x) => [...x, l]);
  const run = async () => {
    setBusy(true); setLines([]);
    const post = async (body: Record<string, unknown>) => {
      const r = await fetch("/api/seva/erp-tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
      return j as Record<string, unknown>;
    };
    try {
      for (let start = 0, n = 0; n < 60; n++) {
        const j = await post({ action: "tickets", start });
        say(`tickets: read ${j.read}, written ${j.written}${j.done ? " — done" : ""}`);
        if (j.done) break; start = Number(j.next_start) || start + 6000;
      }
      for (let start = 0, n = 0; n < 60; n++) {
        const j = await post({ action: "attachments", start });
        say(`attachments: read ${j.read}, indexed ${j.written}${j.done ? " — done" : ""}`);
        if (j.done) break; start = Number(j.next_start) || start + 6000;
      }
      for (let n = 0; n < 10; n++) {
        const j = await post({ action: "frf", limit: 40 });
        say(`FRF forms into the Drive: ${j.copied} copied, ${j.failed} refused, ${j.left ?? "?"} still to go`);
        if (!Number(j.copied) && !Number(j.failed)) break;
        if (Number(j.left) === 0) break;
      }
      say("Finished. The hour keeps it fresh from here, and copies more FRF forms each time.");
    } catch (e) { say(`Stopped: ${e instanceof Error ? e.message : String(e)}`); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} width={640}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>Pull the support tickets from the ERP</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="text-sm mb-2" style={{ color: MUTED, lineHeight: 1.5 }}>
        Every Issue, every field, back to 2016 — then the index of what is attached to each, then the FRF forms copied into the Drive, forty at a time. The hourly pull does the same from where it left off; this is for the whole history, now.
      </div>
      <button onClick={run} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white mb-2" style={{ background: busy ? MUTED : ORANGE }}>{busy ? "Pulling…" : "⇩ Pull everything"}</button>
      <div className="text-xs tnum" style={{ color: MUTED, lineHeight: 1.6, maxHeight: 260, overflowY: "auto" }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
    </Modal>
  );
}

/** The ERP's side of a ticket: the tags, the money, the form, what is attached, and every field verbatim. */
function ErpTicketPanel({ row }: { row: Row }) {
  type F = { id: string; file_name: string; file_url: string; file_size: number | null; is_private: boolean; drive_url: string | null; drive_at: string | null; drive_error?: string | null };
  const [files, setFiles] = useState<F[] | null>(null);
  const [erpBase, setErpBase] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [every, setEvery] = useState(false);
  useEffect(() => {
    const url = `/api/seva/erp-tickets?name=${encodeURIComponent(S(row.erp_name))}`;
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const rows = (j.rows || []) as F[];
      setFiles(rows); setErpBase(j.erp_base || null);
      /* anything not yet in the Drive is copied now, while the box is open (12 Oct 2026) */
      if (rows.some((f) => !f.drive_url && !f.drive_error)) {
        setCopying(true);
        fetch(`${url}&copy=1`, { cache: "no-store" }).then((r) => r.json()).then((k) => { if (k.rows) setFiles(k.rows); }).catch(() => undefined).finally(() => setCopying(false));
      }
    }).catch(() => setFiles([]));
  }, [row.erp_name]);
  const erpFile = (f: F) => (erpBase ? `${erpBase}${f.file_url.startsWith("/") ? "" : "/"}${f.file_url}` : null);
  const openOf = (f: F) => f.drive_url || erpFile(f);
  /* the FRF and the checklist named in the fields, as the files they are */
  const frfFile = (files || []).find((f) => /frf/i.test(f.file_name || "")) || null;
  const checklistFile = (files || []).find((f) => S(row.checklist_used) && (f.file_url === S(row.checklist_used) || S(row.checklist_used).endsWith(f.file_name))) || null;
  const issueHref = erpBase ? `${erpBase}/app/issue/${encodeURIComponent(S(row.erp_name))}` : null;
  const erp = (row.erp ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => (v === null || v === undefined || v === "" || Number(v) === 0 ? "·" : rupee(v));
  const T: [string, string][] = [
    ["job_number", "Job"], ["job_numbers", "Jobs"], ["customer", "Customer"], ["location", "Site"], ["equipment", "Machine"],
    ["type_of_support", "Type of support"], ["problem_type", "Problem"], ["status", "Status"], ["pending_action_status", "Pending action"],
    ["raised_by", "Raised by"], ["attended_by", "Attended by"], ["handled_by", "Handled by"], ["finally_showed_to", "Finally showed to"],
    ["issue_date", "Issue date"], ["opening_date", "Opened"], ["resolved_at", "Resolved"], ["agreement_status", "Agreement"],
    ["frf_no", "FRF no"], ["frf_date", "FRF date"], ["checklist_used", "Checklist"], ["reading", "Reading"],
    ["amount_billed", "Billed"], ["cost_spent", "Cost"], ["mandays_invested", "Man-days"], ["closure_rating", "Closure rating"], ["lead", "Lead"],
  ];
  const linkTo = (f: F | null, text: string) => {
    const href = f ? openOf(f) : null;
    return href ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--blue)" }} title={f?.drive_url ? "the copy in the Drive" : "on the ERP — opens with your ERP login"}>{f?.drive_url ? "📁 " : "↗ "}{text}</a> : text;
  };
  const show = (k: string, v: unknown): React.ReactNode => {
    if (k === "frf_no") return linkTo(frfFile, S(v) || "·");
    if (k === "checklist_used") return linkTo(checklistFile, checklistFile?.file_name || S(v).split("/").pop() || "·");
    return /amount|cost/.test(k) ? money(v) : /date|resolved_at|opening/.test(k) ? fmtD(v) : S(v) || "·";
  };
  return (
    <div className="rounded border p-3 mb-2" style={{ borderColor: BORDER, background: "#FBFAF7" }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        {issueHref
          ? <a href={issueHref} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: "var(--blue)" }} title="Open this ticket in the ERP — edits are made there">{S(row.erp_name)} ↗ <span className="font-semibold">open in the ERP</span></a>
          : <b style={{ color: "var(--blue)" }}>{S(row.erp_name)}</b>}
        <span style={{ color: MUTED }}>off the ERP · modified {S(row.erp_modified).slice(0, 16) || "·"} · pulled {fmtD(row.pulled_at)}{row.pulled_at ? ` ${new Date(String(row.pulled_at)).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST` : ""}</span>
        {row.raised_as_nc ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#FBEAE8", color: "#B3392E" }}>raised as NC</span> : null}
        {row.via_portal ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#EEF1FA", color: "var(--blue)" }}>via customer portal</span> : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
        {T.filter(([k]) => row[k] !== null && row[k] !== undefined && S(row[k]) !== "").map(([k, label]) => (
          <div key={k} className="flex justify-between gap-2" style={{ borderBottom: `1px dotted ${BORDER}` }}>
            <span style={{ color: MUTED }}>{label}</span><span className="font-semibold text-right" style={{ color: INK }}>{show(k, row[k])}</span>
          </div>
        ))}
      </div>
      {S(row.resolution_summary) && (
        <div className="mt-2 text-xs"><b style={{ color: MUTED }}>Resolution, as the ERP has it · </b><span style={{ whiteSpace: "pre-wrap" }}>{S(row.resolution_summary)}</span></div>
      )}
      {S(row.costing_details) && (
        <div className="mt-1 text-xs"><b style={{ color: MUTED }}>Costing · </b><span style={{ whiteSpace: "pre-wrap" }}>{S(row.costing_details)}</span></div>
      )}
      <div className="mt-2 text-xs">
        <b style={{ color: MUTED }}>Attached on the ERP{files ? ` (${files.length})` : ""}{copying ? " · copying to the Drive…" : ""} · </b>
        {!files ? <span style={{ color: MUTED }}>reading…</span> : !files.length ? <span style={{ color: MUTED }}>nothing</span> : files.map((f) => (
          <span key={f.id} className="inline-block mr-2">
            {f.drive_url ? <a href={f.drive_url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }} title="the copy in the Drive">📁 {f.file_name}</a>
              : erpFile(f) ? <a href={erpFile(f)!} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }} title="on the ERP — opens with your ERP login">↗ {f.file_name}</a>
              : <span style={{ color: INK }}>{f.file_name}</span>}
            <span style={{ color: MUTED }}>{f.file_size ? ` ${(f.file_size / 1024).toFixed(0)} KB` : ""}{f.drive_url ? " · in the Drive" : f.drive_error ? ` · the Drive copy failed: ${f.drive_error}` : copying ? " · copying…" : " · on the ERP"}</span>
          </span>
        ))}
      </div>
      <button onClick={() => setEvery((v) => !v)} className="mt-2 text-xs font-bold" style={{ color: "var(--blue)" }}>{every ? "▾" : "▸"} Every field the ERP returned ({Object.keys(erp).length})</button>
      {every && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 rounded border p-2 mt-1 text-xs" style={{ borderColor: BORDER, background: "#fff" }}>
          {Object.entries(erp).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3" style={{ borderBottom: `1px dotted ${BORDER}`, padding: "2px 0" }}>
              <span style={{ color: MUTED, fontFamily: "monospace" }}>{k}</span>
              <span className="text-right" style={{ color: v === null || v === "" ? MUTED : INK, wordBreak: "break-all", maxWidth: 300 }}>{v === null || v === "" ? "·" : typeof v === "object" ? JSON.stringify(v) : S(v).replace(/<[^>]+>/g, " ").slice(0, 300)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The ticket" : "Log a ticket"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      {row && S(row.erp_name) && <ErpTicketPanel row={row} />}
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
        {/* THE FAULT AS IT WAS WRITTEN (Dr Raghu, 9 Sep 2026: "also the issue
            details to be in rich text"). A ticket pulled from the ERP carries
            Quill markup — paragraphs, lists, the occasional table — and the
            shape a man used to explain a fault is part of the explanation.
            So an imported ticket is SHOWN as it was written and not offered
            as a textarea: editing it here would flatten it on the first
            keystroke, and this is the ERP's record, not ours. A ticket typed
            in Genie has no markup and keeps its plain box. */}
        {S(row?.description_html) ? (
          <div><L>What happened — as it was written in the ERP</L>
            <div className="border rounded px-3 py-2 text-sm seva-rich"
              style={{ ...inputCss, maxHeight: 260, overflowY: "auto", background: "#FBFAF7" }}
              dangerouslySetInnerHTML={{ __html: String(row?.description_html) }} />
          </div>
        ) : (
          <div><L>What happened — the customer&apos;s words, and what was seen</L>
            <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        )}
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
  /* CARDS, SORTING AND FILTERS (Dr Raghu, 3 Oct 2026: "show No of Live AMC,
     Value of Live AMC, AMC lapsed in last 6 months. Also make it sortable.
     Show filters for customer and site. Dates. By default show AMC Valid
     paid"). Live = today inside start and end. Lapsed in six months = ended
     in the last 180 days and not live again. The dates narrow the register
     to contracts alive at any point between them. */
  const [statusF, setStatusF] = useState("AMC valid paid");
  const [custF, setCustF] = useState("");
  const [siteF, setSiteF] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 }>({ k: "end_date", d: 1 });
  const needle = q.trim().toLowerCase();
  const today = TODAY();
  const all = rows || [];
  const isLive = (r: Row) => { const s = S(r.start_date).slice(0, 10), e = S(r.end_date).slice(0, 10); return e >= today && (!s || s <= today); };
  const sixBack = (() => { const d = new Date(today); d.setDate(d.getDate() - 180); return d.toISOString().slice(0, 10); })();
  const live = all.filter(isLive);
  const lapsed = all.filter((r) => { const e = S(r.end_date).slice(0, 10); return e && e < today && e >= sixBack; });
  const customers = [...new Set(all.map((r) => S(r.customer)).filter(Boolean))].sort();
  const sites = [...new Set(all.map((r) => S(r.location) || S(r.territory)).filter(Boolean))].sort();
  const statuses = [...new Set(all.map((r) => S(r.status)).filter(Boolean))].sort();
  const shown = all
    .filter((r) => statusF === "all" || (statusF === "live" ? isLive(r) : S(r.status) === statusF))
    .filter((r) => !custF || S(r.customer) === custF)
    .filter((r) => !siteF || (S(r.location) || S(r.territory)) === siteF)
    .filter((r) => { if (!from && !to) return true; const s = S(r.start_date).slice(0, 10), e = S(r.end_date).slice(0, 10); return (!to || !s || s <= to) && (!from || !e || e >= from); })
    .filter((r) => !needle || `${S(r.customer)} ${S(r.machine)} ${S(r.serial_no)} ${S(r.contract_no)} ${S(r.location)} ${S(r.engineer)}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const k = sort.k;
      const x = k === "value" || k === "visits" ? Number(k === "visits" ? a.visits_done : a.value) || 0 : S(k === "machine" ? `${a.machine} ${a.serial_no}` : a[k]);
      const y = k === "value" || k === "visits" ? Number(k === "visits" ? b.visits_done : b.value) || 0 : S(k === "machine" ? `${b.machine} ${b.serial_no}` : b[k]);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.d;
    });
  const sortBy = (k: string) => setSort((p) => (p.k === k ? { k, d: p.d === 1 ? -1 : 1 } : { k, d: k === "value" || k === "visits" ? -1 : 1 }));
  const Hd = ({ k, children, right }: { k: string; children: React.ReactNode; right?: boolean }) => (
    <th onClick={() => sortBy(k)} className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap cursor-pointer select-none`} style={{ position: "sticky", top: 0, background: "var(--ink)" }} title="sort">{children}{sort.k === k ? (sort.d === 1 ? " ▲" : " ▼") : ""}</th>
  );
  const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : rupee(n));
  const Card = ({ label, value, sub, colour, onClick }: { label: string; value: string; sub: string; colour: string; onClick?: () => void }) => (
    <button onClick={onClick} className="bg-white rounded-lg border p-3 text-left" style={{ borderColor: BORDER, cursor: onClick ? "pointer" : "default" }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color: colour }}>{value}</div>
      <div className="text-xs" style={{ color: MUTED }}>{sub}</div>
    </button>
  );

  return (
    <Shell installed={installed} title="Annual Maintenance" onAdd={() => setOpen("new")} addLabel="+ Add a contract"
      blurb="Every AMC on one register — who it covers, from when to when, how many visits are owed and how many have been made. Live means today sits inside the contract's dates; the status word is the ERP's."
      extra={
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 customer, serial, contract…" className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 220 }} />
          <button onClick={() => setPulling(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "var(--blue)", color: "var(--blue)" }}
            title="Read the Annual Maintenance Contracts straight off nandanerp">⇩ Pull from ERP</button>
          <button onClick={() => setImporting(true)} className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: TEAL, color: TEAL }}>⇪ Import</button>
        </>
      }>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <Card label="LIVE AMCs" value={String(live.length)} sub={`of ${all.length} on the register · today inside the dates`} colour={GREEN} onClick={() => setStatusF("live")} />
        <Card label="VALUE OF LIVE AMCs" value={lakh(live.reduce((t, r) => t + (Number(r.value) || 0), 0))} sub="the live contracts, as the register values them" colour={GREEN} onClick={() => setStatusF("live")} />
        <Card label="LAPSED IN LAST 6 MONTHS" value={String(lapsed.length)} sub={`ended since ${fmtD(sixBack)} · ${lakh(lapsed.reduce((t, r) => t + (Number(r.value) || 0), 0))} a year ago`} colour={lapsed.length ? RED : GREEN} onClick={() => { setStatusF("all"); setFrom(sixBack); setTo(today); }} />
        <Card label="SHOWN" value={String(shown.length)} sub={`${lakh(shown.reduce((t, r) => t + (Number(r.value) || 0), 0))} · ${new Set(shown.map((r) => S(r.customer))).size} customers`} colour={INK} />
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="border rounded px-2 py-1.5 bg-white font-semibold" style={{ borderColor: statusF === "all" ? BORDER : ORANGE }}>
          <option value="all">All statuses</option><option value="live">Live today</option>
          {statuses.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={custF} onChange={(e) => setCustF(e.target.value)} className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: custF ? ORANGE : BORDER, maxWidth: 260 }}>
          <option value="">every customer</option>{customers.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={siteF} onChange={(e) => setSiteF(e.target.value)} className="border rounded px-2 py-1.5 bg-white" style={{ borderColor: siteF ? ORANGE : BORDER, maxWidth: 200 }} title="the site the ERP holds on the contract">
          <option value="">every site</option>{sites.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ color: MUTED }}>alive between</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-1.5 py-1 tnum" style={{ borderColor: from ? ORANGE : BORDER }} />
        <span style={{ color: MUTED }}>and</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-1.5 py-1 tnum" style={{ borderColor: to ? ORANGE : BORDER }} />
        {(statusF !== "AMC valid paid" || custF || siteF || from || to) && <button onClick={() => { setStatusF("AMC valid paid"); setCustF(""); setSiteF(""); setFrom(""); setTo(""); }} style={{ color: MUTED }}>reset</button>}
      </div>
      <Box min={1180}>
        <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
          <Hd k="status">Status</Hd><Hd k="customer">Customer</Hd><Hd k="machine">Machine / serial</Hd><Hd k="contract_no">Contract</Hd><Hd k="start_date">From</Hd><Hd k="end_date">To</Hd><Hd k="visits" right>Visits</Hd><Hd k="value" right>Value</Hd><Hd k="engineer">Engineer</Hd>
        </tr></thead>
        <tbody>
          {rows && shown.length === 0 && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {rows.length ? "Nothing matches these filters." : "The register is empty — ⇪ Import brings the Excel in, or add one contract by hand."}</td></tr>)}
          {!rows && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {shown.map((r, i) => {
            const left = daysTo(r.end_date);
            const ending = left != null && left >= 0 && left <= 60;
            const gone = left != null && left < 0;
            return (
              <tr key={r.id} className="border-t" role="button" tabIndex={0} onClick={() => setOpen(r)} style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
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
          <div className="text-xs rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.5 }}>
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
          <div className="text-xs mb-2 rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.6 }}>
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
              style={{ background: busy || !chosen.length ? "#B9BEC4" : "var(--blue)" }}>
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
      <div className="text-xs mb-2 rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.6 }}>
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
            <table className="text-xs w-full genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                {parsed.matched.map((c) => (<th key={c} className="px-2 py-1 text-left whitespace-nowrap">{c}</th>))}
              </tr></thead>
              <tbody>
                {parsed.rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
const PUSH_COLOUR: Record<string, string> = { sent: RED, seen: "var(--warn)", replied: "#1B6B93", closed: GREEN };
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
            style={tab === "inbox" ? { background: INK, color: "#fff" } : { color: "var(--dim)", background: "#fff" }}>
            To me{awaiting > 0 ? ` · ${awaiting}` : ""}
          </button>
          <button onClick={() => setTab("sent")} className="px-3 py-1.5 text-sm font-bold"
            style={tab === "sent" ? { background: INK, color: "#fff" } : { color: "var(--dim)", background: "#fff" }}>
            From me{unanswered > 0 ? ` · ${unanswered}` : ""}
          </button>
        </div>
      }>
      <Box min={880}>
        <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
          <Th>Status</Th><Th>{tab === "inbox" ? "From" : "To"}</Th><Th>Subject</Th><Th>About</Th><Th>Pushed</Th><Th>Answered</Th>
        </tr></thead>
        <tbody>
          {data && rows.length === 0 && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>
            {tab === "inbox" ? "Nothing has been pushed to you." : "You have pushed nothing yet — ⇢ Push to someone hands one person one thing."}</td></tr>)}
          {!data && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {rows.map((p, i) => (
            <tr key={p.id} className="border-t" role="button" tabIndex={0} onClick={() => setOpen(p)} style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
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
        <div className="text-xs rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.5 }}>
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
                <div key={r.id} className="flex items-center gap-1 border-t py-1" style={{ borderColor: "var(--line-soft)" }}>
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

// ============================ ANALYTICS ============================
/** The analytics page, and the ticket box over it when a row is opened — the full row is read by its ERP name. */
function AnalyticsScreen() {
  const [open, setOpen] = useState<Row | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const openTicket = async (t: { id: string; erp_name: string }) => {
    const r = await fetch(`/api/seva/reg?kind=issue&q=${encodeURIComponent(t.erp_name || t.id)}&status=all`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    const row = ((j.rows || []) as Row[]).find((x) => x.id === t.id) || ((j.rows || []) as Row[])[0] || null;
    setMasters(j.masters || []);
    setOpen(row);
  };
  return (
    <>
      <SevaAnalytics onOpen={openTicket} />
      {open && <IssueBox row={open} masters={masters} onClose={() => setOpen(null)} onSaved={() => setOpen(null)} />}
    </>
  );
}

// ============================ DISCUSSION POINTS ============================
/**
 * DISCUSSION POINTS (Dr Raghu, 3 Oct 2026: "show discussion points as a
 * menu item too. It will have a table with Open issues. This is something
 * that they need to discuss with me"). Every open ticket is a point until
 * it is closed, oldest first. Beside each, a line the team writes for the
 * discussion, and a tick when it has been discussed — the ticket itself
 * stays open until the ERP closes it. Migration 0197.
 */
function DiscussScreen() {
  const [rows, masters, installed, load] = useReg("issue", "&status=open");
  const [open, setOpen] = useState<Row | null>(null);
  const [onlyUndiscussed, setOnlyUndiscussed] = useState(true);
  const [busy, setBusy] = useState("");
  /* A FILTER ON TOP, THE SEARCH, AND EVERY COLUMN SORTABLE (Dr Raghu, 12 Oct 2026) */
  const [q, setQ] = useState(""); const [fStatus, setFStatus] = useState(""); const [fEng, setFEng] = useState(""); const [fCust, setFCust] = useState(""); const [fAge, setFAge] = useState(""); const [fNote, setFNote] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "age", dir: -1 });
  const today = TODAY();
  const age = (r: Row) => { const d = (S(r.issue_date) || S(r.at)).slice(0, 10); return d ? Math.round((new Date(today).getTime() - new Date(d).getTime()) / 86400000) : 0; };
  const eng = (r: Row) => (S(r.attended_by) || S(r.handled_by) || S(r.owner)).split("@")[0];
  const base = (rows || []).filter((r) => !onlyUndiscussed || !S(r.discussed_at));
  const uniq = (f: (r: Row) => string) => [...new Set(base.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const key: Record<string, (r: Row) => string | number> = {
    age: age, ticket: (r) => S(r.erp_name), customer: (r) => S(r.customer).toLowerCase(), site: (r) => S(r.location).toLowerCase(), machine: (r) => (S(r.equipment) || S(r.machine)).toLowerCase(),
    status: (r) => S(r.status), engineer: eng, pending: (r) => S(r.pending_action_status), point: (r) => S(r.discuss_note).toLowerCase(), discussed: (r) => S(r.discussed_at),
  };
  const t = q.trim().toLowerCase();
  const list = base.filter((r) => (!fStatus || S(r.status) === fStatus) && (!fEng || eng(r) === fEng) && (!fCust || S(r.customer) === fCust)
      && (!fAge || (fAge === "90" ? age(r) > 90 : fAge === "30" ? age(r) > 30 && age(r) <= 90 : age(r) <= 30))
      && (!fNote || (fNote === "with" ? !!S(r.discuss_note) : !S(r.discuss_note)))
      && (!t || [r.erp_name, r.title, r.customer, r.location, r.equipment, r.machine, r.status, eng(r), r.pending_action_status, r.discuss_note, r.job_number].some((v) => S(v).toLowerCase().includes(t))))
    .sort((a, b) => { const x = key[sort.k](a), y = key[sort.k](b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  const SortTh = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "age" ? -1 : 1 }))} className="px-2 py-2 text-left whitespace-nowrap select-none" style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }} title="Sort">
      {children}<span style={{ opacity: sort.k === k ? 1 : 0.35, marginLeft: 4, fontSize: 10 }}>{sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
    </th>
  );
  const sel: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff", maxWidth: 200 };
  const anyFilter = !!(q || fStatus || fEng || fCust || fAge || fNote);
  const save = async (r: Row, patch: Record<string, unknown>) => {
    setBusy(r.id);
    const e = await saveReg("issue", "update", r.id, patch);
    setBusy("");
    if (e) window.alert(e); else load();
  };
  const cost = list.reduce((t, r) => t + (Number(r.cost_spent) || 0), 0);
  return (
    <Shell installed={installed} title="Discussion points"
      blurb="Every open ticket, oldest first — what the team needs to discuss with Dr Raghu. Write the point beside the ticket; tick it when it has been discussed. A ticket leaves this list only when the ERP closes it."
      extra={
        <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
          <input type="checkbox" checked={onlyUndiscussed} onChange={(e) => setOnlyUndiscussed(e.target.checked)} /> not yet discussed only
        </label>
      }>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket, customer, site, machine, engineer, point…" style={{ ...sel, width: 300, maxWidth: 300 }} />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={sel}><option value="">Status — all</option>{uniq((r) => S(r.status)).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fEng} onChange={(e) => setFEng(e.target.value)} style={sel}><option value="">Engineer — all</option>{uniq(eng).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fCust} onChange={(e) => setFCust(e.target.value)} style={sel}><option value="">Customer — all</option>{uniq((r) => S(r.customer)).map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fAge} onChange={(e) => setFAge(e.target.value)} style={sel}><option value="">Age — all</option><option value="90">Older than 90 days</option><option value="30">31 – 90 days</option><option value="0">30 days or less</option></select>
        <select value={fNote} onChange={(e) => setFNote(e.target.value)} style={sel}><option value="">Point — all</option><option value="with">With a point written</option><option value="without">No point yet</option></select>
        {anyFilter && <button onClick={() => { setQ(""); setFStatus(""); setFEng(""); setFCust(""); setFAge(""); setFNote(""); }} className="text-xs font-bold" style={{ color: "var(--accent)" }}>✕ clear</button>}
      </div>
      <div className="text-sm mb-2" style={{ color: MUTED }}>
        <b style={{ color: INK }}>{list.length}</b> open ticket{list.length === 1 ? "" : "s"}{onlyUndiscussed ? " not yet discussed" : ""}{anyFilter ? " (filtered)" : ""} · {list.filter((r) => age(r) > 90).length} older than ninety days · cost so far {rupee(cost)}
      </div>
      <Box min={1240}>
        <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
          <SortTh k="age">Age</SortTh><SortTh k="ticket">Ticket</SortTh><SortTh k="customer">Customer</SortTh><SortTh k="site">Site</SortTh><SortTh k="machine">Machine</SortTh><SortTh k="status">Status</SortTh><SortTh k="engineer">Engineer</SortTh><SortTh k="pending">Pending action</SortTh><SortTh k="point">Point to discuss</SortTh><SortTh k="discussed">Discussed</SortTh>
        </tr></thead>
        <tbody>
          {!rows && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
          {rows && !list.length && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing to discuss — every open ticket has been talked through, or none is open.</td></tr>)}
          {list.map((r, i) => {
            const a = age(r);
            return (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 tnum font-bold" style={{ color: a > 90 ? RED : a > 30 ? "#B26A00" : INK }}>{a}d</td>
                <td className="px-2 py-1.5" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <button onClick={() => setOpen(r)} className="text-left hover:underline"><span className="tnum text-xs font-bold mr-1" style={{ color: "var(--blue)" }}>{S(r.erp_name)}</span><span className="font-semibold">{S(r.title)}</span></button>
                </td>
                <td className="px-2 py-1.5" style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.customer) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.location) || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{S(r.equipment) || S(r.machine) || "—"}</td>
                <td className="px-2 py-1.5"><Chip s={S(r.status)} colour={statusColour(S(r.status))} /></td>
                <td className="px-2 py-1.5">{(S(r.attended_by) || S(r.handled_by) || S(r.owner)).split("@")[0] || "—"}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{S(r.pending_action_status) || "—"}</td>
                <td className="px-2 py-1.5">
                  <input defaultValue={S(r.discuss_note)} key={`${r.id}|${S(r.discuss_note)}`} placeholder="the point, in a line…" disabled={busy === r.id}
                    onBlur={(e) => { if (e.target.value.trim() !== S(r.discuss_note)) void save(r, { discuss_note: e.target.value.trim() }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="border rounded px-1.5 py-0.5 text-xs" style={{ borderColor: S(r.discuss_note) ? BORDER : "transparent", background: S(r.discuss_note) ? "#fff" : "transparent", width: 240 }} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {S(r.discussed_at) ? <button onClick={() => void save(r, { discussed_at: "" })} className="text-xs font-bold" style={{ color: GREEN }} title="click to un-tick">✓ {fmtD(r.discussed_at)}</button>
                    : <button onClick={() => void save(r, { discussed_at: today })} disabled={busy === r.id} className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: BORDER, color: INK }}>discussed ✓</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Box>
      {open && <IssueBox row={open} masters={masters} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}

// ============================ DASHBOARD ============================
interface SevaStats {
  today: string; fy_start: string;
  amc: { total: number; live: number; live_value: number };
  issues: { total: number; open: number; overdue: number; this_fy: number; by_type_open: { type: string; n: number }[]; by_type_fy: { type: string; n: number }[]; by_type_all: { type: string; n: number }[] };
  warranty: { all: number; all_cost: number; fy: number; fy_cost: number; open: number; open_cost: number };
}
/** The five hues, in fixed order, validated for colour-blind separation; the sixth slice is always "Other", in gray. */
const PIE = ["#1F6FB2", "#D97706", "#0D7A3F", "#7C3AED", "#B3392E"];
function TypePie({ rows, title, sub }: { rows: { type: string; n: number }[]; title: string; sub: string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const top = rows.slice(0, 5);
  const rest = rows.slice(5).reduce((a, r) => a + r.n, 0);
  const slices = [...top.map((r, i) => ({ label: r.type, n: r.n, colour: PIE[i] })), ...(rest ? [{ label: `Other (${rows.length - 5})`, n: rest, colour: "#8A8A8A" }] : [])];
  const R = 46, C = 52;
  let acc = 0;
  const arcs = slices.map((sl) => {
    const a0 = (acc / Math.max(1, total)) * 2 * Math.PI, a1 = ((acc + sl.n) / Math.max(1, total)) * 2 * Math.PI;
    acc += sl.n;
    const x0 = C + R * Math.sin(a0), y0 = C - R * Math.cos(a0), x1 = C + R * Math.sin(a1), y1 = C - R * Math.cos(a1);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const d = slices.length === 1 ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z` : `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} Z`;
    return { ...sl, d, pct: total ? Math.round((sl.n / total) * 100) : 0 };
  });
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{title}</div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>{sub}</div>
      {!total ? <div className="text-sm" style={{ color: MUTED }}>Nothing to draw yet — the hourly pull is bringing the tickets in.</div> : (
        <div className="flex items-center gap-3 flex-wrap">
          <svg width={104} height={104} viewBox="0 0 104 104" role="img" aria-label={`${title}: ${arcs.map((a) => `${a.label} ${a.pct}%`).join(", ")}`}>
            {arcs.map((a) => <path key={a.label} d={a.d} fill={a.colour} stroke="#fff" strokeWidth={2}><title>{`${a.label}: ${a.n} (${a.pct}%)`}</title></path>)}
          </svg>
          <div className="text-xs" style={{ color: INK, lineHeight: 1.7 }}>
            {arcs.map((a) => (
              <div key={a.label} className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: a.colour, display: "inline-block" }} />
                <span style={{ minWidth: 150 }}>{a.label}</span>
                <b className="tnum">{a.n}</b><span className="tnum" style={{ color: MUTED }}>{a.pct}%</span>
              </div>
            ))}
            <div className="flex items-center gap-2" style={{ color: MUTED }}><span style={{ width: 10 }} /><span style={{ minWidth: 150 }}>total</span><b className="tnum" style={{ color: INK }}>{total}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SevaDashboard({ go }: { go: (k: string) => void }) {
  const [amcs] = useReg("amc");
  const [pushes] = usePush();
  const [st, setSt] = useState<SevaStats | null>(null);
  const [pieOf, setPieOf] = useState<"open" | "fy" | "all">("fy");
  useEffect(() => { fetch("/api/seva/stats", { cache: "no-store" }).then((r) => r.json()).then((j) => setSt(j.ok ? j : null)).catch(() => setSt(null)); }, []);
  const owed = (pushes?.inbox || []).filter((p) => p.status === "sent" || p.status === "seen");
  const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : rupee(n));
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
      {/* THE FIVE HE ASKED FOR (3 Oct 2026): AMC valid live by number and by
          value, issues open, the pie by type, and the cost in warranty — all
          counted on the server, over every ticket and contract. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <Card label="AMC VALID LIVE — NOS" value={st ? String(st.amc.live) : "…"} sub={st ? `of ${st.amc.total} contracts, today inside start and end` : "counting"} colour={GREEN} onClick={() => go("amc")} />
        <Card label="AMC VALID LIVE — VALUE" value={st ? lakh(st.amc.live_value) : "…"} sub="the live contracts' value, as the register has it" colour={GREEN} onClick={() => go("amc")} />
        <Card label="ISSUES OPEN" value={st ? String(st.issues.open) : "…"} sub={st ? `${st.issues.overdue} past their due date · ${st.issues.total.toLocaleString("en-IN")} tickets in all` : "counting"} colour={st?.issues.open ? RED : GREEN} onClick={() => go("issues")} />
        <Card label="COST INCURRED IN WARRANTY" value={st ? `${st.warranty.fy} nos · ${lakh(st.warranty.fy_cost)}` : "…"} sub={st ? `this FY from ${fmtD(st.fy_start)} · all time ${st.warranty.all} nos, ${lakh(st.warranty.all_cost)} · ${st.warranty.open} still open` : "counting"} colour={st?.warranty.fy ? "var(--warn)" : GREEN} onClick={() => go("issues")} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Card label="PUSHED TO YOU" value={String(owed.length)} sub="waiting on your answer, by name" colour={owed.length ? RED : GREEN} onClick={() => go("push")} />
        <Card label="AMC EXPIRING" value={String(expiring.length)} sub="within 60 days — renewal talks start here" colour={expiring.length ? "var(--warn)" : GREEN} onClick={() => go("amc")} />
        <Card label="AMC EXPIRED" value={String(expired.length)} sub="past their end date, not yet closed off" colour={expired.length ? RED : GREEN} onClick={() => go("amc")} />
        <Card label="VISITS OWED" value={String(visitsOwed)} sub={`across ${(amcs || []).length} contracts`} colour={TEAL} onClick={() => go("amc")} />
        <Card label="TICKETS THIS FY" value={st ? String(st.issues.this_fy) : "…"} sub={st ? `opened since ${fmtD(st.fy_start)}` : "counting"} colour={INK} onClick={() => go("issues")} />
      </div>
      <div className="grid md:grid-cols-2 gap-2 mb-3">
        <div>
          <div className="flex gap-1 mb-1 text-xs">
            {([["fy", "this FY"], ["open", "open now"], ["all", "all time"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPieOf(k)} className="rounded px-2 py-0.5 font-bold" style={{ background: pieOf === k ? "var(--ink)" : "#F3F1EB", color: pieOf === k ? "#fff" : MUTED }}>{l}</button>
            ))}
          </div>
          <TypePie rows={st ? (pieOf === "open" ? st.issues.by_type_open : pieOf === "fy" ? st.issues.by_type_fy : st.issues.by_type_all) : []}
            title="ISSUES BY TYPE" sub={pieOf === "open" ? "every ticket still open, by its type of support" : pieOf === "fy" ? "tickets opened this financial year, by type of support" : "every ticket on record, by type of support"} />
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="bg-white rounded-lg border mb-3 overflow-auto" style={{ borderColor: BORDER, maxWidth: 760 }}>
          <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>RENEWALS INSIDE 60 DAYS</div>
          <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-1.5 text-left">Customer</th><th className="px-2 py-1.5 text-left">Machine</th>
              <th className="px-2 py-1.5 text-left">Ends</th><th className="px-2 py-1.5 text-right">Days</th>
            </tr></thead>
            <tbody>
              {expiring.sort((a, b) => S(a.end_date).localeCompare(S(b.end_date))).slice(0, 10).map((r, i) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
        <div className="text-sm" style={{ color: "var(--dim)", lineHeight: 1.7 }}>
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
  email, displayName, initials, role, isOwner = false,
}: {
  email: string; displayName: string | null; initials: string | null; role: string; isOwner?: boolean;
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
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <GenieShell module="seva" title="Nandan Seva" tagline="Customer service — every issue owned, every contract kept" user={{ email, displayName, initials, role }} />

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
              style={openKey === s.key ? { background: "var(--navy)", color: "#fff" } : { color: "var(--dim)" }}>
              <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
              {navOpen && s.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-5" style={{ minWidth: 0 }}>
          {openKey === "dashboard" && <SevaDashboard go={go} />}
          {openKey === "issues" && <IssuesScreen isOwner={isOwner} />}
          {openKey === "analytics" && <AnalyticsScreen />}
          {openKey === "locations" && <SevaLocations />}
          {openKey === "discuss" && <DiscussScreen />}
          {openKey === "amc" && <AmcScreen />}
          {openKey === "plan" && <SevaPlan />}
          {openKey === "quotes" && <SevaQuotes />}
          {openKey === "attendance" && <FieldAttendanceDesk />}
          {openKey === "push" && <PushScreen />}
          {openKey === "settings" && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}
