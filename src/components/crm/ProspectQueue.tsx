"use client";
/**
 * The Prospecting Queue — the home screen's call list.
 *
 * Fed by the ☎ icon on the deal board; dealt back here one call at a time,
 * oldest first, because a queue that reorders itself is a queue nobody
 * finishes. The number is resolved LIVE from the person record at every
 * load, so a corrected phone corrects the queue. Done keeps the row — the
 * queue is also its own record of calls made.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

interface Item {
  id: string; kind: string; ref_id: string;
  added_at: string; note: string | null;
  title: string; company: string | null;
  phone: string | null; phone_person: string | null;
}

const KIND_LABEL: Record<string, string> = {
  opportunity: "Opportunity", quotation: "Quotation", sales_order: "Sales Order", lead: "Lead",
};

export default function ProspectQueue({ onOpen, compact = false }: { onOpen: (target: string, id: string) => void; compact?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [doneToday, setDoneToday] = useState(0);
  const [err, setErr] = useState("");
  const [needs, setNeeds] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // drag to rearrange (Dr Raghu, 30 Aug 2026) — the drop writes the order
  const dragFrom = useRef<number | null>(null);
  const drop = async (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to || !items) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    try {
      await fetch("/api/crm/prospect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reorder", ids: next.map((x) => x.id) }),
      });
    } catch (e) { swallow("crm/ProspectQueue", e); /* the next load re-reads the truth */ }
  };
  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: () => { dragFrom.current = i; },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); void drop(i); },
    style: { cursor: "grab" } as React.CSSProperties,
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crm/prospect");
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setItems(j.items || []); setDoneToday(j.doneToday || 0); setNeeds(!!j.needsMigration);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: "done" | "remove") => {
    setBusy(id);
    try {
      const r = await fetch("/api/crm/prospect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (!r.ok) throw new Error(String((await r.json().catch(() => ({}))).error || r.status));
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  return (
    <div className="rounded-lg border mb-4" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <b style={{ fontSize: 14, color: INK }}>☎ Prospecting Queue</b>
        <span className="tnum rounded px-2" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12, fontWeight: 800 }}>
          {items?.length ?? "…"} to call
        </span>
        {doneToday > 0 && <span style={{ fontSize: 11.5, color: GREEN, fontWeight: 700 }}>✓ {doneToday} done today</span>}
        <span style={{ flex: 1 }} />
        {!compact && <span style={{ fontSize: 11, color: MUTED }}>fed by the ☎ icon on the Deal Board · oldest first · dial one by one</span>}
      </div>

      {needs && <div className="px-3 py-2 text-xs" style={{ color: "#8A5B00", background: "#FFF7E6" }}>Run CRM migration 0017 — the queue has nowhere to live yet.</div>}
      {err && <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--red)" }}>{err}</div>}

      {items !== null && items.length === 0 && !needs && (
        <div className="px-3 py-5 text-sm" style={{ color: MUTED }}>
          Nothing queued. On the Deal Board, the ☎ icon in a card&apos;s corner drops it here.
        </div>
      )}

      {(items || []).map((it, i) => compact ? (
        <div key={it.id} {...dragProps(i)} className="px-2.5 py-1.5" style={{ borderBottom: "1px solid #F2F4F8", background: i === 0 ? "#FCF8F2" : "#fff", cursor: "grab" }}>
          <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
            <span className="tnum" style={{ width: 14, textAlign: "right", color: i === 0 ? ORANGE : "#C9CDD6", fontWeight: 800, fontSize: 10.5, flexShrink: 0 }}>{i + 1}</span>
            <button onClick={() => onOpen(it.kind, it.ref_id)} className="text-left font-bold" title={`${it.title}`}
              style={{ color: NAVY, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>
              {it.company || it.title}
            </button>
            <button onClick={() => act(it.id, "done")} disabled={busy === it.id} title="Called — records it and moves on"
              className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 10, flexShrink: 0 }}>✓</button>
            <button onClick={() => act(it.id, "remove")} disabled={busy === it.id} title="Off the list, no call recorded"
              style={{ color: MUTED, fontSize: 10, flexShrink: 0 }}>✕</button>
          </div>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: 20 }}>
            {it.phone ? (
              <a href={`tel:${it.phone.replace(/[^+0-9]/g, "")}`} className="font-bold tnum" title={it.phone_person ? `Rings ${it.phone_person}` : "Dial"}
                style={{ color: GREEN, fontSize: 11, textDecoration: "none" }}>📞 {it.phone}</a>
            ) : (
              <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }} title="Add a phone on the contact record">no number</span>
            )}
            {it.phone_person && <span style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.phone_person}</span>}
          </div>
        </div>
      ) : (
        <div key={it.id} {...dragProps(i)} className="flex items-center gap-3 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid #F2F4F8`, background: i === 0 ? "#FCF8F2" : "#fff", cursor: "grab" }}>
          <span className="tnum" style={{ width: 20, textAlign: "right", color: i === 0 ? ORANGE : "#C9CDD6", fontWeight: 800, fontSize: 12 }}>{i + 1}</span>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <button onClick={() => onOpen(it.kind, it.ref_id)} className="text-left font-bold" style={{ color: NAVY, fontSize: 13 }}>
              {it.company || it.title}
            </button>
            <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {KIND_LABEL[it.kind] || it.kind} · {it.title}
            </div>
          </div>
          {it.phone ? (
            <a href={`tel:${it.phone.replace(/[^+0-9]/g, "")}`}
              className="rounded px-3 py-1.5 font-bold"
              style={{ background: GREEN, color: "#fff", fontSize: 13, textDecoration: "none", fontVariantNumeric: "tabular-nums" }}
              title={it.phone_person ? `Rings ${it.phone_person}` : "Dial"}>
              📞 {it.phone}
            </a>
          ) : (
            <span className="rounded px-2 py-1 font-bold" style={{ background: "#FBEAE8", color: "var(--red)", fontSize: 11 }}
              title="No person with a phone number on this company — add one on the contact record">
              no number on record
            </span>
          )}
          {it.phone_person && <span style={{ fontSize: 11, color: MUTED }}>{it.phone_person}</span>}
          <span style={{ flex: 1 }} />
          <button onClick={() => act(it.id, "done")} disabled={busy === it.id}
            className="rounded px-2.5 py-1 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 11.5 }}
            title="Called — keeps the row as a record and moves the queue on">
            ✓ Done
          </button>
          <button onClick={() => act(it.id, "remove")} disabled={busy === it.id}
            className="rounded px-2 py-1" style={{ color: MUTED, fontSize: 11.5 }}
            title="Take it off the list without recording a call">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
