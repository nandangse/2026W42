"use client";
/**
 * WhatsApp — one message to everybody (Dr Raghu, 4 Sep 2026): "send one
 * message to everybody with a template ... the attendance of this month."
 *
 * Pick a template (Masters → Standard Texts, kind WhatsApp), the month whose
 * salary sheet fills {{attendance_days}} and the rest, and the audience by
 * type. Preview shows the first five as they will read and counts the
 * blanks. Queue parks them in the WhatsApp queue — the CRM's, through
 * Periskope's default number — and Send releases them a few at a time
 * within the ceilings. Nothing goes out on Queue alone.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/hrms-template";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Tpl { key: string; title: string; body: string; note: string | null }
interface SheetRow { id: string; month: number; year: number; status: string }
interface Preview { count: number; noPhone: number; blanks: Record<string, number>; sheet: { month: number; year: number; status: string } | null; sample: { id: string; name: string; phone: string; text: string; missing: string[] }[] }
interface QueueRow { id: string; ref: string; name: string; status: string; error: string; queued_at: string; sent_at: string | null; delivered_at: string | null; template_name: string; phone: string }
interface State { templates: Tpl[]; sheets: SheetRow[]; byType: Record<string, { n: number; withPhone: number }>; byDept: Record<string, number>; total: number; queue: { counts: Record<string, number>; throttle: { blocked: string | null; sentToday?: number; perDay?: number; sentLastHour?: number; perHour?: number } | null; configured: boolean; configError: string | null; recent: QueueRow[]; aisensy?: { configured: boolean; live: boolean; campaign: string | null; error: string | null } } }

const inp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", width: "100%" };

export default function WhatsAppBroadcast({ who }: { who: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState("");
  const [tpl, setTpl] = useState("");
  const [bodyTxt, setBodyTxt] = useState("");
  const [sheet, setSheet] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/whatsapp"); setSt(j);
      if (!sheet && j.sheets?.[0]) setSheet(`${j.sheets[0].year}-${j.sheets[0].month}`);
      const def = (j.templates || []).find((t: Tpl) => t.key === "attendance_monthly");
      if (!tpl && def) { setTpl(def.key); setBodyTxt(def.body); }
    }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const pickTpl = (k: string) => { setTpl(k); setPreview(null); const t = st?.templates.find((x) => x.key === k); if (t) setBodyTxt(t.body); };
  const [year, month] = sheet ? sheet.split("-").map(Number) : [0, 0];
  const args = () => ({ template_key: tpl || null, body: bodyTxt, month, year, types: [...types] });

  const doPreview = async () => {
    setBusy(true); setMsg("");
    try { setPreview(await api.post("/api/hrms/whatsapp", { action: "preview", ...args() })); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const doQueue = async () => {
    if (!preview) return;
    if (!window.confirm(`Queue ${preview.count - preview.noPhone} WhatsApp messages?\n\nThey wait in the queue until Send releases them, a few at a time within the ceilings.`)) return;
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/whatsapp", { action: "queue", ...args() }); setMsg(`${j.queued} queued ✓${j.skipped?.length ? ` · ${j.skipped.length} skipped (no mobile)` : ""}`); setPreview(null); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const doSend = async () => {
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/whatsapp", { action: "send", n: 10 }); setMsg(`Sent ${j.sent}${j.failed ? `, ${j.failed} failed` : ""}${j.stopped ? ` — stopped: ${j.stopped}` : ""} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const doCheck = async () => {
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/whatsapp", { action: "check" }); setMsg(`Checked ${j.checked}: ${j.delivered} delivered, ${j.failed} failed ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const q = st?.queue;
  const audience = Object.entries(st?.byType || {}).filter(([t]) => !types.size || types.has(t)).reduce((a, [, v]) => ({ n: a.n + v.n, p: a.p + v.withPhone }), { n: 0, p: 0 });
  const tone = (s: string) => (s === "delivered" ? C.green : s === "failed" ? C.red : s === "sent" ? "var(--blue)" : C.dim);

  return (
    <Pane title="WhatsApp — one message to everybody" who={who}
      blurb="A template, the month it speaks of, the people it goes to. Preview, then Queue; the queue sends through Periskope's default number within the ceilings, and Check asks what was delivered.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {/*
        WHICH ROAD HRMS IS ON (Dr Raghu, 9 Sep 2026: "also this is used in
        the HRMS also").

        The route has reported both since 8 September and this screen showed
        neither — so a broadcast could go out by AiSensy while the page still
        said Periskope. Which number a hundred messages leave from is not a
        detail to leave to the reader's memory.
      */}
      {q?.aisensy?.live ? (
        <div className="rounded p-2 mb-2" style={{ background: "#F0FAF3", border: "1px solid #1E7A45", fontSize: 12.5, color: "#1E7A45", lineHeight: 1.5 }}>
          <b>Going out through AiSensy</b> — Meta&apos;s official Business API{q.aisensy.campaign ? <>, default campaign <b>{q.aisensy.campaign}</b></> : null}.
          {" "}TEMPLATE ONLY: a message must be a campaign you have set <b>Live</b> in AiSensy; there is no free-text send on this road.
          {" "}Delivered and read come back on the webhook, not by asking.
        </div>
      ) : q && !q.configured ? (
        <div className="rounded p-2 mb-2" style={{ background: "#FBEDEA", border: "1px solid #B3261E", fontSize: 12.5, color: C.red }}>
          {q.configError || "Periskope is not connected — CRM → Settings → Integrations."}
          {q.aisensy?.error && <div className="mt-1">AiSensy is the other road, and it is not open either: {q.aisensy.error}</div>}
        </div>
      ) : q ? (
        <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", border: "1px solid #D9D6CD", fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
          Going out through <b>Periskope</b>, on HR&apos;s own WhatsApp number.
          {q.aisensy?.configured
            ? <> AiSensy is configured but <b>paused</b> — clear paused on its card in CRM → Settings → Integrations to move to Meta&apos;s official API.</>
            : <> AiSensy is not connected yet.</>}
        </div>
      ) : null}

      <div className="flex gap-3 items-start" style={{ flexWrap: "wrap" }}>
        {/* ── compose ── */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line, flex: "1 1 520px" }}>
          <div className="font-bold text-sm mb-2">1 · The message</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="text-xs" style={{ color: C.dim }}>Template <span style={{ color: C.faint }}>(Masters → Standard Texts, kind WhatsApp)</span>
              <select value={tpl} onChange={(e) => pickTpl(e.target.value)} style={{ ...inp, marginTop: 2 }}>
                <option value="">— write below —</option>
                {(st?.templates || []).map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
              </select>
            </label>
            <label className="text-xs" style={{ color: C.dim }}>Month it speaks of <span style={{ color: C.faint }}>(fills {"{{month}}"}, {"{{attendance_days}}"}, {"{{paid_days}}"})</span>
              <select value={sheet} onChange={(e) => { setSheet(e.target.value); setPreview(null); }} style={{ ...inp, marginTop: 2 }}>
                {(st?.sheets || []).map((s) => <option key={s.id} value={`${s.year}-${s.month}`}>{MONTHS[s.month - 1]} {s.year} · {s.status}</option>)}
                {!st?.sheets?.length && <option value="">no salary sheet yet</option>}
              </select>
            </label>
          </div>
          <textarea value={bodyTxt} rows={8} onChange={(e) => { setBodyTxt(e.target.value); setPreview(null); }} placeholder={"Dear {{first_name}},\n\nYour attendance for {{month}}: {{attendance_days}} days present, {{paid_days}} days paid.\n\n- Nandan GSE HR"} className="w-full rounded px-2 py-1.5 mt-2" style={{ border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.6 }} />
          {tpl && st?.templates.find((t) => t.key === tpl)?.note && <div className="text-xs mt-1" style={{ color: C.faint }}>{st.templates.find((t) => t.key === tpl)?.note}</div>}

          <div className="font-bold text-sm mt-3 mb-1">2 · Who</div>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(st?.byType || {}).sort().map(([t, v]) => {
              const on = types.has(t);
              return (
                <button key={t} onClick={() => { setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; }); setPreview(null); }} className="rounded px-2.5 py-1 text-xs font-semibold" style={{ border: `1px solid ${on ? C.orange : C.line}`, background: on ? "#FFF3E8" : "#fff", color: on ? C.orange : C.dim }}>
                  {t} <span style={{ color: C.faint }}>{v.withPhone}/{v.n}</span>
                </button>
              );
            })}
          </div>
          <div className="text-xs mt-1" style={{ color: C.faint }}>{types.size ? "Ticked types only" : "Nobody ticked = everybody on the roll"} · {audience.p} of {audience.n} have a personal mobile.</div>

          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={doPreview} disabled={busy || !bodyTxt.trim()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--blue)", color: "#fff" }}>👁 Preview</button>
            <button onClick={doQueue} disabled={busy || !preview} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: preview ? C.orange : "var(--line)", color: preview ? "#fff" : C.faint }}>⏳ Queue {preview ? preview.count - preview.noPhone : ""}</button>
          </div>

          {preview && (
            <div className="rounded p-2 mt-3" style={{ background: "#FBFAF7", border: `1px dashed ${C.line}` }}>
              <div className="text-xs font-bold" style={{ color: C.faint }}>
                {preview.count} people · {preview.noPhone} without a mobile · sheet {preview.sheet ? `${MONTHS[preview.sheet.month - 1]} ${preview.sheet.year} (${preview.sheet.status})` : "none — payroll variables will be blank"}
                {Object.keys(preview.blanks).length > 0 && <span style={{ color: C.red }}> · blank: {Object.entries(preview.blanks).map(([k, n]) => `{{${k}}} ×${n}`).join(", ")}</span>}
              </div>
              {preview.sample.map((s) => (
                <div key={s.id} className="mt-2 rounded p-2 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 12.5 }}>
                  <div style={{ color: C.faint, fontSize: 11 }}>{s.name} · {s.phone || <span style={{ color: C.red }}>no mobile</span>}</div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{s.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── the queue ── */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line, flex: "1 1 360px" }}>
          <div className="font-bold text-sm mb-1">3 · The WhatsApp queue</div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {["queued", "sending", "sent", "delivered", "failed"].map((s) => (
              <span key={s} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: tone(s) }}>{s} {q?.counts?.[s] || 0}</span>
            ))}
          </div>
          {q?.throttle && (
            <div className="text-xs mb-2" style={{ color: q.throttle.blocked ? "#8A5B00" : C.faint }}>
              {q.throttle.blocked || `Within the ceilings — ${q.throttle.sentLastHour ?? 0}/${q.throttle.perHour ?? "?"} this hour, ${q.throttle.sentToday ?? 0}/${q.throttle.perDay ?? "?"} today.`}
            </div>
          )}
          <div className="flex gap-2 flex-wrap mb-2">
            <button onClick={doSend} disabled={busy || !(q?.counts?.queued)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: q?.counts?.queued ? C.green : "var(--line)", color: q?.counts?.queued ? "#fff" : C.faint }}>▶ Send next 10</button>
            <button onClick={doCheck} disabled={busy || !(q?.counts?.sent)} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>⟳ Check delivery</button>
            <button onClick={load} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>↻</button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {(q?.recent || []).map((r) => (
              <div key={r.id} className="py-1 text-xs flex gap-2 items-baseline" style={{ borderTop: "1px solid #EEECE6" }}>
                <span className="font-bold" style={{ color: tone(r.status), minWidth: 62 }}>{r.status}</span>
                <span style={{ flex: 1 }}>{r.name}</span>
                <span style={{ color: C.faint }}>{fmtFull(String(r.delivered_at || r.sent_at || r.queued_at))}</span>
                {r.error && <span style={{ color: C.red }} title={r.error}>!</span>}
              </div>
            ))}
            {q && !q.recent.length && <div className="text-xs" style={{ color: C.faint }}>Nothing queued from HRMS yet.</div>}
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>The same queue the CRM uses, on Periskope&apos;s default number. Send releases up to ten a click, at least the set gap apart; the hour and day ceilings stop it.</div>
        </div>
      </div>
    </Pane>
  );
}
