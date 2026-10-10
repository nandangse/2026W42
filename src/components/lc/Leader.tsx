"use client";
/**
 * A LEADER'S PAGE (Dr Raghu, 10 Oct 2026: "make these clickable and open up
 * each leader's page showing his or her participation"). Everything one
 * member has put into the council: what they wrote and raised, the solutions
 * and comments, presentations, the minutes they attended or wrote, the KPIs
 * on their name and the figures they entered, the thumbs they gave, what
 * they opened, and whether they answered each health-check round — never
 * what they answered.
 */
import { useEffect, useState } from "react";
import { api, Card, Empty, MUTED, NAVY, ORANGE, dmy, leaderOf, type Boot, type Leader as L } from "./shared";

interface D {
  leader: L;
  ssc: { id: string; kind: string; title: string; created_at: string }[];
  problems: { id: string; title: string; status: string; created_at: string }[];
  solutions: { id: string; problem_id: string; created_at: string; problem: { id: string; title: string; status: string } | null }[];
  comments: { id: string; ref_kind: string; ref_id: string; body: string; created_at: string; problem: { id: string; title: string } | null }[];
  presentations: { id: string; topic: string | null; presenter: string | null; presented_on: string | null; added_by: string | null }[];
  meetings: { attended: { id: string; held_on: string; wrote: boolean }[]; total: number };
  sections: { id: string; kind: string; title: string; approved_by: string | null }[];
  knowledge: { id: string; title: string }[];
  kpis: { id: string; name: string; group: string | null; entered: number }[];
  valuesEntered: number;
  reactions: { up: number; down: number; question: number };
  views: number;
  health: { label: string; open: boolean; answered: boolean }[];
}
const STATUS: Record<string, string> = { new: "New", under_process: "Under process", needs_deep_dive: "Needs deep dive", deployed: "Deployed", cancelled: "Cancelled" };
const KIND: Record<string, string> = { start: "Start", stop: "Stop", continue: "Continue" };

export default function Leader({ boot, email, go }: { boot: Boot | null; email: string; go: (k: string, a?: string | null) => void }) {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(null); api<D>(`/api/lc/leader?email=${encodeURIComponent(email)}`).then(setD).catch((e) => setErr(String(e.message || e))); }, [email]);
  if (err) return <Empty>{err}</Empty>;
  if (!d) return <Empty>Opening…</Empty>;
  const l = d.leader;
  const Tile = ({ n, t }: { n: number; t: string }) => <div className="rounded-lg bg-white px-3 py-2" style={{ border: "1px solid var(--line)", borderTop: `4px solid ${l.colour}`, minWidth: 96 }}><div className="font-bold tnum" style={{ fontSize: 22, color: NAVY, lineHeight: 1.1 }}>{n}</div><div className="text-xs" style={{ color: MUTED }}>{t}</div></div>;
  const Link = ({ room, arg, children }: { room: string; arg?: string; children: React.ReactNode }) => <button onClick={() => go(room, arg)} className="text-left font-semibold" style={{ color: NAVY, fontSize: 13 }}>{children}</button>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 flex-wrap rounded-lg p-4" style={{ background: "#fff", border: "1px solid var(--line)", borderLeft: `8px solid ${l.colour}` }}>
        <span className="rounded-full font-bold inline-flex items-center justify-center" style={{ width: 56, height: 56, fontSize: 20, background: l.colour, color: "#fff" }}>{l.initials}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold" style={{ fontSize: 22, color: NAVY }}>{l.name}{l.isOwner && <span className="ml-2 rounded px-1.5 font-bold" style={{ fontSize: 10, background: "#FFF1E8", color: ORANGE, verticalAlign: "middle" }}>OWNER</span>}</div>
          <div className="text-sm" style={{ color: "var(--dim)" }}>{l.email} · the council's {l.colour} on every board</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {boot?.members.map((m) => <button key={m.email} onClick={() => go("leader", m.email)} className="rounded-full font-bold inline-flex items-center justify-center" style={{ width: 28, height: 28, fontSize: 10, background: m.colour, color: "#fff", opacity: m.email === l.email ? 1 : 0.45, outline: m.email === l.email ? `2px solid ${NAVY}` : "none" }} title={m.name}>{m.initials}</button>)}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Tile n={d.ssc.length} t="Start · Stop · Continue cards" />
        <Tile n={d.problems.length} t="problems raised" />
        <Tile n={d.solutions.length} t="solutions proposed" />
        <Tile n={d.comments.length} t="comments" />
        <Tile n={d.presentations.length} t="presentations" />
        <Tile n={d.meetings.attended.length} t={`of ${d.meetings.total} meetings`} />
        <Tile n={d.sections.length} t="principles & pages written" />
        <Tile n={d.kpis.length} t="KPIs on their name" />
        <Tile n={d.valuesEntered} t="KPI figures entered" />
        <Tile n={d.reactions.up + d.reactions.down + d.reactions.question} t={`reactions — 👍 ${d.reactions.up} · 👎 ${d.reactions.down} · ❓ ${d.reactions.question}`} />
        <Tile n={d.views} t="things opened" />
      </div>
      <div className="grid gap-3 lc-two" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <Card title="Start · Stop · Continue" right={<span className="text-xs" style={{ color: MUTED }}>{d.ssc.length}</span>}>
          {d.ssc.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>Nothing on the board yet.</span> : <div className="grid gap-1">{d.ssc.map((c) => <div key={c.id} className="text-sm"><span className="rounded px-1.5 font-bold mr-1" style={{ fontSize: 10, background: "var(--paper)", color: NAVY }}>{KIND[c.kind]}</span><Link room="ssc">{c.title}</Link> <span className="text-xs" style={{ color: MUTED }}>{dmy(c.created_at)}</span></div>)}</div>}
        </Card>
        <Card title="Problems raised" right={<span className="text-xs" style={{ color: MUTED }}>{d.problems.length}</span>}>
          {d.problems.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>None raised yet.</span> : <div className="grid gap-1">{d.problems.map((x) => <div key={x.id} className="text-sm"><Link room="solutions" arg={x.id}>{x.title}</Link> <span className="text-xs" style={{ color: MUTED }}>· {STATUS[x.status] || x.status} · {dmy(x.created_at)}</span></div>)}</div>}
        </Card>
        <Card title="Solutions proposed" right={<span className="text-xs" style={{ color: MUTED }}>{d.solutions.length}</span>}>
          {d.solutions.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>No solution proposed yet.</span> : <div className="grid gap-1">{d.solutions.map((x) => <div key={x.id} className="text-sm">on <Link room="solutions" arg={x.problem_id}>{x.problem?.title || "a problem"}</Link> <span className="text-xs" style={{ color: MUTED }}>{dmy(x.created_at)}</span></div>)}</div>}
        </Card>
        <Card title="Comments" right={<span className="text-xs" style={{ color: MUTED }}>{d.comments.length}</span>}>
          {d.comments.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>Nothing said yet.</span> : <div className="grid gap-1.5">{d.comments.slice(0, 20).map((c) => <div key={c.id} className="text-sm"><span style={{ color: "var(--dim)" }}>&ldquo;{c.body.slice(0, 140)}{c.body.length > 140 ? "…" : ""}&rdquo;</span> <span className="text-xs" style={{ color: MUTED }}>— {c.ref_kind === "problem" && c.problem ? <Link room="solutions" arg={c.ref_id}>{c.problem.title}</Link> : c.ref_kind === "meeting" ? <Link room="meetings" arg={c.ref_id}>minutes</Link> : c.ref_kind} · {dmy(c.created_at)}</span></div>)}</div>}
        </Card>
        <Card title="Presentations" right={<span className="text-xs" style={{ color: MUTED }}>{d.presentations.length}</span>}>
          {d.presentations.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>None yet.</span> : <div className="grid gap-1">{d.presentations.map((x) => <div key={x.id} className="text-sm"><Link room="presentations" arg={x.id}>{x.topic || "Topic to come"}</Link> <span className="text-xs" style={{ color: MUTED }}>· {x.added_by?.toLowerCase() === l.email ? "added" : "presented"}{x.presented_on ? ` · ${dmy(x.presented_on)}` : ""}</span></div>)}</div>}
        </Card>
        <Card title="Meetings" right={<span className="text-xs" style={{ color: MUTED }}>{d.meetings.attended.length} of {d.meetings.total}</span>}>
          {d.meetings.attended.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>Not on any attendance yet.</span> : <div className="flex gap-1.5 flex-wrap">{d.meetings.attended.map((m) => <button key={m.id} onClick={() => go("meetings", m.id)} className="rounded px-2 py-0.5 font-semibold" style={{ fontSize: 12, background: m.wrote ? l.colour : "var(--paper)", color: m.wrote ? "#fff" : NAVY }} title={m.wrote ? "Wrote the minutes" : "Attended"}>{dmy(m.held_on)}{m.wrote ? " ✎" : ""}</button>)}</div>}
        </Card>
        <Card title="Principles & pages written" right={<span className="text-xs" style={{ color: MUTED }}>{d.sections.length}</span>}>
          {d.sections.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>None written yet.</span> : <div className="grid gap-1">{d.sections.map((x) => <div key={x.id} className="text-sm"><Link room={x.kind}>{x.title}</Link> <span className="text-xs" style={{ color: x.approved_by ? "var(--green)" : "#B45309" }}>{x.approved_by ? "✓ approved" : "awaiting approval"}</span></div>)}</div>}
          {d.knowledge.length > 0 && <div className="text-xs mt-2" style={{ color: MUTED }}>Knowledge added: {d.knowledge.length}</div>}
        </Card>
        <Card title="KPIs on their name" right={<span className="text-xs" style={{ color: MUTED }}>{d.kpis.length}</span>}>
          {d.kpis.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>No KPI assigned yet.</span> : <div className="grid gap-1">{d.kpis.map((k) => <div key={k.id} className="text-sm"><Link room="kpis">{k.name}</Link> <span className="text-xs" style={{ color: MUTED }}>· {k.group || "—"} · {k.entered} figure{k.entered === 1 ? "" : "s"} entered by them</span></div>)}</div>}
        </Card>
        <Card title="Health Check">
          {d.health.length === 0 ? <span className="text-sm" style={{ color: MUTED }}>No round yet.</span> : <div className="grid gap-1">{d.health.map((h) => <div key={h.label} className="text-sm flex items-center gap-2"><span style={{ color: NAVY }}>{h.label}</span><span className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: h.answered ? "#E3F3E8" : "#FFF7E6", color: h.answered ? "var(--green)" : "#B45309" }}>{h.answered ? "answered" : h.open ? "not yet" : "did not answer"}</span></div>)}</div>}
          <div className="text-xs mt-2" style={{ color: MUTED }}>Only whether a round was answered — never what was ticked.</div>
        </Card>
      </div>
      <style>{`@media (max-width: 900px){ .lc-two { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
