"use client";

/**
 * COMMUNICATION — the email queue (Dr Raghu, 26 Aug 2026). Compact: one row
 * per mail, newest first. Admin eyes filter by sender or see all; everyone
 * else sees their own sends only — the API enforces it, the screen just asks.
 */

import { useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, GREEN } from "./palette";

type Row = {
  id: string; direction: string; subject: string | null; body_text: string | null;
  from_handle: string | null; to_handles: string[] | null; occurred_at: string;
  attachments: { name: string; link: string }[] | null; sender_name: string | null;
  company_id: string | null; person_id: string | null; opportunity_id: string | null; lead_id: string | null;
};

export default function MailQueue({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [sender, setSender] = useState("");
  const [data, setData] = useState<{ isBoss: boolean; total: number; rows: Row[]; senders: { id: string; label: string }[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const p = new URLSearchParams();
    if (sender) p.set("sender", sender);
    fetch(`/api/crm/mailq?${p}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the queue");
        setData(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [sender]);

  const fmt = (v: string) => {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : v;
  };

  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>loading the queue…</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {data.isBoss ? (
          <select value={sender} onChange={(e) => setSender(e.target.value)}
            className="px-2 py-1 rounded text-xs border font-semibold"
            style={{ borderColor: sender ? NAVY : BORDER, background: "#fff", color: sender ? INK : MUTED }}>
            <option value="">Sender: all</option>
            {data.senders.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        ) : (
          <span className="text-xs font-semibold" style={{ color: MUTED }}>Your sent mail</span>
        )}
        <span className="text-xs tnum" style={{ color: MUTED }}>{data.total.toLocaleString("en-IN")} mail{data.total === 1 ? "" : "s"}</span>
      </div>

      {data.rows.length === 0 && (
        <div className="rounded p-6 text-sm" style={{ background: "#fff", border: `1px dashed ${BORDER}`, color: MUTED }}>
          Nothing sent yet. Every ✉ across the CRM lands its mail here.
        </div>
      )}

      {data.rows.map((r) => (
        <div key={r.id} className="rounded border px-3 py-2 mb-1.5" style={{ background: "#fff", borderColor: BORDER, borderLeft: `3px solid ${r.direction === "outbound" ? NAVY : GREEN}` }}>
          <div className="flex items-baseline gap-2 flex-wrap text-xs" style={{ color: MUTED }}>
            <span style={{ fontSize: 13 }}>{r.direction === "outbound" ? "↗" : "↘"}</span>
            <b style={{ color: INK, fontSize: 13 }}>{r.subject || "(no subject)"}</b>
            <span className="tnum">{fmt(r.occurred_at)}</span>
            {r.sender_name && <span>by {r.sender_name}</span>}
            <span>→ {(r.to_handles ?? []).join(", ")}</span>
            {(r.attachments?.length ?? 0) > 0 && <span>📎 {r.attachments!.length}</span>}
            <span className="ml-auto flex gap-1">
              {r.company_id && <button onClick={() => onOpen("company", r.company_id as string)} className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY }}>Co</button>}
              {r.person_id && <button onClick={() => onOpen("person", r.person_id as string)} className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY }}>👤</button>}
              {r.opportunity_id && <button onClick={() => onOpen("opportunity", r.opportunity_id as string)} className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY }}>🎯</button>}
              {r.lead_id && <button onClick={() => onOpen("lead", r.lead_id as string)} className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY }}>📥</button>}
            </span>
          </div>
          {r.body_text && (
            <div className="text-xs mt-0.5" style={{ color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.body_text}>
              {r.body_text.slice(0, 220)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
