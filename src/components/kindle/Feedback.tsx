"use client";
import { useEffect, useState } from "react";
import { api, Avatar, btn, Card, input, K, label, serif, type Boot } from "./shared";

interface Row { member_id: string | null; rating: number; went_well: string | null; improve: string | null; takeaway: string | null; next_topic: string | null; anonymous: boolean; submitted_at: string }

/** The meeting quality check, on each member's phone as the meeting closes. */
export default function Feedback({ boot, meetingId, meetingOn }: { boot: Boot; meetingId: string; meetingOn: string }) {
  const [data, setData] = useState<{ rows: Row[]; avg: number | null; mine: Row | null } | null>(null);
  const [f, setF] = useState({ rating: 8, went_well: "", improve: "", takeaway: "", next_topic: "", anonymous: false });
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<{ rows: Row[]; avg: number | null; mine: Row | null }>(`/api/kindle/feedback?meeting_id=${meetingId}`).then((d) => { setData(d); if (d.mine) setF({ rating: d.mine.rating, went_well: d.mine.went_well || "", improve: d.mine.improve || "", takeaway: d.mine.takeaway || "", next_topic: d.mine.next_topic || "", anonymous: d.mine.anonymous }); }).catch(() => setData({ rows: [], avg: null, mine: null }));
  useEffect(() => { load(); }, [meetingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { setBusy(true); setMsg(null); try { await api("/api/kindle/feedback", { meeting_id: meetingId, ...f }); setMsg("Thank you — noted."); setOpen(false); load(); } catch (e) { setMsg(String((e as Error).message || e)); } setBusy(false); };
  const name = (id: string | null) => id ? (boot.members.find((m) => m.id === id)?.short_name || "—") : "anonymous";
  const isPast = meetingOn <= boot.today;
  const notYet = boot.members.filter((m) => m.active && !(data?.rows || []).some((r) => r.member_id === m.id)).map((m) => m.short_name || m.name);
  return (
    <Card title="Feedback on this meeting" right={data?.avg != null ? <span>average <b style={{ color: K.ink, fontSize: 14 }}>{data.avg}</b> / 10 from {data.rows.length}</span> : "the meeting quality check, item 6.6"}>
      {!isPast && <div style={{ color: K.muted, fontSize: 13 }}>Opens once the meeting is held.</div>}
      {isPast && !open && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setOpen(true)} style={btn(data?.mine ? "ghost" : "primary")}>{data?.mine ? `Edit my feedback (${data.mine.rating}/10)` : "Give my feedback"}</button>
          {msg && <span style={{ fontSize: 13, color: K.green }}>{msg}</span>}
          {boot.me.admin && notYet.length > 0 && <span style={{ fontSize: 12, color: K.muted }}>Not yet: {notYet.join(", ")}</span>}
        </div>
      )}
      {open && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={label}>How was the meeting for you? {f.rating}/10</label>
            <input type="range" min={1} max={10} value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })} style={{ width: "100%", accentColor: K.ember }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <div><label style={label}>What went well</label><textarea style={{ ...input, minHeight: 70 }} value={f.went_well} onChange={(e) => setF({ ...f, went_well: e.target.value })} /></div>
            <div><label style={label}>What to improve next time</label><textarea style={{ ...input, minHeight: 70 }} value={f.improve} onChange={(e) => setF({ ...f, improve: e.target.value })} /></div>
            <div><label style={label}>My one takeaway</label><textarea style={{ ...input, minHeight: 70 }} value={f.takeaway} onChange={(e) => setF({ ...f, takeaway: e.target.value })} /></div>
            <div><label style={label}>A topic or Knowledge Guru for next time</label><textarea style={{ ...input, minHeight: 70 }} value={f.next_topic} onChange={(e) => setF({ ...f, next_topic: e.target.value })} /></div>
          </div>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> keep my name off this (the facilitator still sees it)</label>
          {msg && <div style={{ fontSize: 13, color: K.red }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8 }}><button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : "Send"}</button><button onClick={() => setOpen(false)} style={btn("ghost")}>Cancel</button></div>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {data.rows.map((r, i) => (
            <div key={i} style={{ borderTop: `1px solid ${K.soft}`, paddingTop: 8, display: "flex", gap: 10 }}>
              {r.member_id ? <Avatar m={boot.members.find((m) => m.id === r.member_id) || { name: "?", photo_path: null }} size={30} /> : <div style={{ width: 30, height: 30, borderRadius: "50%", background: K.soft }} />}
              <div style={{ flex: 1, fontSize: 13 }}>
                <div><b>{name(r.member_id)}</b> <span style={{ ...serif, color: K.emberDark }}>{r.rating}/10</span></div>
                {r.went_well && <div><span style={{ color: K.muted }}>Went well:</span> {r.went_well}</div>}
                {r.improve && <div><span style={{ color: K.muted }}>Improve:</span> {r.improve}</div>}
                {r.takeaway && <div><span style={{ color: K.muted }}>Takeaway:</span> {r.takeaway}</div>}
                {r.next_topic && <div><span style={{ color: K.muted }}>Next:</span> {r.next_topic}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
