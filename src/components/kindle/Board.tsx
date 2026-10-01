"use client";
import { useEffect, useState } from "react";
import { api, Avatar, btn, Card, dmy, input, K, label, Markdown, pill, serif, type Boot } from "./shared";

interface Topic { id: string; title: string; body: string | null; created_by: string | null; pinned: boolean; closed: boolean; created_at: string; last_post_at: string; posts: number; last_by: string | null; voices: number }
interface Post { id: string; topic_id: string; member_id: string | null; body: string; reply_to: string | null; created_at: string; edited_at: string | null }

/** Message board: topics, threaded replies, pins. Plain text with the little markdown the constitution uses. */
export default function Board({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ topics: Topic[] }>("/api/kindle/board").then((r) => setTopics(r.topics)).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const name = (id: string | null) => boot.members.find((m) => m.id === id)?.short_name || "—";
  const create = async () => { setErr(null); try { const r = await api<{ id: string }>("/api/kindle/board", { action: "topic", title, body }); setAdding(false); setTitle(""); setBody(""); load(); go("board", r.id); } catch (e) { setErr(String((e as Error).message || e)); } };
  if (arg) { const t = topics?.find((x) => x.id === arg); return <TopicView boot={boot} topicId={arg} topic={t || null} back={() => { go("board"); load(); }} name={name} />; }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Message board</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>between the meetings</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ New topic"}</button>
      </div>
      {adding && (
        <Card title="A new topic">
          <label style={label}>Title</label><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label style={{ ...label, marginTop: 10 }}>Opening post</label><textarea style={{ ...input, minHeight: 100 }} value={body} onChange={(e) => setBody(e.target.value)} />
          {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 10 }}><button onClick={create} style={btn("primary")}>Post</button></div>
        </Card>
      )}
      <Card pad={0}>
        {!topics ? <div style={{ padding: 16, color: K.muted }}>Loading…</div> : topics.length === 0 ? <div style={{ padding: 16, color: K.muted }}>Nothing yet. Start a topic — a question for the room, a link worth reading, a date to fix.</div> :
          topics.map((t) => (
            <button key={t.id} onClick={() => go("board", t.id)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${K.soft}`, padding: "12px 16px", cursor: "pointer" }}>
              <Avatar m={boot.members.find((m) => m.id === t.created_by) || { name: "?", photo_path: null }} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, display: "flex", gap: 8, alignItems: "center" }}>{t.pinned && <span style={pill(K.amber, K.ink)}>pinned</span>}{t.closed && <span style={pill(K.muted)}>closed</span>}<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span></div>
                <div style={{ fontSize: 12, color: K.muted }}>{name(t.created_by)} · {dmy(t.created_at)} · {t.posts} {t.posts === 1 ? "reply" : "replies"}{t.voices ? ` from ${t.voices}` : ""} · last {dmy(t.last_post_at)}{t.last_by && t.posts ? ` by ${name(t.last_by)}` : ""}</div>
              </div>
            </button>
          ))}
      </Card>
    </div>
  );
}

function TopicView({ boot, topicId, topic, back, name }: { boot: Boot; topicId: string; topic: Topic | null; back: () => void; name: (id: string | null) => string }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [t, setT] = useState<Topic | null>(topic);
  const [text, setText] = useState(""); const [replyTo, setReplyTo] = useState<Post | null>(null); const [busy, setBusy] = useState(false);
  const load = () => { api<{ posts: Post[] }>(`/api/kindle/board?topic=${topicId}`).then((r) => setPosts(r.posts)); if (!t) api<{ topics: Topic[] }>("/api/kindle/board").then((r) => setT(r.topics.find((x) => x.id === topicId) || null)); };
  useEffect(() => { load(); }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => { if (!text.trim()) return; setBusy(true); try { await api("/api/kindle/board", { action: "post", topic_id: topicId, body: text, reply_to: replyTo?.id || null }); setText(""); setReplyTo(null); load(); } catch (e) { alert(String((e as Error).message || e)); } setBusy(false); };
  const remove = async (p: Post) => { if (!confirm("Remove this post?")) return; await api("/api/kindle/board", { action: "remove", post_id: p.id }); load(); };
  const admin = boot.me.admin;
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 860 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← Message board</button>
      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Avatar m={boot.members.find((m) => m.id === t?.created_by) || { name: "?", photo_path: null }} size={40} />
          <div style={{ flex: 1 }}>
            <h1 style={{ ...serif, fontSize: 22, margin: 0 }}>{t?.title || "…"}</h1>
            <div style={{ fontSize: 12, color: K.muted }}>{name(t?.created_by || null)} · {t ? dmy(t.created_at) : ""}{t?.closed ? " · closed" : ""}</div>
            {t?.body && <div style={{ marginTop: 8 }}><Markdown text={t.body} small /></div>}
          </div>
          {(admin || t?.created_by === boot.me.id) && t && (
            <div style={{ display: "flex", gap: 4 }}>
              {admin && <button onClick={async () => { await api("/api/kindle/board", { action: "pin", topic_id: t.id, pinned: !t.pinned }); setT({ ...t, pinned: !t.pinned }); }} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })}>{t.pinned ? "Unpin" : "Pin"}</button>}
              {admin && <button onClick={async () => { await api("/api/kindle/board", { action: "close", topic_id: t.id, closed: !t.closed }); setT({ ...t, closed: !t.closed }); }} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })}>{t.closed ? "Reopen" : "Close"}</button>}
              <button onClick={async () => { if (!confirm("Remove the whole topic?")) return; await api("/api/kindle/board", { action: "remove", topic_id: t.id }); back(); }} style={btn("ghost", { padding: "4px 8px", fontSize: 12 })}>Remove</button>
            </div>
          )}
        </div>
      </Card>
      <div style={{ display: "grid", gap: 8 }}>
        {(posts || []).map((p) => { const parent = p.reply_to ? posts?.find((x) => x.id === p.reply_to) : null; return (
          <div key={p.id} style={{ display: "flex", gap: 10, background: "#fff", border: `1px solid ${K.line}`, borderRadius: 12, padding: 12, marginLeft: parent ? 28 : 0 }}>
            <Avatar m={boot.members.find((m) => m.id === p.member_id) || { name: "?", photo_path: null }} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: K.muted }}><b style={{ color: K.ink }}>{name(p.member_id)}</b> · {dmy(p.created_at)} {new Date(p.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{p.edited_at ? " · edited" : ""}{parent ? <> · replying to {name(parent.member_id)}</> : ""}</div>
              <div style={{ marginTop: 4 }}><Markdown text={p.body} small /></div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {!t?.closed && <button onClick={() => { setReplyTo(p); document.getElementById("kindle-reply")?.focus(); }} style={lnk}>Reply</button>}
                {(p.member_id === boot.me.id || admin) && <button onClick={() => remove(p)} style={{ ...lnk, color: K.muted }}>Remove</button>}
              </div>
            </div>
          </div>
        ); })}
        {posts && posts.length === 0 && <div style={{ color: K.muted, fontSize: 13, padding: "4px 2px" }}>No replies yet.</div>}
      </div>
      {!t?.closed && (
        <Card>
          {replyTo && <div style={{ fontSize: 12, color: K.dim, marginBottom: 6 }}>Replying to <b>{name(replyTo.member_id)}</b> <button onClick={() => setReplyTo(null)} style={lnk}>cancel</button></div>}
          <textarea id="kindle-reply" style={{ ...input, minHeight: 80 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to the group…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}><button onClick={send} disabled={busy || !text.trim()} style={btn("primary")}>{busy ? "Posting…" : "Post"}</button><span style={{ fontSize: 11, color: K.muted }}>Ctrl+Enter posts. **bold**, lists with - , links as [text](url).</span></div>
        </Card>
      )}
    </div>
  );
}
const lnk: React.CSSProperties = { background: "none", border: "none", color: K.emberDark, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 };
