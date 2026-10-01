"use client";
import { useEffect, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, Markdown, pill, serif, type Boot } from "./shared";

interface Q { id: string; label: string; help: string | null; rows: number }
interface Ex { id: string; title: string; intro: string | null; questions: Q[]; created_by: string | null; open: boolean; due_on: string | null; created_at: string; answered?: number; mine?: boolean }
interface Ans { member_id: string; answers: Record<string, string>; private: boolean; submitted_at: string }

/** Exercises: a member writes one; the others take it; answers per person, private if the writer of the answer wants. */
export default function Exercises({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [list, setList] = useState<Ex[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(""); const [intro, setIntro] = useState(""); const [due, setDue] = useState(""); const [qs, setQs] = useState<{ label: string; help: string }[]>([{ label: "", help: "" }, { label: "", help: "" }, { label: "", help: "" }]);
  const load = () => api<{ exercises: Ex[] }>("/api/kindle/exercises").then((r) => setList(r.exercises)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const name = (id: string | null) => boot.members.find((m) => m.id === id)?.short_name || "—";
  const create = async () => { try { const r = await api<{ id: string }>("/api/kindle/exercises", { action: "create", title, intro, due_on: due || null, questions: qs.filter((q) => q.label.trim()) }); setAdding(false); setTitle(""); setIntro(""); setQs([{ label: "", help: "" }]); load(); go("exercises", r.id); } catch (e) { alert(String((e as Error).message || e)); } };
  if (arg) return <ExerciseView boot={boot} id={arg} back={() => { go("exercises"); load(); }} name={name} />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Exercises</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>written by one of us, taken by the rest</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ Write one"}</button>
      </div>
      {adding && (
        <Card title="A new exercise" right="the off-site pre-work is the model: a few questions, answered in writing before the room">
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}><div><label style={label}>Title</label><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Life Audit, The Council Brief…" /></div><div><label style={label}>Due by</label><input style={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div></div>
          <label style={{ ...label, marginTop: 10 }}>Introduction — how to approach it</label><textarea style={{ ...input, minHeight: 60 }} value={intro} onChange={(e) => setIntro(e.target.value)} />
          <label style={{ ...label, marginTop: 10 }}>Questions</label>
          <div style={{ display: "grid", gap: 8 }}>{qs.map((q, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}><input style={input} value={q.label} placeholder={`Question ${i + 1}`} onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /><input style={input} value={q.help} placeholder="A line of help (optional)" onChange={(e) => setQs(qs.map((x, j) => j === i ? { ...x, help: e.target.value } : x))} /><button onClick={() => setQs(qs.filter((_, j) => j !== i))} style={btn("ghost", { padding: "6px 9px" })}>✕</button></div>)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={() => setQs([...qs, { label: "", help: "" }])} style={btn("ghost")}>+ question</button><button onClick={create} style={btn("primary")}>Publish to the group</button></div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {list?.map((e) => (
          <button key={e.id} onClick={() => go("exercises", e.id)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 14, cursor: "pointer" }}>
            <div style={{ ...serif, fontSize: 17 }}>{e.title}</div>
            <div style={{ fontSize: 12, color: K.muted, marginTop: 2 }}>by {name(e.created_by)} · {dmy(e.created_at)}{e.due_on ? ` · due ${dmy(e.due_on)}` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><span style={pill(K.soft, K.dim)}>{(e.questions || []).length} questions</span><span style={pill(K.soft, K.dim)}>{e.answered} answered</span>{e.mine && <span style={pill(K.green)}>done</span>}{!e.open && <span style={pill(K.muted)}>closed</span>}</div>
          </button>
        ))}
        {list && list.length === 0 && <Card><span style={{ color: K.muted }}>None yet. The off-site pre-work (the Life Audit, the Sealed Letter, the Council Brief) would make a fine first three.</span></Card>}
      </div>
    </div>
  );
}

function ExerciseView({ boot, id, back, name }: { boot: Boot; id: string; back: () => void; name: (id: string | null) => string }) {
  const [d, setD] = useState<{ exercise: Ex; answers: Ans[]; mine: Ans | null } | null>(null);
  const [a, setA] = useState<Record<string, string>>({}); const [priv, setPriv] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [show, setShow] = useState<string | null>(null);
  const load = () => api<{ exercise: Ex; answers: Ans[]; mine: Ans | null }>(`/api/kindle/exercises?id=${id}`).then((r) => { setD(r); if (r.mine) { setA(r.mine.answers || {}); setPriv(r.mine.private); } });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { setBusy(true); setMsg(null); try { await api("/api/kindle/exercises", { action: "answer", id, answers: a, private: priv }); setMsg("Saved."); load(); } catch (e) { setMsg(String((e as Error).message || e)); } setBusy(false); };
  if (!d) return <Card><span style={{ color: K.muted }}>Loading…</span></Card>;
  const ex = d.exercise; const owner = ex.created_by === boot.me.id || boot.me.admin;
  const others = d.answers.filter((x) => x.member_id !== boot.me.id);
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 900 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← Exercises</button>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ ...serif, fontSize: 24, margin: 0 }}>{ex.title}</h1>
          <span style={{ fontSize: 12, color: K.muted }}>by {name(ex.created_by)}{ex.due_on ? ` · due ${dmy(ex.due_on)}` : ""} · {d.answers.length} answered</span>
          <div style={{ flex: 1 }} />
          {owner && <><button onClick={async () => { await api("/api/kindle/exercises", { action: "edit", id, open: !ex.open }); load(); }} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>{ex.open ? "Close" : "Reopen"}</button><button onClick={async () => { if (confirm("Remove the exercise and every answer?")) { await api("/api/kindle/exercises", { action: "remove", id }); back(); } }} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>Remove</button></>}
        </div>
        {ex.intro && <div style={{ marginTop: 8 }}><Markdown text={ex.intro} small /></div>}
      </Card>
      <Card title={d.mine ? "My answers" : "Take it"} right={d.mine ? `saved ${dmy(d.mine.submitted_at)}` : ex.open ? "in your own words, in your own time" : "closed"}>
        <div style={{ display: "grid", gap: 12 }}>
          {ex.questions.map((q, i) => <div key={q.id}><label style={label}>{i + 1}. {q.label}</label>{q.help && <div style={{ fontSize: 11, color: K.muted, marginBottom: 4 }}>{q.help}</div>}<textarea disabled={!ex.open} style={{ ...input, minHeight: (q.rows || 4) * 22 }} value={a[q.id] || ""} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} /></div>)}
        </div>
        {ex.open && <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : d.mine ? "Update" : "Submit"}</button><label style={{ fontSize: 13 }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> keep mine private (the author and facilitator still see it)</label>{msg && <span style={{ fontSize: 13, color: msg === "Saved." ? K.green : K.red }}>{msg}</span>}</div>}
      </Card>
      {others.length > 0 && (
        <Card title="The others" right={d.mine ? undefined : "answer first, then read"}>
          {!d.mine && !owner ? <span style={{ color: K.muted, fontSize: 13 }}>{others.length} have answered. Yours first.</span> : (
            <div style={{ display: "grid", gap: 8 }}>
              {others.map((x) => { const m = boot.members.find((y) => y.id === x.member_id); const on = show === x.member_id; return (
                <div key={x.member_id} style={{ border: `1px solid ${K.line}`, borderRadius: 10, padding: 10 }}>
                  <button onClick={() => setShow(on ? null : x.member_id)} style={{ display: "flex", gap: 8, alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>{m && <Avatar m={m} size={28} />}<b style={{ fontSize: 14 }}>{m?.short_name || "—"}</b><span style={{ fontSize: 12, color: K.muted }}>{dmy(x.submitted_at)}{x.private ? " · private" : ""}</span><span style={{ marginLeft: "auto", fontSize: 12, color: K.emberDark, fontWeight: 700 }}>{on ? "hide" : "read"}</span></button>
                  {on && <div style={{ marginTop: 8, display: "grid", gap: 8 }}>{ex.questions.map((q, i) => x.answers[q.id] ? <div key={q.id}><div style={{ fontSize: 11, color: K.muted, fontWeight: 700 }}>{i + 1}. {q.label}</div><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{x.answers[q.id]}</div></div> : null)}</div>}
                </div>); })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
