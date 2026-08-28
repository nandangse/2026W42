"use client";
/**
 * Sales Plan — Sales Genie's two panes, moved home into the CRM
 * (Dr Raghu, 28 Aug 2026): "My Sales Plan" (the interactive companies /
 * industries / products / pipeline app) and the Playbook, both served
 * byte-for-byte from their authed routes, exactly as they were in Genie.
 * The Sales Genie icon leaves the main app; this is the one door now.
 * Folding the app's DATA into the CRM's own tables is the next, larger step.
 */
import { useState } from "react";
import { NAVY, MUTED, BORDER, ORANGE, INK } from "./palette";

export default function SalesPlan() {
  const [pane, setPane] = useState<"plan" | "playbook">("plan");
  const [seen, setSeen] = useState<Record<string, boolean>>({ plan: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>◩ Sales Plan</h2>
        {(["plan", "playbook"] as const).map((p) => (
          <button key={p} onClick={() => { setPane(p); setSeen((s) => ({ ...s, [p]: true })); }}
            className="rounded px-3 py-1 font-bold"
            style={{ fontSize: 12.5, background: pane === p ? NAVY : "#fff", color: pane === p ? "#fff" : MUTED, border: `1px solid ${pane === p ? NAVY : BORDER}` }}>
            {p === "plan" ? "My Sales Plan" : "Playbook"}
          </button>
        ))}
        <span style={{ fontSize: 11, color: ORANGE, fontWeight: 700 }}>moved from Sales Genie</span>
      </div>
      {/* both stay mounted once visited — same keep-alive as Sales Genie had */}
      {seen.plan && (
        <iframe src="/api/sales/plan" title="My Sales Plan"
          style={{ display: pane === "plan" ? "block" : "none", flex: 1, border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", width: "100%" }} />
      )}
      {seen.playbook && (
        <iframe src="/api/sales/html" title="Playbook"
          style={{ display: pane === "playbook" ? "block" : "none", flex: 1, border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", width: "100%" }} />
      )}
    </div>
  );
}
