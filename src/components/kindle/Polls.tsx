"use client";
import { useEffect, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, pill, serif, type Boot } from "./shared";

interface Poll { id: string; question: string; options: string[]; multi: boolean; anonymous: boolean; closes_at: string | null; created_by: string | null; created_at: string; counts: number[]; voters: number; mine: number[] | null; closed: boolean; by: { member_id: string; choices: number[] }[] | null }

/** Polls: any member asks; one vote each, changeable until close; the result as bars. */
export default function Polls({ boot }: { boot: Boot }) {
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState(""); const [opts, setOpts] = useState(["", ""]); const [multi, setMulti] = useState(false); const [anon, setAnon] = useState(false); const [closes, setCloses] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ polls: Poll[] }>("/api/kindle/polls").then((r) => setPolls(r.polls)).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const create = async () => {
    setErr(null);
    try { await api("/api/kindle/polls", { action: "create", question: q, options: opts.filter((o) => o.trim()), multi, anonymous: anon, closes_at: closes ? new Date(closes).toISOString() : null }); setAdding(false); setQ(""); setOpts(["", ""]); setMulti(false); setAnon(false); setCloses(""); load(); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };
  const name = (id: string | null) => boot.members.find((m) => m.id === id)?.short_name || boot.members.find((m) => m.id === id)?.name || "—";
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Polls</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>ask the ten; one vote each</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ New poll"}</button>
      </div>
      {adding && (
        <Card title="A new poll">
          <label style={label}>Question</label>
          <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which date for the December off-site?" />
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {opts.map((o, i) => <div key={i} style={{ display: "flex", gap: 6 }}><input style={input} value={o} onChange={(e) => setOpts(opts.map((x, j) => j === i ? e.target.value : x))} placeholder={`Option ${i + 1}`} />{opts.length > 2 && <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} style={btn("ghost", { padding: "6px 9px" })}>✕</button>}</div>)}
            <div><button onClick={() => setOpts([...opts, ""])} style={btn("ghost", { padding: "5px 10px", fontSize: 12 })}>+ option</button></div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 13, alignItems: "center" }}>
            <label><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> more than one answer allowed</label>
            <label><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> anonymous</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>closes <input type="datetime-local" style={{ ...input, width: 200 }} value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
          </div>
          {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 10 }}><button onClick={create} style={btn("primary")}>Ask</button></div>
        </Card>
      )}
      {!polls ? <Card><span style={{ color: K.muted }}>Loading…</span></Card> : polls.length === 0 ? <Card><span style={{ color: K.muted }}>No polls yet. Ask the first one.</span></Card> :
        polls.map((p) => <PollCard key={p.id} p={p} boot={boot} reload={load} name={name} />)}
    </div>
  );
}

function PollCard({ p, boot, reload, name }: { p: Poll; boot: Boot; reload: () => void; name: (id: string | null) => string }) {
  const [sel, setSel] = useState<number[]>(p.mine || []);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSel(p.mine || []), [p.mine]);
  const total = Math.max(1, ...p.counts);
  const mayManage = boot.me.admin || p.created_by === boot.me.id;
  const vote = async () => { setBusy(true); try { await api("/api/kindle/polls", { action: "vote", poll_id: p.id, choices: sel }); reload(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(false); };
  const toggle = (i: number) => setSel(p.multi ? (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]) : [i]);
  const showResult = p.closed || p.mine;
  return (
    <Card title={p.question} right={<span>{p.anonymous ? "anonymous · " : ""}{p.voters} of {boot.members.filter((m) => m.active).length} voted{p.closes_at ? ` · ${p.closed ? "closed" : "closes"} ${dmy(p.closes_at)}` : ""}</span>}>
      <div style={{ display: "grid", gap: 8 }}>
        {p.options.map((o, i) => {
          const n = p.counts[i] || 0; const on = sel.includes(i);
          return (
            <button key={i} disabled={p.closed} onClick={() => toggle(i)} style={{ position: "relative", textAlign: "left", border: `1px solid ${on ? K.ember : K.line}`, background: "#fff", borderRadius: 10, padding: "10px 12px", cursor: p.closed ? "default" : "pointer", overflow: "hidden" }}>
              {showResult && <div style={{ position: "absolute", inset: 0, width: `${Math.round((n / total) * 100)}%`, background: on ? "#fde7cf" : K.soft, zIndex: 0 }} />}
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
                <span>{!p.closed && <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: p.multi ? 4 : 7, border: `2px solid ${on ? K.ember : K.muted}`, background: on ? K.ember : "transparent", marginRight: 8, verticalAlign: -2 }} />}{o}</span>
                {showResult && <span style={{ fontWeight: 700, color: K.dim }}>{n}</span>}
              </div>
              {showResult && p.by && n > 0 && <div style={{ position: "relative", marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>{p.by.filter((v) => v.choices.includes(i)).map((v) => <span key={v.member_id} style={pill(K.soft, K.dim)}>{name(v.member_id)}</span>)}</div>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!p.closed && <button onClick={vote} disabled={busy || !sel.length} style={btn("primary")}>{p.mine ? "Change my vote" : "Vote"}</button>}
        {!p.closed && !p.mine && <span style={{ fontSize: 12, color: K.muted }}>Results show after you vote.</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: K.muted }}>asked by {name(p.created_by)} · {dmy(p.created_at)}</span>
        {mayManage && !p.closed && <button onClick={async () => { await api("/api/kindle/polls", { action: "close", poll_id: p.id }); reload(); }} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>Close</button>}
        {mayManage && <button onClick={async () => { if (!confirm("Remove this poll?")) return; try { await api("/api/kindle/polls", { action: "remove", poll_id: p.id }); reload(); } catch (e) { alert(String((e as Error).message || e)); } }} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>Remove</button>}
      </div>
      {p.closed && p.voters > 0 && <div style={{ marginTop: 8, fontSize: 12, color: K.dim, display: "flex", gap: 6, alignItems: "center" }}><Avatar m={{ name: "✓", photo_path: null }} size={0} />Final.</div>}
    </Card>
  );
}
