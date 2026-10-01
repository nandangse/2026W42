"use client";
import { useEffect, useMemo, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, pill, serif, type Boot } from "./shared";

interface Issue { id: string; member_id: string; submitted_at: string; statement: string; efforts: string | null; why_important: string | null; accomplished: string | null; urgency: number | null; related_to: string | null; theme: string | null; status: string; discussed_in: string | null; outcome: string | null }
const STATUS: Record<string, [string, string]> = { open: ["Open", K.ember], discussed: ["Discussed", K.blue], resolved: ["Resolved", K.green], parked: ["Parked", K.muted] };

/** Burning issues: the sounding board, the five questions, the nine themes, and what the room did with each. */
export default function Issues({ boot }: { boot: Boot }) {
  const [d, setD] = useState<{ issues: Issue[]; themes: string[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ statement: "", efforts: "", why_important: "", accomplished: "", urgency: 8, related_to: "" });
  const [filter, setFilter] = useState<{ who: string; theme: string; status: string }>({ who: "", theme: "", status: "" });
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ issues: Issue[]; themes: string[] }>("/api/kindle/issues").then(setD).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const name = (id: string) => boot.members.find((m) => m.id === id)?.short_name || "—";
  const list = useMemo(() => (d?.issues || []).filter((i) => (!filter.who || i.member_id === filter.who) && (!filter.theme || i.theme === filter.theme) && (!filter.status || i.status === filter.status)), [d, filter]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const i of d?.issues || []) if (i.theme) c[i.theme] = (c[i.theme] || 0) + 1; return c; }, [d]);
  const add = async () => { setErr(null); try { await api("/api/kindle/issues", { action: "add", ...f }); setAdding(false); setF({ statement: "", efforts: "", why_important: "", accomplished: "", urgency: 8, related_to: "" }); load(); } catch (e) { setErr(String((e as Error).message || e)); } };
  if (err && !d) return <Card><span style={{ color: K.red }}>{err}</span></Card>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Burning issues</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{d ? `${d.issues.length} entries since 2023 · ${d.issues.filter((i) => i.status === "open").length} open` : ""}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ Raise one"}</button>
      </div>
      {adding && (
        <Card title="Sounding board — the five questions">
          <div style={{ display: "grid", gap: 10 }}>
            <div><label style={label}>The problem, in a sentence or two</label><textarea style={{ ...input, minHeight: 70 }} value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              <div><label style={label}>What have you tried so far?</label><textarea style={{ ...input, minHeight: 60 }} value={f.efforts} onChange={(e) => setF({ ...f, efforts: e.target.value })} /></div>
              <div><label style={label}>Why is this important?</label><textarea style={{ ...input, minHeight: 60 }} value={f.why_important} onChange={(e) => setF({ ...f, why_important: e.target.value })} /></div>
              <div><label style={label}>What gets accomplished if you solve it?</label><textarea style={{ ...input, minHeight: 60 }} value={f.accomplished} onChange={(e) => setF({ ...f, accomplished: e.target.value })} /></div>
              <div><label style={label}>How urgent, 1 to 10 · <b>{f.urgency}</b></label><input type="range" min={1} max={10} value={f.urgency} onChange={(e) => setF({ ...f, urgency: Number(e.target.value) })} style={{ width: "100%", accentColor: K.ember }} /><label style={{ ...label, marginTop: 8 }}>Related to (a goal, a person, a project)</label><input style={input} value={f.related_to} onChange={(e) => setF({ ...f, related_to: e.target.value })} /></div>
            </div>
            {err && <div style={{ color: K.red, fontSize: 13 }}>{err}</div>}
            <div><button onClick={add} style={btn("primary")}>Put it to the room</button></div>
          </div>
        </Card>
      )}
      {d && (
        <Card title="The nine themes" right="from the June 2026 reading of 114 statements">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setFilter({ ...filter, theme: "" })} style={{ ...pill(!filter.theme ? K.charcoal : K.soft, !filter.theme ? "#fff" : K.dim), border: "none", cursor: "pointer", padding: "5px 10px", fontSize: 12 }}>All</button>
            {d.themes.map((t) => <button key={t} onClick={() => setFilter({ ...filter, theme: filter.theme === t ? "" : t })} style={{ ...pill(filter.theme === t ? K.charcoal : K.soft, filter.theme === t ? "#fff" : K.dim), border: "none", cursor: "pointer", padding: "5px 10px", fontSize: 12 }}>{t} {counts[t] ? <span style={{ opacity: 0.7 }}>· {counts[t]}</span> : ""}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <select style={{ ...input, width: "auto" }} value={filter.who} onChange={(e) => setFilter({ ...filter, who: e.target.value })}><option value="">Everyone</option>{boot.members.map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select>
            <select style={{ ...input, width: "auto" }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">Any status</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <span style={{ fontSize: 12, color: K.muted, alignSelf: "center" }}>{list.length} shown</span>
          </div>
        </Card>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((i) => <IssueCard key={i.id} i={i} boot={boot} name={name} themes={d?.themes || []} reload={load} />)}
      </div>
    </div>
  );
}

function IssueCard({ i, boot, name, themes, reload }: { i: Issue; boot: Boot; name: (id: string) => string; themes: string[]; reload: () => void }) {
  const m = boot.members.find((x) => x.id === i.member_id);
  const [open, setOpen] = useState(false);
  const [t, setT] = useState({ theme: i.theme || "", status: i.status, outcome: i.outcome || "", discussed_in: i.discussed_in || "" });
  const triage = async () => { try { await api("/api/kindle/issues", { action: "triage", id: i.id, ...t }); setOpen(false); reload(); } catch (e) { alert(String((e as Error).message || e)); } };
  const held = boot.meetings.filter((x) => x.meeting_on <= boot.today).reverse().slice(0, 24);
  return (
    <Card pad={14}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {m && <Avatar m={m} size={34} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b>{name(i.member_id)}</b><span style={{ fontSize: 12, color: K.muted }}>{dmy(i.submitted_at)}</span>
            {i.urgency != null && <span style={{ fontSize: 12, color: i.urgency >= 9 ? K.red : K.dim }}>urgency {i.urgency}/10</span>}
            <span style={pill(STATUS[i.status]?.[1] || K.muted)}>{STATUS[i.status]?.[0] || i.status}</span>
            {i.theme && <span style={pill(K.soft, K.dim)}>{i.theme}</span>}
          </div>
          <div style={{ fontSize: 15, marginTop: 4, whiteSpace: "pre-wrap" }}>{i.statement}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, marginTop: 8, fontSize: 13 }}>
            {i.efforts && <div><div style={{ fontSize: 10, textTransform: "uppercase", color: K.muted, fontWeight: 700 }}>Tried</div>{i.efforts}</div>}
            {i.why_important && <div><div style={{ fontSize: 10, textTransform: "uppercase", color: K.muted, fontWeight: 700 }}>Why</div>{i.why_important}</div>}
            {i.accomplished && <div><div style={{ fontSize: 10, textTransform: "uppercase", color: K.muted, fontWeight: 700 }}>If solved</div>{i.accomplished}</div>}
            {i.related_to && <div><div style={{ fontSize: 10, textTransform: "uppercase", color: K.muted, fontWeight: 700 }}>Related to</div>{i.related_to}</div>}
          </div>
          {i.outcome && <div style={{ marginTop: 8, fontSize: 13, background: "#e3f3e8", borderRadius: 8, padding: "6px 10px" }}><b>Outcome:</b> {i.outcome}{i.discussed_in ? <span style={{ color: K.muted }}> · discussed {dmy(boot.meetings.find((x) => x.id === i.discussed_in)?.meeting_on)}</span> : ""}</div>}
          {boot.me.admin && (open ? (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, alignItems: "end" }}>
              <div><label style={label}>Theme</label><select style={input} value={t.theme} onChange={(e) => setT({ ...t, theme: e.target.value })}><option value="">—</option>{themes.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label style={label}>Status</label><select style={input} value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label style={label}>Discussed in</label><select style={input} value={t.discussed_in} onChange={(e) => setT({ ...t, discussed_in: e.target.value })}><option value="">—</option>{held.map((x) => <option key={x.id} value={x.id}>{dmy(x.meeting_on)}</option>)}</select></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Outcome</label><textarea style={{ ...input, minHeight: 50 }} value={t.outcome} onChange={(e) => setT({ ...t, outcome: e.target.value })} /></div>
              <div style={{ display: "flex", gap: 6 }}><button onClick={triage} style={btn("primary")}>Save</button><button onClick={() => setOpen(false)} style={btn("ghost")}>Cancel</button></div>
            </div>
          ) : <div style={{ marginTop: 6 }}><button onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 }}>File it →</button></div>)}
        </div>
      </div>
    </Card>
  );
}
