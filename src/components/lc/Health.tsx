"use client";
/**
 * Health Check — the Rockefeller Habits Checklist (Dr Raghu, 10 Oct 2026):
 * "let them fill it out … we will reach a certain score. The answers will
 * be anonymous. Be very clear on that."
 *
 * The owner opens a round (a quarter). Each leader ticks the forty lines
 * once; the answer is stored with no name on it, and the fact of having
 * answered is stored separately. The round's score appears only once three
 * have answered, as averages, to everybody alike.
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, input, label, Lightbox, MUTED, NAVY, dmy, type Boot } from "./shared";
import { ROCKEFELLER, TICKS } from "@/lib/lc/rockefeller";

interface Round { id: string; label: string; opened_on: string; closed_on: string | null; answered: number; answeredBy: number; mine: boolean; result: null | { overall: number; habits: { n: number; score: number; items: number[] }[] } }

const bar = (p: number) => p >= 75 ? "var(--green)" : p >= 50 ? "var(--amber)" : "var(--red)";

export default function Health({ boot, isOwner }: { boot: Boot | null; isOwner: boolean }) {
  const [d, setD] = useState<{ rounds: Round[]; minAnswers: number } | null>(null);
  const [fill, setFill] = useState<Round | null>(null);
  const [opening, setOpening] = useState(false);
  const [labelTxt, setLabelTxt] = useState("");
  const load = () => api<{ rounds: Round[]; minAnswers: number }>("/api/lc/health").then(setD).catch(() => setD({ rounds: [], minAnswers: 3 }));
  useEffect(() => { load(); }, []);
  const open = d?.rounds.find((r) => !r.closed_on) || null;
  const members = boot?.members.length || 0;
  const openRound = async () => { try { await api("/api/lc/health", { action: "open", label: labelTxt }); setOpening(false); setLabelTxt(""); load(); } catch (e) { alert(String((e as Error).message)); } };
  const closeRound = async (r: Round) => { if (!confirm(`Close "${r.label}"? Nobody can answer it after this.`)) return; await api("/api/lc/health", { action: "close", id: r.id }); load(); };

  return (
    <div className="grid gap-3">
      <div className="rounded-lg px-4 py-3" style={{ background: "var(--navy)", color: "#fff" }}>
        <div className="font-bold" style={{ fontSize: 15 }}>Your answers are anonymous. Here is exactly how.</div>
        <ul className="text-sm mt-1 grid gap-0.5" style={{ color: "#CBD5E1", paddingLeft: 18 }}>
          <li>An answer is stored as forty ticks and the round — <b style={{ color: "#fff" }}>no name, no e-mail, no time</b>. Nothing on it can lead back to you.</li>
          <li>Separately, Genie notes only <i>that</i> you have answered, so you cannot answer twice and the council can see how many have. That note holds no answer.</li>
          <li>A round shows a result only once <b style={{ color: "#fff" }}>{d?.minAnswers ?? 3} or more</b> have answered — to Dr Raghu as to everyone — and only as an average.</li>
        </ul>
      </div>
      {isOwner && (
        <div className="flex items-center gap-2 flex-wrap">
          {!opening ? <button onClick={() => setOpening(true)} style={btn("primary")}>+ Open a round</button> : (
            <><input style={{ ...input, width: 220 }} value={labelTxt} onChange={(e) => setLabelTxt(e.target.value)} placeholder="Q3 FY 2026-27" autoFocus /><button onClick={openRound} style={btn("primary")}>Open</button><button onClick={() => setOpening(false)} style={btn("ghost")}>Cancel</button></>
          )}
          <span className="text-xs" style={{ color: MUTED }}>Opening a new round closes the previous one.</span>
        </div>
      )}
      {d === null && <Empty>Opening…</Empty>}
      {d && d.rounds.length === 0 && <Empty>No round open yet{isOwner ? " — open the first." : ". Dr Raghu opens a round each quarter."}</Empty>}
      {d?.rounds.map((r) => (
        <Card key={r.id} title={<>{r.label} <span className="text-xs font-normal" style={{ color: MUTED }}>opened {dmy(r.opened_on)}{r.closed_on ? ` · closed ${dmy(r.closed_on)}` : " · open"}</span></>}
          accent={r.closed_on ? "#8a94a0" : "var(--accent)"}
          right={<span className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: MUTED }}>{r.answeredBy} of {members || "?"} answered</span>
            {!r.closed_on && !r.mine && <button onClick={() => setFill(r)} style={btn("primary", { padding: "6px 12px", fontSize: 12 })}>Fill it in — anonymously</button>}
            {!r.closed_on && r.mine && <span className="rounded px-2 font-bold" style={{ fontSize: 11, background: "#E3F3E8", color: "var(--green)" }}>✓ you have answered</span>}
            {isOwner && !r.closed_on && <button onClick={() => closeRound(r)} style={btn("ghost", { padding: "6px 10px", fontSize: 12 })}>Close the round</button>}
          </span>}>
          {r.result ? (
            <div>
              <div className="flex items-end gap-3 mb-3">
                <div className="font-bold tnum" style={{ fontSize: 40, color: bar(r.result.overall), lineHeight: 1 }}>{r.result.overall}<span style={{ fontSize: 18 }}>%</span></div>
                <div className="text-sm" style={{ color: "var(--dim)" }}>of the {TICKS} habits in place, averaged over {r.answered} answers.<br /><span className="text-xs" style={{ color: MUTED }}>Below 50 is a habit we have not built; 50–75 is half-built; above 75 is ours.</span></div>
              </div>
              <div className="grid gap-1.5">
                {r.result.habits.map((h) => { const def = ROCKEFELLER[h.n - 1]; return (
                  <details key={h.n} className="rounded" style={{ border: "1px solid var(--line)" }}>
                    <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer" style={{ listStyle: "none" }}>
                      <span className="font-bold tnum" style={{ color: NAVY, width: 22 }}>{h.n}.</span>
                      <span className="text-sm flex-1" style={{ color: NAVY }}>{def.title}</span>
                      <span className="rounded" style={{ width: 120, height: 8, background: "#EEECE6", overflow: "hidden" }}><span style={{ display: "block", width: `${h.score}%`, height: "100%", background: bar(h.score) }} /></span>
                      <span className="font-bold tnum" style={{ color: bar(h.score), width: 42, textAlign: "right" }}>{h.score}%</span>
                    </summary>
                    <div className="px-3 pb-2 grid gap-1">
                      {def.items.map((it, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="tnum font-bold" style={{ width: 36, color: bar(h.items[i]) }}>{h.items[i]}%</span><span style={{ color: "var(--dim)" }}>{it}</span></div>)}
                    </div>
                  </details>
                ); })}
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: MUTED }}>{r.answered < (d?.minAnswers ?? 3) ? `The score appears once ${d?.minAnswers ?? 3} have answered — ${r.answered} so far.` : ""}</div>
          )}
        </Card>
      ))}
      {fill && <Fill r={fill} onDone={() => { setFill(null); load(); }} />}
    </div>
  );
}

function Fill({ r, onDone }: { r: Round; onDone: () => void }) {
  const [ticks, setTicks] = useState<boolean[]>(() => Array(TICKS).fill(false));
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  let k = 0;
  const n = ticks.filter(Boolean).length;
  const send = async () => {
    if (!confirm("Submit? Your forty answers are stored without your name and cannot be changed afterwards.")) return;
    setErr(null); setBusy(true);
    try { await api("/api/lc/health", { action: "answer", round_id: r.id, ticks }); onDone(); } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  };
  return (
    <Lightbox title={`Rockefeller Habits Checklist — ${r.label}`} onClose={onDone} wide>
      <div className="rounded px-3 py-2 text-sm mb-3" style={{ background: "#FFF7E6", color: "#7A4A00" }}>
        <b>Anonymous.</b> Tick what is true at Nandan today, not what we aim for. Your name is not stored with these ticks. Honest ticks make the score worth having.
      </div>
      <div className="grid gap-3">
        {ROCKEFELLER.map((h) => (
          <div key={h.n} className="rounded-lg p-3" style={{ border: "1px solid var(--line)" }}>
            <div className="font-bold mb-1.5" style={{ color: NAVY, fontSize: 14 }}>{h.n}. {h.title}</div>
            <div className="grid gap-1">
              {h.items.map((it) => { const i = k++; return (
                <label key={i} className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: "var(--ink)" }}>
                  <input type="checkbox" checked={ticks[i]} onChange={(e) => setTicks((t) => { const c = [...t]; c[i] = e.target.checked; return c; })} style={{ marginTop: 3 }} />
                  <span>{it}</span>
                </label>
              ); })}
            </div>
          </div>
        ))}
      </div>
      <Err e={err} />
      <div className="flex items-center gap-3 mt-4 sticky bottom-0 bg-white py-2" style={{ borderTop: "1px solid var(--line)" }}>
        <span className="text-sm tnum font-bold" style={{ color: NAVY }}>{n} of {TICKS} ticked · {Math.round((n / TICKS) * 100)}%</span>
        <span className="ml-auto" />
        <button onClick={send} disabled={busy} style={btn("primary")}>{busy ? "Sending…" : "Submit anonymously"}</button>
        <button onClick={onDone} style={btn("ghost")}>Cancel</button>
      </div>
      <style>{`.lc-x{color:${MUTED}}`}</style>
    </Lightbox>
  );
}
