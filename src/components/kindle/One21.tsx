"use client";
import { useEffect, useMemo, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, monthYear, pill, serif, type Boot } from "./shared";

interface Row { id: string; period: string; member_a: string; member_b: string; planned: boolean; done_on: string | null; mode: string | null; note_a: string | null; note_b: string | null; created_at: string }

/** 1-2-1s: the year's pairing plan month by month, who is still owed, and each meeting marked done with a note from both sides. */
export default function One21({ boot }: { boot: Boot }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = () => api<{ rows: Row[] }>("/api/kindle/one21").then((r) => setRows(r.rows)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const thisPeriod = (boot.next?.meeting_on || boot.today).slice(0, 7) + "-01";
  const [period, setPeriod] = useState(thisPeriod);
  const [adding, setAdding] = useState(false); const [other, setOther] = useState(""); const [note, setNote] = useState(""); const [mode, setMode] = useState("in_person"); const [on, setOn] = useState(boot.today);
  const periods = useMemo(() => { const s = new Set<string>((rows || []).map((r) => r.period)); s.add(thisPeriod); return [...s].sort().reverse(); }, [rows, thisPeriod]);
  const members = boot.members.filter((m) => m.active);
  const name = (id: string) => members.find((m) => m.id === id)?.short_name || boot.members.find((m) => m.id === id)?.short_name || "—";
  const inMonth = (rows || []).filter((r) => r.period === period);
  const mine = inMonth.filter((r) => r.member_a === boot.me.id || r.member_b === boot.me.id);
  const owed = mine.filter((r) => r.planned && !r.done_on);
  const markDone = async () => { try { await api("/api/kindle/one21", { action: "done", period, other_id: other, done_on: on, mode, note }); setAdding(false); setNote(""); setOther(""); load(); } catch (e) { alert(String((e as Error).message || e)); } };
  const tally = useMemo(() => { const t: Record<string, { done: number; planned: number }> = {}; for (const m of members) t[m.id] = { done: 0, planned: 0 }; for (const r of rows || []) { if (!r.period.startsWith(String(new Date().getFullYear()))) continue; for (const id of [r.member_a, r.member_b]) { if (!t[id]) continue; if (r.planned) t[id].planned++; if (r.done_on) t[id].done++; } } return t; }, [rows, members]);
  if (!rows) return <Card><span style={{ color: K.muted }}>Loading…</span></Card>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>1-2-1s</h1>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 13 }}>{periods.map((p) => <option key={p} value={p}>{monthYear(p)}{p === thisPeriod ? " · this month" : ""}</option>)}</select>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "I did a 1-2-1"}</button>
      </div>
      {owed.length > 0 && <div style={{ background: "#fde7cf", borderRadius: 10, padding: "8px 12px", fontSize: 13 }}>Owed this month: <b>{owed.map((r) => name(r.member_a === boot.me.id ? r.member_b : r.member_a)).join(", ")}</b>. The constitution's fine for a missed 1-2-1 is ₹5,000 (4.24).</div>}
      {adding && (
        <Card title={`Mark a 1-2-1 done · ${monthYear(period)}`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div><label style={label}>With</label><select style={input} value={other} onChange={(e) => setOther(e.target.value)}><option value="">—</option>{members.filter((m) => m.id !== boot.me.id).map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select></div>
            <div><label style={label}>On</label><input style={input} type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
            <div><label style={label}>How</label><select style={input} value={mode} onChange={(e) => setMode(e.target.value)}><option value="in_person">In person</option><option value="video">Video</option><option value="call">Call</option></select></div>
          </div>
          <label style={{ ...label, marginTop: 10 }}>What did you commit? What did you gain?</label>
          <textarea style={{ ...input, minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ marginTop: 10 }}><button onClick={markDone} disabled={!other} style={btn("primary")}>Mark done</button></div>
        </Card>
      )}
      <Card title={`${monthYear(period)} — the pairs`} right={`${inMonth.filter((r) => r.done_on).length} done of ${inMonth.length}`}>
        <div style={{ display: "grid", gap: 6 }}>
          {inMonth.length === 0 && <span style={{ color: K.muted, fontSize: 13 }}>No pairs planned for this month.</span>}
          {inMonth.sort((a, b) => Number(!!a.done_on) - Number(!!b.done_on)).map((r) => <PairRow key={r.id} r={r} boot={boot} name={name} reload={load} />)}
        </div>
      </Card>
      <Card title={`The year ${new Date().getFullYear()}`} right="done / planned">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {members.map((m) => { const t = tally[m.id]; return <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: K.soft, borderRadius: 10, padding: 8 }}><Avatar m={m} size={30} /><div><div style={{ fontWeight: 700, fontSize: 13 }}>{m.short_name || m.name}</div><div style={{ fontSize: 12, color: t && t.done >= t.planned ? K.green : K.ember }}>{t?.done ?? 0} / {t?.planned ?? 0}</div></div></div>; })}
        </div>
      </Card>
    </div>
  );
}

function PairRow({ r, boot, name, reload }: { r: Row; boot: Boot; name: (id: string) => string; reload: () => void }) {
  const me = r.member_a === boot.me.id ? "a" : r.member_b === boot.me.id ? "b" : null;
  const [note, setNote] = useState(me === "a" ? r.note_a || "" : me === "b" ? r.note_b || "" : "");
  const [open, setOpen] = useState(false);
  const mA = boot.members.find((m) => m.id === r.member_a), mB = boot.members.find((m) => m.id === r.member_b);
  const save = async (undo = false) => { await api("/api/kindle/one21", { action: "done", id: r.id, note, mode: r.mode || "in_person", done_on: r.done_on || boot.today, undo }); setOpen(false); reload(); };
  return (
    <div style={{ borderTop: `1px solid ${K.soft}`, padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {mA && <Avatar m={mA} size={28} />}<b style={{ fontSize: 14 }}>{name(r.member_a)}</b><span style={{ color: K.muted }}>+</span>{mB && <Avatar m={mB} size={28} />}<b style={{ fontSize: 14 }}>{name(r.member_b)}</b>
        <span style={pill(r.done_on ? K.green : r.planned ? K.ember : K.muted)}>{r.done_on ? `done ${dmy(r.done_on)}` : r.planned ? "owed" : "—"}</span>
        {r.mode && <span style={{ fontSize: 11, color: K.muted }}>{r.mode.replace("_", " ")}</span>}
        <div style={{ flex: 1 }} />
        {me && <button onClick={() => setOpen(!open)} style={{ ...btn("ghost", { padding: "4px 10px", fontSize: 12 }) }}>{r.done_on ? "My note" : "Mark done"}</button>}
        {boot.me.admin && !me && <button onClick={async () => { if (confirm("Remove this pair?")) { await api("/api/kindle/one21", { action: "remove", id: r.id }); reload(); } }} style={{ ...btn("ghost", { padding: "4px 10px", fontSize: 12 }) }}>Remove</button>}
      </div>
      {(r.note_a || r.note_b) && !open && <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 13 }}>{r.note_a && <div><span style={{ color: K.muted }}>{name(r.member_a)}:</span> {r.note_a}</div>}{r.note_b && <div><span style={{ color: K.muted }}>{name(r.member_b)}:</span> {r.note_b}</div>}</div>}
      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea style={{ ...input, minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you commit? What did you gain?" />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}><button onClick={() => save()} style={btn("primary")}>{r.done_on ? "Save note" : "Mark done"}</button>{r.done_on && <button onClick={() => save(true)} style={btn("ghost")}>Undo done</button>}<button onClick={() => setOpen(false)} style={btn("ghost")}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
