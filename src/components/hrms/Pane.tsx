"use client";
/**
 * The frame every HRMS screen sits in: a title, whatever tools that screen
 * needs, and the print button.
 *
 * NotBuilt is the other half of it. Most of HRMS is navigation today, and a
 * module that is not written yet says what will go there and where it comes
 * from, rather than showing a blank or being hidden from the menu. Dr Raghu
 * asked for the whole structure up front precisely so it can be checked
 * against what he meant before any of it is built.
 */
import type { ReactNode } from "react";

export function Pane({
  title,
  blurb,
  tools,
  children,
  who,
  print = false,
}: {
  title: string;
  blurb?: string;
  tools?: ReactNode;
  children: ReactNode;
  /** Printed on the paper masthead — who took the printout, and when. */
  who: string;
  /**
   * PDF / Print is OFF unless a page asks for it (Dr Raghu, 23 Aug 2026).
   * It was on everything; it is now one flag, set on the pages whose output
   * actually goes into a physical file. The machinery — the print stylesheet,
   * the paper masthead, the repeating table header — stays ready for
   * whichever page is told to have it next.
   */
  print?: boolean;
}) {
  return (
    <div id="hrms-print" className="p-3 md:p-4" style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
      {/* paper only — hidden on screen, see globals.css */}
      <div id="hrms-print-head" style={{ display: "none", marginBottom: 12, borderBottom: "1px solid #999", paddingBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Nandan GSE — HRMS — {title}</div>
        <div style={{ fontSize: 10, color: "#444" }}>
          Printed by {who} on{" "}
          {new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" · CONFIDENTIAL — personnel record"}
        </div>
      </div>

      <div className="flex items-start gap-3 flex-wrap mb-3">
        <div style={{ minWidth: 0 }}>
          <h1 className="font-bold" style={{ fontSize: 17, lineHeight: 1.2 }}>{title}</h1>
          {blurb && <div style={{ fontSize: 12, color: "#8A94A0", lineHeight: 1.5, maxWidth: 720 }}>{blurb}</div>}
        </div>
        <div className="flex items-center gap-1.5 ml-auto no-print flex-wrap">
          {tools}
          {print && (
          <button
            onClick={() => window.print()}
            className="text-xs font-bold rounded px-2.5 py-1.5"
            style={{ background: "#16232F", color: "#fff" }}
            title="Print this page, or save it as a PDF for the file — the browser's own dialogue"
          >
            🖨 PDF / Print
          </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function NotBuilt({ label, source }: { label: string; source?: string }) {
  return (
    <div className="bg-white rounded-lg border p-5" style={{ borderColor: "#E2E0DA", maxWidth: 760 }}>
      <div className="font-bold text-sm mb-1" style={{ color: "#8A5B00" }}>
        Not built yet — the menu entry is here so the structure can be checked first
      </div>
      <div className="text-xs mb-3" style={{ color: "#5A6672", lineHeight: 1.6 }}>
        <b>{label}</b> has no screen in Genie today. Nothing is lost by that: whatever it will hold is still
        wherever it lives now, and this page will read it rather than replace it.
      </div>
      {source && (
        <div className="rounded p-3" style={{ background: "#F4F2EC" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#5A6672" }}>Where the material is today</div>
          <div className="text-xs" style={{ color: "#5A6672", lineHeight: 1.6 }}>{source}</div>
        </div>
      )}
      <div className="text-xs mt-3" style={{ color: "#8A94A0", lineHeight: 1.6 }}>
        The three sheets behind HRMS are catalogued in <b>docs/HR-SOURCE-DOCUMENTS.md</b> — every tab, what it
        holds, and which module it becomes.
      </div>
    </div>
  );
}
