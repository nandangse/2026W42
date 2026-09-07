"use client";
/**
 * Individual Report Card for Appraisal — the desk the discussion happens at.
 *
 * One person, four tabs, in the order a conversation runs:
 *   SELF IDP        what they said about themselves, one line per question
 *   MANAGER         only the ratings, the salary direction, and the comments
 *   FINALISED IDP   the document the employee will later see — nothing here
 *                   that they will not see
 *   APPRAISAL FINAL the money: previous gross, the new structure, increment
 *
 * HR is the one desk that sees both sides at once — the self-view and the
 * manager's — which is exactly what a discussion moderator needs and exactly
 * why neither side sees this screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { swallow } from "@/lib/swallow";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { IDP_SECTIONS, IDP_RATINGS } from "@/lib/idp";
import { NO_HRA_NO_MEDICAL, salaryTable, type SalaryRow, type ExtraRow } from "@/lib/salary";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import { inr } from "@/lib/fmt";



interface ListRow { idpId: string; employee_id: string | null; name: string; submitted_at: string | null }
interface Rec { url: string | null; seconds: number | null; transcript: string | null }
interface PersonData {
  employee: { id: string; name: string; department: string | null; designation: string | null; type: string | null; age?: number | null; years?: number | null; doj?: string | null; manager?: string | null; personal_mobile?: string | null; personal_email?: string | null };
  role?: { role: string; department: string | null; grade: string | null; reports_to: string | null; job_description: string | null; deliverable: string | null; metric: string | null; summary: string | null } | null;
  salaryYears?: { year: number; gross: number | null; note: string }[];
  salary: { rows: SalaryRow[]; ctcLakhs: string; exempt: boolean; gross: number } | null;
  idp: {
    id: string; submitted_at: string | null; role_at_time: string | null; role_summary: string | null;
    answers: Record<string, string>; ratings: Record<string, number>;
    audioUrls: Record<string, Rec[]>;
  } | null;
  reviews: {
    reviewer_name: string | null; reviewer_email: string; ratings: Record<string, number>;
    gross_current: number | null; gross_proposed: number | null; notes: string | null;
    analysis: string | null; submitted_at: string | null; voice: Rec[];
  }[];
  appraisal: {
    new_gross: number | null; prev_gross: number | null; note: string | null; decided_by: string | null; decided_at: string;
    structure?: { components?: Record<string, number>; extras?: Record<string, number> } | null;
    pending_since?: string | null; pending_by?: string | null;
    approved_at?: string | null; approved_by?: string | null;
  } | null;
}

/**
 * Growth note sits BEFORE Raghu's brief (Dr Raghu, 7 Sep 2026): "Raghu's
 * brief is internal and the Growth note is external." The thing the person
 * is handed comes first; the thing only he reads comes after.
 */
const TABS = ["Self IDP", "Manager IDP comment", "Finalised IDP for Employee", "Growth note", "Raghu's brief", "Finalised discussion", "Appraisal Final"] as const;

export default function AppraisalCard({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [people, setPeople] = useState<ListRow[] | null>(null);
  const [pick, setPick] = useState("");
  const [d, setD] = useState<PersonData | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Self IDP");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/api/hrms/idp").then((j) => setPeople((j.idps || []).filter((r: ListRow) => r.employee_id)))
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    // arriving from the Appraisal Table with a person already chosen
    try {
      const handed = window.sessionStorage.getItem("hrms.appraisal.person");
      if (handed) { window.sessionStorage.removeItem("hrms.appraisal.person"); setPick(handed); }
    } catch (e) { swallow("hrms/AppraisalCard", e); /* fine */ }
  }, []);

  const load = useCallback(async (emp: string) => {
    setD(null); setMsg("");
    try { setD(await api.get(`/api/hrms/idp?person=${encodeURIComponent(emp)}`)); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { if (pick) load(pick); }, [pick, load]);

  return (
    <Pane title="Individual Report Card for Appraisal and Edits" who={who}
      blurb="The desk the appraisal discussion happens at: what they said, what their manager said, what they will be shown, and the money — one person at a time.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex items-center gap-2 flex-wrap mb-3 no-print">
        <select value={pick} onChange={(e) => setPick(e.target.value)}
          className="text-sm rounded px-2 py-2 bg-white" style={{ border: `1px solid ${C.line}`, minWidth: 260 }}>
          <option value="">— choose a person (those with an IDP) —</option>
          {pick && !(people || []).some((p) => p.employee_id === pick) && (
            <option value={pick}>{pick} (no IDP yet)</option>
          )}
          {(people || []).map((p) => (
            <option key={p.idpId} value={p.employee_id!}>
              {p.employee_id} · {p.name}{p.submitted_at ? "" : " (not submitted)"}
            </option>
          ))}
        </select>
        {people !== null && people.length === 0 && <span className="text-xs" style={{ color: C.faint }}>Nobody has an IDP yet.</span>}
        {/* the interview's opening words (Dr Raghu, 29 Aug 2026) — in the
            blank space to the right, where the eye rests before the sit-down */}
        <div className="rounded-lg p-3 ml-auto" style={{ background: "#FFF9EC", border: "1px solid #F0D9A8", maxWidth: 460, fontSize: 13, color: "#6B5518", lineHeight: 1.65 }}>
          <b>We have read your IDP.</b> If you have any presentation to make, please do so in the first 10 minutes.
          <br />Post that, we will discuss your role, your concerns, and your final remuneration.
        </div>
      </div>

      {pick && !d && <div className="text-xs" style={{ color: C.faint }}>loading…</div>}

      {d && (
        <>
          <div className="rounded-lg px-3 py-2 mb-2 flex items-baseline gap-x-4 gap-y-1 flex-wrap" style={{ background: "var(--navy)", color: "#fff" }}>
            <span className="font-bold">{d.employee.name}</span>
            <span style={{ fontSize: 12, color: "#8FA1B3" }}>
              {d.employee.id} · {[d.employee.designation, d.employee.department, d.employee.type].filter(Boolean).join(" · ")}
            </span>
            {d.idp?.submitted_at
              ? <span style={{ fontSize: 11, color: "#9AD3AE" }}>IDP submitted {fmtFull(String(d.idp.submitted_at))}</span>
              : <span style={{ fontSize: 11, color: "var(--amber)" }}>IDP not submitted — read with that in mind</span>}
          </div>
          <div className="flex gap-x-4 gap-y-1 flex-wrap mb-2 px-1" style={{ fontSize: 12, color: C.dim }}>
            {d.employee.age != null && <span>Age <b style={{ color: C.ink }}>{d.employee.age}</b></span>}
            {d.employee.years != null && <span>In company <b style={{ color: C.ink }}>{d.employee.years} yrs</b>{d.employee.doj ? ` (since ${fmtFull(String(d.employee.doj))})` : ""}</span>}
            {d.employee.department && <span>Dept <b style={{ color: C.ink }}>{d.employee.department}</b></span>}
            {d.employee.designation && <span>Designation <b style={{ color: C.ink }}>{d.employee.designation}</b></span>}
            {d.employee.manager && <span>Reports to <b style={{ color: C.ink }}>{d.employee.manager}</b></span>}
            {d.employee.personal_mobile && <span>📱 <b style={{ color: C.ink }}>{d.employee.personal_mobile}</b></span>}
            {d.employee.personal_email && <span title="The finalised IDP letter goes to this address">✉ <b style={{ color: C.ink }}>{d.employee.personal_email}</b></span>}
          </div>

          <div className="flex gap-1 flex-wrap mb-3 no-print">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className="text-xs font-bold rounded px-2.5 py-1.5"
                style={tab === t ? { background: "var(--accent)", color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.dim }}>
                {t}
              </button>
            ))}
          </div>

          {tab === "Self IDP" && <SelfTab d={d} />}
          {tab === "Manager IDP comment" && <ManagerTab d={d} />}
          {tab === "Finalised IDP for Employee" && <FinalisedTab d={d} />}
          {tab === "Growth note" && <GrowthNoteTab d={d} isOwner={isOwner} onSaved={() => load(pick)} />}
          {tab === "Raghu's brief" && <RaghuBriefTab d={d} isOwner={isOwner} onSaved={() => load(pick)} />}
          {tab === "Finalised discussion" && <DiscussionTab d={d} isOwner={isOwner} onSaved={() => load(pick)} />}
          {tab === "Appraisal Final" && <AppraisalTab d={d} isOwner={isOwner} onSaved={() => load(pick)} />}
        </>
      )}
    </Pane>
  );
}

/* ── 1 · what they said, one line per question ── */
function SelfTab({ d }: { d: PersonData }) {
  if (!d.idp) return <None what="No IDP" />;
  const a = d.idp.answers || {};
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
      {IDP_SECTIONS.flatMap((s) => s.questions).map((q) => {
        const v = String(a[q.id] || "").trim();
        if (!v) return null;
        return (
          <div key={q.id} className="py-1.5 flex gap-3" style={{ borderTop: "1px solid #EEECE6", fontSize: 13 }}>
            <div className="font-semibold" style={{ minWidth: 200, maxWidth: 200, color: C.dim }}>{q.label}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, flex: 1 }}>{v}</div>
          </div>
        );
      })}
      <div className="py-2 flex gap-3 items-start" style={{ borderTop: "1px solid #EEECE6" }}>
        <div className="font-semibold" style={{ minWidth: 200, fontSize: 13, color: C.dim }}>Self-ratings</div>
        <div className="flex gap-1 flex-wrap">
          {IDP_RATINGS.map((x) => (
            <span key={x.key} className="rounded px-1.5 py-0.5" style={{ background: "#F4F2EC", fontSize: 11.5 }} title={x.key}>
              {x.key.split(" ")[0]} <b style={{ color: C.orange }}>{d.idp!.ratings?.[x.key] || "—"}</b>
            </span>
          ))}
        </div>
      </div>
      {a["ask_gross"] && (
        <div className="py-2 flex gap-3" style={{ borderTop: "1px solid #EEECE6", fontSize: 13 }}>
          <div className="font-semibold" style={{ minWidth: 200, color: C.dim }}>Asked for (gross/mo)</div>
          <b className="tnum" style={{ color: C.orange }}>₹{inr(Number(a["ask_gross"]))}</b>
        </div>
      )}
    </div>
  );
}

/* ── 2 · the manager: ratings, salary direction, comments — nothing else ── */
function ManagerTab({ d }: { d: PersonData }) {
  if (!d.reviews.length) return <None what="No manager review yet" />;
  return (
    <>
      {d.reviews.map((r) => (
        <div key={r.reviewer_email} className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
          <div className="font-bold text-sm">
            {r.reviewer_name || r.reviewer_email}
            {r.submitted_at
              ? <span className="font-normal" style={{ fontSize: 11, color: C.green }}> · submitted {fmtFull(String(r.submitted_at))}</span>
              : <span className="font-normal" style={{ fontSize: 11, color: "#8A5B00" }}> · in progress</span>}
          </div>
          <div className="flex gap-1 flex-wrap mt-2">
            {IDP_RATINGS.map((x) => (
              <span key={x.key} className="rounded px-1.5 py-0.5" style={{ background: "#FFF3E8", fontSize: 11.5 }} title={x.key}>
                {x.key.split(" ")[0]} <b style={{ color: C.orange }}>{r.ratings?.[x.key] || "—"}</b>
              </span>
            ))}
          </div>
          <div className="mt-2" style={{ fontSize: 13.5 }}>
            Salary direction:{" "}
            <b className="tnum">₹{inr(r.gross_current)}</b> → <b className="tnum" style={{ color: C.green }}>₹{inr(r.gross_proposed)}</b>
            {r.gross_current != null && r.gross_proposed != null && (
              <span style={{ color: C.faint }}> ({r.gross_proposed >= r.gross_current ? "+" : ""}{(((r.gross_proposed - r.gross_current) / r.gross_current) * 100).toFixed(1)}%)</span>
            )}
          </div>
          {r.voice.map((v, i) => (
            <div key={i} className="mt-2">
              {v.url && <audio controls controlsList="nodownload" src={v.url} style={{ height: 28, maxWidth: 360 }} />}
              {v.transcript && <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginTop: 3 }}>{v.transcript}</div>}
            </div>
          ))}
          {r.notes && <div className="mt-2" style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.notes}</div>}
        </div>
      ))}
    </>
  );
}

/* ── 3 · exactly what the employee will later see, and nothing more ── */
/** Gross salary, 2020 → 2027 (Dr Raghu, 29 Aug 2026) — a small honest line:
 *  points only where a year's gross is actually known (today's sheet, each
 *  appraisal cycle as it lands); the empty years say so with their absence. */
function GrossGraph({ years }: { years: { year: number; gross: number | null; note: string }[] }) {
  const W = 460, Hh = 130, PAD = 34;
  const known = years.filter((y) => y.gross != null);
  const max = Math.max(...known.map((y) => y.gross || 0), 1);
  const x = (yr: number) => PAD + ((yr - 2019) * (W - PAD * 2)) / 8;
  const yy = (v: number) => Hh - 26 - (v / max) * (Hh - 52);
  return (
    <div className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: C.line }}>
      <div className="font-bold mb-1" style={{ fontSize: 13 }}>Gross Salary — the climb</div>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: "100%", maxWidth: 520 }}>
        <line x1={PAD} y1={Hh - 26} x2={W - PAD} y2={Hh - 26} stroke={C.line} />
        {years.map((y) => (
          <text key={y.year} x={x(y.year)} y={Hh - 10} textAnchor="middle" fontSize={9.5} fill={y.gross != null ? C.ink : C.faint}>{String(y.year).slice(2)}</text>
        ))}
        {known.length > 1 && (
          <path d={known.map((y, i) => `${i ? "L" : "M"}${x(y.year)},${yy(y.gross!)}`).join(" ")} fill="none" stroke="var(--green)" strokeWidth={2.2} />
        )}
        {known.map((y) => (
          <g key={y.year}>
            <circle cx={x(y.year)} cy={yy(y.gross!)} r={3.2} fill="var(--green)" />
            <text x={x(y.year)} y={yy(y.gross!) - 7} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--green)">₹{Math.round((y.gross || 0) / 1000)}k</text>
          </g>
        ))}
        {known.length <= 1 && <text x={W / 2} y={40} textAnchor="middle" fontSize={10} fill={C.faint}>history fills as each appraisal cycle lands — earlier years join when the old sheets are given</text>}
      </svg>
      {known.length > 0 && (
        <div className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          <div className="text-xs font-bold" style={{ color: C.dim, letterSpacing: 0.6 }}>SALARY GROWTH</div>
          {[...known].sort((a, b) => b.year - a.year).map((y) => (
            <div key={y.year}><b className="tnum">{y.year}-{String(y.year + 1).slice(2)}</b>: Rs {Math.round(y.gross || 0).toLocaleString("en-IN")}/month <span style={{ color: C.faint }}>({y.note})</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

/** RAGHU'S BRIEF (Dr Raghu, 29 Aug 2026): click-only AI pointers before
 *  the sit-down — the role, the work in their own words, what to affirm,
 *  what to raise, three questions, and a feedback seed he can reuse. */
function RaghuBriefTab({ d, isOwner, onSaved }: { d: PersonData; isOwner: boolean; onSaved: () => void }) {
  const ap = d.appraisal as Record<string, unknown> | null;
  const brief = ap?.brief ? String(ap.brief) : "";
  const at = ap?.brief_at ? String(ap.brief_at) : null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [live, setLive] = useState("");
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/hrms/idp", { action: "raghu-brief", employee_id: d.employee.id });
      setLive(String(r.brief || "")); setMsg("Written ✓ — kept on the cycle"); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const text = live || brief;
  return (
    <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line, maxWidth: 760 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-bold" style={{ fontSize: 15 }}>Raghu&apos;s brief</div>
        {isOwner && (
          <button onClick={run} disabled={busy} className="rounded px-3 py-1.5 text-xs font-bold text-white ml-auto" style={{ background: busy ? "#B9BEC4" : "#7C3AED" }}>
            {busy ? "Reading the record…" : text ? "✨ Write it afresh" : "✨ Write the brief"}
          </button>
        )}
      </div>
      <p className="text-xs mb-2" style={{ color: C.dim, lineHeight: 1.5 }}>
        <b>Internal — for me alone, never shown to them.</b> Five minutes before the sit-down: the role, the work in
        their own words, what to affirm, what to raise, three questions, and a feedback seed to adapt.
        {at && <> · last written {new Date(String(at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} IST</>}
      </p>
      {text
        ? <div className="text-sm rounded border p-3" style={{ borderColor: "#D9CBF5", whiteSpace: "pre-wrap", lineHeight: 1.65, background: "#FBFAFE" }}>{text}</div>
        : <div className="text-sm" style={{ color: C.faint }}>{isOwner ? "Not written yet — ✨ writes it from the role, the IDP and the reviews." : "Not written yet — RJ writes this one."}</div>}
    </div>
  );
}

/**
 * THE GROWTH NOTE (Dr Raghu, 7 Sep 2026): "also show the growth note of
 * CHRO. Write this in Raghu's voice to the person directly. Use first
 * person and also use his name at least 2 to 3 times. For the workers
 * mention this in Hindi also."
 *
 * Not the brief — the brief is for him before the sit-down. This is the
 * note the person is handed, written as he would speak to them, and in
 * Hindi as well for anybody on the floor.
 */
function GrowthNoteTab({ d, isOwner, onSaved }: { d: PersonData; isOwner: boolean; onSaved: () => void }) {
  const ap = d.appraisal as Record<string, unknown> | null;
  const [live, setLive] = useState<{ en: string; hi: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const en = live ? live.en : ap?.growth_note ? String(ap.growth_note) : "";
  const hi = live ? live.hi : ap?.growth_note_hi ? String(ap.growth_note_hi) : "";
  const at = ap?.growth_note_at ? String(ap.growth_note_at) : null;
  const floor = /labour|worker/i.test(String(d.employee.type || ""));
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/hrms/idp", { action: "growth-note", employee_id: d.employee.id });
      setLive({ en: String(r.en || ""), hi: String(r.hi || "") });
      setMsg("Written ✓ — kept on the cycle"); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); setMsg("copied ✓"); } catch { setMsg("could not copy"); } };
  const box = (text: string, label: string, hindi?: boolean) => (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs font-bold" style={{ color: C.faint, letterSpacing: 0.6 }}>{label}</div>
        <button onClick={() => copy(text)} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>copy</button>
      </div>
      <div className="text-sm rounded border p-4" style={{ borderColor: hindi ? "#F5D9B8" : "#CFE3D4", background: hindi ? "#FFFBF5" : "#F8FBF9", whiteSpace: "pre-wrap", lineHeight: hindi ? 1.9 : 1.75 }}>
        {text}
      </div>
    </div>
  );
  return (
    <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line, maxWidth: 800 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-bold" style={{ fontSize: 15 }}>Growth note — from me to {d.employee.name.split(" ")[0]}</div>
        {isOwner && (
          <button onClick={run} disabled={busy} className="rounded px-3 py-1.5 text-xs font-bold text-white ml-auto" style={{ background: busy ? "#B9BEC4" : "#0D7A3F" }}>
            {busy ? "Writing…" : en ? "✨ Write it afresh" : "✨ Write the note"}
          </button>
        )}
      </div>
      <p className="text-xs mb-1" style={{ color: C.dim, lineHeight: 1.55 }}>
        <b>External — this is what they are given.</b> In my own voice and addressed to them: what I have seen, what they do well, where
        I want them to grow, what we will do to help, and what I expect. Written from the role, their IDP and their
        manager&apos;s words — never from money.{floor ? " In Hindi as well, because they work on the floor." : ""}
        {at && <> · last written {new Date(String(at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
      </p>
      {msg && <div className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
      {en
        ? <>{box(en, "IN ENGLISH")}{hi ? box(hi, "हिंदी में", true) : null}</>
        : <div className="text-sm mt-2" style={{ color: C.faint }}>{isOwner ? "Not written yet — ✨ writes it from the role, their IDP and the manager's words." : "Not written yet."}</div>}
    </div>
  );
}

/** The FINALISED DISCUSSION (Dr Raghu, 29 Aug 2026): date · attendees ·
 *  link · MoM · Note from Raghu. Kept on record with the cycle; the Note
 *  rides into the IDP letter when that is built. Raghu's pen; others read. */
function DiscussionTab({ d, isOwner, onSaved }: { d: PersonData; isOwner: boolean; onSaved: () => void }) {
  const saved = ((d.appraisal as Record<string, unknown> | null)?.discussion || {}) as Record<string, string>;
  const [f, setF] = useState({
    date: String(saved.date || "").slice(0, 10), attendees: String(saved.attendees || ""),
    link: String(saved.link || ""), mom: String(saved.mom || ""), note_raghu: String(saved.note_raghu || ""),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/hrms/idp", { action: "appraisal-discussion", employee_id: d.employee.id, discussion: f });
      setMsg("Saved — on the record ✓"); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const ro = !isOwner;
  return (
    <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line, maxWidth: 720 }}>
      <div className="font-bold mb-1" style={{ fontSize: 15 }}>Finalised discussion</div>
      <p className="text-xs mb-3" style={{ color: C.dim, lineHeight: 1.5 }}>
        The record of the sit-down. Once this is filled, RJ finalises and sends — the Note from Raghu also travels
        into the IDP letter{ro ? ". RJ's pen; you are reading the record." : "."}
      </p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label className="text-xs font-bold" style={{ color: C.dim }}>DATE
          <input type="date" disabled={ro} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}
            className="w-full mt-1 px-2 py-1.5 rounded border font-normal tnum" style={{ borderColor: C.line }} /></label>
        <label className="text-xs font-bold" style={{ color: C.dim }}>ATTENDEES
          <input disabled={ro} value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} placeholder="RJ, HR, the manager…"
            className="w-full mt-1 px-2 py-1.5 rounded border font-normal" style={{ borderColor: C.line }} /></label>
        <label className="text-xs font-bold" style={{ color: C.dim, gridColumn: "1 / -1" }}>LINK — recording / document
          <input disabled={ro} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…"
            className="w-full mt-1 px-2 py-1.5 rounded border font-normal" style={{ borderColor: C.line }} /></label>
        <label className="text-xs font-bold" style={{ color: C.dim, gridColumn: "1 / -1" }}>MINUTES OF THE MEETING
          <textarea disabled={ro} value={f.mom} onChange={(e) => setF({ ...f, mom: e.target.value })} rows={5}
            className="w-full mt-1 px-2 py-1.5 rounded border font-normal" style={{ borderColor: C.line, lineHeight: 1.5 }} /></label>
        <label className="text-xs font-bold" style={{ color: "#7C3AED", gridColumn: "1 / -1" }}>NOTE FROM RAGHU — goes into the IDP letter
          <textarea disabled={ro} value={f.note_raghu} onChange={(e) => setF({ ...f, note_raghu: e.target.value })} rows={4}
            className="w-full mt-1 px-2 py-1.5 rounded border font-normal" style={{ borderColor: "#D9CBF5", lineHeight: 1.5 }} /></label>
      </div>
      {saved.at && <div className="text-xs mt-2" style={{ color: C.faint }}>last saved by {saved.by} · {new Date(String(saved.at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} IST</div>}
      {msg && <div className="text-xs font-bold mt-2" style={{ color: /✓/.test(msg) ? C.green : "var(--red)" }}>{msg}</div>}
      {!ro && (
        <button onClick={save} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white mt-3" style={{ background: busy ? "#B9BEC4" : C.orange }}>
          💾 Save the record
        </button>
      )}
    </div>
  );
}

function FinalisedTab({ d }: { d: PersonData }) {
  if (!d.idp) return <None what="No IDP" />;
  const analysis = d.reviews.find((r) => r.analysis)?.analysis;
  return (
    <>
      <div className="rounded p-2 mb-2" style={{ background: "#EDEAF6", fontSize: 11.5, color: "#4A3B7A", lineHeight: 1.5 }}>
        This is the document {d.employee.name.split(" ")[0]} will see — their own words, their role, and the growth
        note. No ratings of either side, no salaries. What is on this tab is safe to put in front of them.
      </div>
      {d.role && (d.role.job_description || d.role.deliverable || d.role.metric) && (
        <div className="bg-white rounded-lg border p-4 mb-2" style={{ borderColor: C.line, borderLeft: "4px solid #7C3AED" }}>
          <div className="font-bold mb-1" style={{ fontSize: 14 }}>The Role — from the roles register</div>
          <div className="text-sm font-semibold" style={{ color: "#4A3B7A" }}>{d.role.role}{d.role.grade ? ` · ${d.role.grade}` : ""}{d.role.reports_to ? ` · reports to ${d.role.reports_to}` : ""}</div>
          {d.role.job_description && (<div className="mt-2"><div className="text-xs font-bold" style={{ color: C.dim }}>ROLE</div><div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{d.role.job_description}</div></div>)}
          {d.role.deliverable && (<div className="mt-2"><div className="text-xs font-bold" style={{ color: C.dim }}>KRA — WHAT THE ROLE DELIVERS</div><div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{d.role.deliverable}</div></div>)}
          {d.role.metric && (<div className="mt-2"><div className="text-xs font-bold" style={{ color: C.dim }}>KPIs — HOW IT IS MEASURED</div><div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{d.role.metric}</div></div>)}
        </div>
      )}
      {(d.salaryYears || []).some((y) => y.gross != null) && <GrossGraph years={d.salaryYears!} />}
      <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line }}>
        <div className="font-bold" style={{ fontSize: 17 }}>Individual Development Plan — {d.employee.name}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{d.idp.role_at_time || "—"} · cycle 2026-27</div>
        {d.idp.role_summary && (
          <div className="rounded p-2 mt-3" style={{ background: "#FFF7E6", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            <b>What the role expects:</b><br />{d.idp.role_summary}
          </div>
        )}
        {analysis && (
          <div className="rounded p-3 mt-3" style={{ background: "#F0FAF3", border: "1px solid #9AD3AE" }}>
            <div className="font-bold" style={{ fontSize: 14 }}>The growth note</div>
            <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 4 }}>{analysis}</div>
          </div>
        )}
        {IDP_SECTIONS.map((s) => {
          const qs = s.questions.filter((q) => String(d.idp!.answers?.[q.id] || "").trim());
          if (!qs.length) return null;
          return (
            <div key={s.key} className="mt-4">
              <div className="font-bold" style={{ fontSize: 14 }}>{s.title}</div>
              {qs.map((q) => (
                <div key={q.id} className="mt-2">
                  <div className="font-semibold" style={{ fontSize: 12.5, color: C.dim }}>{q.label}</div>
                  <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{d.idp!.answers[q.id]}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── 4 · the money ── */

/** The five earning components, in table order. */
const COMPS = [
  ["basic_da", "Basic and DA", "Basic & DA"],
  ["hra", "HRA", "HRA"],
  ["fixed", "Fixed Allowance", "Fixed Allowance"],
  ["conveyance", "Conveyance", "Conveyance"],
  ["medical", "Medical Allowance", "Medical Allowance"],
] as const;

/** The company's investment lines beyond pay. All editable; the rules are the hints. */
const EXTRAS = [
  ["lic_yr", "LIC Policy", "yr", ""],
  ["training_yr", "Training", "yr", ""],
  ["leader_dev_yr", "Leader Development Investment", "yr", "Rs 50,000/yr for leaders · Rs 75,000/yr for StratCom"],
  ["leader_tools_mo", "Leader Tools", "mo", "Rs 10,000 per month"],
] as const;

function AppraisalTab({ d, isOwner, onSaved }: { d: PersonData; isOwner: boolean; onSaved: () => void }) {
  // THE STAFF LAW (Dr Raghu, 29 Aug 2026): for Staff, HRA = 20% OF BASIC &
  // DA — derived, never typed. Caught on Santosh Patra's card, where a
  // proportional scale left HRA at 19.9%.
  const isStaff = String(d.employee.type || "") === "Staff";
  // more of the same day's laws: MEDICAL IS ALWAYS ₹1,250 (never typed),
  // and a CONTRACT engagement is Basic & DA alone — every other box closes.
  const isContract = ["Contractor", "Labour - Contract", "Staff - Contract"].includes(String(d.employee.type || ""));
  /**
   * A WORKER HAS NEITHER HRA NOR MEDICAL ALLOWANCE (Dr Raghu, 2 Sep 2026:
   * "HR medical allowance is not there for workers. Please note. No HRA
   * either") — caught on a Prod - Fitter's card offering Rs 1,250 marked
   * "always". Labour is 116 of the 200 on the roll, so this was the MAJORITY
   * of the company being shown a structure they are not on, and every
   * increment split against it put money into two heads that do not exist.
   */
  const isWorker = NO_HRA_NO_MEDICAL.has(String(d.employee.type || ""));
  const prev = d.salary?.gross ?? null;
  const proposed = d.reviews.find((r) => r.gross_proposed != null)?.gross_proposed ?? null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // NEW DESIGNATION (29 Aug 2026): same as before until changed at the desk
  const [newDesig, setNewDesig] = useState<string>(() =>
    String((d.appraisal as Record<string, unknown> | null)?.new_designation || d.employee.designation || ""));

  // today's split, off the current table, for proportional scaling
  const baseComps = useMemo(() => {
    const base = new Map((d.salary?.rows || []).filter((r) => r.kind === "row").map((r) => [r.label, r.monthly ?? 0]));
    const out: Record<string, number> = {};
    for (const [key, , rowLabel] of COMPS) out[key] = base.get(rowLabel) ?? 0;
    return out;
  }, [d]);

  // % OF BASIC drives the split (Dr Raghu, 29 Aug 2026: "changing the gross
  // AND the % of basic should also be an update") — and NOTHING scales
  // proportionally any more: conveyance HOLDS, medical is 1250, HRA follows
  // its law, and THE FIXED ALLOWANCE ALONE absorbs the difference.
  const [basicPct, setBasicPct] = useState<string>(() => {
    const cur = Object.values(baseComps).reduce((a, b) => a + b, 0);
    const b = baseComps.basic_da || 0;
    return String(cur && b ? Math.round((b / cur) * 100) : 58);
  });
  const scaleTo = useCallback((target: number, pctRaw?: string) => {
    if (isContract && target) {
      // a contract target IS the basic
      return { basic_da: String(target), hra: "0", fixed: "0", conveyance: "0", medical: "0" };
    }
    if (!target) return { basic_da: "0", hra: "0", fixed: "0", conveyance: "0", medical: "0" };
    const pct = Math.min(100, Math.max(1, Number(pctRaw ?? basicPct) || 58));
    const basic = Math.round((target * pct) / 100);
    const hra = isWorker ? 0 : isStaff ? Math.round(basic * 0.2) : (baseComps.hra || 0);
    const conveyance = baseComps.conveyance || 0;   // fixed — never scaled
    const medical = isWorker ? 0 : 1250;            // always, EXCEPT for workers
    const fixed = Math.max(0, target - basic - hra - conveyance - medical);
    return { basic_da: String(basic), hra: String(hra), fixed: String(fixed), conveyance: String(conveyance), medical: String(medical) };
  }, [baseComps, isStaff, isContract, isWorker, basicPct]);

  // the split being decided: saved tuning first, else today's shares at the decided/proposed gross
  const [comps, setComps] = useState<Record<string, string>>(() => {
    const saved = d.appraisal?.structure?.components;
    if (saved && Object.values(saved).some((v) => Number(v) > 0)) {
      const out: Record<string, string> = {};
      for (const [key] of COMPS) out[key] = String(Math.round(Number(saved[key]) || 0));
      return out;
    }
    return scaleTo(Number(d.appraisal?.new_gross ?? proposed ?? prev ?? 0) || 0);
  });
  const [extras, setExtras] = useState<Record<string, string>>(() => {
    const saved = d.appraisal?.structure?.extras || {};
    const out: Record<string, string> = {};
    for (const [key] of EXTRAS) out[key] = String(Math.round(Number(saved[key]) || 0) || "");
    return out;
  });

  // the gross IS the sum of the components — one source, no drift
  const n = COMPS.reduce((a, [key]) => a + (Number(comps[key]) || 0), 0);
  const [grossBox, setGrossBox] = useState(String(n || ""));

  const setGrossAndScale = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, "");
    setGrossBox(clean);
    setComps(scaleTo(Number(clean) || 0));
  };
  const setPctAndScale = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, "");
    setBasicPct(clean);
    if (Number(grossBox)) setComps(scaleTo(Number(grossBox) || 0, clean));
  };
  // THE GROSS IS FIXED (Dr Raghu, 29 Aug 2026: "gross total is fixed —
  // adjustment below will change the % of basic"): typing in the table never
  // moves the gross. Fixed Allowance absorbs the difference, the Staff HRA
  // law rides every Basic edit, and the % lever FOLLOWS the split. Editing
  // Fixed Allowance itself re-balances through Basic — the gross still holds.
  const setComp = (key: string, raw: string) => {
    const clean = raw.replace(/[^0-9]/g, "");
    const next = { ...comps, [key]: clean };
    const gross = Number(grossBox) || 0;
    if (isContract || !gross) {
      // contract: the basic IS the gross · no anchor yet: the sum becomes it
      if (isStaff && key === "basic_da") next.hra = String(Math.round((Number(next.basic_da) || 0) * 0.2));
      setComps(next);
      setGrossBox(String(COMPS.reduce((a, [k]) => a + (Number(next[k]) || 0), 0) || ""));
      return;
    }
    if (key === "fixed") {
      const rest = (Number(next.conveyance) || 0) + (Number(next.medical) || 0) + (Number(next.fixed) || 0);
      const basic = isStaff
        ? Math.max(0, Math.round((gross - rest) / 1.2))          // basic + 20% hra fill the room
        : Math.max(0, gross - rest - (Number(next.hra) || 0));
      next.basic_da = String(basic);
      if (isStaff) next.hra = String(Math.round(basic * 0.2));
    } else {
      if (isStaff && key === "basic_da") next.hra = String(Math.round((Number(next.basic_da) || 0) * 0.2));
      next.fixed = String(Math.max(0, gross - (Number(next.basic_da) || 0) - (Number(next.hra) || 0) - (Number(next.conveyance) || 0) - (Number(next.medical) || 0)));
    }
    setComps(next);
    setBasicPct(String(Math.round(((Number(next.basic_da) || 0) / gross) * 100)));
  };
  // a saved structure from before the law wears the correction the moment
  // the card opens — visibly, so what is saved next is right
  useEffect(() => {
    const basic = Number(comps.basic_da) || 0;
    if (!basic) return;
    const next: Record<string, string> = { ...comps };
    let touched = false;
    if (isContract) {
      for (const k of ["hra", "fixed", "conveyance", "medical"]) if (next[k] !== "0") { next[k] = "0"; touched = true; }
    } else {
      if (next.medical !== "1250") { next.medical = "1250"; touched = true; }
      if (isStaff) {
        const want = String(Math.round(basic * 0.2));
        if (next.hra !== want) { next.hra = want; touched = true; }
      }
    }
    if (touched) {
      setComps(next);
      setGrossBox(String(COMPS.reduce((a, [k]) => a + (Number(next[k]) || 0), 0) || ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, isContract]);

  const extraRows: ExtraRow[] = EXTRAS.map(([key, label, unit]) => ({
    label: unit === "yr" ? `${label} (annual)` : label,
    monthly: unit === "yr" ? (Number(extras[key]) || 0) / 12 : Number(extras[key]) || 0,
  })).filter((e) => e.monthly > 0);

  const newTable = useMemo(() => {
    if (!n) return null;
    const get = (k: string) => {
      const hit = COMPS.find(([, sheetKey]) => sheetKey === k);
      return hit ? Number(comps[hit[0]]) || 0 : 0;
    };
    return salaryTable(get, d.employee.type, extraRows);
  }, [n, comps, d, extraRows]);

  const inc = prev != null && n ? n - prev : null;

  const save = async (draft = false) => {
    setBusy(true); setMsg("");
    try {
      const structure = {
        components: Object.fromEntries(COMPS.map(([key]) => [key, Number(comps[key]) || 0])),
        extras: Object.fromEntries(EXTRAS.map(([key]) => [key, Number(extras[key]) || 0])),
      };
      const r = await api.post("/api/hrms/idp", { action: "appraisal", employee_id: d.employee.id, new_gross: String(n), prev_gross: prev, structure, new_designation: newDesig.trim(), draft });
      setMsg(r?.warning ? String(r.warning) : draft ? "Draft saved — not submitted ✓" : r?.approved ? "Saved and finalised ✓" : "Saved — it now waits for RJ to finalise ✓");
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const editable = (label: string) => COMPS.find(([, , rowLabel]) => rowLabel === label)?.[0];

  const approveThis = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/hrms/idp", { action: "approve-appraisal", ids: [d.employee.id] });
      setMsg("Finalised ✓"); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
      <div className="flex gap-x-6 gap-y-1 flex-wrap" style={{ fontSize: 14 }}>
        <span>Previous Gross: <b className="tnum">₹{inr(prev)}</b>/mo</span>
        {proposed != null && <span style={{ color: C.faint }}>manager proposed <b className="tnum">₹{inr(proposed)}</b></span>}
        {d.idp?.answers?.["ask_gross"] && <span style={{ color: C.faint }}>they asked <b className="tnum">₹{inr(Number(d.idp.answers["ask_gross"]))}</b></span>}
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="font-bold" style={{ fontSize: 15 }}>New Gross:</span>
        <span style={{ fontWeight: 700, color: C.green }}>Rs</span>
        <input value={grossBox} inputMode="numeric" onChange={(e) => setGrossAndScale(e.target.value)}
          className="rounded px-2 py-2 tnum" style={{ border: `2px solid ${C.green}`, color: C.green, fontWeight: 700, fontSize: 17, width: 160 }} />
        <span className="font-bold" style={{ fontSize: 15, color: C.dim }}>/month</span>
        {!isContract && (
          <>
            <span className="font-bold ml-2" style={{ fontSize: 14, color: C.dim }}>Basic:</span>
            <input value={basicPct} inputMode="numeric" onChange={(e) => setPctAndScale(e.target.value)}
              title="Basic & DA as % of gross — change it and the split recomputes: conveyance holds, medical stays 1,250, HRA follows its law, Fixed Allowance absorbs"
              className="rounded px-2 py-2 tnum text-right" style={{ border: `2px solid #7C3AED`, color: "#7C3AED", fontWeight: 700, fontSize: 15, width: 64 }} />
            <span className="font-bold" style={{ fontSize: 14, color: "#7C3AED" }}>% of gross</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="font-bold" style={{ fontSize: 14 }}>New Designation:</span>
        <input value={newDesig} onChange={(e) => setNewDesig(e.target.value)}
          title="Defaults to the current designation — change it when the promotion is part of the decision"
          className="rounded px-2 py-1.5" style={{ border: `1px solid ${newDesig !== String(d.employee.designation || "") ? "#7C3AED" : C.line}`, fontSize: 14, minWidth: 280 }} />
        {newDesig !== String(d.employee.designation || "") && (
          <span className="text-xs font-bold" style={{ color: "#7C3AED" }}>changed — was {d.employee.designation || "—"}</span>
        )}
      </div>

      {d.appraisal && (
        d.appraisal.approved_at
          ? <div className="rounded px-2.5 py-1.5 mt-2 inline-block" style={{ background: "#E6F4EA", color: "var(--green)", fontSize: 12, fontWeight: 700 }}>
              ✓ Finalised by {String(d.appraisal.approved_by || "").split("·")[0].trim() || "RJ"} on {fmtFull(String(d.appraisal.approved_at))}
            </div>
          : d.appraisal.pending_since
            ? <div className="rounded px-2.5 py-1.5 mt-2 inline-block" style={{ background: "#FFF3E8", color: "#8A5B00", fontSize: 12, fontWeight: 700 }}>
                Proposed by {String(d.appraisal.pending_by || "").split("·")[0].trim() || "HR"} — waiting for RJ to finalise. It is in Approvals → RJ Approval - Commercial.
              </div>
            : <div className="rounded px-2.5 py-1.5 mt-2 inline-block" style={{ background: "#F1F0FB", color: "#5B54B8", fontSize: 12, fontWeight: 700 }}>
                💾 draft — not submitted
              </div>
      )}

      {/* the headline, on top — the increment both ways, and the new CTC */}
      {inc !== null && (
        <div className="flex gap-2 flex-wrap mt-3">
          <Head n={`${inc >= 0 ? "+" : "−"}₹${inr(Math.abs(inc))}`} l="Increment / month" sub={prev ? `${inc >= 0 ? "+" : "−"}${Math.abs((inc / prev) * 100).toFixed(1)}% increment` : ""} good={inc >= 0} />
          <Head n={`${inc >= 0 ? "+" : "−"}₹${inr(Math.abs(inc) * 12)}`} l="Increment / year" good={inc >= 0} />
          {newTable && <Head n={`Rs ${newTable.ctcLakhs} L`} l="New annual CTC (approx)" good />}
        </div>
      )}

      {newTable && (
        <div className="mt-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-bold" style={{ fontSize: 14 }}>The New Salary Structure</div>
            <span style={{ fontSize: 11, color: C.faint }}>the gross HOLDS — type in the Monthly column and Fixed Allowance absorbs, the Basic % follows{isStaff ? " · Staff rule: HRA stays 20% of Basic & DA by itself" : ""}</span>
          </div>
          <table className="genie-table" style={{ fontSize: 12.5, width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginTop: 6 }}>
            <thead>
              <tr>
                <th className="text-left px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "48%" }}>Components of Compensation</th>
                <th className="text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "24%" }}>Monthly (Rs.)</th>
                <th className="text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "28%" }}>Yearly (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {newTable.rows.map((r, i) => {
                const key = r.kind === "row" ? editable(r.label) : undefined;
                return (
                  <tr key={i} style={{ background: r.kind === "head" || r.kind === "total" ? "#FFF9C4" : "#fff", fontWeight: r.kind !== "row" && r.kind !== "note" ? 700 : 400 }}>
                    {r.kind === "note"
                      ? <td colSpan={3} className="px-1.5 py-1" style={{ border: `1px solid ${C.line}`, fontSize: 11.5, color: C.dim }}>{r.label}</td>
                      : <>
                          <td className="px-1.5 py-1" style={{ border: `1px solid ${C.line}` }}>{r.label}</td>
                          <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}`, padding: key ? "2px 4px" : undefined }}>
                            {key
                              ? (isContract && key !== "basic_da"
                                ? <span className="tnum" title="A contract engagement is Basic & DA alone" style={{ color: C.dim }}>—</span>
                                /* A worker has neither head — shown as not
                                   applicable rather than as a typeable zero,
                                   because a box you can type into is a box
                                   somebody eventually types into. */
                                : isWorker && (key === "medical" || key === "hra")
                                ? <span className="tnum" title="Workers are not paid HRA or Medical Allowance" style={{ color: C.dim }}>— <span style={{ fontSize: 10 }}>not for workers</span></span>
                                : key === "medical"
                                ? <span className="tnum" title="Medical Allowance is always ₹1,250 — the rule" style={{ fontWeight: 600 }}>
                                    {inr(Number(comps[key]) || 0)} <span style={{ fontSize: 10, color: C.dim }}>always</span>
                                  </span>
                                : isStaff && key === "hra"
                                ? <span className="tnum" title="Staff rule: HRA is always 20% of Basic & DA — it follows the Basic, it is not typed" style={{ fontWeight: 600 }}>
                                    {inr(Number(comps[key]) || 0)} <span style={{ fontSize: 10, color: C.dim }}>= 20% of Basic</span>
                                  </span>
                                : <input value={comps[key]} inputMode="numeric" onChange={(e) => setComp(key, e.target.value)}
                                    className="tnum rounded text-right px-1.5 py-1 w-full"
                                    style={{ border: `1.5px solid ${C.green}`, fontWeight: 600, fontSize: 12.5, maxWidth: 130, marginLeft: "auto", display: "block" }} />)
                              : inr(r.monthly)}
                          </td>
                          <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}` }}>{inr(r.yearly)}</td>
                        </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-1 font-bold" style={{ fontSize: 14 }}>
            New CTC ≈ <span style={{ color: C.orange }}>Rs {newTable.ctcLakhs} Lakhs</span> per year
          </div>
        </div>
      )}

      {/* the company's investment beyond pay — showcased, and part of the CTC when filled */}
      <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: C.line, background: "#FBFAF7" }}>
        <div className="font-bold" style={{ fontSize: 13 }}>Company Investment in You</div>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>Fill what applies — filled lines appear in the structure above and count into the CTC.</div>
        <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {EXTRAS.map(([key, label, unit, hint]) => (
            <label key={key} className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>
                {label} <span style={{ color: C.faint }}>({unit === "yr" ? "Rs/year" : "Rs/month"})</span>
                {hint && <div style={{ fontSize: 10.5, color: C.faint }}>{hint}</div>}
              </span>
              <input value={extras[key]} inputMode="numeric"
                onChange={(e) => setExtras((x) => ({ ...x, [key]: e.target.value.replace(/[^0-9]/g, "") }))}
                className="tnum rounded text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: 100 }} />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded p-2.5 mt-3" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 13, lineHeight: 1.6 }}>
        <b>Note:</b> we will get into <b>Performance Incentives for Q3</b> depending on the IDP work.
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => save()} disabled={busy || !n}
          className="rounded font-bold px-4 py-2"
          style={{ background: n ? C.green : "var(--line)", color: n ? "#fff" : "var(--muted)", fontSize: 14 }}>
          {busy ? "Saving…" : isOwner ? (d.appraisal ? "✓ Update and finalise" : "✓ Save and finalise") : (d.appraisal ? "Update — send to RJ" : "Save — send to RJ")}
        </button>
        <button onClick={() => save(true)} disabled={busy || !n}
          title="Park the working — nothing submitted, nothing finalised, just kept for the sit-down"
          className="rounded font-bold px-3 py-2"
          style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 13 }}>
          💾 Save draft
        </button>
        {isOwner && d.appraisal?.pending_since && !d.appraisal?.approved_at && (
          <button onClick={approveThis} disabled={busy}
            className="rounded font-bold px-3 py-2" style={{ background: "var(--green)", color: "#fff", fontSize: 13 }}>
            ✓ Finalise this one
          </button>
        )}
        {d.appraisal?.decided_by && (
          <span style={{ fontSize: 11.5, color: C.faint }}>
            last decided by {String(d.appraisal.decided_by).split("·")[0].trim()} on {fmtFull(String(d.appraisal.decided_at))}
          </span>
        )}
        {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
      </div>
    </div>
  );
}

function Head({ n, l, sub, good }: { n: string; l: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: good ? "#BFE3CB" : "#F0C9C4", background: good ? "#F2FAF4" : "#FDF3F1", minWidth: 150 }}>
      <div className="font-bold tnum" style={{ fontSize: 18, lineHeight: 1.15, color: good ? C.green : C.red }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.faint }}>{sub}</div>}
    </div>
  );
}

const None = ({ what }: { what: string }) => (
  <div className="bg-white rounded-lg border p-4 text-sm" style={{ borderColor: C.line, color: C.faint }}>{what} for this person yet.</div>
);
