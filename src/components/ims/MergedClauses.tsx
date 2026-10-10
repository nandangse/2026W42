"use client";
/**
 * CLAUSES & EVIDENCE ACROSS THE STANDARDS (Dr Raghu, 10 Oct 2026): "show the
 * checkboxes for the standard, then merge the same; show combined and
 * logical clause; next to it the single cell with the standard — 9001 /
 * AS9100D / 27001 / 45001; next to it a cell with the evidence. Let the man
 * write. Then on saving automatically let Genie rewrite all."
 *
 * The standards share the Annex SL numbering, so the clause number is the
 * logical clause. One row per number; the standard cell says what each
 * standard calls it and how each is marked; the evidence cell is written
 * once and, on Save, Genie writes it into every ticked standard's own note.
 */
import { useEffect, useState } from "react";
import { Area, Btn, Chip, Empty, Note, Select, Text, post, BORDER, INK, MUTED, NAVY_SOFT, GREEN, AMBER, RED } from "./ui";
import type { StandardRow } from "./types";

interface Per { standard_id: string; short: string; clause_id: string; title: string; evidence: string; compliance: string | null; updated_by: string | null; updated_at: string | null }
interface Remark { id: string; clause_no: string; standard_id: string | null; audit_label: string; kind: string; remark: string; added_by: string; added_at: string }
interface Row { clause_no: string; title: string; parent_clause: string | null; per: Per[]; group: { raw: string | null; updated_by: string | null; updated_at: string | null; rewritten_at: string | null } | null; remarks: Remark[] }
interface Loaded { installed: boolean; standards: StandardRow[]; chosen?: (StandardRow & { short: string })[]; rows: Row[]; mayWrite: boolean; mayRemark?: boolean; me?: string }
const KINDS = ["Conforms", "Observation", "OFI", "Minor NC", "Major NC"];
const KIND_COLOUR: Record<string, string> = { Conforms: GREEN, Observation: "#1B6B93", OFI: AMBER, "Minor NC": "#C2410C", "Major NC": RED };
const COMP_COLOUR: Record<string, string> = { "Fully compliant": GREEN, WIP: "#1B6B93", Pending: AMBER, Risk: RED };

export default function MergedClauses() {
  const [d, setD] = useState<Loaded | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [merged, setMerged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = async (ids: string[]) => {
    setBusy(true); setErr("");
    try { const r = await fetch(`/api/ims/standard/merge${ids.length ? `?ids=${ids.join(",")}` : ""}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setD(j); if (ids.length && !ticked.length) setTicked(ids); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not read."); }
    setBusy(false);
  };
  useEffect(() => { load([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d && !ticked.length && d.standards.length) setTicked(d.standards.filter((s) => /9001|9100|14001|45001|27001/.test(s.name)).map((s) => String(s.id))); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  /* TICKING SHOWS THE CLAUSES RELEVANT TO THAT STANDARD, at once (Dr Raghu, 10 Oct 2026) */
  useEffect(() => { if (!ticked.length) { setMerged([]); return; } const t = setTimeout(() => { setMerged(ticked); load(ticked); }, 250); return () => clearTimeout(t); }, [ticked]); // eslint-disable-line react-hooks/exhaustive-deps
  const merge = () => { setMerged(ticked); load(ticked); };
  const rows = merged.length ? (d?.rows ?? []) : [];
  const top = rows.filter((r) => !r.parent_clause);
  const kids = (no: string) => rows.filter((r) => r.parent_clause === no);
  const mayWrite = !!d?.mayWrite;

  return (
    <div>
      {err && <Note kind="error">{err}</Note>}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
        <div className="text-xs font-bold mb-2" style={{ color: MUTED, letterSpacing: 0.6 }}>TICK THE STANDARDS, THEN MERGE</div>
        <div className="flex gap-3 flex-wrap items-center">
          {(d?.standards ?? []).map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm" style={{ color: INK, cursor: "pointer" }}>
              <input type="checkbox" checked={ticked.includes(String(s.id))} onChange={(e) => setTicked(e.target.checked ? [...ticked, String(s.id)] : ticked.filter((x) => x !== String(s.id)))} />
              <span className="font-bold">{s.name.split(" — ")[0].split(" - ")[0]}</span><Chip text={s.sys} colour="#1B2D6B" />
            </label>
          ))}
          <span className="flex-1" />
          <Btn onClick={merge} disabled={busy || !ticked.length}>{busy ? "Merging…" : "Refresh"}</Btn>
        </div>
        <div className="text-xs mt-2" style={{ color: MUTED }}>Tick a standard and its clauses appear; tick several and they merge on the clause number, since the standards share the Annex SL numbering. One row per clause; write the evidence once; Save hands it to Genie, which rewrites it into each ticked standard&apos;s own clause note. <b>The clause-wise remarks are the key:</b> under every clause the internal auditor writes a remark per audit, with the finding type and the date.</div>
      </div>

      {merged.length > 0 && (
        rows.length === 0 ? <Empty>{busy ? "Merging…" : "No clauses seeded for the ticked standards."}</Empty> : (
          <div className="bg-white rounded-lg border mt-3 overflow-auto" style={{ borderColor: BORDER }}>
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 980 }}>
              <thead>
                <tr style={{ background: NAVY_SOFT }}>
                  <th className="text-left px-3 py-2" style={{ width: 300, color: INK }}>Combined, logical clause</th>
                  <th className="text-left px-3 py-2" style={{ width: 330, color: INK }}>The standard</th>
                  <th className="text-left px-3 py-2" style={{ color: INK }}>Evidence — written once{mayWrite ? ", Genie rewrites it for each" : ""} · and the auditor&apos;s remarks</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => <><RowView key={r.clause_no} r={r} depth={0} open={open} setOpen={setOpen} mayWrite={mayWrite} mayRemark={!!d?.mayRemark} me={d?.me || ""} ids={merged} onSaved={() => load(merged)} />{kids(r.clause_no).map((k) => <><RowView key={k.clause_no} r={k} depth={1} open={open} setOpen={setOpen} mayWrite={mayWrite} mayRemark={!!d?.mayRemark} me={d?.me || ""} ids={merged} onSaved={() => load(merged)} />{kids(k.clause_no).map((g) => <RowView key={g.clause_no} r={g} depth={2} open={open} setOpen={setOpen} mayWrite={mayWrite} mayRemark={!!d?.mayRemark} me={d?.me || ""} ids={merged} onSaved={() => load(merged)} />)}</>)}</>)}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function RowView({ r, depth, open, setOpen, mayWrite, mayRemark, me, ids, onSaved }: { r: Row; depth: number; open: string | null; setOpen: (k: string | null) => void; mayWrite: boolean; mayRemark: boolean; me: string; ids: string[]; onSaved: () => void }) {
  const [raw, setRaw] = useState(r.group?.raw || "");
  const [audit, setAudit] = useState(() => { try { return localStorage.getItem("ims-audit-label") || ""; } catch { return ""; } });
  const [kind, setKind] = useState("Observation"); const [remark, setRemark] = useState(""); const [forStd, setForStd] = useState("");
  const addRemark = async () => {
    setMsg("");
    const res = await post("/api/ims/standard/merge", { action: "remark_add", clause_no: r.clause_no, standard_id: forStd || null, audit_label: audit, kind, remark });
    if (!res.ok) { setMsg(res.error || "Could not add the remark."); return; }
    try { localStorage.setItem("ims-audit-label", audit); } catch { /* no storage */ }
    setRemark(""); onSaved();
  };
  const dropRemark = async (id: string) => { if (!confirm("Withdraw this remark?")) return; const res = await post("/api/ims/standard/merge", { action: "remark_remove", id }); if (!res.ok) { setMsg(res.error || "Could not withdraw."); return; } onSaved(); };
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [showEach, setShowEach] = useState(false);
  useEffect(() => { setRaw(r.group?.raw || ""); }, [r.group?.raw]);
  const isOpen = open === r.clause_no;
  const save = async (rewrite: boolean) => {
    setSaving(rewrite ? "Saving — Genie is writing it into each standard…" : "Saving…"); setMsg("");
    const res = await post("/api/ims/standard/merge", { action: "group_save", clause_no: r.clause_no, standard_ids: ids, raw, rewrite });
    setSaving(null);
    if (!res.ok) { setMsg(res.error || "Could not save."); return; }
    setMsg(rewrite ? `Saved; Genie rewrote ${res.rewritten} note${res.rewritten === 1 ? "" : "s"}.` : "Saved.");
    onSaved();
  };
  const written = r.per.filter((p) => p.evidence).length;
  return (
    <tr style={{ borderTop: `1px solid ${BORDER}`, background: depth === 0 ? NAVY_SOFT : "#fff", verticalAlign: "top" }}>
      <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 18 }}>
        <button onClick={() => setOpen(isOpen ? null : r.clause_no)} className="text-left" style={{ color: INK, fontWeight: depth === 0 ? 700 : 500 }}>
          <span style={{ display: "inline-block", minWidth: 56, fontWeight: 700, color: depth === 0 ? INK : MUTED }}>{r.clause_no}</span>{r.title}
        </button>
        <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: MUTED }}>{r.per.length} standard{r.per.length === 1 ? "" : "s"}{written ? ` · ${written} written` : ""}{r.group?.rewritten_at ? " · ✨ Genie wrote it" : ""}
          {r.remarks.length > 0 && <span className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: "#FFF1E8", color: "#C2410C" }} title={r.remarks.map((x) => `${x.audit_label}: ${x.kind}`).join("\n")}>🔎 {r.remarks.length} remark{r.remarks.length === 1 ? "" : "s"}{r.remarks.some((x) => /NC/.test(x.kind)) ? " · NC" : ""}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="grid gap-0.5">
          {r.per.map((p) => (
            <div key={p.clause_id} className="flex items-start gap-1.5 text-xs">
              <span className="font-bold" style={{ color: INK, minWidth: 64 }}>{p.short}:</span>
              <span className="flex-1" style={{ color: p.title === r.title ? MUTED : INK }}>{p.title === r.title ? "same" : p.title}</span>
              <Chip text={p.compliance ?? "—"} colour={COMP_COLOUR[p.compliance ?? ""] ?? "#9CA3AF"} />
            </div>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        {isOpen ? (
          <div>
            {mayWrite ? <Area rows={6} value={raw} onChange={setRaw} placeholder="How this clause is met at Nandan — the documents, records, who does what. Write it once; Genie words it for each standard on Save." />
              : <div className="text-sm whitespace-pre-wrap" style={{ color: INK }}>{raw || "Nothing written yet."}</div>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {mayWrite && <Btn kind="primary" onClick={() => save(true)} disabled={!!saving}>{saving || "Save — Genie rewrites all"}</Btn>}
              {mayWrite && <Btn onClick={() => save(false)} disabled={!!saving}>Save my words only</Btn>}
              <Btn onClick={() => setShowEach(!showEach)}>{showEach ? "Hide each standard's note" : "See each standard's note"}</Btn>
              {msg && <span className="text-xs font-bold" style={{ color: msg.startsWith("Could") ? RED : GREEN }}>{msg}</span>}
              {r.group?.updated_by && <span className="text-xs" style={{ color: MUTED }}>· written by {r.group.updated_by}</span>}
            </div>
            {showEach && (
              <div className="grid gap-2 mt-2">
                {r.per.map((p) => (
                  <div key={p.clause_id} className="rounded border p-2" style={{ borderColor: BORDER }}>
                    <div className="text-xs font-bold mb-1" style={{ color: INK }}>{p.short} · {r.clause_no} {p.title} <Chip text={p.compliance ?? "—"} colour={COMP_COLOUR[p.compliance ?? ""] ?? "#9CA3AF"} /></div>
                    <div className="text-xs whitespace-pre-wrap" style={{ color: INK, lineHeight: 1.5 }}>{p.evidence || "Nothing written for this standard yet."}</div>
                  </div>
                ))}
              </div>
            )}
            {/* THE AUDITOR'S REMARKS — the key, per audit, dated, never edited */}
            <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: INK, letterSpacing: 0.4 }}>AUDIT REMARKS · {r.remarks.length}</div>
              {r.remarks.length === 0 && <div className="text-xs" style={{ color: MUTED }}>No remark on this clause yet.</div>}
              <div className="grid gap-1.5">
                {r.remarks.map((x) => (
                  <div key={x.id} className="rounded px-2 py-1.5" style={{ background: "#FAFAFC", borderLeft: `4px solid ${KIND_COLOUR[x.kind] || MUTED}` }}>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <Chip text={x.kind} colour={KIND_COLOUR[x.kind] || MUTED} /><b style={{ color: INK }}>{x.audit_label}</b>
                      {x.standard_id && <span style={{ color: MUTED }}>· {r.per.find((p) => p.standard_id === x.standard_id)?.short || "one standard"}</span>}
                      <span style={{ color: MUTED }}>· {x.added_by} · {new Date(x.added_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      {(x.added_by === me || mayWrite) && <button onClick={() => dropRemark(x.id)} className="font-bold" style={{ color: RED }} title="Withdraw">×</button>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap mt-0.5" style={{ color: INK }}>{x.remark}</div>
                  </div>
                ))}
              </div>
              {mayRemark && (
                <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: "1fr 150px 160px" }}>
                  <Text value={audit} onChange={setAudit} placeholder="Which audit — Internal audit, Oct 2026" />
                  <Select value={kind} onChange={setKind} blank="Observation" options={KINDS} />
                  <Select value={forStd} onChange={setForStd} blank="All ticked standards" options={r.per.map((p) => ({ value: p.standard_id, label: p.short }))} />
                  <div style={{ gridColumn: "1/-1" }}><Area rows={2} value={remark} onChange={setRemark} placeholder="What the auditor saw, what was asked, what was shown…" /></div>
                  <div style={{ gridColumn: "1/-1" }}><Btn kind="primary" onClick={addRemark} disabled={!remark.trim() || !audit.trim()}>Add the remark</Btn></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(r.clause_no)} className="text-left w-full" style={{ color: raw ? INK : MUTED, fontSize: 13 }}>
            {raw ? <span className="line-clamp-2">{raw}</span> : <span>Click to write</span>}
          </button>
        )}
      </td>
    </tr>
  );
}
