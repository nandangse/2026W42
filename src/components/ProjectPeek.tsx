"use client";
/**
 * THE LOOK BEFORE THE TAB — one lightbox, used everywhere a project number
 * is clicked (Dr Raghu, 9 Sep 2026: "in this the project plan should open
 * up which is same as the lightbox in projects!").
 *
 * It was written inside Projects on 9 September and immediately wanted on
 * Live Projects too. Copying it would have been quicker and would have gone
 * wrong the first time one copy learned a field the other did not — so it
 * lives here, and both screens mount the same component.
 *
 * WHAT IT CARRIES is deliberately short: whose the project is, where it has
 * got to, when it was promised, and who answers for it. That is what a man
 * needs to decide whether this is the project he meant. Everything else is
 * a tab away, and a tab is worth spending only once that is settled.
 *
 * Callers pass ERP field names because that is what both sources hold —
 * Projects passes the ERP row untouched; Live Projects maps its own project
 * meta onto the same keys. A field neither can fill shows an em dash rather
 * than vanishing, so the shape of the card never changes between screens.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

const C = { ink: "var(--navy)", sub: "var(--dim)", line: "var(--line)" };

export type PeekRow = Record<string, unknown>;

export default function ProjectPeek({
  row,
  id,
  onClose,
  extra,
}: {
  /** The ERP row, when the caller already holds it (Projects does). */
  row?: PeekRow;
  /**
   * The project id, when the caller does NOT hold the ERP row (Live
   * Projects holds only a summary). The record is then fetched for real
   * rather than half-filled from what happened to be on the card — a
   * lightbox that shows a dash where the other screen shows a status is
   * two lightboxes, and he asked for one.
   */
  id?: string;
  onClose: () => void;
  /** A second way on, offered by the screen that knows about one — Live
   *  Projects has the GANTT and the project plan in the page already. */
  extra?: React.ReactNode;
}) {
  const [fetched, setFetched] = useState<PeekRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoading(true);
    api.get(`/api/erp-project?id=${encodeURIComponent(id)}`)
      .then((r: { erp?: PeekRow }) => { if (live && r?.erp) setFetched(r.erp); })
      // The seed row still draws. A look that fails to enrich is worse than
      // no look only if it also disappears.
      .catch(() => { /* fall back to whatever the caller seeded */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  const data: PeekRow = { ...(row || {}), ...(fetched || {}) };
  const g = (k: string) => {
    const v = data[k];
    return v === null || v === undefined || v === "" ? (loading ? "…" : "—") : String(v);
  };
  const num = String(data.name ?? id ?? "").replace(/^NGSE-PROJ-/i, "");

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg bg-white"
        style={{ width: "min(760px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}
      >
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
          <div className="text-white font-bold text-sm">{g("name")}</div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4">
          <div style={{ fontFamily: "Barlow, system-ui, sans-serif", fontWeight: 800, fontSize: 19, marginBottom: 10 }}>
            {g("project_name")}
          </div>
          <div className="flex flex-wrap gap-2">
            <Field l="CUSTOMER" v={g("customer")} />
            <Field l="STATUS" v={g("status")} />
            <Field l="STAGE" v={g("project_stage")} />
            <Field l="PROJECT DIRECTOR" v={g("custom_project_director")} />
            <Field l="SALES ORDER" v={g("sales_order")} />
            <Field l="COMMITTED" v={g("customer_committed_delivery_")} />
            <Field l="EXPECTED END" v={g("expected_end_date")} />
            <Field l="PERCENT COMPLETE" v={g("percent_complete")} />
          </div>
          {String(data.short_summary_description ?? "").trim() && (
            <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, color: C.ink, whiteSpace: "pre-wrap" }}>
              {String(data.short_summary_description)}
            </div>
          )}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <a
              href={`/project/${encodeURIComponent(num)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded px-4 py-2 text-sm font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Open the project ↗
            </a>
            {extra}
            <button onClick={onClose} className="rounded px-3 py-2 text-sm font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>
              Close
            </button>
            <span className="ml-auto text-xs" style={{ color: C.sub }}>opens in a new tab</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One labelled fact. Hoisted, not nested — a component built inside a
 *  render is a new type on every render and remounts what is inside it. */
function Field({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", background: "#fff", minWidth: 150 }}>
      <div style={{ fontSize: 10.5, color: C.sub, fontWeight: 700, letterSpacing: .5 }}>{l}</div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{v}</div>
    </div>
  );
}
