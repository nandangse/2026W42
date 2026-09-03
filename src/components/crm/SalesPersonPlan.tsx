"use client";
/**
 * SalesPerson Plan — two tabs (Dr Raghu, 3 Sep 2026).
 *
 *   MY PLAN      "eg Nitu's Sales Plan" — one person's nine numbers, the
 *                plan in their own words, and two buttons beside it:
 *                CONSULT DR RAGHU (his chair, with this position on the
 *                desk) and GENIE GARNISH ("this will help them to make a
 *                better plan"). Dr Raghu guides WHAT plan to make; Genie
 *                sharpens how it is written; the words stay the person's.
 *   COMBINED     everyone's row, the table the Dashboard measures against.
 *
 * Money targets are annual, activity per week, because that is how each is
 * actually promised. The numbers are the Sales Head's to set; the words are
 * the salesperson's to write.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import RichText, { RichTextView, isEmptyHtml } from "@/components/hrms/RichText";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, GREEN, ORANGE, ORANGE_SOFT } from "./palette";

interface Row {
  profile_id: string; name: string; initials: string | null; role: string;
  targets: Record<string, number>;
  plan_text?: string | null; garnish?: string | null; garnished_at?: string | null;
  files?: PlanFile[];
}
interface PlanFile { name: string; url: string; drive?: boolean; at: string; by: string }
interface Me { profile_id: string | null; name: string; role: string }

const COLS: { key: string; label: string; money?: boolean; unit: string }[] = [
  { key: "booking", label: "Booking", money: true, unit: "₹ / year" },
  { key: "billing", label: "Billing", money: true, unit: "₹ / year" },
  { key: "collections", label: "Collections", money: true, unit: "₹ / year" },
  { key: "quotation_value", label: "Quotations", money: true, unit: "₹ / year" },
  { key: "quotation_nos", label: "Quotes", unit: "nos / year" },
  { key: "calls_wk", label: "Calls", unit: "per week" },
  { key: "visits_wk", label: "Visits", unit: "per week" },
  { key: "video_calls_wk", label: "Video calls", unit: "per week" },
  { key: "opps_wk", label: "Opportunities", unit: "per week" },
];

const fmtL = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : String(n));
/** Genie's garnish arrives as plain text with Markdown bones; the plan is HTML. */
const toHtml = (t: string) => t.split(/\n{2,}/).map((para) =>
  `<p>${para.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`).join("");
const possessive = (name: string) => { const f = name.trim().split(/\s+/)[0] || name; return /s$/i.test(f) ? `${f}'` : `${f}'s`; };

export default function SalesPersonPlan({ onConsult }: { onConsult?: (profileId: string, title: string) => void }) {
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [fy, setFy] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [manage, setManage] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [needsWords, setNeedsWords] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // the first tab: whose plan, and the words as they are being typed
  const [who, setWho] = useState<string>("");
  const [words, setWords] = useState("");
  const [wordsDirty, setWordsDirty] = useState(false);
  const [garnishing, setGarnishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [driveLink, setDriveLink] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback((f?: string) => {
    fetch(`/api/crm/salesplan${f ? `?fy=${encodeURIComponent(f)}` : ""}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setFy(j.fy); setRows(j.rows || []); setManage(!!j.manage); setNeeds(!!j.needsMigration); setNeedsWords(!!j.needsWordsMigration);
      setMe(j.me || null);
      setEdit(Object.fromEntries((j.rows || []).map((row: Row) => [
        row.profile_id,
        Object.fromEntries(COLS.map((c) => [c.key, row.targets[c.key] ? String(row.targets[c.key]) : ""])),
      ])));
      // whose plan opens first: your own if you have one, else the first row
      setWho((cur) => cur || (j.rows || []).find((x: Row) => x.profile_id === j.me?.profile_id)?.profile_id || (j.rows || [])[0]?.profile_id || "");
    }).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const person = (rows || []).find((r) => r.profile_id === who) || null;
  useEffect(() => { if (person && !wordsDirty) setWords(String(person.plan_text || "")); }, [person, wordsDirty]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/crm/salesplan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fy, ...body }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j;
  };

  const save = async (profileId: string) => {
    setBusy(profileId); setErr("");
    try { await post({ profile_id: profileId, targets: edit[profileId] || {} }); load(fy); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  const saveWords = async (html?: string) => {
    if (!person) return;
    const body = html ?? words;
    setBusy("words"); setErr("");
    try { await post({ action: "words", profile_id: person.profile_id, plan_text: body }); setWords(body); setWordsDirty(false); load(fy); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  /** FILES ON THE PLAN — an upload goes to the CRM's storage (and the Drive
   *  archive behind it); a pasted Drive link is kept as the link, named
   *  through the person's own OAuth. Either way the list lives on the plan. */
  const setFiles = async (files: PlanFile[]) => {
    if (!person) return;
    setErr("");
    try { await post({ action: "files", profile_id: person.profile_id, files }); load(fy); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const upload = async (f: File) => {
    if (!person) return;
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("target_type", "sales_plan"); fd.set("target_id", person.profile_id); fd.set("file", f);
      const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      await setFiles([...(person.files || []), { name: String(j.name), url: String(j.url), at: new Date().toISOString(), by: me?.name || "" }]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const addDrive = async () => {
    const url = driveLink.trim();
    if (!person || !/drive\.google\.com|docs\.google\.com/i.test(url)) { setErr("Paste a Google Drive or Docs link."); return; }
    setDriveLink("");
    await setFiles([...(person.files || []), { name: "", url, drive: true, at: new Date().toISOString(), by: me?.name || "" }]);
  };
  const garnish = async () => {
    if (!person) return;
    if (wordsDirty) await saveWords();          // Genie garnishes what is saved, not what is half-typed
    setGarnishing(true); setErr("");
    try { await post({ action: "garnish", profile_id: person.profile_id }); load(fy); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setGarnishing(false);
  };

  const mayWrite = !!person && (manage || person.profile_id === me?.profile_id);
  const title = person ? `${possessive(person.name)} Sales Plan` : "Sales Plan";

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>◐ SalesPerson Plan</h2>
        <span className="rounded px-2 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12 }}>FY {fy || "…"}</span>
        <div className="flex gap-1 ml-2">
          {([["mine", person ? title : "My plan"], ["all", "Combined plan"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-full px-3 py-1 text-xs font-bold border"
              style={tab === k ? { background: NAVY, color: "#fff", borderColor: NAVY } : { color: NAVY, borderColor: BORDER, background: "#fff" }}>{l}</button>
          ))}
        </div>
      </div>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migration 0020 — the plan has nowhere to live yet.</div>}
      {!needs && needsWords && tab === "mine" && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migration 0050 — the plan&apos;s words and Genie garnish have nowhere to live yet. The numbers still work.</div>}
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

      {tab === "mine" && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {manage && rows && rows.length > 1 ? (
              <select value={who} onChange={(e) => { setWho(e.target.value); setWordsDirty(false); }} className="rounded border px-2 py-1 text-sm font-bold" style={{ borderColor: BORDER, color: INK }}>
                {rows.map((r) => <option key={r.profile_id} value={r.profile_id}>{possessive(r.name)} Sales Plan</option>)}
              </select>
            ) : (
              <h3 className="font-black" style={{ fontSize: 22, color: INK }}>{title}</h3>
            )}
            <div className="flex-1" />
            {/* "Next to it keep a consult Dr Raghu button handy and then let them chat" */}
            <button onClick={() => person && onConsult?.(person.profile_id, title)} disabled={!person || !onConsult}
              className="rounded-lg px-3 py-1.5 text-sm font-black text-white flex items-center gap-2"
              style={{ background: ORANGE, boxShadow: "0 3px 10px rgba(240,78,35,.3)" }}
              title="Sit down with Dr Raghu — your numbers and your plan go with you">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/consult-raghu.png" alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "1.5px solid #fff" }} />
              Consult Dr Raghu
            </button>
            {/* "Also make a button of 'Genie garnish' — this will help them to make a better plan" */}
            <button onClick={garnish} disabled={!person || !mayWrite || garnishing || needsWords}
              className="rounded-lg px-3 py-1.5 text-sm font-black border"
              style={{ borderColor: NAVY, color: NAVY, background: "#fff", opacity: !mayWrite || needsWords ? .5 : 1 }}
              title="Genie reads the numbers, the year so far and your words — and hands the plan back sharper">
              {garnishing ? "✨ Garnishing…" : "✨ Genie garnish"}
            </button>
          </div>

          {!person ? <div className="text-sm" style={{ color: MUTED }}>{rows === null ? "loading…" : "No salesperson row for you yet — the Sales Head adds you under Settings → Users."}</div> : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
              {/* the nine numbers, as tiles -- the Sales Head types, everyone reads */}
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {COLS.map((c) => (
                  <div key={c.key} className="rounded-lg border p-2.5" style={{ borderColor: BORDER, background: "#fff" }}>
                    <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>{c.label}</div>
                    {manage ? (
                      <input value={edit[person.profile_id]?.[c.key] ?? ""} inputMode="numeric" placeholder="—"
                        onChange={(e) => setEdit((m) => ({ ...m, [person.profile_id]: { ...m[person.profile_id], [c.key]: e.target.value.replace(/[^0-9.]/g, "") } }))}
                        className="tnum w-full rounded border px-1.5 py-0.5 mt-1 font-bold" style={{ borderColor: BORDER, fontSize: 16, color: INK }} />
                    ) : (
                      <div className="tnum font-black mt-1" style={{ fontSize: 20, color: person.targets[c.key] ? INK : "#C9CDD6" }}>
                        {person.targets[c.key] ? (c.money ? `₹${fmtL(person.targets[c.key])}` : person.targets[c.key]) : "—"}
                      </div>
                    )}
                    <div className="text-xs" style={{ color: MUTED }}>{c.unit}</div>
                  </div>
                ))}
                {manage && (
                  <div className="flex items-end">
                    <button onClick={() => save(person.profile_id)} disabled={busy === person.profile_id}
                      className="rounded px-3 py-2 font-bold w-full" style={{ background: GREEN, color: "#fff", fontSize: 13 }}>
                      {busy === person.profile_id ? "…" : "Save the numbers"}
                    </button>
                  </div>
                )}
              </div>

              {/* the plan in words -- theirs */}
              <div className="rounded-lg border p-3" style={{ borderColor: BORDER, background: "#fff" }}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>The plan, in {manage && person.profile_id !== me?.profile_id ? `${possessive(person.name)}` : "my"} own words</div>
                  <div className="text-xs" style={{ color: MUTED }}>which accounts and families carry the number · what you walk away from · the weekly rhythm</div>
                </div>
                {/* RICH TEXT (Dr Raghu, 3 Sep 2026: "this isn to be rich text").
                    It saves when focus leaves the box, so there is no Save
                    to forget -- and Genie garnishes what is saved. */}
                {mayWrite && !needsWords ? (
                  <div className="mt-2">
                    <RichText value={words} rows={9} onSave={(html) => void saveWords(html)}
                      placeholder="Write the plan here. Then press Consult Dr Raghu — he will ask the questions it has to answer." />
                    <div className="text-xs mt-1" style={{ color: MUTED }}>{busy === "words" ? "Saving…" : "Saves by itself when you click away."}</div>
                  </div>
                ) : (
                  <div className="mt-2"><RichTextView html={words} /></div>
                )}

                {/* FILES (Dr Raghu, 3 Sep 2026: "Also have a place to attach
                    file. it can also be a google drive. I have given Oauth") */}
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>Attached to the plan</div>
                  {(person.files || []).length === 0 && <div className="text-xs mt-1" style={{ color: "#C9CDD6" }}>Nothing attached yet — a territory map, a target-account sheet, last year&apos;s review.</div>}
                  <ul className="mt-1">
                    {(person.files || []).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm py-0.5">
                        <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: NAVY, fontWeight: 600 }}>
                          {f.drive ? "🗂 " : "📎 "}{f.name || "file"}
                        </a>
                        <span className="text-xs" style={{ color: MUTED }}>{f.by}{f.at ? ` · ${new Date(f.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}` : ""}</span>
                        {mayWrite && (
                          <button onClick={() => { if (window.confirm(`Remove "${f.name || "this file"}" from the plan?`)) void setFiles((person.files || []).filter((_, k) => k !== i)); }}
                            title="Remove from the plan (the file itself is not deleted)" style={{ color: "#B3261E", fontWeight: 700 }}>×</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {mayWrite && !needsWords && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="rounded px-3 py-1.5 text-xs font-bold border" style={{ borderColor: NAVY, color: NAVY, background: "#fff" }}>
                        {uploading ? "Uploading…" : "📎 Attach a file"}
                      </button>
                      <input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="…or paste a Google Drive link"
                        onKeyDown={(e) => { if (e.key === "Enter") void addDrive(); }}
                        className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: BORDER, minWidth: 280, flex: 1 }} />
                      <button onClick={() => void addDrive()} disabled={!driveLink.trim()}
                        className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: driveLink.trim() ? NAVY : BORDER, color: driveLink.trim() ? "#fff" : MUTED }}>
                        🗂 Add from Drive
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Genie's garnish -- kept apart, taken by choice */}
              {person.garnish && (
                <div className="rounded-lg border p-3" style={{ borderColor: NAVY, background: NAVY_SOFT }}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="text-xs font-bold uppercase" style={{ color: NAVY, letterSpacing: .5 }}>✨ Genie&apos;s garnish</div>
                    <div className="text-xs" style={{ color: MUTED }}>{person.garnished_at ? new Date(person.garnished_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>
                  </div>
                  <div className="text-sm mt-2" style={{ color: INK, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{person.garnish}</div>
                  {mayWrite && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button onClick={() => void saveWords(toHtml(String(person.garnish || "")))}
                        className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: NAVY }}>
                        Take this into my plan
                      </button>
                      <button onClick={() => void saveWords((isEmptyHtml(words) ? "" : words + "<p><b>— Genie's garnish —</b></p>") + toHtml(String(person.garnish || "")))}
                        className="rounded px-3 py-1.5 text-xs font-bold border" style={{ borderColor: NAVY, color: NAVY, background: "#fff" }}>
                        Append below my words
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="text-xs rounded p-2.5" style={{ background: ORANGE_SOFT, color: INK, lineHeight: 1.6, borderLeft: `3px solid ${ORANGE}` }}>
                <b>How this goes:</b> the Sales Head sets the numbers. You write the plan that gets there. <b>Consult Dr Raghu</b> sits with you — your numbers and your words are already on his desk — and asks what the plan must answer. <b>Genie garnish</b> hands it back sharper; take it into your plan only if you agree with it.
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "all" && (
        <>
          <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "78ch", lineHeight: 1.6 }}>
            The numbers the Dashboard measures each week against. Money targets are for the YEAR; call, visit and
            opportunity targets are PER WEEK. {manage ? "Type and Save per row." : "Your own row, as agreed in review — the Sales Head sets it."}
          </p>
          <div className="rounded-lg border" style={{ borderColor: BORDER, background: "#fff", overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F4F6FA" }}>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}`, minWidth: 160 }}>Salesperson</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right" style={{ borderBottom: `1px solid ${BORDER}`, fontSize: 10.5, whiteSpace: "nowrap" }}>{c.label} <span style={{ color: MUTED, fontWeight: 400 }}>{c.money ? "₹/yr" : c.unit === "per week" ? "/wk" : "/yr"}</span></th>
                  ))}
                  <th style={{ borderBottom: `1px solid ${BORDER}` }} />
                </tr>
              </thead>
              <tbody>
                {rows === null && <tr><td colSpan={COLS.length + 2} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>}
                {(rows || []).map((row) => (
                  <tr key={row.profile_id} style={{ borderBottom: "1px solid #F2F4F8" }}>
                    <td className="px-3 py-1.5">
                      <button onClick={() => { setWho(row.profile_id); setWordsDirty(false); setTab("mine"); }} className="text-left hover:underline" title={`Open ${possessive(row.name)} Sales Plan`}>
                        <b style={{ color: INK }}>{row.name}</b>
                      </button>
                      <span style={{ fontSize: 10, color: MUTED }}> · {row.role}</span>
                      {row.plan_text && !isEmptyHtml(row.plan_text) ? <span title="Has a plan in words" style={{ fontSize: 10, color: GREEN }}> ●</span> : null}
                      {(row.files || []).length ? <span title={`${row.files!.length} file(s) attached`} style={{ fontSize: 10, color: MUTED }}> 📎{row.files!.length}</span> : null}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right">
                        {manage ? (
                          <input value={edit[row.profile_id]?.[c.key] ?? ""} inputMode="numeric"
                            onChange={(e) => setEdit((m) => ({ ...m, [row.profile_id]: { ...m[row.profile_id], [c.key]: e.target.value.replace(/[^0-9.]/g, "") } }))}
                            placeholder="—" className="tnum rounded border px-1.5 py-0.5 text-right"
                            style={{ borderColor: BORDER, width: c.money ? 90 : 56, fontSize: 12 }}
                            title={c.money && edit[row.profile_id]?.[c.key] ? `₹${fmtL(Number(edit[row.profile_id][c.key]))}` : undefined} />
                        ) : (
                          <span className="tnum" style={{ color: row.targets[c.key] ? INK : "#C9CDD6", fontWeight: 700 }}>
                            {row.targets[c.key] ? (c.money ? `₹${fmtL(row.targets[c.key])}` : row.targets[c.key]) : "—"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {manage && (
                        <button onClick={() => save(row.profile_id)} disabled={busy === row.profile_id}
                          className="rounded px-2.5 py-1 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 11 }}>
                          {busy === row.profile_id ? "…" : "Save"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
