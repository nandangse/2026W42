"use client";
/**
 * ADMIN → AGENT RULES (Dr Raghu, 16 Oct 2026: "currently Genie and Perisclaw
 * can only be working through Raghu's commands. In Admin also make the rules
 * that it has to follow"). The prose is handed to every agent as its standing
 * orders; the switches are enforced by Genie whatever the agent was told.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Policy = { rules: string; reads_on: boolean; writes_on: boolean; write_people: string[]; whatsapp_on: boolean; whatsapp_to: "staff" | "anyone" | "none"; whatsapp_from: number; whatsapp_till: number; whatsapp_daily: number; max_calls_daily: number; updated_at: string | null; updated_by: string | null; installed: boolean };
type Log = { at: string; email: string; key_label: string | null; tool: string; ok: boolean; note: string | null; ms: number | null };
type Key = { email: string; label: string; calls: number; last_used_at: string | null; last_tool: string | null; revoked_at: string | null };
const box: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: 16 };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—");
const HOURS = Array.from({ length: 25 }, (_, i) => i);

export default function AgentRules() {
  const [p, setP] = useState<Policy | null>(null); const [log, setLog] = useState<Log[]>([]); const [keys, setKeys] = useState<Key[]>([]);
  const [people, setPeople] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/api/agent-policy").then((d) => { setP(d.policy); setPeople((d.policy.write_people || []).join(", ")); setLog(d.log || []); setKeys(d.keys || []); }).catch((e) => setMsg(String(e.message || e))), []);
  useEffect(() => { load(); }, [load]);
  if (!p) return <div className="text-sm" style={{ color: "var(--muted)" }}>{msg || "Reading…"}</div>;
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setP({ ...p, [k]: v });
  const save = async () => {
    setBusy(true); setMsg("");
    try { const r = await api.post("/api/agent-policy", { ...p, write_people: people }); setP(r.policy); setMsg("Saved ✓ — every agent reads these on its next call."); }
    catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  const Switch = ({ k, label, hint }: { k: "reads_on" | "writes_on" | "whatsapp_on"; label: string; hint: string }) => (
    <label className="flex items-start gap-2 text-sm" style={{ color: "var(--navy)" }}><input type="checkbox" checked={p[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1" /><span><b>{label}</b><span style={{ color: "var(--dim)" }}> — {hint}</span></span></label>
  );
  const live = keys.filter((k) => !k.revoked_at);
  return (
    <div className="grid gap-4" style={{ maxWidth: 1100 }}>
      <div>
        <div className="text-lg font-bold" style={{ color: "var(--navy)" }}>Rules every agent must follow</div>
        <div className="text-sm" style={{ color: "var(--dim)" }}>Perisclaw, Claude and any other agent holding a Genie key reads these as its standing orders on every connection. The switches below are enforced by Genie itself, whatever an agent was told. {p.updated_at ? <>Last set by {p.updated_by} on {when(p.updated_at)}.</> : null}</div>
      </div>
      {!p.installed && <div style={{ ...box, color: "#B26A00" }}>Run migration <b>0240_agent_rules.sql</b> — until then Genie runs on the built-in defaults shown here and nothing can be saved.</div>}

      <div style={box}>
        <div className="text-sm font-bold mb-1" style={{ color: "var(--navy)" }}>Standing orders (handed to the agent verbatim)</div>
        <textarea value={p.rules} onChange={(e) => set("rules", e.target.value)} rows={12} className="w-full text-sm border rounded p-2" style={{ borderColor: "var(--line)", fontFamily: "inherit", lineHeight: 1.45 }} placeholder="1. You speak for the person whose key you hold…" />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={box}>
          <div className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>Reading and writing Genie</div>
          <div className="grid gap-2">
            <Switch k="reads_on" label="Agents may read Genie" hint="the master switch; off = every key is refused (Dr Raghu's own excepted)" />
            <Switch k="writes_on" label="Agents may write" hint="raise a task, write a job update — only when the person asks" />
            <label className="text-sm" style={{ color: "var(--navy)" }}><b>Only these people may write through an agent</b><span style={{ color: "var(--dim)" }}> — e-mails, comma-separated; empty = anyone whose Genie role may</span>
              <input value={people} onChange={(e) => setPeople(e.target.value)} className="w-full text-sm border rounded px-2 py-1 mt-1" style={{ borderColor: "var(--line)" }} placeholder="raghu@nandan.co.in, tushar@nandan.co.in" /></label>
            <label className="text-sm" style={{ color: "var(--navy)" }}><b>Calls per key per day</b> <input type="number" value={p.max_calls_daily} onChange={(e) => set("max_calls_daily", Number(e.target.value))} className="text-sm border rounded px-2 py-0.5 ml-2 tnum" style={{ borderColor: "var(--line)", width: 100 }} /><span style={{ color: "var(--dim)" }}> (0 = no cap)</span></label>
          </div>
        </div>
        <div style={box}>
          <div className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>Genie sending WhatsApp through Perisclaw</div>
          <div className="grid gap-2">
            <Switch k="whatsapp_on" label="Genie may send messages" hint="off = no message leaves, even on Dr Raghu's test button" />
            <label className="text-sm" style={{ color: "var(--navy)" }}><b>To whom</b>
              <select value={p.whatsapp_to} onChange={(e) => set("whatsapp_to", e.target.value as Policy["whatsapp_to"])} className="text-sm border rounded px-2 py-0.5 ml-2" style={{ borderColor: "var(--line)" }}>
                <option value="staff">Nandan staff only (numbers on HRMS records)</option><option value="anyone">Any number</option><option value="none">Nobody</option>
              </select></label>
            <div className="text-sm" style={{ color: "var(--navy)" }}><b>Hours (IST)</b>
              <select value={p.whatsapp_from} onChange={(e) => set("whatsapp_from", Number(e.target.value))} className="text-sm border rounded px-2 py-0.5 ml-2" style={{ borderColor: "var(--line)" }}>{HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
              <span style={{ color: "var(--dim)" }}> to </span>
              <select value={p.whatsapp_till} onChange={(e) => set("whatsapp_till", Number(e.target.value))} className="text-sm border rounded px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{HOURS.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
            </div>
            <label className="text-sm" style={{ color: "var(--navy)" }}><b>Messages per day</b> <input type="number" value={p.whatsapp_daily} onChange={(e) => set("whatsapp_daily", Number(e.target.value))} className="text-sm border rounded px-2 py-0.5 ml-2 tnum" style={{ borderColor: "var(--line)", width: 100 }} /><span style={{ color: "var(--dim)" }}> (0 = no cap)</span></label>
          </div>
        </div>
      </div>
      <div className="flex gap-3 items-center">
        <button onClick={save} disabled={busy || !p.installed} className="text-sm font-bold rounded px-4 py-1.5" style={{ background: "var(--green)", color: "#fff", opacity: p.installed ? 1 : .5 }}>{busy ? "Saving…" : "Save the rules"}</button>
        {msg && <span className="text-sm font-semibold" style={{ color: /✓/.test(msg) ? "var(--green)" : "var(--red)" }}>{msg}</span>}
      </div>

      <div style={box}>
        <div className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>Keys in use · {live.length} live{keys.length - live.length ? `, ${keys.length - live.length} revoked` : ""}</div>
        {keys.length === 0 ? <div className="text-sm" style={{ color: "var(--muted)" }}>Nobody has minted a key yet (Connect an agent, in the user menu).</div> : (
          <table className="w-full text-xs genie-table"><thead><tr style={{ background: "var(--ink)", color: "#fff" }}><th className="px-2 py-1.5 text-left">Who</th><th className="px-2 py-1.5 text-left">Label</th><th className="px-2 py-1.5 text-right">Calls</th><th className="px-2 py-1.5 text-left">Last used</th><th className="px-2 py-1.5 text-left">Last tool</th><th className="px-2 py-1.5 text-left">State</th></tr></thead>
            <tbody>{keys.map((k, i) => <tr key={i} style={{ borderTop: "1px solid #EFEDE7", opacity: k.revoked_at ? .5 : 1 }}><td className="px-2 py-1.5">{k.email}</td><td className="px-2 py-1.5">{k.label}</td><td className="px-2 py-1.5 text-right tnum">{k.calls}</td><td className="px-2 py-1.5">{when(k.last_used_at)}</td><td className="px-2 py-1.5">{k.last_tool || "—"}</td><td className="px-2 py-1.5">{k.revoked_at ? "revoked" : "live"}</td></tr>)}</tbody></table>
        )}
      </div>

      <div style={box}>
        <div className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>What the agents did · last {log.length} calls</div>
        {log.length === 0 ? <div className="text-sm" style={{ color: "var(--muted)" }}>No call logged yet.</div> : (
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="w-full text-xs genie-table"><thead><tr style={{ background: "var(--ink)", color: "#fff", position: "sticky", top: 0 }}><th className="px-2 py-1.5 text-left">When</th><th className="px-2 py-1.5 text-left">Who</th><th className="px-2 py-1.5 text-left">Key</th><th className="px-2 py-1.5 text-left">Tool</th><th className="px-2 py-1.5 text-left">Result</th><th className="px-2 py-1.5 text-right">ms</th></tr></thead>
              <tbody>{log.map((l, i) => <tr key={i} style={{ borderTop: "1px solid #EFEDE7" }}><td className="px-2 py-1 whitespace-nowrap">{when(l.at)}</td><td className="px-2 py-1">{l.email}</td><td className="px-2 py-1">{l.key_label || "—"}</td><td className="px-2 py-1 font-semibold">{l.tool}</td><td className="px-2 py-1" style={{ color: l.ok ? "var(--green)" : "var(--red)" }}>{l.ok ? "ok" : `refused — ${l.note || ""}`}</td><td className="px-2 py-1 text-right tnum">{l.ms ?? ""}</td></tr>)}</tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
