"use client";
/**
 * CONNECT AN AGENT (Dr Raghu, 16 Oct 2026: "the Genie should be wired to ALL
 * the modules … I want it to access the others. This currently is only for
 * me"). A person mints a key here and gives it to their agent; the agent
 * then sees what their Genie login sees. Below, for Dr Raghu: Genie's own
 * connection to Perisclaw, so Genie can send WhatsApp messages itself.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Key = { id: string; email: string; label: string; prefix: string; created_at: string; last_used_at: string | null; last_tool: string | null; calls: number; revoked_at: string | null };
type D = { installed: boolean; me: string; isOwner: boolean; keys: Key[]; doors: string[] | null; door_labels: Record<string, string> };
type P = { registered: boolean; connected: boolean; connected_by: string | null; connected_at: string | null; expires_at: string | null; tools: string[]; last_error: string | null; mcp: string };
const C = { ink: "var(--navy)", sub: "var(--dim)", mute: "var(--muted)", line: "var(--line)", green: "var(--green)", red: "var(--red)", accent: "var(--accent)", blue: "var(--blue)" };
const box: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "never");
const URL_ = "https://genie.nandan.co.in/api/mcp";

export default function Connect({ isOwner, email, perisclawNote }: { isOwner: boolean; email: string; perisclawNote: string | null }) {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState(""); const [label, setLabel] = useState("Perisclaw"); const [minted, setMinted] = useState<string | null>(null); const [busy, setBusy] = useState("");
  const [p, setP] = useState<P | null>(null); const [to, setTo] = useState(""); const [sent, setSent] = useState("");
  const load = useCallback(() => { api.get("/api/connect").then(setD).catch((e) => setErr(String(e.message || e))); if (isOwner) api.get("/api/perisclaw").then(setP).catch(() => setP(null)); }, [isOwner]);
  useEffect(() => { load(); }, [load]);
  const mint = async () => { setBusy("mint"); setErr(""); try { const r = await api.post("/api/connect", { action: "mint", label }); setMinted(r.token); load(); } catch (e) { setErr(String((e as Error).message || e)); } setBusy(""); };
  const revoke = async (k: Key) => { if (!window.confirm(`Revoke the key "${k.label}" (${k.prefix}…)? The agent using it stops at once.`)) return; try { await api.post("/api/connect", { action: "revoke", id: k.id }); load(); } catch (e) { setErr(String((e as Error).message || e)); } };
  const peri = async (action: string, extra: Record<string, unknown> = {}) => { setBusy(action); setErr(""); setSent(""); try { const r = await api.post("/api/perisclaw", { action, ...extra }); if (action === "start" && r.url) { window.location.href = r.url; return; } if (action === "send_test") setSent("Sent — check WhatsApp."); load(); } catch (e) { setErr(String((e as Error).message || e)); } setBusy(""); };
  const copy = (s: string) => { try { navigator.clipboard.writeText(s); } catch { /* fine */ } };
  return (
    <div className="grid gap-4">
      <div>
        <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>CONNECT AN AGENT</div>
        <div className="text-lg font-bold" style={{ color: C.ink }}>Give Perisclaw, Claude or any MCP client a key to Genie</div>
        <div className="text-sm" style={{ color: C.sub }}>Your agent sees exactly what your Genie login sees — the same module doors — and anything it writes is written in your name. Keep the key like a password; revoke it here the moment it leaks.</div>
      </div>
      {err && <div className="text-sm font-bold" style={{ color: C.red }}>{err}</div>}
      {d && !d.installed && <div style={{ ...box, color: "#B26A00" }}>Run migration <b>0239_genie_api_token.sql</b> — keys have nowhere to live yet.</div>}

      {d?.installed && (
        <div style={box}>
          <div className="text-sm font-bold mb-2" style={{ color: C.ink }}>1 · Mint a key</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What will use it — Perisclaw, Claude, my phone…" className="text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line, minWidth: 260 }} />
            <button onClick={mint} disabled={busy === "mint"} className="text-sm font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>{busy === "mint" ? "…" : "+ Mint a key"}</button>
          </div>
          {minted && (
            <div className="mt-3 rounded p-3" style={{ background: "#FFF8EC", border: "1px solid #F0D9A8" }}>
              <div className="text-xs font-bold" style={{ color: "#B26A00" }}>YOUR NEW KEY — shown once. Copy it now; Genie keeps only its fingerprint.</div>
              <div className="flex gap-2 items-center mt-1"><code className="text-sm break-all" style={{ color: C.ink }}>{minted}</code><button onClick={() => copy(minted)} className="text-xs font-bold rounded px-2 py-1" style={{ border: `1px solid ${C.line}` }}>Copy</button></div>
            </div>
          )}
          <div className="text-sm font-bold mt-4 mb-1" style={{ color: C.ink }}>2 · In Perisclaw → Apps → Add custom</div>
          <table className="text-sm" style={{ borderCollapse: "collapse" }}><tbody>
            {[["Key", "genie"], ["Display name", "Genie"], ["Server URL", URL_], ["Auth", "Bearer token — paste your key"], ["When should the agent use this?", "Anything about Nandan GSE — company figures, jobs, tasks, queries, approvals, money, customers, service, materials. Genie is the source."], ["How should it use it?", "Read freely. Raise a task or write a job update only when asked, confirming details first. Never approve, pay, release or delete."]].map(([k, v]) => (
              <tr key={k}><td className="pr-3 py-1 align-top font-semibold whitespace-nowrap" style={{ color: C.sub }}>{k}</td><td className="py-1" style={{ color: C.ink }}><span>{v}</span>{k === "Server URL" && <button onClick={() => copy(URL_)} className="ml-2 text-xs font-bold rounded px-2 py-0.5" style={{ border: `1px solid ${C.line}` }}>Copy</button>}</td></tr>
            ))}
          </tbody></table>
          <div className="text-xs mt-2" style={{ color: C.mute }}>For Claude Desktop or Claude Code, a config entry: {`{"mcpServers":{"genie":{"type":"http","url":"${URL_}","headers":{"Authorization":"Bearer <your key>"}}}}`}</div>
        </div>
      )}

      {d?.installed && (
        <div style={box}>
          <div className="text-sm font-bold mb-2" style={{ color: C.ink }}>{d.isOwner ? "Every key in Genie" : "Your keys"} · {d.keys.filter((k) => !k.revoked_at).length} live</div>
          {d.keys.length === 0 ? <div className="text-sm" style={{ color: C.mute }}>No key yet.</div> : (
            <table className="w-full text-xs genie-table"><thead><tr style={{ background: "var(--ink)", color: "#fff" }}>{d.isOwner && <th className="px-2 py-1.5 text-left">Who</th>}<th className="px-2 py-1.5 text-left">Label</th><th className="px-2 py-1.5 text-left">Key</th><th className="px-2 py-1.5 text-left">Made</th><th className="px-2 py-1.5 text-left">Last used</th><th className="px-2 py-1.5 text-right">Calls</th><th className="px-2 py-1.5" /></tr></thead>
              <tbody>{d.keys.map((k) => (
                <tr key={k.id} style={{ borderTop: "1px solid #EFEDE7", opacity: k.revoked_at ? .5 : 1 }}>
                  {d.isOwner && <td className="px-2 py-1.5">{k.email}</td>}
                  <td className="px-2 py-1.5 font-semibold">{k.label}</td><td className="px-2 py-1.5"><code>{k.prefix}…</code></td><td className="px-2 py-1.5">{when(k.created_at)}</td><td className="px-2 py-1.5">{when(k.last_used_at)}{k.last_tool ? <span style={{ color: C.mute }}> · {k.last_tool}</span> : null}</td><td className="px-2 py-1.5 text-right tnum">{k.calls}</td>
                  <td className="px-2 py-1.5 text-right">{k.revoked_at ? <span style={{ color: C.mute }}>revoked</span> : <button onClick={() => revoke(k)} className="text-xs font-bold" style={{ color: C.red }}>Revoke</button>}</td>
                </tr>
              ))}</tbody></table>
          )}
          {d.doors && <div className="text-xs mt-2" style={{ color: C.mute }}>Your doors: {d.doors.join(" · ")}</div>}
        </div>
      )}

      {isOwner && (
        <div style={{ ...box, borderLeft: `5px solid ${C.blue}` }}>
          <div className="text-sm font-bold" style={{ color: C.ink }}>Genie → Perisclaw: let Genie send WhatsApp messages itself</div>
          <div className="text-xs mb-2" style={{ color: C.sub }}>Genie registers itself with Perisclaw, you allow it once in your browser, and Genie keeps the key — refreshed on its own — to send through your WhatsApp from then on.</div>
          {perisclawNote && <div className="text-sm font-bold mb-2" style={{ color: perisclawNote === "connected" ? C.green : C.red }}>{perisclawNote === "connected" ? "Connected — Perisclaw allowed Genie." : `Perisclaw said: ${perisclawNote}`}</div>}
          {p ? (
            <div className="text-sm" style={{ color: C.ink }}>
              {p.connected ? <>Connected by <b>{p.connected_by}</b> on {when(p.connected_at)} · token good till {when(p.expires_at)} (refreshes itself){p.last_error ? <div style={{ color: C.red }}>Last error: {p.last_error}</div> : null}</> : <>Not connected{p.registered ? " (Genie is registered as a client)" : ""}.</>}
              <div className="flex gap-2 flex-wrap mt-2 items-center">
                {!p.connected && <button onClick={() => peri("start")} disabled={!!busy} className="text-sm font-bold rounded px-3 py-1.5" style={{ background: C.blue, color: "#fff" }}>Connect Genie to Perisclaw</button>}
                {p.connected && <>
                  <button onClick={() => peri("tools")} disabled={!!busy} className="text-xs font-bold rounded px-2 py-1" style={{ border: `1px solid ${C.line}` }}>List Perisclaw&apos;s tools</button>
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="WhatsApp no. with country code, e.g. 9198…" className="text-xs border rounded px-2 py-1" style={{ borderColor: C.line, minWidth: 240 }} />
                  <button onClick={() => peri("send_test", { to })} disabled={!!busy || !to.trim()} className="text-xs font-bold rounded px-2 py-1" style={{ background: C.green, color: "#fff" }}>Send a test message</button>
                  <button onClick={() => { if (window.confirm("Disconnect Genie from Perisclaw?")) void peri("disconnect"); }} className="text-xs font-bold" style={{ color: C.red }}>Disconnect</button>
                </>}
                {sent && <span className="text-xs font-bold" style={{ color: C.green }}>{sent}</span>}
              </div>
              {p.tools.length > 0 && <div className="text-xs mt-2" style={{ color: C.mute }}>Perisclaw&apos;s tools: {p.tools.join(", ")}</div>}
            </div>
          ) : <div className="text-sm" style={{ color: C.mute }}>Reading…</div>}
        </div>
      )}
      <div className="text-xs" style={{ color: C.mute }}>Signed in as {email}.</div>
    </div>
  );
}
