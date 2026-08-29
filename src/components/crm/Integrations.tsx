"use client";
/**
 * Settings → Integrations — every outside service's keys, in one place.
 * Keys live in the CRM's own database; the screen shows the last four
 * characters, enough to recognise a key, never enough to steal one.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, INK, MUTED, BORDER, GREEN } from "./palette";

interface Integration { key: string; label: string; fields: string[]; help: string; configured: boolean; tail: string | null; url: string | null; ownerOnly?: boolean; mayEdit?: boolean; mapping?: Record<string, string> | null; updated_by: string | null; updated_at: string | null }

export default function Integrations() {
  const [rows, setRows] = useState<Integration[] | null>(null);
  const [err, setErr] = useState("");
  const [needs, setNeeds] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [inspect, setInspect] = useState({ doctype: "", name: "" });
  const [inspected, setInspected] = useState<{ field: string; sample: string }[] | null>(null);

  const erpAction = async (action: string, extra: Record<string, string> = {}) => {
    setBusy("erpnext"); setMsg(action === "inspect" ? "Reading the ERP…" : "Working — this can take a few minutes on the big books…");
    try {
      const r = await fetch("/api/crm/erp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      if (action === "inspect") { setInspected(j.fields || []); setMsg(`Fields of ${j.name || inspect.doctype} ↓`); }
      else if (action === "push_jobs") setMsg(`${j.jobs} jobs read · ${j.pushed} pushed · ${j.unchanged} already matched · ${j.missing} not in the ERP · ${j.failed} refused${j.firstErr ? ` (first: ${j.firstErr})` : ""}`);
      else if (action === "pull_enquiry_info") setMsg(`ERP holds ${j.erpWithInfo} opportunities with text · ${j.matched} matched ours · ${j.updated} enquiry infos refreshed as rich text ✓`);
      else setMsg(JSON.stringify(j));
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

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
            {it.fields.map((f) => {
              const secret = f === "api_key" || f === "api_secret";
              const mapped = it.mapping?.[f] || "";
              return (
              <input key={f} value={vals[`${it.key}.${f}`] || ""}
                onChange={(e) => setVals((v) => ({ ...v, [`${it.key}.${f}`]: e.target.value }))}
                type={secret ? "password" : "text"}
                title={f}
                placeholder={f === "url" ? (it.url || "https://erp.…") : secret ? (it.configured ? `${f} — paste to replace` : f.replace(/_/g, " ")) : (mapped ? `${f.replace(/_/g, " ")}: ${mapped}` : f.replace(/_/g, " "))}
                className="rounded border px-2 py-1.5" style={{ borderColor: mapped && !secret ? "#BFD9C8" : BORDER, fontSize: 13, flex: f === "url" ? "1 1 100%" : "1 1 30%", minWidth: 140 }} />
              );
            })}
            <button onClick={() => save(it.key, it.fields)} disabled={busy === it.key || !it.fields.some((f) => (vals[`${it.key}.${f}`] || "").trim())}
              className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>
              {busy === it.key ? "…" : "Save"}
            </button>
            {it.key === "erpnext" && it.configured && (
              <>
                <button onClick={() => test(it.key)} disabled={busy === it.key}
                  className="rounded px-3 py-1.5 font-bold border" style={{ borderColor: BORDER, color: NAVY, fontSize: 12.5 }}>
                  Test the door
                </button>
                <button onClick={async () => {
                  setBusy(it.key); setMsg("Reading the ERP's quotations…");
                  try {
                    const r = await fetch("/api/crm/erp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pull_quotation_values" }) });
                    const j = await r.json();
                    if (!r.ok) throw new Error(String(j.error || r.status));
                    setMsg(`ERP holds ${j.erpCount} quotations · ${j.matched} matched ours · ${j.filled} zero-value quotes filled ✓`);
                  } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
                  setBusy(null);
                }} disabled={busy === it.key}
                  className="rounded px-3 py-1.5 font-bold border" style={{ borderColor: BORDER, color: "#7C3AED", fontSize: 12.5 }}
                  title="Reads only — fills our zero-value quotations by quote number; never overwrites a typed value, never touches the ERP">
                  ⬇ Pull quotation values
                </button>
                <button onClick={() => erpAction("pull_enquiry_info")} disabled={busy === it.key}
                  className="rounded px-3 py-1.5 font-bold border" style={{ borderColor: BORDER, color: "#7C3AED", fontSize: 12.5 }}
                  title="Reads the mapped Opportunity field, converts its HTML to rich text, refreshes our enquiry infos">
                  ⬇ Pull enquiry info
                </button>
                <button onClick={() => erpAction("push_jobs")} disabled={busy === it.key}
                  className="rounded px-3 py-1.5 font-bold border" style={{ borderColor: "#F5B32B", color: "#8A5B00", fontSize: 12.5 }}
                  title="Writes TDD / kitting % / production % to the ERP through the confirmed mapping — only where the value differs">
                  ⬆ Push job dates &amp; %
                </button>
                <span className="flex items-center gap-1" style={{ flexBasis: "100%" }}>
                  <input value={inspect.doctype} onChange={(e) => setInspect((v) => ({ ...v, doctype: e.target.value }))}
                    placeholder="doctype — Opportunity, Task…" className="rounded border px-2 py-1" style={{ borderColor: BORDER, fontSize: 12, width: 200 }} />
                  <input value={inspect.name} onChange={(e) => setInspect((v) => ({ ...v, name: e.target.value }))}
                    placeholder="document name (blank = first)" className="rounded border px-2 py-1" style={{ borderColor: BORDER, fontSize: 12, width: 200 }} />
                  <button onClick={() => erpAction("inspect", inspect)} disabled={busy === it.key || !inspect.doctype.trim()}
                    className="rounded px-2 py-1 font-bold border" style={{ borderColor: BORDER, color: NAVY, fontSize: 12 }}>🔍 Inspect</button>
                </span>
                {inspected && (
                  <div className="rounded border p-2" style={{ borderColor: BORDER, background: "#FAF9F5", maxHeight: 200, overflowY: "auto", flexBasis: "100%", fontSize: 11.5 }}>
                    {inspected.length === 0 && <span style={{ color: MUTED }}>No plain fields found.</span>}
                    {inspected.map((f) => (
                      <div key={f.field} className="flex gap-2">
                        <b style={{ minWidth: 180, color: NAVY }}>{f.field}</b>
                        <span style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.sample}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          )}
          {it.updated_by && <div className="text-xs mt-1" style={{ color: MUTED }}>last set by {it.updated_by} · {String(it.updated_at).slice(0, 10)}</div>}
        </div>
      ))}
    </div>
  );
}
