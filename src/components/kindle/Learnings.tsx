"use client";
import { useEffect, useMemo, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, monthYear, serif, type Boot } from "./shared";

interface Learning { id: string; member_id: string; noted_on: string; body: string; checkin_id: string | null; created_at: string; period: string | null }

/**
 * Learnings (Kindle 1.5.0): what each of us took away, month by month —
 * every "inspiration and learning" written in a check-in since 2023, and
 * anything noted here between meetings. By person, by year, searchable.
 */
export default function Learnings({ boot, go }: { boot: Boot; go: (k: string, a?: string | null) => void }) {
  const [rows, setRows] = useState<Learning[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Learning | null>(null); const [editText, setEditText] = useState("");
  const load = () => api<{ learnings: Learning[] }>("/api/kindle/learnings").then((r) => { setRows(r.learnings); setErr(null); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const member = (id: string) => boot.members.find((m) => m.id === id);
  const name = (id: string) => member(id)?.short_name || member(id)?.name || "—";
  const monthOf = (r: Learning) => (r.period || r.noted_on).slice(0, 7) + "-01";

  const years = useMemo(() => Array.from(new Set((rows || []).map((r) => monthOf(r).slice(0, 4)))).sort().reverse(), [rows]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows || []) if (year === "all" || monthOf(r).startsWith(year)) c[r.member_id] = (c[r.member_id] || 0) + 1; return c; }, [rows, year]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter((r) => (who === "all" || r.member_id === who) && (year === "all" || monthOf(r).startsWith(year)) && (!needle || r.body.toLowerCase().includes(needle) || name(r.member_id).toLowerCase().includes(needle)));
  }, [rows, who, year, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const byMonth = useMemo(() => { const g: { month: string; items: Learning[] }[] = []; for (const r of shown) { const m = monthOf(r); const last = g[g.length - 1]; if (last && last.month === m) last.items.push(r); else g.push({ month: m, items: [r] }); } return g; }, [shown]);

  const add = async () => { setBusy(true); try { await api("/api/kindle/learnings", { action: "add", body }); setBody(""); setAdding(false); load(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(false); };
  const saveEdit = async () => { if (!editing) return; setBusy(true); try { await api("/api/kindle/learnings", { action: "edit", id: editing.id, body: editText }); setEditing(null); load(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(false); };
  const remove = async (r: Learning) => { if (!confirm("Remove this learning?")) return; try { await api("/api/kindle/learnings", { action: "remove", id: r.id }); load(); } catch (e) { alert(String((e as Error).message || e)); } };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Learnings</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>what we took away, month by month</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ A learning"}</button>
      </div>
      {adding && (
        <Card title="A learning, between meetings">
          <label style={label}>What did you learn, and from what?</label>
          <textarea style={{ ...input, minHeight: 90 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="A book, a conversation, a mistake, a customer…" />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <button onClick={add} disabled={busy || body.trim().length < 3} style={btn("primary")}>{busy ? "Saving…" : "Keep it"}</button>
            <span style={{ fontSize: 11, color: K.muted }}>Your monthly check-in's learning lands here on its own.</span>
          </div>
        </Card>
      )}
      <Card pad={12}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setWho("all")} style={chip(who === "all")}>Everyone{rows ? ` · ${Object.values(counts).reduce((a, b) => a + b, 0)}` : ""}</button>
          {boot.members.filter((m) => m.active || counts[m.id]).map((m) => <button key={m.id} onClick={() => setWho(who === m.id ? "all" : m.id)} style={chip(who === m.id)}>{m.short_name || m.name.split(" ")[0]}{counts[m.id] ? ` · ${counts[m.id]}` : ""}</button>)}
          <div style={{ flex: 1 }} />
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 13 }}><option value="all">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...input, width: 180, padding: "6px 10px", fontSize: 13 }} />
        </div>
      </Card>
      {err && <div style={{ color: K.red, fontSize: 13 }}>{err}</div>}
      {!rows ? <div style={{ color: K.muted }}>Loading…</div> : shown.length === 0 ? <Card><div style={{ color: K.muted }}>Nothing here yet{q ? " for that search" : ""}. The learning from each monthly check-in lands here; or note one now.</div></Card> :
        byMonth.map((g) => (
          <div key={g.month}>
            <div style={{ ...serif, fontSize: 17, color: K.emberDark, margin: "6px 0 8px", display: "flex", alignItems: "baseline", gap: 8 }}>{monthYear(g.month)}<span style={{ fontSize: 12, color: K.muted, fontFamily: "inherit" }}>{g.items.length}</span></div>
            <div style={{ display: "grid", gap: 8 }}>
              {g.items.map((r) => { const m = member(r.member_id); const mine = r.member_id === boot.me.id; return (
                <div key={r.id} style={{ display: "flex", gap: 10, background: "#fff", border: `1px solid ${K.line}`, borderRadius: 12, padding: 12 }}>
                  <Avatar m={m || { name: "?", photo_path: null }} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: K.muted }}><b style={{ color: K.ink }}>{name(r.member_id)}</b> · {dmy(r.noted_on)}{r.checkin_id ? <> · from the {monthYear(r.period || r.noted_on)} check-in <button onClick={() => go("checkins", "person")} style={lnk}>→</button></> : " · noted here"}</div>
                    {editing?.id === r.id ? (
                      <div style={{ marginTop: 6 }}>
                        <textarea style={{ ...input, minHeight: 70 }} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}><button onClick={saveEdit} disabled={busy} style={btn("primary", { padding: "5px 10px", fontSize: 12 })}>Save</button><button onClick={() => setEditing(null)} style={btn("ghost", { padding: "5px 10px", fontSize: 12 })}>Cancel</button></div>
                      </div>
                    ) : <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{r.body}</div>}
                    {(mine || boot.me.admin) && editing?.id !== r.id && (
                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        {mine && !r.checkin_id && <button onClick={() => { setEditing(r); setEditText(r.body); }} style={lnk}>Edit</button>}
                        <button onClick={() => remove(r)} style={{ ...lnk, color: K.muted }}>Remove</button>
                      </div>
                    )}
                  </div>
                </div>
              ); })}
            </div>
          </div>
        ))}
    </div>
  );
}
const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? K.charcoal : K.line}`, background: on ? K.charcoal : "#fff", color: on ? "#fff7ea" : K.ink, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" });
const lnk: React.CSSProperties = { background: "none", border: "none", color: K.emberDark, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 };
