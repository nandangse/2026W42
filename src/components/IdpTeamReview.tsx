"use client";
/**
 * The manager's review of one submitted IDP, at /idp.
 *
 * The ORDER is the design, and it runs one way:
 *   read the person → rate the person → only then see the money → speak.
 *
 * The reviewer never sees the person's self-ratings or the salary the person
 * asked for. The current gross appears only after all eleven ratings are
 * given, and the proposal starts AT the current figure — so "no change" is a
 * decision somebody made, not a box somebody skipped. On submit, a CHRO-style
 * growth note is written and shown.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { IDP_SECTIONS, IDP_RATINGS, RATING_MEANING, RATING_MAX, bandIndex } from "@/lib/idp";
import DictateBox, { type Recording } from "./DictateBox";

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };
const inr = (n: number) => n.toLocaleString("en-IN");

export interface TeamRow {
  idpId: string; name: string; email: string; employeeId: string | null; role: string | null;
  depth: number; submitted_at: string | null; review: { submitted_at: string | null } | null;
}

/**
 * "for people who have reporting people under them, show them a box saying
 * show IDP of reporting staff" (Dr Raghu, 5 Sep 2026). The box appears only
 * when the person has reportees; a tap opens the team list beneath it.
 */
export function TeamBox({ onOpen }: { onOpen: (r: TeamRow) => void }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get("/api/idp/team").then((j) => setRows(j.noTeam ? [] : (j.team || []))).catch(() => setRows([])); }, []);
  if (!rows || rows.length === 0) return null;
  const reviewable = rows.filter((r) => r.submitted_at);
  const doneCount = reviewable.filter((r) => r.review?.submitted_at).length;
  const waiting = reviewable.length - doneCount;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left rounded-lg p-3" style={{ background: "#16232F", color: "#fff", border: waiting ? "3px solid #E8600A" : "3px solid #0D7A3F" }}>
        <div className="font-bold" style={{ fontSize: 17, lineHeight: 1.2 }}>👥 Show IDP of reporting staff</div>
        <div className="text-xs mt-1" style={{ color: "#8FA1B3", lineHeight: 1.6 }}>
          {rows.length} report{rows.length === 1 ? "s" : ""} to you · {reviewable.length} submitted · {doneCount} feedback{doneCount === 1 ? "" : "s"} given{waiting ? ` · ${waiting} waiting for you` : reviewable.length ? " · all done 🎉" : ""} · tap to {open ? "hide" : "open"}
        </div>
      </button>
      {open && <TeamList onOpen={onOpen} />}
    </div>
  );
}

export function TeamList({ onOpen }: { onOpen: (r: TeamRow) => void }) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [gateMsg, setGateMsg] = useState("");
  const [noTeam, setNoTeam] = useState(false);

  useEffect(() => {
    api.get("/api/idp/team")
      .then((j) => { setRows(j.team || []); setNoTeam(!!j.noTeam); })
      .catch((e) => setGateMsg(e instanceof Error ? e.message : String(e)));
  }, []);

  if (gateMsg)
    return (
      <div className="rounded-lg p-3 mt-6" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 13, color: "#8A5B00", lineHeight: 1.6 }}>
        <b>Your team&apos;s IDPs:</b> {gateMsg}
      </div>
    );
  if (rows === null || noTeam || rows.length === 0) return null;

  // the scoreboard (Dr Raghu, 29 Aug 2026): pending after pending after
  // pending, until they are all green — that is the game.
  const reviewable = rows.filter((r) => r.submitted_at);
  const doneCount = reviewable.filter((r) => r.review?.submitted_at).length;
  return (
    <div className="mt-8">
      <h2 className="font-bold" style={{ fontSize: 18 }}>👥 You are the reporting manager for these people</h2>
      <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.6 }}>
        Please give your feedback for all of them. You read what they wrote, rate them on the same eleven dimensions,
        and say what their pay should now be. You are never shown their self-ratings, or what they asked for.
      </div>
      {reviewable.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="rounded-full" style={{ flex: 1, maxWidth: 260, height: 8, background: "#EEECE6", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((doneCount / reviewable.length) * 100)}%`, height: "100%", background: doneCount === reviewable.length ? C.green : C.orange, transition: "width .3s" }} />
          </div>
          <span className="font-bold tnum" style={{ fontSize: 12, color: doneCount === reviewable.length ? C.green : "#8A5B00" }}>
            {doneCount} of {reviewable.length} feedbacks given{doneCount === reviewable.length ? " — all done 🎉" : ""}
          </span>
        </div>
      )}
      <div className="rounded-lg mt-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        {rows.map((r, i) => (
          <div key={r.idpId} className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <span style={{ width: 12 * Math.max(0, r.depth - 1) }} />
            <div style={{ minWidth: 170, flex: 1 }}>
              <div className="font-semibold" style={{ fontSize: 14 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{r.role || "—"}{r.employeeId && <> · {r.employeeId}</>}</div>
            </div>
            {!r.submitted_at ? (
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#F4F2EC", color: C.faint }}>not submitted yet</span>
            ) : r.review?.submitted_at ? (
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: C.green }}>reviewed ✓</span>
            ) : (
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>pending</span>
            )}
            {r.submitted_at && (
              <button onClick={() => onOpen(r)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#16232F", color: "#fff" }}>
                {r.review?.submitted_at ? "See the review" : "Review →"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-lg p-3 mt-2" style={{ background: "#F3EEFB", border: "1px solid #D9CBF5", fontSize: 12.5, color: "#4A3B7A", lineHeight: 1.6 }}>
        After your interview, the summary result will be available here for you to see. Thank you once again for your
        service.
      </div>
    </div>
  );
}

/* ─────────────────────────── the review itself ─────────────────────────── */

interface Detail {
  person: {
    name: string; employeeId: string | null; role: string | null; roleSummary: string | null;
    submitted_at: string; answers: Record<string, string>;
    audioUrls: Record<string, { url: string | null; seconds: number | null; transcript: string | null }[]>;
    attachments: { name: string; size: number; url: string | null }[];
  };
  review: { ratings: Record<string, number>; gross_proposed: number | null; notes: string | null; analysis: string | null; submitted_at: string | null; audio: Recording[] } | null;
  grossCurrent: number | null;
}

export function TeamReview({ row, onClose }: { row: TeamRow; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [gross, setGross] = useState<string>("");
  const [grossCurrent, setGrossCurrent] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [voice, setVoice] = useState<Recording[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const j = await api.get(`/api/idp/team?id=${encodeURIComponent(row.idpId)}`);
    setD(j);
    setRatings(j.review?.ratings || {});
    setGross(j.review?.gross_proposed ? String(j.review.gross_proposed) : "");
    setGrossCurrent(j.grossCurrent ?? null);
    setNotes(j.review?.notes || "");
    setVoice(j.review?.audio || []);
    setAnalysis(j.review?.analysis || null);
  }, [row.idpId]);
  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : String(e))); }, [load]);

  const save = (patch: Record<string, unknown>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post("/api/idp/team", { action: "save", idpId: row.idpId, ...patch }).catch(() => {});
    }, 900);
  };
  const setR = (k: string, v: number) => { const n = { ...ratings, [k]: v }; setRatings(n); save({ ratings: n }); };

  const allRated = IDP_RATINGS.every((x) => ratings[x.key]);
  const locked = !!d?.review?.submitted_at;

  const reveal = async () => {
    setBusy(true); setMsg("");
    try {
      const j = await api.post("/api/idp/team", { action: "reveal", idpId: row.idpId, ratings });
      setGrossCurrent(j.grossCurrent ?? null);
      if (!gross && j.grossCurrent) setGross(String(j.grossCurrent)); // no change is a decision, not a blank
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const j = await api.post("/api/idp/team", { action: "submit", idpId: row.idpId, ratings, gross_proposed: gross, notes });
      setAnalysis(j.analysis || null);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 no-print" style={{ background: "rgba(13,22,31,0.5)", zIndex: 70 }} role="button" tabIndex={0} onClick={onClose}>
      <div className="mx-auto my-3 md:my-6 rounded-lg overflow-y-auto"
        style={{ maxWidth: 860, maxHeight: "calc(100vh - 30px)", background: "#F1EFE9" }}
        role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 sticky top-0 flex items-start gap-2" style={{ background: "#16232F", color: "#fff", zIndex: 2 }}>
          <div>
            <div className="font-bold">{row.name}</div>
            <div style={{ fontSize: 11, color: "#8FA1B3" }}>
              {row.role || "—"} · submitted {row.submitted_at ? fmtFull(String(row.submitted_at)) : ""}
            </div>
          </div>
          {locked && <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: C.green }}>reviewed</span>}
          <button onClick={onClose} className="ml-auto text-sm font-bold rounded px-2.5 py-1" style={{ background: "#22303C", color: "#8FA1B3" }}>✕</button>
        </div>

        <div className="p-4">
          {msg && <div className="rounded p-2 mb-3 text-sm font-semibold" style={{ background: "#FBEDEA", color: C.red }}>{msg}</div>}
          {!d ? <div className="text-sm" style={{ color: C.faint }}>loading…</div> : (
            <>
              {/* the CHRO note, once it exists, leads */}
              {analysis && (
                <div className="rounded-lg p-3 mb-4" style={{ background: "#fff", border: "2px solid #0D7A3F" }}>
                  <div className="font-bold" style={{ fontSize: 15 }}>The growth note — what this person should be doing</div>
                  <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6 }}>{analysis}</div>
                </div>
              )}

              {/* 1 · what they wrote */}
              <details open={!locked && !allRated}>
                <summary className="font-bold cursor-pointer rounded-lg px-3 py-2.5" style={{ fontSize: 15, background: "#fff", border: `1px solid ${C.line}` }}>
                  1 · What {row.name.split(" ")[0]} wrote
                  <span style={{ fontSize: 11, color: C.faint, fontWeight: 400 }}> — their self-ratings and the salary they asked for are not shown to you</span>
                </summary>
                {d.person.roleSummary && (
                  <div className="rounded p-2 mt-2" style={{ background: "#FFF7E6", fontSize: 12.5, color: C.dim, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    <b>What their role expects:</b> {d.person.roleSummary}
                  </div>
                )}
                {IDP_SECTIONS.map((sec) => {
                  const has = sec.questions.some((q) => String(d.person.answers[q.id] || "").trim() || (d.person.audioUrls[q.id] || []).length);
                  if (!has) return null;
                  return (
                    <div key={sec.key} className="mt-3">
                      <div className="font-bold" style={{ fontSize: 13.5 }}>{sec.title}</div>
                      {sec.questions.map((q) => {
                        const v = String(d.person.answers[q.id] || "").trim();
                        const recs = d.person.audioUrls[q.id] || [];
                        if (!v && !recs.length) return null;
                        return (
                          <div key={q.id} className="bg-white rounded-lg border p-2.5 mt-1.5" style={{ borderColor: C.line }}>
                            <div className="font-semibold" style={{ fontSize: 12.5 }}>{q.label}</div>
                            {v && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.65, marginTop: 2 }}>{v}</div>}
                            {recs.map((a, i) => a.url && (
                              <audio key={i} controls controlsList="nodownload" src={a.url} className="mt-1" style={{ height: 26, maxWidth: 340 }} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {d.person.attachments.length > 0 && (
                  <div className="mt-2">
                    {d.person.attachments.map((a) => (
                      <div key={a.name} style={{ fontSize: 12.5 }}>📄 {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C" }}>{a.name}</a> : a.name}</div>
                    ))}
                  </div>
                )}
              </details>

              {/* 2 · your ratings */}
              <div className="mt-4">
                <div className="font-bold" style={{ fontSize: 15 }}>2 · Your rating of {row.name.split(" ")[0]}</div>
                <div style={{ fontSize: 12.5, color: C.faint }}>The same eleven dimensions they rated themselves on. Yours is independent — that is the point.</div>
                <div className="rounded-lg mt-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                  {IDP_RATINGS.map((x, i) => {
                    const val = ratings[x.key] || 0;
                    return (
                      <div key={x.key} className="px-3 py-2.5" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <div style={{ fontSize: 14, fontWeight: 600, minWidth: 190 }}>{x.key}</div>
                          <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: val ? C.orange : "#C9C6BD" }}>{val || "–"}</div>
                          <div style={{ fontSize: 12, color: C.faint, flex: 1, minWidth: 200 }}>{val ? `“${x.bands[bandIndex(val)]}”` : x.what}</div>
                        </div>
                        <input type="range" min={1} max={RATING_MAX} step={1} value={val || 1} disabled={locked}
                          onChange={(ev) => setR(x.key, Number(ev.target.value))}
                          className="w-full" style={{ accentColor: val ? C.orange : "#C9C6BD", height: 26 }} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 · the money, earned by finishing the ratings */}
              <div className="mt-4">
                <div className="font-bold" style={{ fontSize: 15 }}>3 · The pay</div>
                {grossCurrent === null && !locked ? (
                  <div className="rounded-lg p-3 mt-1" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
                      Their current salary is shown only after you have rated all eleven — so the number cannot colour
                      your judgement of the work.
                    </div>
                    <button onClick={reveal} disabled={!allRated || busy}
                      className="mt-2 rounded font-bold px-3 py-2"
                      style={{ background: allRated ? "#16232F" : "#E2E0DA", color: allRated ? "#fff" : "#8A94A0", fontSize: 13, cursor: allRated ? "pointer" : "not-allowed" }}>
                      {allRated ? "Show their current salary" : `Rate all eleven first (${IDP_RATINGS.filter((x) => ratings[x.key]).length}/11)`}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg p-3 mt-1" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 14 }}>
                      Current gross: <b className="tnum">{grossCurrent !== null ? `₹${inr(grossCurrent)}/month` : "not on the record"}</b>
                    </div>
                    <div className="mt-2" style={{ fontSize: 13, fontWeight: 600 }}>What should their Monthly Gross Salary be NOW?</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ fontWeight: 700 }}>Rs</span>
                      <input value={gross} disabled={locked} inputMode="numeric"
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setGross(v); save({ gross_proposed: v }); }}
                        className="rounded px-2 py-2 tnum" style={{ border: `1px solid ${C.line}`, fontSize: 16, width: 160 }} />
                      <span style={{ fontSize: 11.5, color: C.faint }}>starts at today&apos;s figure — no change is a decision too</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 · the voice */}
              <div className="mt-4">
                <div className="font-bold" style={{ fontSize: 15 }}>
                  4 · Your voice note — <span style={{ color: C.red }}>compulsory</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
                  How should {row.name.split(" ")[0]} become more useful to the company? Say it; it is written out
                  below and you can add anything else.
                </div>
                <div className="mt-1">
                  <DictateBox value={notes} rows={4} disabled={locked} serverStt
                    onChange={(v) => { setNotes(v); save({ notes: v }); }}
                    idpId={row.idpId} qid="review" uploadKind="review-voice" uploadUrl="/api/idp/team"
                    recordings={voice} onRecorded={(r) => setVoice((x) => [...x, r])} />
                </div>
              </div>

              {!locked && (
                <div className="rounded-lg p-3 mt-4 mb-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                  <button onClick={submit} disabled={busy || !allRated || !voice.length}
                    className="rounded font-bold"
                    style={{
                      background: allRated && voice.length ? C.green : "#E2E0DA",
                      color: allRated && voice.length ? "#fff" : "#8A94A0",
                      padding: "13px 22px", fontSize: 15, width: "100%", maxWidth: 340,
                      cursor: allRated && voice.length ? "pointer" : "not-allowed",
                    }}>
                    {busy ? "Writing the growth note…" : "✓ Submit my review"}
                  </button>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                    {!allRated ? "Rate all eleven dimensions first." : !voice.length ? "The voice note is compulsory." :
                      "On submitting you will see the growth note — what this person should be doing next, written as a CHRO would."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
