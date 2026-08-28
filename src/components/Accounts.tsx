"use client";

/**
 * Kuber — the accounts module's shell (Dr Raghu, 28 Aug 2026). Kuber keeps
 * the wealth; this module keeps the books.
 *
 * The door, the header and the navbar go up first so the module has an address
 * and a grant (the tick on Admin → accounts_access) before it has a ledger.
 * The sections listed here are the intended shape; each pane says plainly that
 * the books arrive next. Granular roles inside Accounts come later, as roles.
 */

import { useState } from "react";
import { APP_VERSION } from "@/lib/changelog";
import ModuleMenu from "@/components/ModuleMenu";

const SECTIONS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧", blurb: "Cash today, receivables ageing, payables due — the morning glance." },
  { key: "receivables", label: "Receivables", icon: "₹", blurb: "Who owes what, since when, and who is chasing it." },
  { key: "payables", label: "Payables", icon: "◔", blurb: "What we owe, by due date, so nothing surprises the bank balance." },
  { key: "bank", label: "Bank & Cash", icon: "🏦", blurb: "The balances and the day's movements, reconciled against the books." },
  { key: "ledgers", label: "Ledgers", icon: "▤", blurb: "The account books themselves — party, expense, and control ledgers." },
  { key: "gst", label: "GST & Statutory", icon: "▦", blurb: "Returns and challans, gated the HRMS way: frozen first, filed after." },
  { key: "reports", label: "Reports", icon: "▨", blurb: "P&L, balance sheet, cash flow — printed the Genie way, PDF on every page." },
];

export default function Accounts({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  const sec = SECTIONS.find((s) => s.key === openKey) ?? SECTIONS[0];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ═══════════════════ header ═══════════════════ */}
      <div style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest" style={{ fontSize: 11, color: "#F5B32B" }}>
                💰 NANDAN KUBER GENIE
              </span>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#22303C", color: "#8FA1B3" }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              The books, the bank and the balances
            </div>
          </div>
          <span className="ml-auto" />
          <ModuleMenu current="accounts" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar ═══════════════════ */}
        <nav style={{ width: 236, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 8px" }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setOpenKey(s.key)}
              className="w-full text-left rounded px-2.5 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5"
              style={openKey === s.key
                ? { background: "#16232F", color: "#fff" }
                : { color: "#5A6672" }}>
              <span style={{ width: 18, textAlign: "center" }}>{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>

        {/* ═══════════════════ pane ═══════════════════ */}
        <main className="flex-1 p-6">
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: "#E2E0DA", maxWidth: 720 }}>
            <div className="text-lg font-bold mb-1" style={{ color: "#16232F" }}>{sec.icon} {sec.label}</div>
            <div className="text-sm mb-4" style={{ color: "#5A6672", lineHeight: 1.6 }}>{sec.blurb}</div>
            <div className="rounded p-3 text-sm font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
              The shell went up first — this screen is being built. Access is already real: only
              people ticked on Admin → module access can open this page.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
