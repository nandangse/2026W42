"use client";
/**
 * Tools → Email Queue and WhatsApp Queue.
 *
 * A message is composed and KEPT — rendered whole at queue time, so what
 * the system wrote is what the record holds — then sent from here. Email
 * has three tabs: Queue (placed till sent), Sent (every mail Genie sent,
 * off the Communication log), and Automated send (what the 6 AM cron
 * dispatched). WhatsApp is edit-in-lightbox, and SEND opens WhatsApp with
 * the words ready — that click is the moment it enters Communication.
 */
import { useCallback, useEffect, useState } from "react";
import MailComposer from "./MailComposer";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

interface QItem {
  id: string; channel: string; person: string | null; company: string | null;
  to_email: string | null; to_phone: string | null;
  subject: string | null; body: string | null; template_name: string | null;
  send_mode: string; due_at: string | null; status: string;
  added_by: string; added_at: string; sent_at: string | null; sent_note: string | null;
}
interface SentMail { id: string; subject: string | null; body_text: string | null; to_handles: string[]; occurred_at: string }

const d10 = (s: unknown) => String(s || "").slice(0, 10);

type TrackedMail = { id: string; subject: string; to_handles: string[]; occurred_at: string; opened_at: string | null; open_count: number };

export function EmailQueue() { return <QueueScreen channel="email" />; }
export function WhatsAppQueue() { return <QueueScreen channel="whatsapp" />; }

function QueueScreen({ channel }: { channel: "email" | "whatsapp" }) {
  const [tab, setTab] = useState<"queue" | "sent" | "auto" | "tracking">("queue");
  const [items, setItems] = useState<QItem[] | null>(null);
  const [sentMail, setSentMail] = useState<SentMail[] | null>(null);
  const [tracked, setTracked] = useState<TrackedMail[] | null>(null);
  const [compose, setCompose] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<QItem | null>(null);

  const load = useCallback(() => {
    setItems(null); setSentMail(null);
    fetch(`/api/crm/outbound?channel=${channel}&tab=${tab}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      if (tab === "sent" && channel === "email") setSentMail(j.rows || []);
      else if (tab === "tracking") { setTracked(j.rows || []); setNeeds(!!j.needsMigration); }
      else { setItems(j.items || []); setNeeds(!!j.needsMigration); }
    }).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); setSentMail([]); });
  }, [channel, tab]);
  useEffect(() => { load(); }, [load]);

  const TABS: [typeof tab, string][] = channel === "email"
    ? [["queue", "Queue"], ["sent", "Sent"], ["tracking", "Open tracking"], ["auto", "Automated send"]]
    : [["queue", "Queue"], ["sent", "Sent"]];

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>
          {channel === "email" ? "✉ Email" : "🟢 WhatsApp Queue"}
        </h2>
        {channel === "email" && (
          <button onClick={() => setCompose(true)}
            className="rounded-full px-4 py-1.5 font-bold text-white" style={{ fontSize: 13, background: ORANGE }}>
            ✉ New Email
          </button>
        )}
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded px-3 py-1 font-bold"
            style={{ fontSize: 12.5, background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : MUTED, border: `1px solid ${tab === k ? NAVY : BORDER}` }}>
            {l}
          </button>
        ))}
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "76ch", lineHeight: 1.6 }}>
        {channel === "email"
          ? "Placed till sent. Auto entries go out by themselves at 6 AM through the owner's own Gmail; the rest wait for a hand."
          : "Composed and kept, editable — SEND opens WhatsApp with the words ready, and that click is the moment it enters Communication."}
      </p>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migration 0022 — the queues have nowhere to live yet.</div>}
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

      {compose && (
        <MailComposer
          ctx={{ refs: {}, chain: [] }}
          onClose={() => setCompose(false)}
          onSent={() => { setCompose(false); load(); }}
        />
      )}
      {tab === "tracking" && channel === "email" ? (
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "68vh" }}>
          <table className="w-full text-xs" style={{ minWidth: 640, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#22303C", color: "#fff" }}>
                {["Sent", "To", "Subject", "Opened", "Times"].map((h) => (
                  <th key={h} className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {needs && (<tr><td colSpan={5} className="px-3 py-4" style={{ color: "#8A6D1A" }}>Run CRM migration 0023 first — the pixel has nowhere to write yet.</td></tr>)}
              {tracked?.length === 0 && !needs && (<tr><td colSpan={5} className="px-3 py-4" style={{ color: MUTED }}>No tracked mail yet — the Tracking toggle in the composer starts this ledger.</td></tr>)}
              {(tracked || []).map((m, i) => (
                <tr key={m.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: MUTED }}>
                    {new Date(m.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-2 py-1.5">{(m.to_handles || []).join(", ")}</td>
                  <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {m.opened_at
                      ? <span className="font-bold" style={{ color: "#0D7A3F" }}>✓ {new Date(m.opened_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      : <span style={{ color: MUTED }}>not yet</span>}
                  </td>
                  <td className="px-2 py-1.5 tnum">{m.open_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs p-2" style={{ color: MUTED }}>
            A signal, not a court record: Gmail&apos;s image proxy can open the pixel without a human, and text-only readers never do.
          </div>
        </div>
      ) : tab === "sent" && channel === "email" ? (
        <div className="rounded-lg border" style={{ borderColor: BORDER, background: "#fff" }}>
          {(sentMail || []).map((m) => (
            <div key={m.id} className="px-3 py-2" style={{ borderBottom: "1px solid #F2F4F8" }}>
              <div className="flex items-baseline gap-2">
                <b style={{ fontSize: 12.5, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{m.subject || "(no subject)"}</b>
                <span style={{ fontSize: 10.5, color: MUTED }}>{d10(m.occurred_at)}</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED }}>to {(m.to_handles || []).join(", ")}</div>
            </div>
          ))}
          {sentMail !== null && !sentMail.length && <div className="px-3 py-4 text-sm" style={{ color: MUTED }}>Nothing sent yet.</div>}
          {sentMail === null && <div className="px-3 py-4 text-sm" style={{ color: MUTED }}>loading…</div>}
        </div>
      ) : (
        <div className="rounded-lg border" style={{ borderColor: BORDER, background: "#fff" }}>
          {(items || []).map((q) => (
            <div key={q.id} className="px-3 py-2 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid #F2F4F8" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <div className="flex items-baseline gap-2">
                  <b style={{ fontSize: 12.5, color: INK }}>{q.person || q.to_email || q.to_phone || "—"}</b>
                  {q.company && <span style={{ fontSize: 10.5, color: MUTED }}>· {q.company}</span>}
                  {q.send_mode === "auto" && q.status === "queued" && (
                    <span className="rounded px-1.5 font-bold" style={{ fontSize: 9, background: "#E6F4EB", color: GREEN }}>AUTO · 6 AM</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {q.subject ? `${q.subject} — ` : ""}{(q.body || "").slice(0, 90)}
                </div>
                {q.sent_note && tab !== "queue" && <div style={{ fontSize: 10, color: q.sent_note.includes("failed") ? "#B3261E" : MUTED }}>{q.sent_note} · {d10(q.sent_at)}</div>}
                {q.sent_note?.includes("failed") && tab === "queue" && <div style={{ fontSize: 10, color: "#B3261E" }}>{q.sent_note}</div>}
              </div>
              {tab === "queue" && (
                <button onClick={() => setEdit(q)} className="rounded px-3 py-1.5 font-bold"
                  style={{ background: NAVY, color: "#fff", fontSize: 12 }}>
                  Open
                </button>
              )}
            </div>
          ))}
          {items !== null && !items.length && !needs && (
            <div className="px-3 py-4 text-sm" style={{ color: MUTED }}>
              {tab === "queue" ? "The queue is empty — card scans and composers feed it." : "Nothing here yet."}
            </div>
          )}
          {items === null && <div className="px-3 py-4 text-sm" style={{ color: MUTED }}>loading…</div>}
        </div>
      )}

      {edit && <QueueLightbox item={edit} onClose={() => setEdit(null)} onChanged={() => { setEdit(null); load(); }} />}
    </div>
  );
}

/** Edit in the lightbox; Send from the same box. */
function QueueLightbox({ item, onClose, onChanged }: { item: QItem; onClose: () => void; onChanged: () => void }) {
  const isMail = item.channel === "email";
  const [f, setF] = useState({
    to: String(isMail ? item.to_email || "" : item.to_phone || ""),
    subject: String(item.subject || ""), body: String(item.body || ""),
    auto: item.send_mode === "auto",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/crm/outbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j;
  };
  const save = async () => post({
    action: "update", id: item.id, body: f.body, subject: f.subject,
    ...(isMail ? { to_email: f.to, send_mode: f.auto ? "auto" : "manual" } : { to_phone: f.to }),
  });

  const send = async () => {
    setBusy("send"); setErr("");
    try {
      await save();
      const j = await post({ action: "send", id: item.id });
      if (j.url) window.open(j.url, "_blank", "noopener");  // WhatsApp opens, words ready
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  const keep = async () => {
    setBusy("keep"); setErr("");
    try { await save(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  const cancel = async () => {
    if (!window.confirm("Take this message off the queue?")) return;
    setBusy("cancel");
    try { await post({ action: "cancel", id: item.id }); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(600px,100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <b className="text-white" style={{ fontSize: 14 }}>{isMail ? "✉ Queued mail" : "🟢 Queued WhatsApp"}{item.person ? ` — ${item.person}` : ""}</b>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <label className="block mb-2" style={{ fontSize: 11.5, color: MUTED }}>
            {isMail ? "To (email)" : "To (phone)"}
            <input value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))}
              className="w-full rounded border px-2 py-1.5 block" style={{ borderColor: BORDER, fontSize: 13.5 }} />
          </label>
          {isMail && (
            <label className="block mb-2" style={{ fontSize: 11.5, color: MUTED }}>
              Subject
              <input value={f.subject} onChange={(e) => setF((x) => ({ ...x, subject: e.target.value }))}
                className="w-full rounded border px-2 py-1.5 block" style={{ borderColor: BORDER, fontSize: 13.5 }} />
            </label>
          )}
          <label className="block mb-2" style={{ fontSize: 11.5, color: MUTED }}>
            Message
            <textarea value={f.body} rows={9} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))}
              className="w-full rounded border px-2 py-1.5 block" style={{ borderColor: BORDER, fontSize: 13.5, lineHeight: 1.6 }} />
          </label>
          {isMail && (
            <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: INK }}>
              <input type="checkbox" checked={f.auto} onChange={(e) => setF((x) => ({ ...x, auto: e.target.checked }))} />
              Send automatically at 6 AM {item.due_at ? `(due ${d10(item.due_at)})` : ""}
            </label>
          )}
          {err && <div className="text-xs font-semibold mt-2" style={{ color: "#B3261E" }}>{err}</div>}
        </div>
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={send} disabled={busy !== null} className="rounded px-3 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 13 }}>
            {busy === "send" ? "…" : isMail ? "Send now" : "Send — opens WhatsApp"}
          </button>
          <button onClick={keep} disabled={busy !== null} className="rounded px-3 py-2 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 13 }}>
            {busy === "keep" ? "…" : "Keep in queue"}
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={cancel} disabled={busy !== null} className="rounded px-3 py-2 font-bold" style={{ color: "#B3261E", fontSize: 13 }}>Cancel it</button>
        </div>
      </div>
    </div>
  );
}
