"use client";
/**
 * AUDIT QUERIES — the Accounts Management Review, inside Genie.
 *
 * Dr Raghu, 29 Sep 2026: "make a section called Audit Queries. We will get the
 * Auditors to put it here itself from now on ... I want us to be able to get
 * ALL the details in this so that the Accounts management review file with
 * manual work is redundant."
 *
 * SO IT HAS TO BE BETTER THAN THE SHEET, not merely a copy of it. The sheet
 * is nineteen hundred rows kept by hand since April 2021, and the only thing
 * anybody actually asks it is "what is still open, whose is it, and how old".
 * That is the first thing on this screen; the history is behind a filter.
 *
 * THE SHEET'S OWN HEADLINE IS COUNTED, NOT COPIED. It carries a typed line
 * reading "Total: 644 Pending: 162 (older than 7 days: 160)" which somebody
 * has to remember to update and which no longer matches the rows beneath it.
 * Here the same four numbers are counted from the rows every time the screen
 * is drawn, so they cannot drift.
 *
 * NOTHING IS GUESSED. Dates in that column read "20/04/2021", "8" and
 * "Immediately on priority"; amounts read "16.31 lakhs" and "80000". Each is
 * kept exactly as written and only turned into a date or a rupee figure where
 * it plainly is one. Where it is not, the screen shows the words.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  AUDIT_STATUS, STATUS_TONE, properName, overdue, readAmount,
  AUDIT_RAISERS, AUDIT_CLOSERS, aiSummary,
  type AuditRow, type AuditEvent,
} from "@/lib/audit-query";
import { today, fmtFull } from "@/lib/schedule";

const C = {
  ink: "var(--ink)", navy: "var(--navy)", sub: "var(--dim)", mute: "var(--muted)",
  line: "var(--line)", soft: "var(--line-soft)", accent: "var(--accent)",
  green: "var(--green)", red: "var(--red)", faint: "#B8B5AC", panel: "#F4F2EC",
};
const cr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

export default function AuditQueries({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [who, setWho] = useState("all");
  const [by, setBy] = useState("all");
  const [edit, setEdit] = useState<Partial<AuditRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState("");

  const load = useCallback(() => {
    api.get("/api/kuber/audit")
      .then((r: { installed?: boolean; rows?: AuditRow[] }) => {
        setInstalled(r.installed !== false);
        setRows(r.rows || []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = rows || [];
  const open = all.filter((r) => r.status !== "Done" && r.status !== "Closed");
  const late = overdue(all, today());

  /* Names arrive as vidya / Vidya / VIDYA — one person, three spellings. The
     filter groups them; the row still shows what was written. */
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) {
      const k = String(r.assigned_to || "").trim().toLowerCase();
      if (k) m.set(k, properName(r.assigned_to || ""));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const askers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) {
      const k = String(r.instructed_by || "").trim().toLowerCase();
      if (k) m.set(k, properName(r.instructed_by || ""));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => {
    if (status === "open" && (r.status === "Done" || r.status === "Closed")) return false;
    if (status === "late" && !late.includes(r)) return false;
    if (status !== "open" && status !== "late" && status !== "all" && r.status !== status) return false;
    if (who !== "all" && String(r.assigned_to || "").trim().toLowerCase() !== who) return false;
    if (by !== "all" && String(r.instructed_by || "").trim().toLowerCase() !== by) return false;
    if (!needle) return true;
    return [r.related_to, r.instruction, r.remarks, r.assigned_to, r.instructed_by, r.amount_text]
      .some((x) => String(x || "").toLowerCase().includes(needle));
  });
  /* Only what can be added up is added up — a total built partly on
     "16.31 lakhs" read as sixteen rupees would be worse than no total. */
  const money = shown.reduce((a, r) => a + (r.amount || 0), 0);
  const unpriced = shown.filter((r) => r.amount_text && r.amount == null).length;

  const save = async (r: Partial<AuditRow>) => {
    setBusy(true); setErr("");
    try { await api.post("/api/kuber/audit", { action: "save", ...r }); setEdit(null); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const setStatusOf = async (id: string, s: string) => {
    setBusy(true);
    try { await api.post("/api/kuber/audit", { action: "status", id, status: s }); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  if (!installed) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: C.line, background: "#FFF7E6", color: "#8A5A00", lineHeight: 1.6 }}>
        <b>Audit Queries is not installed yet.</b><br />
        Run migration <b>0172_audit_queries.sql</b> on the Genie database and this section comes alive.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="font-bold" style={{ fontSize: 16 }}>Audit Queries</div>
        <div className="text-xs" style={{ color: C.mute }}>
          the Accounts Management Review — auditors write here
        </div>
        <div className="flex-1" />
        {isOwner && <ImportSheet onDone={load} note={importing} setNote={setImporting} />}
        <button onClick={() => setEdit({ status: "Pending" })} className="rounded px-3 py-1.5 font-bold"
          style={{ background: C.accent, color: "#fff", fontSize: 12.5 }}>+ New query</button>
      </div>
      {err && <div className="text-xs font-bold mb-2" style={{ color: C.red }}>{err}</div>}

      {/* THE FOUR NUMBERS, COUNTED. The sheet carries them typed at the top,
          which is a line somebody has to remember to update and which no
          longer agrees with the rows under it. */}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Count label="ON THE SHEET" v={all.length} tone={C.navy} sub="every query ever raised" onClick={() => { setStatus("all"); setWho("all"); setBy("all"); }} />
        <Count label="STILL OPEN" v={open.length} tone={open.length ? C.red : C.green} sub="not Done, not Closed" onClick={() => setStatus("open")} />
        <Count label="OLDER THAN 7 DAYS" v={late.length} tone={late.length ? C.red : C.green} sub="open, and raised over a week ago" onClick={() => setStatus("late")} />
        <Count label="DONE FOR REVIEW" v={all.filter((r) => r.status === "Done for Review").length} tone="#8A5B00" sub="answered, waiting to be checked" onClick={() => setStatus("Done for Review")} />
      </div>

      <div className="flex gap-2 flex-wrap items-center mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ledger, instruction, remark…"
          className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, minWidth: 230 }} />
        <Sel v={status} on={setStatus} opts={[["open", "Open"], ["late", "Older than 7 days"], ["all", "Everything"], ...AUDIT_STATUS.map((s) => [s, s] as [string, string])]} />
        <Sel v={who} on={setWho} opts={[["all", "Anyone"], ...people.map(([k, n]) => [k, n] as [string, string])]} />
        <Sel v={by} on={setBy} opts={[["all", "Asked by anyone"], ...askers.map(([k, n]) => [k, n] as [string, string])]} />
        <span className="text-xs" style={{ color: C.mute }}>
          <b className="tnum" style={{ color: C.ink, fontSize: 14 }}>{shown.length}</b> shown
          {money > 0 && <> · {cr(money)} named</>}
          {unpriced > 0 && <> · <span title="Amounts written in words that could not be read as a figure — they are shown on the row">{unpriced} in words</span></>}
        </span>
      </div>

      <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
        <div style={{ maxHeight: "62vh", overflowY: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Raised", "Asked by", "On", "Ledger / vendor", "The query", "Amount", "Status", ""].map((h) => (
                  <th key={h} style={{ position: "sticky", top: 0, background: C.navy, color: "#fff", padding: "6px 8px", textAlign: "left", fontSize: 11, letterSpacing: .4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} style={{ padding: 20, color: C.mute }}>Reading the sheet…</td></tr>}
              {rows !== null && shown.length === 0 && <tr><td colSpan={8} style={{ padding: 20, color: C.mute }}>Nothing matches.</td></tr>}
              {shown.slice(0, 400).map((r) => {
                const tone = STATUS_TONE[r.status] || { bg: "#F2F2EE", fg: C.sub };
                const isLate = late.includes(r);
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.soft}` }}>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap", color: isLate ? C.red : C.sub }}>
                      {r.assigned_on ? fmtFull(r.assigned_on) : <i style={{ color: C.faint }}>{r.assigned_text || "—"}</i>}
                    </td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{properName(r.instructed_by || "")}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap", fontWeight: 600 }}>{properName(r.assigned_to || "") || <span style={{ color: C.faint }}>nobody</span>}</td>
                    <td style={{ padding: "5px 8px", maxWidth: 190 }}>{r.related_to}</td>
                    <td onClick={() => setEdit(r)} title="Click to edit" style={{ padding: "5px 8px", maxWidth: 420, lineHeight: 1.4, cursor: "text" }}>
                      {String(r.instruction || "").slice(0, 220)}{String(r.instruction || "").length > 220 ? "…" : ""}
                      {r.remarks && <div style={{ color: C.green, fontSize: 11, marginTop: 2 }}>↳ {plainText(String(r.remarks)).slice(0, 140)}{/<img/i.test(String(r.remarks)) ? " 🖼" : ""}</div>}
                      {/* GENIE'S READING, IN ONE LINE (Dr Raghu, 30 Sep 2026:
                          "show summary in this"). A sparkle saying a reading
                          exists is not the same as being able to see what it
                          said \u2014 the whole point of scanning this list is to
                          know which queries you can answer without opening. */}
                      {!!r.ai_note && (
                        <div style={{ color: "#3C4E63", fontSize: 11, marginTop: 3, lineHeight: 1.45, display: "flex", gap: 4 }}>
                          <span>&#10024;</span><span>{aiSummary(r.ai_note)}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap", textAlign: "right" }}>
                      {r.amount != null
                        ? <b className="tnum">{cr(r.amount)}</b>
                        : <i style={{ color: C.faint }}>{r.amount_text || ""}</i>}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <select value={r.status} onChange={(e) => setStatusOf(r.id, e.target.value)} disabled={busy}
                        className="rounded px-1.5 py-0.5 font-bold"
                        style={{ background: tone.bg, color: tone.fg, border: "none", fontSize: 11 }}>
                        {[...new Set([r.status, ...AUDIT_STATUS])].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {/* THE PENCIL, NEXT TO THE STATUS (Dr Raghu, 30 Sep 2026:
                        "put an edit icon next to it \u2014 I will get Jyoti to
                        write here itself"). The word "open" read like a status,
                        not an action; a pencil says what it does without being
                        read. It edits every field of the query \u2014 the ledger,
                        the wording, the amount, who it is for. */}
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEdit(r)} title="Edit this query — the wording, the ledger, the amount, who it is for"
                        className="rounded"
                        style={{ color: C.accent, fontWeight: 700, fontSize: 13, border: `1px solid ${C.line}`, background: "#fff", padding: "2px 7px", lineHeight: 1.2 }}>
                        &#9998;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length > 400 && (
          <div style={{ padding: "6px 10px", fontSize: 11.5, color: C.mute, borderTop: `1px solid ${C.soft}` }}>
            Showing the first 400 of {shown.length}. Narrow it with the search or a filter.
          </div>
        )}
      </div>

      {edit && <QueryBox row={edit} busy={busy} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function Count({ label, v, sub, tone, onClick }: { label: string; v: number; sub: string; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border bg-white text-left p-2.5" style={{ borderColor: C.line }}>
      <div style={{ fontSize: 10, letterSpacing: .5, color: C.mute }}>{label}</div>
      <div className="tnum font-bold" style={{ fontSize: 24, color: tone, lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{sub}</div>
    </button>
  );
}

function Sel({ v, on, opts }: { v: string; on: (s: string) => void; opts: [string, string][] }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value)} className="text-xs border rounded px-2 py-1.5 bg-white"
      style={{ borderColor: C.line, color: C.ink }}>
      {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

/** One query, whole — the row opened up, because the sheet's cells hold paragraphs. */
function QueryBox({ row, busy, onClose, onSave }: {
  row: Partial<AuditRow>; busy: boolean; onClose: () => void; onSave: (r: Partial<AuditRow>) => void;
}) {
  const [f, setF] = useState<Partial<AuditRow>>(row);
  const set = (k: keyof AuditRow, v: string) => setF((x) => ({ ...x, [k]: v }));
  const amt = readAmount(String(f.amount_text || ""));
  return (
    <div onClick={onClose} role="button" tabIndex={0}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="button" tabIndex={0} className="rounded-lg bg-white"
        style={{ width: "min(720px,100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center" style={{ background: C.navy, borderRadius: "8px 8px 0 0" }}>
          <b className="text-white" style={{ fontSize: 14 }}>{f.id ? "Audit query" : "A new audit query"}</b>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3" }}>✕</button>
        </div>
        {/* THE QUERY FIRST, IN FULL (Dr Raghu, 30 Sep 2026: "put a lightbox
            to open, show the query"). It was a textarea among twelve other
            fields; the one thing the person opening this came to read should
            not have to be found. */}
        {!!f.id && (
          <div className="px-4 pt-4">
            <div className="rounded" style={{ background: C.panel, padding: "12px 14px", borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>
                {f.related_to ? <b style={{ color: C.ink }}>{f.related_to}</b> : null}
                {f.related_to && (f.assigned_text || f.instructed_by) ? " · " : ""}
                {f.instructed_by ? `asked by ${properName(String(f.instructed_by))}` : ""}
                {f.assigned_text ? ` · ${f.assigned_text}` : ""}
                {f.amount_text ? ` · ${f.amount_text}` : ""}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: C.ink }}>{f.instruction || <i style={{ color: C.faint }}>nothing written yet</i>}</div>
            </div>
          </div>
        )}
        {!!f.id && <Thread row={f as AuditRow} />}
        <div className="p-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <L label="Raised on" hint="as you would write it">
              <input value={f.assigned_text || ""} onChange={(e) => set("assigned_text", e.target.value)} style={box} placeholder="29/09/2026" />
            </L>
            {/* THE TWO LISTS, TYPED ONCE (Dr Raghu, 30 Sep 2026: "people
                giving \u2014 Jyoti, UDS, Sandeep. People closing \u2014 Suresh,
                Sandesh"). Free text splits one person three ways in the
                by-person filter; a datalist offers the names and still takes
                anything, because five years of sheet history will not be
                re-keyed to suit a dropdown. */}
            <L label="Asked by">
              <input list="audit-raisers" value={f.instructed_by || ""} onChange={(e) => set("instructed_by", e.target.value)} style={box} />
              <datalist id="audit-raisers">{AUDIT_RAISERS.map((n) => <option key={n} value={n} />)}</datalist>
            </L>
            <L label="Assigned to">
              <input list="audit-closers" value={f.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} style={box} />
              <datalist id="audit-closers">{AUDIT_CLOSERS.map((n) => <option key={n} value={n} />)}</datalist>
            </L>
          </div>
          {/* TYPE, AND THE LEDGER OFFERS ITSELF (Dr Raghu, 30 Sep 2026:
              "should be able to type this and follow show ledger. however
              even can write another one also"). The names come from the
              books as you type; a datalist offers, it does not insist, so
              "Purchase" or "GST Liabilities" stay possible. */}
          <L label="Ledger or vendor" hint="start typing — the books' own ledger names appear; anything else can still be written">
            <LedgerInput value={f.related_to || ""} onChange={(v) => set("related_to", v)} />
          </L>
          <L label="The query"><textarea value={f.instruction || ""} onChange={(e) => set("instruction", e.target.value)} rows={5} style={{ ...box, resize: "vertical", lineHeight: 1.55 }} /></L>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <L label="Target" hint="a date, or words"><input value={f.target_text || ""} onChange={(e) => set("target_text", e.target.value)} style={box} /></L>
            <L label="Amount" hint={amt != null ? `reads as ${cr(amt)}` : f.amount_text ? "kept as words — it will not be totalled" : "80000, or 16.31 lakhs"}>
              <input value={f.amount_text || ""} onChange={(e) => set("amount_text", e.target.value)} style={box} />
            </L>
            <L label="Status">
              <select value={f.status || "Pending"} onChange={(e) => set("status", e.target.value)} style={box}>
                {[...new Set([f.status || "Pending", ...AUDIT_STATUS])].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </L>
          </div>
          {/* DETAILS, WITH PICTURES (his ask, same day: "change to Details
              and make it rich text to put screenshots"). Paste a screenshot
              and it files itself to the drive; the query keeps only Genie's
              address for it. */}
          <L label="Details" hint="paste a screenshot straight in — it goes to the drive and appears here">
            <RichBox value={f.remarks || ""} onChange={(v) => set("remarks", v)} />
          </L>
          <L label="Verified on" hint="left empty until somebody has actually checked it">
            <input value={f.verified_text || ""} onChange={(e) => set("verified_text", e.target.value)} style={{ ...box, maxWidth: 200 }} />
          </L>
          {f.updated_at && (
            <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
              Last touched {fmtFull(String(f.updated_at).slice(0, 10))}{f.updated_by ? ` by ${String(f.updated_by).split("@")[0]}` : ""}
              {f.source === "sheet" ? " · came from the sheet" : ""}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => onSave(f)} disabled={busy} className="rounded px-4 py-2 font-bold"
              style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>{busy ? "Saving…" : "Save"}</button>
            <div className="flex-1" />
            <button onClick={onClose} className="rounded px-3 py-2" style={{ color: C.mute, fontSize: 12.5 }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const box: React.CSSProperties = {
  border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px",
  fontSize: 13, color: C.ink, width: "100%", background: "#fff",
};

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mt-2">
      <span style={{ fontSize: 11, color: C.mute }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: C.faint }}> · {hint}</span>}
      {children}
    </label>
  );
}

/**
 * THE SHEET, READ IN THE BROWSER AND SENT IN BATCHES.
 *
 * Nineteen hundred rows is more than the platform will take in one request,
 * and a refusal halfway through an import of an audit record is the worst
 * outcome available. Keyed on the sheet's own row number, so running it twice
 * corrects rather than doubles.
 */
function ImportSheet({ onDone, note, setNote }: { onDone: () => void; note: string; setNote: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="rounded px-3 py-1.5 font-bold" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.navy, fontSize: 12.5, cursor: "pointer" }}>
      {busy ? note || "Reading…" : "⇪ Import the sheet"}
      <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setBusy(true); setNote("Reading…");
        try {
          const text = await file.text();
          const rows = parseCsv(text);
          /* Row 0 is the sheet's own typed summary, row 1 is the header. */
          const head = rows.findIndex((r) => r[0]?.trim() === "Assigned Date");
          const body = rows.slice(head + 1).filter((r) => r.some((c) => c.trim()));
          let wrote = 0;
          for (let i = 0; i < body.length; i += 300) {
            const batch = body.slice(i, i + 300).map((r, k) => ({
              sheet_row: head + 2 + i + k,
              assigned_text: r[0], instructed_by: r[1], assigned_to: r[2], related_to: r[3],
              instruction: r[4], target_text: r[5], amount_text: r[6], status: r[7],
              remarks: r[8], verified_text: r[9],
            }));
            const res = await api.post("/api/kuber/audit", { action: "import", rows: batch }) as { wrote?: number };
            wrote += res.wrote || 0;
            setNote(`${wrote} of ${body.length}…`);
          }
          setNote(`${wrote} rows in ✓`);
          onDone();
        } catch (err) {
          setNote(err instanceof Error ? err.message : String(err));
        }
        setBusy(false);
      }} />
    </label>
  );
}

/** A CSV reader that understands quoted cells with commas and newlines in them —
 *  the Instruction column is full of both. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

/**
 * THE THREAD — what was said, and how the query moved.
 *
 * Dr Raghu, 30 Sep 2026: "also make the comment there. and make it log change
 * from pending to done for review and then close." And: "show a genie icon so
 * that suresh can click on it and it will give greater insight about this.
 * this will be seen."
 *
 * THE GENIE READING IS KEPT, NOT SHOWN AND FORGOTTEN. An insight that only
 * the person who pressed the button can see helps nobody — so it is written
 * into the thread with their name on it, and the next person to open the
 * query finds it waiting. It is generated once and then read; pressing again
 * re-reads the query with whatever has been said since.
 */
function Thread({ row }: { row: AuditRow }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api.post("/api/kuber/audit", { action: "events", id: row.id })
      .then((r: { events?: AuditEvent[] }) => setEvents(r.events || []))
      .catch(() => setEvents([]));
  }, [row.id]);
  useEffect(load, [load]);

  const say = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy("comment"); setErr("");
    try { await api.post("/api/kuber/audit", { action: "comment", id: row.id, body: t }); setText(""); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const ask = async () => {
    setBusy("genie"); setErr("");
    try { await api.post("/api/kuber/audit", { action: "genie", id: row.id }); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  const when = (at: string) => new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const who = (e: AuditEvent) => (e.by_email || "").split("@")[0] || "somebody";

  return (
    <div className="px-4 pt-3">
      {/* ASK GENIE — the one button Suresh presses before he starts looking */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={ask} disabled={!!busy} className="rounded px-3 py-1.5 font-bold flex items-center gap-1.5"
          title="Genie reads the query, the ledger behind it and everything said so far, and says what to check"
          style={{ background: busy === "genie" ? C.faint : "#1E2B3A", color: "#fff", fontSize: 12.5 }}>
          <span style={{ fontSize: 14 }}>&#10024;</span>
          {busy === "genie" ? "Genie is reading…" : events?.some((e) => e.kind === "ai") ? "Ask Genie again" : "Ask Genie about this"}
        </button>
        <span style={{ fontSize: 11, color: C.mute }}>
          it reads the ledger behind the query too — and whatever it says stays here for the next person
        </span>
      </div>
      {err && <div style={{ color: C.red, fontSize: 11.5, marginTop: 6 }}>{err}</div>}

      {events === null ? (
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 10 }}>reading the thread…</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {events.map((e) => (
            <div key={e.id} style={{ borderTop: `1px solid ${C.soft}`, padding: "8px 0" }}>
              {e.kind === "status" ? (
                <div style={{ fontSize: 11.5, color: C.sub }}>
                  <b style={{ color: C.ink }}>{who(e)}</b> moved it
                  {e.from_status ? <> from <Pill s={e.from_status} /></> : null} to <Pill s={e.to_status || ""} />
                  <span style={{ color: C.faint }}> · {when(e.at)}</span>
                </div>
              ) : e.kind === "ai" ? (
                <div className="rounded" style={{ background: "#F2F4F8", padding: "10px 12px", borderLeft: "3px solid #1E2B3A" }}>
                  <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>
                    <b style={{ color: C.ink }}>&#10024; Genie</b> — asked by {who(e)} · {when(e.at)}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>{e.body}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: C.mute }}><b style={{ color: C.ink }}>{who(e)}</b> · {when(e.at)}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>{e.body}</div>
                </div>
              )}
            </div>
          ))}
          {!events.length && <div style={{ fontSize: 11.5, color: C.faint }}>Nothing said yet.</div>}
        </div>
      )}

      <div className="flex gap-2 items-end" style={{ marginTop: 10 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a comment…"
          style={{ ...box, resize: "vertical", lineHeight: 1.5, flex: 1 }} />
        <button onClick={say} disabled={!text.trim() || !!busy} className="rounded px-3 py-2 font-bold"
          style={{ background: text.trim() ? C.accent : C.faint, color: "#fff", fontSize: 12.5 }}>
          {busy === "comment" ? "…" : "Comment"}
        </button>
      </div>
    </div>
  );
}

const Pill = ({ s }: { s: string }) => {
  const t = STATUS_TONE[s] || { bg: "#F2F2EE", fg: C.sub };
  return <b className="rounded" style={{ background: t.bg, color: t.fg, padding: "1px 6px", fontSize: 11 }}>{s}</b>;
};

/**
 * "+ AUDIT" — RAISE ONE FROM ANYWHERE.
 *
 * Dr Raghu, 30 Sep 2026: "show on top before the bell a '+ Audit' icon so
 * from any page an audit entry can be put. By default from logged in person!"
 *
 * A query noticed while reading the P&L had to be carried in the head as far
 * as the Audit Queries page, and a query carried in the head is a query that
 * gets lost. It sits in Kuber's header now, on every screen in the module.
 *
 * ASKED BY IS THE PERSON SIGNED IN, and the date is today, both already
 * filled — the two fields that are never in doubt and were always retyped.
 * Assigned to starts at Suresh because all two hundred and sixty-nine open
 * queries are his; it is a starting point, not a rule, and the box changes it.
 */
export function QuickAudit({ who }: { who: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const d = new Date();
  const dmy = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const save = async (r: Partial<AuditRow>) => {
    setBusy(true);
    try {
      await api.post("/api/kuber/audit", { action: "save", ...r });
      setOpen(false); setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch { /* the box stays open so nothing typed is lost */ }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="Raise an audit query from here — it lands in Kuber → Audit Queries"
        className="rounded px-2.5 py-1 font-bold"
        style={{ background: saved ? "#0D7A3F" : "#22303C", color: "#fff", border: "1px solid #33424F", fontSize: 12 }}>
        {saved ? "✓ raised" : "+ Audit"}
      </button>
      {open && (
        <QueryBox
          row={{ status: "Pending", instructed_by: who || "", assigned_to: "Suresh", assigned_text: dmy }}
          busy={busy} onClose={() => setOpen(false)} onSave={save} />
      )}
    </>
  );
}


/** the words of a rich-text field, for a one-line preview */
function plainText(html: string): string {
  return html.replace(/<img[^>]*>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A ledger name, offered as you type and never insisted upon.
 * The names come from the books; the field stays free text.
 */
function LedgerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setNames([]); return; }
    const t = window.setTimeout(() => {
      fetch(`/api/kuber/books?view=ledgers&q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { rows?: { name: string }[] }) => setNames((j.rows || []).map((x) => x.name).slice(0, 40)))
        .catch(() => setNames([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <>
      <input list="aq-ledgers" value={value} onChange={(e) => onChange(e.target.value)} style={box} autoComplete="off" />
      <datalist id="aq-ledgers">{names.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

/**
 * RICH TEXT THAT TAKES A PASTED SCREENSHOT.
 *
 * A contentEditable box. Typing is typing; pasting an image uploads it to
 * the drive through /api/kuber/audit-image and drops an <img> at the caret
 * pointing at Genie's own address for it. What is saved is the box's HTML,
 * which the server strips down to paragraphs, emphasis, lists and our own
 * pictures before it is kept.
 */
function RichBox({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* seed once; afterwards the box owns its own DOM and reports upward */
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value; }, [value]);

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
    if (!item) return;                       /* text pastes as text */
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/kuber/audit-image", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "could not upload the image");
      const img = document.createElement("img");
      img.src = j.url; img.style.maxWidth = "100%"; img.style.display = "block"; img.style.margin = "6px 0";
      const sel = window.getSelection();
      if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0); range.deleteContents(); range.insertNode(img);
        range.setStartAfter(img); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
      } else ref.current?.appendChild(img);
      onChange(ref.current?.innerHTML || "");
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || "")}
        onPaste={(e) => void onPaste(e)}
        style={{ ...box, minHeight: 88, lineHeight: 1.55, overflowY: "auto", maxHeight: 360, whiteSpace: "pre-wrap" }} />
      <div style={{ fontSize: 11, color: busy ? C.accent : err ? C.red : C.faint, marginTop: 3 }}>
        {busy ? "filing the screenshot to the drive…" : err || "bold with ⌘B, lists with ⌘⇧8 — a pasted screenshot goes straight in"}
      </div>
    </div>
  );
}
