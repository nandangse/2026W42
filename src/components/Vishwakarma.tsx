"use client";

/**
 * Vishwakarma — the design module's shell (Dr Raghu, 28 Aug 2026). Named for
 * the divine engineer who built the golden city Kuber ruled: the builder
 * beside the treasurer on the same menu.
 *
 * The door, header and navbar go up first, the way Kuber's did; each pane
 * names what it will hold so the shape is agreed before the screens fill.
 */

import { useState } from "react";
import { APP_VERSION } from "@/lib/changelog";
import ModuleMenu from "@/components/ModuleMenu";

const SECTIONS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧", blurb: "Design work in motion — what is being drawn, for which job, and what waits on a decision." },
  { key: "drawings", label: "Drawing Register", icon: "▤", blurb: "Every drawing with its number, revision, job and status — the register of record." },
  { key: "bom", label: "BOMs", icon: "▦", blurb: "Bills of material per machine and variant, the bridge from design to kitting." },
  { key: "ecn", label: "Revisions & ECN", icon: "↺", blurb: "Engineering changes with the why, the affected jobs, and who signed them off." },
  { key: "requests", label: "Design Requests", icon: "✉", blurb: "What sales and production ask of design, dated and answered." },
  { key: "standards", label: "Standards Library", icon: "▨", blurb: "The codes, standards and proven details the drawings lean on." },
];

export default function Vishwakarma({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  const sec = SECTIONS.find((s) => s.key === openKey) ?? SECTIONS[0];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      <div style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest" style={{ fontSize: 11, color: "#F5B32B" }}>
                🛠 NANDAN VISHWAKARMA GENIE
              </span>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#22303C", color: "#8FA1B3" }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              Design — the drawings, the BOMs and the changes
            </div>
          </div>
          <span className="ml-auto" />
          <ModuleMenu current="vishwakarma" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        <nav style={{ width: 236, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 8px" }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setOpenKey(s.key)}
              className="w-full text-left rounded px-2.5 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5"
              style={openKey === s.key ? { background: "#16232F", color: "#fff" } : { color: "#5A6672" }}>
              <span style={{ width: 18, textAlign: "center" }}>{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-6">
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: "#E2E0DA", maxWidth: 720 }}>
            <div className="text-lg font-bold mb-1" style={{ color: "#16232F" }}>{sec.icon} {sec.label}</div>
            <div className="text-sm mb-4" style={{ color: "#5A6672", lineHeight: 1.6 }}>{sec.blurb}</div>
            <div className="rounded p-3 text-sm font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
              The shell went up first — this screen is being built. Access is already real: only
              people ticked for Vishwakarma on Admin → module access can open this page.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
