"use client";
/**
 * The Solution Board (Dr Raghu, 10 Oct 2026): a problem, its description,
 * everyone's solution, the LC discussion in the lightbox, Genie's summary as
 * the LC Solution, a status, a tentative date; Edit for the author and the
 * owner, 👍 👎 ❓ and comments for everyone; problems blocked and solved
 * for MTD, QTD, YTD or a date range. "A continuous problem-solving method."
 */
import { useEffect, useState } from "react";
import { api, btn, Card, Empty, Err, FileDrop, Files, input, label, Lightbox, MUTED, NAVY, ORANGE, Names, Rich, RichField, Thumbs, Who, dmy, dmyt, istToday, leaderOf, type Boot, type LcFile } from "./shared";

interface P { id: string; title: string; description: string | null; lc_summary: string | null; status: string; tentative_on: string | null; added_by: string; created_at: string; updated_at: string; closed_at: string | null; up: number; down: number; question: number; mine: string | null; solutions: number; comments: number; mayEdit: boolean }
interface Full { problem: Omit<P, "up" | "down" | "question" | "solutions" | "comments"> & { up: string[]; down: string[]; question: string[]; mine: string | null; mayEdit: boolean }; solutions: { id: string; body: string; added_by: string; created_at: string; up: string[]; down: string[]; question: string[]; mine: string | null; mayEdit: boolean }[]; comments: { id: string; body: string; added_by: string; created_at: string }[]; files: LcFile[] }
interface Stats { from: string; to: string; raised: number; solved: number; blocked: number; open: number; cancelled: number }

export const STATUS: Record<string, { label: string; colour: string; bg: string }> = {
  new: { label: "New", colour: "#1b3a5c", bg: "#E6EEF6" },
  under_process: { label: "Under process", colour: "#B45309", bg: "#FFF7E6" },
  needs_deep_dive: { label: "Needs deep dive", colour: "#7C3AED", bg: "#F1EAFE" },
  deployed: { label: "Deployed", colour: "#0d7a3f", bg: "#E3F3E8" },
  cancelled: { label: "Cancelled", colour: "#8a94a0", bg: "#F1EFE9" },
};
const ORDER = ["new", "under_process", "needs_deep_dive", "deployed", "cancelled"];

/** MTD / QTD / YTD on the Indian financial year, in IST. */
function range(kind: "mtd" | "qtd" | "ytd"): { from: string; to: string } {
  const to = istToday(); const [y, m] = to.split("-").map(Number);
  if (kind === "mtd") return { from: `${y}-${String(m).padStart(2, "0")}-01`, to };
  if (kind === "qtd") { const qs = m >= 4 ? [4, 7, 10][Math.floor((m - 4) / 3)] : 1; return { from: `${y}-${String(qs).padStart(2, "0")}-01`, to }; }
  return { from: `${m >= 4 ? y : y - 1}-04-01`, to };
}

export default function Solutions({ boot, arg, go }: { boot: Boot | null; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [d, setD] = useState<{ problems: P[]; stats: Stats } | null>(null);
  const [win, setWin] = useState<{ kind: "mtd" | "qtd" | "ytd" | "custom"; from: string; to: string }>({ kind: "qtd", ...range("qtd") });
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState<"open" | "all">("open");
  const load = () => api<{ problems: P[]; stats: Stats }>(`/api/lc/problems?from=${win.from}&to=${win.to}`).then(setD).catch(() => setD({ problems: [], stats: { from: "", to: "", raised: 0, solved: 0, blocked: 0, open: 0, cancelled: 0 } }));
  useEffect(() => { load(); }, [win.from, win.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (arg) return <View boot={boot} id={arg} back={() => { go("solutions"); load(); }} />;
  const react = async (id: string, value: string) => { await api("/api/lc/problems", { action: "react", id, value }); load(); };
  const list = (d?.problems || []).filter((p) => show === "all" || !["deployed", "cancelled"].includes(p.status));
  const s = d?.stats;
  const Tile = ({ n, t, c }: { n: number; t: string; c: string }) => <div className="rounded-lg bg-white px-3 py-2" style={{ border: "1px solid var(--line)", borderTop: `4px solid ${c}`, minWidth: 110 }}><div className="font-bold tnum" style={{ fontSize: 24, color: c, lineHeight: 1.1 }}>{n}</div><div className="text-xs" style={{ color: MUTED }}>{t}</div></div>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setAdding(true)} style={btn("primary")}>+ Raise a problem</button>
        <span className="ml-auto" />
        {(["mtd", "qtd", "ytd"] as const).map((k) => <button key={k} onClick={() => setWin({ kind: k, ...range(k) })} style={btn(win.kind === k ? "primary" : "soft", { padding: "5px 10px", fontSize: 12 })}>{k.toUpperCase()}</button>)}
        <input type="date" style={{ ...input, width: 140, padding: "5px 8px", fontSize: 12 }} value={win.from} onChange={(e) => setWin({ kind: "custom", from: e.target.value, to: win.to })} />
        <span className="text-xs" style={{ color: MUTED }}>to</span>
        <input type="date" style={{ ...input, width: 140, padding: "5px 8px", fontSize: 12 }} value={win.to} onChange={(e) => setWin({ kind: "custom", from: win.from, to: e.target.value })} />
      </div>
      {s && (
        <div className="flex gap-2 flex-wrap">
          <Tile n={s.raised} t="raised in the range" c="var(--navy)" />
          <Tile n={s.solved} t="solved (deployed) in the range" c="var(--green)" />
          <Tile n={s.blocked} t="blocked — needs deep dive" c="#7C3AED" />
          <Tile n={s.open} t="open now" c="var(--accent)" />
          <Tile n={s.cancelled} t="cancelled in the range" c="#8a94a0" />
        </div>
      )}
      <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
        Showing <button onClick={() => setShow("open")} style={{ color: show === "open" ? ORANGE : NAVY, fontWeight: 700 }}>open</button> · <button onClick={() => setShow("all")} style={{ color: show === "all" ? ORANGE : NAVY, fontWeight: 700 }}>all</button>
      </div>
      {d === null && <Empty>Opening…</Empty>}
      {d && list.length === 0 && <Empty>No problems here. Raise one — the board is where they get solved.</Empty>}
      <div className="grid gap-3 lc-sol" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {list.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.updated_at.localeCompare(a.updated_at)).map((p) => {
          const st = STATUS[p.status] || STATUS.new;
          return (
            <div key={p.id} role="button" tabIndex={0} onClick={() => go("solutions", p.id)} onKeyDown={(e) => { if (e.key === "Enter") go("solutions", p.id); }} className="text-left rounded-lg bg-white p-3 cursor-pointer" style={{ border: "1px solid var(--line)", borderLeft: `6px solid ${leaderOf(boot, p.added_by).colour}` }}>
              <div className="flex items-start gap-2">
                <div className="font-bold flex-1" style={{ fontSize: 14.5, color: NAVY, lineHeight: 1.3 }}>{p.title}</div>
                <span className="rounded px-1.5 font-bold flex-shrink-0" style={{ fontSize: 10, background: st.bg, color: st.colour }}>{st.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs" style={{ color: MUTED }}>
                <Who boot={boot} email={p.added_by} size={20} />
                <span>{dmy(p.created_at)}</span>
                {p.tentative_on && <span>· by {dmy(p.tentative_on)}</span>}
                <span className="ml-auto">💡 {p.solutions} · 💬 {p.comments}{p.lc_summary ? " · 🧞" : ""}</span>
              </div>
              <div className="mt-2"><Thumbs up={p.up} down={p.down} question={p.question} mine={p.mine} onReact={(v) => react(p.id, v)} size={12} /></div>
            </div>
          );
        })}
      </div>
      {adding && <Form onDone={(id) => { setAdding(false); load(); if (id) go("solutions", id); }} />}
    </div>
  );
}

function Form({ p, onDone }: { p?: Full["problem"]; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ title: p?.title || "", description: p?.description || "", tentative_on: p?.tentative_on || "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const save = async () => { setErr(null); setBusy(true); try { const r = await api<{ id?: string }>("/api/lc/problems", { action: p ? "edit" : "create", id: p?.id, ...f }); onDone(r.id || p?.id); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  return (
    <Lightbox title={p ? "Edit the problem" : "Raise a problem"} onClose={() => onDone()} wide>
      <label style={label}>The problem, in one line</label>
      <input style={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Dispatches slip because the packing list is made after the truck arrives" autoFocus />
      <label style={{ ...label, marginTop: 12 }}>Description — what happens, where, how often; pictures paste in</label>
      <RichField value={f.description} onChange={(h) => setF({ ...f, description: h })} minHeight={200} />
      <label style={{ ...label, marginTop: 12 }}>Tentative date — when we expect to apply the solution</label>
      <input type="date" style={{ ...input, width: 200 }} value={f.tentative_on} onChange={(e) => setF({ ...f, tentative_on: e.target.value })} />
      <Err e={err} />
      <div className="flex gap-2 mt-3"><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Save"}</button><button onClick={() => onDone()} style={btn("ghost")}>Cancel</button></div>
    </Lightbox>
  );
}

function View({ boot, id, back }: { boot: Boot | null; id: string; back: () => void }) {
  const [d, setD] = useState<Full | null>(null);
  const [edit, setEdit] = useState(false); const [sol, setSol] = useState(""); const [editSol, setEditSol] = useState<{ id: string; body: string } | null>(null);
  const [text, setText] = useState(""); const [genie, setGenie] = useState(false);
  const load = () => api<Full>(`/api/lc/problems?id=${id}`).then(setD).catch((e) => alert(String(e.message || e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Empty>Opening…</Empty>;
  const p = d.problem; const st = STATUS[p.status] || STATUS.new;
  const react = async (kind: "problem" | "solution", rid: string, value: string) => { await api("/api/lc/problems", { action: "react", kind, id: rid, value }); load(); };
  const setStatus = async (status: string) => { await api("/api/lc/problems", { action: "status", id, status }); load(); };
  const addSol = async () => { if (!sol.replace(/<[^>]+>/g, "").trim()) return; await api("/api/lc/problems", { action: "solution", id, body: sol }); setSol(""); load(); };
  const saveSol = async () => { if (!editSol) return; await api("/api/lc/problems", { action: "edit_solution", solution_id: editSol.id, body: editSol.body }); setEditSol(null); load(); };
  const comment = async () => { if (!text.trim()) return; await api("/api/lc/problems", { action: "comment", id, body: text }); setText(""); load(); };
  const summarise = async () => { setGenie(true); try { await api("/api/lc/genie", { action: "summarise_problem", id }); load(); } catch (e) { alert(String((e as Error).message)); } setGenie(false); };
  const remove = async () => { if (!confirm("Remove this problem, its solutions and discussion?")) return; await api("/api/lc/problems", { action: "remove", id }); back(); };
  return (
    <div className="grid gap-3">
      <button onClick={back} className="text-left font-bold" style={{ color: ORANGE, fontSize: 13 }}>← Solution Board</button>
      <Card accent={leaderOf(boot, p.added_by).colour}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded px-2 font-bold" style={{ fontSize: 11, background: st.bg, color: st.colour }}>{st.label}</span>
              {p.tentative_on && <span className="text-xs" style={{ color: MUTED }}>tentative {dmy(p.tentative_on)}</span>}
              {p.closed_at && <span className="text-xs" style={{ color: MUTED }}>closed {dmy(p.closed_at)}</span>}
            </div>
            <div className="font-bold mt-1" style={{ fontSize: 20, color: NAVY, lineHeight: 1.3 }}>{p.title}</div>
            <div className="text-xs mt-1 flex items-center gap-1" style={{ color: MUTED }}>Raised by <Who boot={boot} email={p.added_by} size={18} /> · {dmyt(p.created_at)}</div>
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <Thumbs up={p.up.length} down={p.down.length} question={p.question.length} mine={p.mine} onReact={(v) => react("problem", id, v)} />
            {p.mayEdit && <select style={{ ...input, width: "auto", padding: "5px 8px", fontSize: 12 }} value={p.status} onChange={(e) => setStatus(e.target.value)}>{ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select>}
            {p.mayEdit && <button onClick={summarise} disabled={genie} style={btn("primary", { padding: "6px 12px", fontSize: 12 })} title="Genie summarises every solution and the discussion into the LC Solution">{genie ? "🧞 Summarising…" : "🧞 Genie Summary"}</button>}
            {p.mayEdit && <FileDrop refKind="problem" refId={id} onDone={load} label="📎" />}
            {p.mayEdit && <button onClick={() => setEdit(true)} style={btn("soft", { padding: "6px 12px", fontSize: 12 })}>Edit</button>}
            {p.mayEdit && <button onClick={remove} style={btn("ghost", { padding: "6px 10px", fontSize: 12, color: MUTED })}>Remove</button>}
          </div>
        </div>
        {(p.up.length + p.down.length + p.question.length) > 0 && (
          <div className="text-xs mt-2 grid gap-0.5" style={{ color: MUTED }}>
            {p.up.length > 0 && <div>👍 <Names boot={boot} emails={p.up} /></div>}
            {p.down.length > 0 && <div>👎 <Names boot={boot} emails={p.down} /></div>}
            {p.question.length > 0 && <div>❓ needs clarity — <Names boot={boot} emails={p.question} /></div>}
          </div>
        )}
      </Card>
      <div className="grid gap-3 lc-two" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(300px, 1fr)" }}>
        <div className="grid gap-3" style={{ alignContent: "start" }}>
          <Card title="Description">{p.description ? <Rich html={p.description} /> : <span className="text-sm" style={{ color: MUTED }}>No description.</span>}{d.files.length > 0 && <div className="mt-2"><Files files={d.files} boot={boot} mayRemove={p.mayEdit} onChange={load} compact /></div>}</Card>
          <Card title="LC Solution — Genie's summary" accent="var(--accent)">{p.lc_summary ? <Rich html={p.lc_summary} /> : <span className="text-sm" style={{ color: MUTED }}>Not summarised yet. Once solutions and discussion are in, {p.mayEdit ? "press Genie Summary" : "the author or Dr Raghu presses Genie Summary"}.</span>}</Card>
          <Card title="Solutions — crowdsourced" right={<span className="text-xs" style={{ color: MUTED }}>{d.solutions.length}</span>}>
            <div className="grid gap-2">
              {d.solutions.map((s) => (
                <div key={s.id} className="rounded-lg p-2.5" style={{ background: "var(--paper)", borderLeft: `5px solid ${leaderOf(boot, s.added_by).colour}` }}>
                  {editSol?.id === s.id ? (
                    <><RichField value={editSol.body} onChange={(h) => setEditSol({ id: s.id, body: h })} minHeight={120} /><div className="flex gap-2 mt-2"><button onClick={saveSol} style={btn("primary", { padding: "5px 12px", fontSize: 12 })}>Save</button><button onClick={() => setEditSol(null)} style={btn("ghost", { padding: "5px 12px", fontSize: 12 })}>Cancel</button></div></>
                  ) : (
                    <>
                      <Rich html={s.body} small />
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs" style={{ color: MUTED }}>
                        <Who boot={boot} email={s.added_by} size={18} /> {dmyt(s.created_at)}
                        <span className="ml-auto flex items-center gap-1.5">
                          <Thumbs up={s.up.length} down={s.down.length} question={s.question.length} mine={s.mine} onReact={(v) => react("solution", s.id, v)} size={11} />
                          {s.mayEdit && <button onClick={() => setEditSol({ id: s.id, body: s.body })} style={{ color: ORANGE, fontWeight: 700 }}>edit</button>}
                          {s.mayEdit && <button onClick={async () => { if (confirm("Remove your solution?")) { await api("/api/lc/problems", { action: "remove_solution", solution_id: s.id }); load(); } }} style={{ color: MUTED }}>remove</button>}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {d.solutions.length === 0 && <span className="text-sm" style={{ color: MUTED }}>No solution proposed yet — add yours.</span>}
            </div>
            <div className="mt-3"><label style={label}>Your solution</label><RichField value={sol} onChange={setSol} minHeight={110} placeholder="What you would do, and why it works…" /><div className="mt-2"><button onClick={addSol} style={btn("primary")}>Add my solution</button></div></div>
          </Card>
        </div>
        <Card title="LC discussion" right={<span className="text-xs" style={{ color: MUTED }}>{d.comments.length}</span>} style={{ alignSelf: "start" }}>
          <div className="grid gap-2" style={{ maxHeight: 520, overflowY: "auto" }}>
            {d.comments.map((c) => (
              <div key={c.id} className="flex gap-2 items-start">
                <Who boot={boot} email={c.added_by} size={24} withName={false} />
                <div className="flex-1 text-sm"><div className="text-xs" style={{ color: MUTED }}><b style={{ color: NAVY }}>{leaderOf(boot, c.added_by).name}</b> · {dmyt(c.created_at)}</div><div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div></div>
              </div>
            ))}
            {d.comments.length === 0 && <span className="text-sm" style={{ color: MUTED }}>Nothing said yet.</span>}
          </div>
          <textarea style={{ ...input, minHeight: 64, marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="A question, a doubt, a push…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") comment(); }} />
          <div className="mt-2"><button onClick={comment} disabled={!text.trim()} style={btn("primary")}>Say it</button></div>
        </Card>
      </div>
      {edit && <Form p={p} onDone={() => { setEdit(false); load(); }} />}
      <style>{`@media (max-width: 900px){ .lc-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
