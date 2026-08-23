"use client";
/**
 * IDP Discussion - Individual.
 *
 * The welcome screen is Dr Raghu's own wording and is not decoration. It asks
 * for an hour, a quiet room, three breaths and a glass of water before
 * anybody starts, because the difference between an IDP worth reading and a
 * form filled in between two meetings is entirely in how it was approached.
 *
 * ONE SITTING. Starting deletes any abandoned attempt and begins again — that
 * is the rule as stated. Answers are still saved as they are typed, so a
 * closed laptop does not cost ninety minutes of thinking; but an unsubmitted
 * session is not an IDP and is never read as one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { IDP_SECTIONS, IDP_RATINGS, RATING_MEANING, RATING_MAX, CONSENT_TEXT, isComplete } from "@/lib/idp";
import DictateBox from "./DictateBox";

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };

interface Open {
  id: string; answers: Record<string, string>; ratings: Record<string, number>;
  role_summary: string | null; role_at_time: string | null;
}

export default function IdpDiscussion({ name, initials }: { name: string; initials: string | null }) {
  const [state, setState] = useState<{
    open: Open | null; done: { id: string; submitted_at: string }[];
    role: string | null; roleSummary: string | null; needsMigration?: boolean;
    employee: { id: string; name: string } | null;
    isLeader?: boolean;
  } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/idp");
      setState({ open: j.open, done: j.done || [], role: j.role, roleSummary: j.roleSummary, needsMigration: j.needsMigration, employee: j.employee ?? null, isLeader: !!j.isLeader });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true); setMsg("");
    try { await api.post("/api/idp", { action: "start", consent: true }); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  if (!state) return <Shell initials={initials}><div className="p-6 text-sm" style={{ color: C.faint }}>Loading…</div></Shell>;

  if (state.open) return <Shell initials={initials}><Filling open={state.open} isLeader={!!state.isLeader} onDone={load} /></Shell>;

  // The login is the key, and it has to reach a record. An IDP filled in by a
  // login that matches no employee has nowhere to be filed and nobody to
  // review it, so this says what to do rather than offering a button that
  // would fail at the last step.
  if (!state.employee && !state.needsMigration) {
    return (
      <Shell initials={initials}>
        <div className="mx-auto px-4 py-10" style={{ maxWidth: 620 }}>
          <h1 className="font-bold" style={{ fontSize: 24 }}>Welcome {name}</h1>
          <div className="rounded-lg p-4 mt-5" style={{ background: "#FFF7E6", border: "1px solid #F5B32B" }}>
            <div className="font-bold" style={{ fontSize: 15, color: "#8A5B00" }}>
              Your login is not linked to your employee record yet
            </div>
            <div className="mt-2" style={{ fontSize: 14, lineHeight: 1.7, color: C.dim }}>
              An IDP is filed on your record, so Genie has to know which record is yours before you can begin.
              Nothing is wrong with your account — the link simply has not been made.
              <br /><br />
              <b>Ask HR to open your record in HRIS and set the <i>Genie user</i> field to this login.</b> It takes
              them a moment, and this page will work the next time you open it.
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell initials={initials}>
      <div className="mx-auto px-4 py-8" style={{ maxWidth: 720 }}>
        {msg && <div className="rounded p-2 mb-4 text-xs font-semibold" style={{ background: "#FBEDEA", color: C.red }}>{msg}</div>}
        {state.needsMigration && (
          <div className="rounded p-3 mb-4" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
            <b>Run migration 0053 first.</b> The IDP has nowhere to save yet.
          </div>
        )}

        <h1 className="font-bold" style={{ fontSize: 26, lineHeight: 1.2 }}>Welcome {name}</h1>
        <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.7, color: C.ink }}>
          Would you like to fill up the IDP?
        </p>
        <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.8, color: C.dim }}>
          You will need a quiet place and would need to invest in at least <b>60 minutes</b>. It will involve your full
          concentration so preferably do it early morning or late evening / night when you will not be disturbed.
        </p>

        <div className="rounded-lg p-4 mt-5" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, lineHeight: 2, color: C.ink }}>
            Take <b>3 deep breaths</b>.
            <br />
            Then a <b>glass of water</b>.
            <br />
            Then click below.
          </div>
        </div>

        <p className="mt-5 rounded p-3" style={{ fontSize: 14, lineHeight: 1.7, color: "#8A5B00", background: "#FFF7E6", border: "1px solid #F5B32B" }}>
          Once you start it has to be completed else you will begin all over again.
        </p>

        {state.done.length > 0 && (
          <p className="mt-4" style={{ fontSize: 13, color: C.faint, lineHeight: 1.6 }}>
            You have already submitted {state.done.length} for this cycle. Starting again replaces nothing — the one you
            submitted stays on your record.
          </p>
        )}

        <div className="mt-6" style={{ fontSize: 17, fontWeight: 700 }}>Start?</div>

        <label className="flex items-start gap-2 mt-3" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
            style={{ accentColor: C.orange, width: 17, height: 17, marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 14, lineHeight: 1.6, color: C.ink }}>{CONSENT_TEXT}</span>
        </label>

        <p className="mt-3" style={{ fontSize: 14, color: C.dim }}>
          You will get a finalised document once completed.
        </p>

        <button onClick={start} disabled={!consent || busy || state.needsMigration}
          className="mt-5 rounded font-bold"
          style={{
            background: consent && !state.needsMigration ? C.orange : "#E2E0DA",
            color: consent && !state.needsMigration ? "#fff" : "#8A94A0",
            padding: "13px 26px", fontSize: 15,
            cursor: consent && !state.needsMigration ? "pointer" : "not-allowed",
          }}>
          {busy ? "Starting…" : "Start the IDP discussions"}
        </button>

        {!consent && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            The tick above is needed before you can begin.
          </div>
        )}

        {state.role && (
          <div className="mt-8 rounded-lg p-3" style={{ background: "#F4F2EC" }}>
            <div className="text-xs font-bold" style={{ color: C.dim }}>Your role, as the company has written it</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{state.role}</div>
            {state.roleSummary && (
              <div className="mt-2" style={{ fontSize: 13, color: C.dim, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {state.roleSummary}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ─────────────────────────── the discussion ─────────────────────────── */

function Filling({ open, isLeader, onDone }: { open: Open; isLeader: boolean; onDone: () => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(open.answers || {});
  const [ratings, setRatings] = useState<Record<string, number>>(open.ratings || {});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // saved as they type — a closed laptop should not cost an hour's thinking
  const touch = (next: Record<string, string>, nextR: Record<string, number>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post("/api/idp", { action: "save", id: open.id, answers: next, ratings: nextR }).catch(() => {});
    }, 1200);
  };
  const setA = (id: string, v: string) => { const n = { ...answers, [id]: v }; setAnswers(n); touch(n, ratings); };
  const setR = (d: string, v: number) => { const n = { ...ratings, [d]: v }; setRatings(n); touch(answers, n); };

  // the leaders' four are asked only of the Leaders Council, and are only
  // required of the people they are shown to
  const sections = IDP_SECTIONS.filter((x) => !x.leadersOnly || isLeader);
  const check = isComplete(answers, ratings, isLeader);

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/idp", { action: "submit", id: open.id, answers, ratings });
      await onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="mx-auto px-4 py-6" style={{ maxWidth: 800 }}>
      {open.role_summary && (
        <div className="rounded-lg p-3 mb-5" style={{ background: "#F4F2EC" }}>
          <div className="text-xs font-bold" style={{ color: C.dim }}>
            What is expected of {open.role_at_time || "your role"} — answer against this
          </div>
          <div style={{ fontSize: 13, color: C.dim, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 4 }}>
            {open.role_summary}
          </div>
        </div>
      )}

      {sections.map((s) => (
        <div key={s.key} className="mb-6">
          <h2 className="font-bold" style={{ fontSize: 18 }}>{s.title}</h2>
          {s.blurb && <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.6, marginTop: 2 }}>{s.blurb}</div>}
          {s.questions.map((q) => {
            const v = answers[q.id] || "";
            const short = q.min ? v.trim().length > 0 && v.trim().length < q.min : false;
            return (
              <div key={q.id} className="mt-3 rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${short ? "#F5B32B" : C.line}` }}>
                <div className="font-semibold" style={{ fontSize: 15 }}>{q.label}</div>
                {q.hint && <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>{q.hint}</div>}
                {q.help && (
                  <div className="rounded p-2 mt-2 mb-2" style={{ background: "#F4F2EC", fontSize: 12.5, color: C.dim, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {q.help}
                  </div>
                )}
                <DictateBox value={v} rows={q.rows} onChange={(nv) => setA(q.id, nv)} />
                {short && <div style={{ fontSize: 11, color: "#8A5B00" }}>A little more — this is one of the answers that gets read.</div>}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mb-6">
        <h2 className="font-bold" style={{ fontSize: 18 }}>How I rate myself</h2>
        <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.6 }}>
          Against what your role needs — not against the people around you.
        </div>
        <div className="rounded-lg mt-3" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
          {IDP_RATINGS.map((d, i) => {
            const val = ratings[d] || 0;
            return (
              <div key={d} className="px-3 py-3" style={{ borderTop: i ? `1px solid #EEECE6` : undefined }}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div style={{ fontSize: 15, fontWeight: 600, minWidth: 200 }}>{d}</div>
                  <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: val ? C.orange : "#C9C6BD", minWidth: 34 }}>
                    {val || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: val ? C.dim : C.faint, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                    {val ? RATING_MEANING[val] : "Move the slider to choose, 1 to 10."}
                  </div>
                </div>
                <input type="range" min={1} max={RATING_MAX} step={1} value={val || 1}
                  onChange={(ev) => setR(d, Number(ev.target.value))}
                  className="w-full mt-2"
                  style={{ accentColor: val ? C.orange : "#C9C6BD" }} />
                <div className="flex justify-between" style={{ fontSize: 10.5, color: C.faint }}>
                  <span>1 · only starting</span>
                  <span>5 · what the role needs</span>
                  <span>10 · the best here</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {msg && <div className="rounded p-2 mb-3 text-sm font-semibold" style={{ background: "#FBEDEA", color: C.red }}>{msg}</div>}

      <div className="rounded-lg p-4 mb-10" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        {!check.ok ? (
          <div style={{ fontSize: 13, color: "#8A5B00", lineHeight: 1.6 }}>
            <b>Not finished yet.</b>{" "}
            {check.missing.length > 0 && <>{check.missing.length} question{check.missing.length === 1 ? "" : "s"} still to answer</>}
            {check.missing.length > 0 && check.unrated.length > 0 && ", and "}
            {check.unrated.length > 0 && <>{check.unrated.length} rating{check.unrated.length === 1 ? "" : "s"} to give</>}.
            <div style={{ color: C.faint, marginTop: 4 }}>
              Your answers are saved as you type, so nothing is lost if you have to stop — but an IDP that is not
              submitted is not on your record.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.green, lineHeight: 1.6 }}>
            Everything is answered. Read it once more — once you press Complete it goes on your record and
            <b> cannot be changed</b>.
          </div>
        )}
        <button onClick={submit} disabled={!check.ok || busy}
          className="mt-3 rounded font-bold"
          style={{
            background: check.ok ? C.green : "#E2E0DA", color: check.ok ? "#fff" : "#8A94A0",
            padding: "11px 22px", fontSize: 14, cursor: check.ok ? "pointer" : "not-allowed",
          }}>
          {busy ? "Completing…" : "Complete and finish"}
        </button>
      </div>
    </div>
  );
}

function Shell({ children, initials }: { children: React.ReactNode; initials: string | null }) {
  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: C.ink }}>
      <div style={{ background: "#16232F", color: "#fff" }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="rounded bg-white px-1.5 py-1 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 22, display: "block" }} />
          </div>
          <div>
            <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>IDP</div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              IDP Discussion — Individual
            </div>
          </div>
          <a href="/" className="ml-auto text-xs font-semibold rounded px-2.5 py-1.5"
            style={{ background: "#22303C", color: "#8FA1B3" }}>← Genie</a>
          <span className="rounded-full font-bold flex items-center justify-center"
            style={{ width: 26, height: 26, fontSize: 11, background: initials ? "#E8600A" : "#B3261E", color: "#fff" }}>
            {initials || "??"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
