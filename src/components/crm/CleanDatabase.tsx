"use client";
/**
 * CLEAN DATABASE — what is wrong in there, and a button beside each one.
 *
 * Dr Raghu, 16 Sep 2026, listing it: duplicate company names, the Pvt Ltd
 * spellings, duplicate contacts by e-mail and by mobile, and every number
 * written as WhatsApp wants it. "This can be done by Shweta."
 *
 * TWO THINGS SHAPE THE WHOLE SCREEN.
 *
 * THE SCAN IS KEPT, NOT REPEATED. Reading 255,288 people takes 84 seconds.
 * Doing that on every page load would make the screen unusable, so a scan
 * runs when somebody asks, and the screen shows what it found with the time
 * it was found — a count without its date is a rumour.
 *
 * NOTHING IS CLEANED AUTOMATICALLY. Among the colliding company names are
 * "Kuldeep" four times and "Rahul Kumar" four times: people's names used as
 * a company, almost certainly four different people at four different firms.
 * A name alone is not identity. So every row here is a PROPOSAL, the risky
 * ones say so, and anything wrong can be dismissed for good.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

type Finding = { id: string; kind: string; grp: string; ids: string[]; labels: string[]; n: number; suggestion: string | null };
type Run = { at: string; seconds: number; summary: Record<string, number> };

const KINDS = [
  { key: "company_dup",  label: "Companies that are the same firm twice", verb: "Merge",  note: "Two rows whose names come to the same thing once spacing and the Ltd spelling are set aside." },
  { key: "company_name", label: "Company names spelled unusually",        verb: "Rename", note: "Only the legal suffix is touched — Pvt. Ltd., PRIVATE LIMITED and pvt ltd all become Pvt Ltd. The company's own words are left alone." },
  { key: "person_email", label: "Contacts sharing one e-mail address",     verb: "Merge",  note: "An address identifies far better than a name does. Still check: hr@ and info@ belong to whole departments." },
  { key: "person_phone", label: "Contacts sharing one mobile number",      verb: "Merge",  note: "Matched on the last ten digits, so +91 98… and 098… count as the same number." },
  { key: "phone_format", label: "Numbers not written for WhatsApp",        verb: "Fix",    note: "+<country code> then the number. Ten digits are read as India; anything that cannot be read confidently is left alone rather than guessed at." },
];

/**
  * Dr Raghu, 17 Sep 2026: "make it clickable to open in lightbox", twice.
  * A row of a duplicate group is a record; the only way to judge whether two
  * rows are one person is to look at them, so every line opens.
  */

/** The record itself, read straight back — the only way to judge a duplicate. */
function Peek({ kind, id }: { kind: string; id: string }) {
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/crm/${kind}?id=${id}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(String(j.error || r.status)); setRow(j.row || null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [kind, id]);
  if (err) return <div className="p-4 text-sm" style={{ color: "#B3261E" }}>{err}</div>;
  if (!row) return <div className="p-4 text-sm" style={{ color: MUTED }}>opening…</div>;
  const skip = new Set(["id", "search_vector", "deleted_at", "match_key", "merged_into_id"]);
  const shown = Object.entries(row).filter(([k, v]) => !skip.has(k) && v !== null && v !== "" && typeof v !== "object");
  return (
    <div className="p-4" style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%,230px), 1fr))" }}>
      {shown.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontSize: 10.5, color: MUTED, textTransform: "uppercase", letterSpacing: .4 }}>{k.replace(/_/g, " ")}</div>
          <div style={{ fontSize: 13, color: INK, wordBreak: "break-word" }}>{String(v)}</div>
        </div>
      ))}
      {!shown.length && <div className="text-sm" style={{ color: MUTED }}>Nothing on this record but its id.</div>}
    </div>
  );
}

export default function CleanDatabase({ onOpen }: { onOpen?: (target: string, id: string) => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [installed, setInstalled] = useState(true);
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [peek, setPeek] = useState<{ kind: string; id: string } | null>(null);
  /* Which row of a group survives. Defaults to the first — usually the oldest. */
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [wide, setWide] = useState<Record<string, boolean>>({});

  const get = useCallback(async (k: string) => {
    try {
      const r = await fetch(`/api/crm/clean${k ? `?kind=${k}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setInstalled(j.installed !== false);
      setRun(j.run || null);
      setRows(k ? (j.findings || []) : null);
      setErr("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { get(kind); }, [get, kind]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/crm/clean", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j;
  };

  const scan = async () => {
    setBusy("scan"); setErr(""); setNote("");
    try {
      const j = await post({ action: "scan" });
      setNote(`Read ${j.summary.companies.toLocaleString()} companies and ${j.summary.people.toLocaleString()} people in ${j.seconds}s.`);
      await get(kind);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const act = async (f: Finding, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(f.id); setErr("");
    try { await post({ action, id: f.id, ...extra }); setRows((xs) => (xs || []).filter((x) => x.id !== f.id)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const s = run?.summary || {};
  const card = (k: typeof KINDS[number]) => (
    <button key={k.key} onClick={() => setKind(kind === k.key ? "" : k.key)}
      className="rounded border p-2 text-left"
      style={{ borderColor: kind === k.key ? ORANGE : BORDER, background: kind === k.key ? "#FFF6F2" : "#fff", borderWidth: kind === k.key ? 2 : 1 }}>
      <div className="tnum" style={{ fontSize: 21, fontWeight: 700, color: (s[k.key] || 0) ? INK : MUTED }}>
        {(s[k.key] ?? "—").toLocaleString?.() ?? s[k.key] ?? "—"}
      </div>
      <div style={{ fontSize: 12, color: NAVY, fontWeight: 600, lineHeight: 1.35 }}>{k.label}</div>
    </button>
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <div>
          <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 1.4 }}>TOOLS</div>
          <div className="text-lg font-bold" style={{ color: NAVY, lineHeight: 1.2 }}>🧹 Clean Database</div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <button onClick={scan} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: busy === "scan" ? "#B9BEC4" : ORANGE }}>
          {busy === "scan" ? "reading the whole database…" : run ? "Scan again" : "Scan the database"}
        </button>
      </div>
      <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
        <b>Everything here is a proposal.</b> Nothing is merged or rewritten until you press the button beside it, and a merge is reversible —
        the losing row is hidden, never destroyed. Reading a quarter of a million people takes about a minute and a half, which is why the
        findings are kept rather than recounted every time you open this.
      </div>

      {!installed && <div className="rounded border p-2 mb-3 text-xs" style={{ borderColor: "#E0C88A", background: "#FDF8EC", color: "#7A5B00" }}>
        <b>Run CRM migration 0078</b> — there is nowhere to keep what a scan finds yet.
      </div>}
      {err && <div className="rounded border p-2 mb-2 text-xs font-semibold" style={{ borderColor: "#B3261E", color: "#B3261E", background: "#FDF3F2" }}>{err}</div>}
      {note && <div className="text-xs mb-2 font-semibold" style={{ color: GREEN }}>{note}</div>}

      {!run && installed && (
        <div className="rounded border p-4 text-sm" style={{ borderColor: BORDER, color: MUTED, background: "#FAFBFD" }}>
          Nothing scanned yet. Press <b>Scan the database</b> — it reads every company and every contact once and takes about ninety seconds.
        </div>
      )}

      {run && (
        <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))" }}>
            {KINDS.map(card)}
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED }}>
            From {(s.companies || 0).toLocaleString()} companies and {(s.people || 0).toLocaleString()} contacts ·
            scanned {new Date(run.at).toLocaleString("en-GB")} in {Math.round(run.seconds)}s ·
            the biggest {s.shown_cap || 400} of each duplicate kind are listed
          </div>
        </>
      )}

      {peek && (
        <div onClick={() => setPeek(null)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded bg-white"
            style={{ width: "min(900px,100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
              <b className="text-white text-sm">{peek.kind === "company" ? "🏢" : "👤"} the record</b>
              <span className="flex items-center gap-2">
                {onOpen && <button onClick={() => { const t = peek; setPeek(null); onOpen(t.kind, t.id); }}
                  className="text-xs font-bold rounded px-2 py-1" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>open it properly</button>}
                <button onClick={() => setPeek(null)} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
              </span>
            </div>
            <Peek kind={peek.kind} id={peek.id} />
          </div>
        </div>
      )}

      {kind && (
        <div className="mt-3">
          <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.6 }}>
            <b>{KINDS.find((k) => k.key === kind)?.label}</b> — {KINDS.find((k) => k.key === kind)?.note}
          </div>
          {rows && rows.length === 0 && <div className="text-sm" style={{ color: MUTED }}>Nothing left here.</div>}
          {(rows || []).map((f) => {
            const risky = String(f.suggestion || "").startsWith("RISKY");
            return (
              <div key={f.id} className="rounded border p-2 mb-1.5" style={{ borderColor: risky ? "#E0C88A" : BORDER, background: risky ? "#FDF8EC" : "#fff" }}>
                <div className="flex items-start gap-2 flex-wrap">
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    {/* EVERY LINE OPENS. Two rows can only be judged the same
                        person by looking at them, and a label never carries
                        enough. The one that will survive is ticked. */}
                    {(wide[f.id] ? f.labels : f.labels.slice(0, 8)).map((l, i) => {
                      const rowId = f.ids[i];
                      const isGroup = f.kind === "company_dup" || f.kind === "person_email" || f.kind === "person_phone";
                      const survivor = (keep[f.id] || f.ids[0]) === rowId;
                      return (
                        <div key={i} className="flex items-start gap-1.5" style={{ fontSize: 12.5, color: INK, lineHeight: 1.6 }}>
                          {isGroup && (
                            <input type="radio" name={`keep-${f.id}`} checked={survivor} onChange={() => setKeep((k) => ({ ...k, [f.id]: rowId }))}
                              title="Keep this one" style={{ marginTop: 4 }} />
                          )}
                          <button onClick={() => rowId && setPeek({ kind: f.kind.startsWith("company") ? "company" : "person", id: rowId })}
                            className="text-left" style={{ color: survivor && isGroup ? INK : "var(--blue)", fontWeight: survivor && isGroup ? 700 : 400, textDecoration: rowId ? "underline" : "none", minWidth: 0 }}
                            title="Open this record">
                            {f.kind === "phone_format" && i === 1 ? <code>{l}</code> : l}
                          </button>
                        </div>
                      );
                    })}
                    {f.labels.length > 8 && (
                      <button onClick={() => setWide((w) => ({ ...w, [f.id]: !w[f.id] }))} style={{ fontSize: 11.5, color: "var(--blue)", textDecoration: "underline" }}>
                        {wide[f.id] ? "show fewer" : `and ${f.labels.length - 8} more…`}
                      </button>
                    )}
                    {f.suggestion && !risky && (
                      <div style={{ fontSize: 12, color: GREEN, marginTop: 2 }}>→ <b>{f.suggestion}</b></div>
                    )}
                    {risky && (
                      <div style={{ fontSize: 11.5, color: "#8A5B00", marginTop: 2 }}>
                        <b>Careful.</b> This reads as a person&rsquo;s name rather than a firm, so these are probably different people at different companies. Dismiss it unless you know otherwise.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {(f.kind === "company_dup" || f.kind === "person_email" || f.kind === "person_phone") && (
                      <button onClick={() => act(f, "merge", { keep: keep[f.id] || f.ids[0] })} disabled={!!busy}
                        title="Fold the rest into the ticked one. Reversible."
                        className="text-xs font-bold rounded px-2 py-1 text-white" style={{ background: risky ? "#8A5B00" : GREEN }}>
                        Fold {f.ids.length - 1} into the ticked one
                      </button>
                    )}
                    {f.kind === "company_name" && (
                      <button onClick={() => act(f, "rename_company")} disabled={!!busy} className="text-xs font-bold rounded px-2 py-1 text-white" style={{ background: GREEN }}>Rename</button>
                    )}
                    {f.kind === "phone_format" && (
                      <button onClick={() => act(f, "fix_phone")} disabled={!!busy} className="text-xs font-bold rounded px-2 py-1 text-white" style={{ background: GREEN }}>Fix</button>
                    )}
                    <button onClick={() => act(f, "ignore")} disabled={!!busy} className="text-xs rounded px-2 py-1" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: MUTED }}>not a duplicate</button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows && rows.length >= 200 && <div className="text-xs" style={{ color: MUTED }}>The two hundred biggest are shown. Clear these and scan again for the next lot.</div>}
        </div>
      )}
    </div>
  );
}
