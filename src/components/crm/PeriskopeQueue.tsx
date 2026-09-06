"use client";
/**
 * WHATSAPP BUSINESS — the Periskope queue (Dr Raghu, 31 Aug 2026).
 *
 * "personalised messages can be created and sent from this … create a queue
 *  for this automation too. While creating it put into queue and when clicked
 *  and sent send it. After sending and its delivered put it into
 *  communication as Whatsapp Biz message."
 *
 * Three acts, three buttons, never one:
 *   ✎ Compose   personalises and PARKS. Nothing leaves.
 *   ➤ Send      releases one message. The ceilings are checked server-side.
 *   ↻ Check     asks Periskope what arrived; delivered ones become
 *               Communication, as WhatsApp Biz messages.
 *
 * The ceilings ride at the top because a queue that hides its own limits is a
 * queue that gets a WhatsApp number banned.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";
import VariableHelp from "./VariableHelp";

interface QRow {
  id: string; phone: string; person_id: string | null; person_name: string | null;
  template_name: string; body: string; status: string; error: string;
  external_id: string | null; queued_at: string; sent_at: string | null; delivered_at: string | null;
}
interface Throttle {
  sentLastHour: number; sentToday: number; secondsSinceLast: number | null;
  perHour: number; perDay: number; gapSeconds: number; blocked: string | null; waitSeconds: number;
}

const STATUS_COLOUR: Record<string, string> = {
  queued: "var(--muted)", sending: "var(--warn)", sent: "#1B6B93", delivered: GREEN, failed: "var(--red)", cancelled: "var(--dim)",
};
const stamp = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function PeriskopeQueue() {
  const [data, setData] = useState<{ installed: boolean; configured: boolean; configError: string | null; throttle: Throttle | null; rows: QRow[] } | null>(null);
  const [filter, setFilter] = useState("queued");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [compose, setCompose] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/crm/wa/queue?status=${filter}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ installed: true, configured: false, configError: "Could not read the queue.", throttle: null, rows: [] }));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label); setMsg("");
    try {
      const r = await fetch("/api/crm/wa/queue", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) { setMsg(j.reason || j.error || "That did not go through."); return j; }
      return j;
    } finally { setBusy(""); load(); }
  };

  const t = data?.throttle;
  const rows = data?.rows ?? [];

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>WhatsApp Business — Periskope</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640, lineHeight: 1.5 }}>
            Personalised messages are made here and <b>parked</b>. A hand releases each one; only what Periskope
            confirms as delivered becomes a WhatsApp Biz message on the record.
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCompose(true)} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>✎ Compose</button>
          <button onClick={() => void act({ action: "check" }, "check")} disabled={!!busy}
            className="rounded border px-3 py-1.5 text-sm font-bold" style={{ borderColor: NAVY, color: NAVY }}
            title="Ask Periskope what arrived — delivered messages land in Communication">
            {busy === "check" ? "Asking Periskope…" : "↻ Check delivery"}
          </button>
        </div>
      </div>

      {data?.installed === false && (
        <div className="rounded p-3 text-sm font-semibold mb-3" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run CRM migration 0049 first — the WhatsApp queue has nowhere to live yet.
        </div>
      )}
      {data?.configError && (
        <div className="rounded p-3 text-sm font-semibold mb-3" style={{ background: "#FBEAE8", color: "#8E2C20" }}>
          {data.configError}
        </div>
      )}

      {/* THE CEILINGS, in sight. */}
      {t && (
        <div className="rounded border p-3 mb-3" style={{ borderColor: t.blocked ? ORANGE : BORDER, background: "#fff" }}>
          <div className="flex gap-5 flex-wrap items-center text-sm">
            <span><b style={{ color: t.sentLastHour >= t.perHour ? "var(--red)" : INK }}>{t.sentLastHour}</b> <span style={{ color: MUTED }}>/ {t.perHour} this hour</span></span>
            <span><b style={{ color: t.sentToday >= t.perDay ? "var(--red)" : INK }}>{t.sentToday}</b> <span style={{ color: MUTED }}>/ {t.perDay} today</span></span>
            <span style={{ color: MUTED }}>{t.gapSeconds}s apart · last sent {t.secondsSinceLast === null ? "never" : `${t.secondsSinceLast}s ago`}</span>
            {t.blocked
              ? <span className="font-bold" style={{ color: "#B26A00" }}>⏸ {t.blocked}</span>
              : <span className="font-bold" style={{ color: GREEN }}>clear to send</span>}
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
            The ceilings live in Settings → Integrations → Periskope and are enforced by the server, not this screen.
            <b style={{ color: "#8A6D1A" }}> Periskope&apos;s own guidance calls 100+ messages a day high risk of a ban</b> and
            suggests 20–50 for an established number, spread across the day rather than fired in one minute.
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-2 flex-wrap">
        {["queued", "sent", "delivered", "failed", "all"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className="rounded px-3 py-1 text-xs font-bold"
            style={filter === s ? { background: NAVY, color: "#fff" } : { background: NAVY_SOFT, color: NAVY }}>
            {s}
          </button>
        ))}
        {msg && <span className="text-xs font-semibold ml-2" style={{ color: "#8E2C20" }}>{msg}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "60vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            {["Status", "To", "Message", "Queued", "Sent", "Delivered", ""].map((h) => (
              <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {!data && <tr><td colSpan={7} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>}
            {data && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-5 text-center" style={{ color: MUTED }}>
                Nothing {filter === "all" ? "in the queue" : `is ${filter}`} — ✎ Compose makes the first batch.
              </td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5">
                  <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: STATUS_COLOUR[r.status] || MUTED }}>{r.status}</span>
                  {r.error && <div style={{ color: "#8E2C20", maxWidth: 200 }}>{r.error}</div>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-semibold">{r.person_name || "—"}</div>
                  <div className="tnum" style={{ color: MUTED }}>{r.phone}</div>
                </td>
                <td className="px-2 py-1.5" style={{ maxWidth: 380 }}>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, maxHeight: 60, overflow: "hidden" }}>{r.body}</div>
                  {r.template_name && <div style={{ color: MUTED }}>from {r.template_name}</div>}
                </td>
                <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{stamp(r.queued_at)}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{stamp(r.sent_at)}</td>
                <td className="px-2 py-1.5 tnum" style={{ color: r.delivered_at ? GREEN : MUTED }}>{stamp(r.delivered_at)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {r.status === "queued" && (
                    <>
                      <button onClick={() => void act({ action: "send", id: r.id }, r.id)} disabled={!!busy || !data?.configured || !!t?.blocked}
                        className="rounded px-2 py-1 font-bold text-white"
                        style={{ background: !data?.configured || t?.blocked ? "#B9BEC4" : GREEN }}
                        title={t?.blocked || "Send this one now"}>
                        {busy === r.id ? "…" : "➤ Send"}
                      </button>
                      <button onClick={() => { if (window.confirm("Drop this message from the queue?")) void act({ action: "cancel", id: r.id }, r.id); }}
                        className="ml-1 font-bold" style={{ color: MUTED }}>✕</button>
                    </>
                  )}
                  {r.status === "sent" && (
                    <button onClick={() => void act({ action: "check", ids: [r.id] }, r.id)} disabled={!!busy}
                      className="rounded border px-2 py-1 font-bold" style={{ borderColor: BORDER, color: NAVY }}>↻</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compose && <ComposeBox onClose={() => setCompose(false)} onQueued={() => { setCompose(false); setFilter("queued"); load(); }} />}
    </div>
  );
}

/**
 * Compose — the words once, the recipients many, the personalisation per head.
 * Recipients are pasted as phone numbers, one per line, so the first batch can
 * go out without waiting for a picker to be built.
 */
function ComposeBox({ onClose, onQueued }: { onClose: () => void; onQueued: () => void }) {
  const [body, setBody] = useState("");
  const [who, setWho] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const numbers = who.split(/[\n,]/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length >= 8);

  const queue = async () => {
    if (!body.trim()) { setErr("Write the message first."); return; }
    if (!numbers.length) { setErr("No usable phone number in that list."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/crm/wa/queue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", template, body, recipients: numbers.map((phone) => ({ phone })) }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Could not queue them."); return; }
    onQueued();
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 640, maxHeight: "90vh", overflow: "auto" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold text-sm">Compose — into the queue, not out the door</div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4 space-y-2">
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>A name for the batch (optional)</span>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="Diwali greeting · AMC renewal…"
              className="w-full border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
          </div>
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>The message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
              placeholder="Dear {{name}}, …"
              className="w-full border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
            <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.6 }}>
              The {"{{variables}}"} are filled per person when it is queued, so what you see in the queue is exactly
              what goes out. <b>Personalise it</b> — Periskope&apos;s advice is that identical text across many
              numbers is the fingerprint that gets a number banned.
            </div>
            <div className="mt-2"><VariableHelp compact /></div>
          </div>
          <div>
            <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>Numbers — one per line, with country code</span>
            <textarea value={who} onChange={(e) => setWho(e.target.value)} rows={5} placeholder="919876543210"
              className="w-full border rounded px-2 py-1.5 text-sm tnum" style={{ borderColor: BORDER }} />
            <div className="text-xs mt-1" style={{ color: numbers.length ? GREEN : MUTED }}>{numbers.length} usable number{numbers.length === 1 ? "" : "s"}</div>
          </div>
          {err && <div className="text-xs font-bold" style={{ color: "#8E2C20" }}>{err}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={queue} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
              {busy ? "Queueing…" : `✎ Queue ${numbers.length || ""} message${numbers.length === 1 ? "" : "s"}`}
            </button>
            <span className="text-xs self-center" style={{ color: MUTED }}>Nothing sends until you press ➤ Send on a row.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
