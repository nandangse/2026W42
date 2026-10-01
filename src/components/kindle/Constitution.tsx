"use client";
import { useEffect, useState } from "react";
import { api, btn, Card, dmy, input, K, label, Markdown, serif, type Boot } from "./shared";

/** The constitution as a page; the facilitator can save a new version (the old ones stay on record). */
export default function Constitution({ boot, reload }: { boot: Boot; reload: () => void }) {
  const c = boot.constitution;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(""); const [on, setOn] = useState(""); const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; version: string; revised_on: string | null; created_at: string; is_current: boolean }[]>([]);
  const [accepts, setAccepts] = useState<{ member_id: string; accepted: boolean; accepted_at: string }[]>([]);
  const [mine, setMine] = useState<{ accepted: boolean; accepted_at: string } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const loadAccepts = () => api<{ versions: typeof history; accepts: typeof accepts; mine: typeof mine }>("/api/kindle/constitution").then((r) => { setHistory(r.versions); setAccepts(r.accepts || []); setMine(r.mine || null); }).catch(() => undefined);
  useEffect(() => { loadAccepts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const accept = async () => { if (!c) return; setAccepting(true); try { await api("/api/kindle/constitution", { action: "accept", constitution_id: c.id }); await loadAccepts(); } catch (e) { setErr(String((e as Error).message || e)); } setAccepting(false); };
  const start = () => { setV(c ? bump(c.version) : "1.0"); setOn(boot.today); setBody(c?.body || ""); setEdit(true); setErr(null); };
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("/api/kindle/constitution", { version: v, revised_on: on, body, passed_by: c?.passed_by || [] }); setEdit(false); reload(); }
    catch (e) { setErr(String((e as Error).message || e)); }
    setBusy(false);
  };
  if (!c) return <Card><h1 style={{ ...serif, margin: 0 }}>Constitution</h1><p style={{ color: K.muted }}>Not loaded yet.</p></Card>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Constitution of Kindle</h1>
          <span style={{ color: K.muted, fontSize: 13 }}>Version {c.version}{c.revised_on ? ` · revised ${dmy(c.revised_on)}` : ""}</span>
          <div style={{ flex: 1 }} />
          {boot.me.admin && !edit && <button onClick={start} style={btn("ghost")}>New version</button>}
        </div>
        <p style={{ color: K.dim, fontSize: 13, margin: "6px 0 0" }}>Passed and agreed by {c.passed_by.join(", ")}. Reviewed every December; amended with a two-third majority.</p>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${K.soft}`, paddingTop: 12 }}>
          {mine?.accepted ? (
            <span style={{ fontSize: 13, color: K.green, fontWeight: 700 }}>✓ You accepted version {c.version} on {dmy(mine.accepted_at)}.</span>
          ) : (
            <>
              <button onClick={accept} disabled={accepting} style={btn("primary", { padding: "10px 18px", fontSize: 14 })}>{accepting ? "Recording…" : "I Accept"}</button>
              <span style={{ fontSize: 13, color: K.dim }}>I have read version {c.version} and accept it as the constitution of Kindle. Recorded against your name, with the date.</span>
            </>
          )}
          {boot.me.admin && (
            <div style={{ flexBasis: "100%", fontSize: 12, color: K.dim, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: K.muted }}>Accepted {accepts.filter((a) => a.accepted).length} of {boot.members.filter((m) => m.active).length}:</span>
              {boot.members.filter((m) => m.active).map((m) => { const a = accepts.find((x) => x.member_id === m.id); return <span key={m.id} title={a?.accepted ? `accepted ${dmy(a.accepted_at)}` : "not yet"} style={{ padding: "2px 8px", borderRadius: 999, background: a?.accepted ? "#e3f3e8" : K.soft, color: a?.accepted ? K.green : K.muted, fontWeight: 700 }}>{m.short_name || m.name}{a?.accepted ? " ✓" : ""}</span>; })}
            </div>
          )}
        </div>
      </Card>
      {edit ? (
        <Card title="Save a new version" right="the current one stays on record">
          <div style={{ display: "grid", gridTemplateColumns: "140px 180px", gap: 12, marginBottom: 10 }}>
            <div><label style={label}>Version</label><input style={input} value={v} onChange={(e) => setV(e.target.value)} /></div>
            <div><label style={label}>Revised on</label><input style={input} type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
          </div>
          <label style={label}>Text — headings as ## , lists as - , tables with | </label>
          <textarea style={{ ...input, minHeight: 420, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} value={body} onChange={(e) => setBody(e.target.value)} />
          {err && <div style={{ color: K.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={busy} style={btn("primary")}>{busy ? "Saving…" : `Save as ${v}`}</button>
            <button onClick={() => setEdit(false)} style={btn("ghost")}>Cancel</button>
          </div>
        </Card>
      ) : (
        <Card pad={24}><Markdown text={c.body} /></Card>
      )}
      {boot.me.admin && history.length > 1 && (
        <Card title="Earlier versions">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: K.dim }}>{history.map((h) => <li key={h.id}>Version {h.version}{h.revised_on ? ` · ${dmy(h.revised_on)}` : ""} · saved {dmy(h.created_at)}{h.is_current ? " · current" : ""}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
const bump = (v: string) => { const p = v.split("."); const last = Number(p.pop() || 0) + 1; return [...p, String(last)].join("."); };
