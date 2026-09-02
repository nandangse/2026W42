"use client";

/**
 * ERP pull — reading nandanerp into the mirror.
 *
 * Six phases, six requests, one button: items, their child tables, the
 * files, the projects, the BOM headers, then the BOM lines of the jobs in
 * process. Each phase reports what it found and what it
 * wrote before the next begins, so a walk that stops half-way says exactly
 * where. Raghu's hand only, as with Seva's ERP door; everyone else sees the
 * ledger.
 */

import { useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, INK, MUTED, BORDER, GREEN, RED, post } from "@/components/ims/ui";
import type { Summary, PullLine } from "./Dashboard";

const PHASES: { key: string; label: string; what: string }[] = [
  { key: "items", label: "1 · Items", what: 'every Item whose group is "RM - …" and which is not disabled — the whole document, 500 a page' },
  { key: "children", label: "2 · Child tables", what: "UOM conversions, item defaults, suppliers, reorder levels, taxes, barcodes, customer items, variant attributes" },
  { key: "files", label: "3 · Files", what: "every attachment the ERP holds against those items — the drawings, the images, the rest — as it is" },
  { key: "projects", label: "4 · Projects", what: "every Project, with the Approved BOM it points at and the BOM fields the ERP keeps on it" },
  { key: "boms", label: "5 · BOMs", what: "every BOM header — the item it makes, the project it belongs to, active, default, submitted" },
  { key: "bom_items", label: "6 · BOM lines", what: "every line of every live BOM on a project in process — the working set, whole, each time" },
];

type Line = { phase: string; state: "waiting" | "running" | "done" | "failed"; note: string };

export default function Pull({ summary, isOwner, onDone }: { summary: Summary; isOwner: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const state: Line[] = PHASES.map((p) => ({ phase: p.key, state: "waiting", note: "" }));
    setLines([...state]);
    for (let i = 0; i < PHASES.length; i++) {
      state[i].state = "running"; setLines([...state]);
      const r = await post("/api/saamaan/erp-items", { phase: PHASES[i].key });
      if (!r.ok) {
        state[i] = { ...state[i], state: "failed", note: r.error || "failed" }; setLines([...state]);
        break;
      }
      state[i] = { ...state[i], state: "done", note: String(r.note || "") }; setLines([...state]);
    }
    setBusy(false);
    onDone();
  };

  const fmtAt = (s: string) => new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Screen
      title="ERP pull"
      blurb="Reads nandanerp into Saamaan — items, child tables, files, projects, BOMs, then the BOM lines of the jobs in process. Nothing on the ERP is written, ever."
      action={isOwner ? <Btn kind="primary" onClick={run} disabled={busy} title="Six phases, one after the other">{busy ? "Pulling…" : "⇣ Pull from the ERP"}</Btn> : undefined}>
      {!isOwner && <Note kind="info">The ERP door is Raghu&apos;s to use, for now. The ledger below shows every walk that was made.</Note>}
      {!summary.erpBase && <Note kind="warn">The ERP&apos;s URL is not saved — CRM → Settings → Integrations holds the ERPNext keys, and Saamaan borrows them from there.</Note>}

      <div className="rounded-lg border mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
        {PHASES.map((p, i) => {
          const l = lines[i];
          const colour = !l ? MUTED : l.state === "done" ? GREEN : l.state === "failed" ? RED : l.state === "running" ? "#B45309" : MUTED;
          const word = !l ? "" : l.state === "running" ? "running…" : l.state === "waiting" ? "waiting" : l.state;
          return (
            <div key={p.key} className="px-3 py-2.5 flex gap-3" style={{ borderBottom: i < PHASES.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ minWidth: 130 }}>
                <div className="text-sm font-bold" style={{ color: INK }}>{p.label}</div>
                <div className="text-xs font-bold" style={{ color: colour }}>{word}</div>
              </div>
              <div className="text-xs" style={{ color: MUTED, lineHeight: 1.5 }}>
                {p.what}
                {l?.note && <div className="mt-1 font-semibold" style={{ color: colour }}>{l.note}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>The ledger — every walk, newest first</div>
      <GenieTable<PullLine>
        rows={summary.pulls}
        minWidth={720}
        maxHeight="50vh"
        empty="No pull yet. The mirror is empty until the first one."
        columns={[
          { key: "at", label: "When", align: "left", sort: (r) => r.at, render: (r) => <span className="tnum">{fmtAt(r.at)}</span> },
          { key: "phase", label: "Phase", align: "left", render: (r) => <b>{r.phase}</b> },
          { key: "found", label: "Found", align: "right", render: (r) => <span className="tnum">{r.found.toLocaleString("en-IN")}</span> },
          { key: "written", label: "Written", align: "right", render: (r) => <span className="tnum">{r.written.toLocaleString("en-IN")}</span> },
          { key: "removed", label: "Marked / removed", align: "right", render: (r) => <span className="tnum" style={{ color: r.removed ? "#B45309" : MUTED }}>{r.removed ? r.removed.toLocaleString("en-IN") : "·"}</span> },
          { key: "by", label: "By", align: "left", render: (r) => <span style={{ color: MUTED }}>{(r.by || "").split("@")[0] || "·"}</span> },
          { key: "note", label: "Note", align: "left", render: (r) => <span style={{ whiteSpace: "normal" }}>{r.note}</span> },
        ]}
      />
    </Screen>
  );
}
