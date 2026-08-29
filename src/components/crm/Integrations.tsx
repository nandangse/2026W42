"use client";
/**
 * Settings → Integrations — every outside service's keys, in one place.
 * Keys live in the CRM's own database; the screen shows the last four
 * characters, enough to recognise a key, never enough to steal one.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, INK, MUTED, BORDER, GREEN } from "./palette";

interface Integration { key: string; label: string; fields: string[]; help: string; configured: boolean; tail: string | null; url: string | null; ownerOnly?: boolean; mayEdit?: boolean; updated_by: string | null; updated_at: string | null }

export default function Integrations() {
  const [rows, setRows] = useState<Integration[] | null>(null);
  const [err, setErr] = useState("");
  const [needs, setNeeds] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/crm/integrations").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setRows(j.integrations || []); setNeeds(!!j.needsMigration);
    }).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, fields: string[]) => {
    setBusy(key); setMsg("");
    try {
      const config: Record<string, string> = {};
      for (const f of fields) config[f] = vals[`${key}.${f}`] || "";
      const r = await fetch("/api/crm/integrations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, config }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setMsg(`${key} saved ✓`);
      setVals((v) => { const n = { ...v }; for (const f of fields) delete n[`${key}.${f}`]; return n; });
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  const test = async (key: string) => {
    setBusy(key); setMsg("");
    try {
      const r = await fetch("/api/crm/integrations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, action: "test" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setMsg(`ERPNext answered as ${j.user} ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 className="font-bold mb-1" style={{ fontSize: 17, color: INK }}>⚙ Integrations</h2>
      <p className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
        Keys for outside services, kept in the CRM&apos;s database — change one here and it is live at once, no redeploy.
      </p>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migration 0019 — the integrations have nowhere to live yet.</div>}
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: GREEN }}>{msg}</div>}

      {(rows || []).map((it) => (
        <div key={it.key} className="rounded-lg border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="flex items-center gap-2">
            <b style={{ fontSize: 14, color: INK }}>{it.label}</b>
            {it.configured
              ? <span className="rounded px-2 font-bold" style={{ fontSize: 10.5, background: "#E6F4EB", color: GREEN }}>connected · …{it.tail}</span>
              : <span className="rounded px-2 font-bold" style={{ fontSize: 10.5, background: "#FBEAE8", color: "#B3261E" }}>not connected</span>}
          </div>
          <p className="text-xs mt-1 mb-2" style={{ color: MUTED, lineHeight: 1.5 }}>{it.help}</p>
          {it.mayEdit === false ? (
            <div className="text-xs font-semibold" style={{ color: MUTED }}>
              {it.url && <span>URL: {it.url} · </span>}Editable only by Raghu, for now.
            </div>
          ) : (
          <div className="flex gap-2 flex-wrap">
            {it.fields.map((f) => (
              <input key={f} value={vals[`${it.key}.${f}`] || ""}
                onChange={(e) => setVals((v) => ({ ...v, [`${it.key}.${f}`]: e.target.value }))}
                type={f === "url" ? "text" : "password"}
                placeholder={f === "url" ? (it.url || "https://erp.…") : it.configured ? `${f} — paste to replace` : f.replace("_", " ")}
                className="rounded border px-2 py-1.5" style={{ borderColor: BORDER, fontSize: 13, flex: f === "url" ? "1 1 100%" : 1, minWidth: 140 }} />
            ))}
            <button onClick={() => save(it.key, it.fields)} disabled={busy === it.key || !it.fields.some((f) => (vals[`${it.key}.${f}`] || "").trim())}
              className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>
              {busy === it.key ? "…" : "Save"}
            </button>
            {it.key === "erpnext" && it.configured && (
              <button onClick={() => test(it.key)} disabled={busy === it.key}
                className="rounded px-3 py-1.5 font-bold border" style={{ borderColor: BORDER, color: NAVY, fontSize: 12.5 }}>
                Test the door
              </button>
            )}
          </div>
          )}
          {it.updated_by && <div className="text-xs mt-1" style={{ color: MUTED }}>last set by {it.updated_by} · {String(it.updated_at).slice(0, 10)}</div>}
        </div>
      ))}
    </div>
  );
}
