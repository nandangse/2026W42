"use client";

/**
 * Kuber — the accounts module (Dr Raghu, 28 Aug 2026: "build the Kuber
 * properly… act like a great CFO who can see this properly"). The sidebar is
 * the CFO's day, grouped the way the money actually moves, and every section
 * that has data is REAL — the shape mirrors the management-review sheet the
 * module replaces, tab by tab.
 *
 * Kuber keeps the wealth; this module keeps the books. Sections are
 * deep-linkable the HRMS way: /kuber#cashflow opens the cash flow.
 */

import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/changelog";
import ModuleMenu from "@/components/ModuleMenu";
import UploadFiles from "@/components/kuber/UploadFiles";
import RegisterScreen from "@/components/kuber/Registers";
import { KuberDashboard, AgeingScreen, ReportCardScreen, CashFlowScreen, LedgerBrowser, VoucherBrowser } from "@/components/kuber/Books";
import { MoneyProvider, UnitPicker } from "@/components/kuber/money";

const NAV: { header?: string; items: { key: string; label: string; icon: string }[] }[] = [
  {
    items: [
      { key: "dashboard", label: "Dashboard", icon: "◧" },
      { key: "cashflow", label: "13-Week Cash Flow", icon: "〰" },
    ],
  },
  {
    header: "MONEY IN",
    items: [{ key: "receivables", label: "Customer Receivables", icon: "₹" }],
  },
  {
    header: "MONEY OUT",
    items: [
      { key: "payables", label: "Supplier Payables", icon: "◔" },
      { key: "payplan", label: "Payment Planning", icon: "☑" },
      { key: "reportcard", label: "Supplier Report Card", icon: "▦" },
    ],
  },
  {
    header: "INSTRUMENTS",
    items: [
      { key: "bg", label: "Bank Guarantees", icon: "🏦" },
      { key: "fd", label: "Fixed Deposits", icon: "▤" },
      { key: "insurance", label: "Insurance", icon: "☂" },
    ],
  },
  {
    header: "BOOKS",
    items: [
      { key: "upload", label: "Upload Files", icon: "⬆" },
      { key: "ledgers", label: "Ledgers", icon: "▥" },
      { key: "vouchers", label: "Vouchers", icon: "▨" },
      { key: "cashitem", label: "Cash Flow Items", icon: "✎" },
    ],
  },
  {
    header: "LATER",
    items: [
      { key: "bank", label: "Bank & Cash", icon: "◫" },
      { key: "gst", label: "GST & Statutory", icon: "▩" },
      { key: "reports", label: "Reports", icon: "▧" },
    ],
  },
];
const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));

const STUBS: Record<string, string> = {
  bank: "Bank & Cash — the balances, the BRS and the PDC register (the sheet's Bank Reco tab), feeding the cash flow's opening balance. Being built next.",
  gst: "GST & Statutory — the compliance calendar with its due dates, shown the sheet's own way: verified, late-and-risk, not done. Being built.",
  reports: "Reports — the MIS P&L against budget, break-even and the working-capital day ratios, printed the Genie way. Being built.",
};

export default function Accounts({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  // The sidebar folds to an icon rail (Dr Raghu, 28 Aug 2026) — remembered.
  const [navOpen, setNavOpen] = useState(true);
  useEffect(() => {
    try { setNavOpen(localStorage.getItem("kuber.nav") !== "0"); } catch { /* fine */ }
  }, []);
  const toggleNav = () => setNavOpen((v) => {
    try { localStorage.setItem("kuber.nav", v ? "0" : "1"); } catch { /* fine */ }
    return !v;
  });

  // Deep-linkable, the HRMS way: /kuber#cashflow opens the cash flow.
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && ALL_KEYS.includes(h)) setOpenKey(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const go = (key: string) => {
    setOpenKey(key);
    try { window.history.replaceState(null, "", `#${key}`); } catch { /* SSR */ }
  };

  return (
    <MoneyProvider>
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
          <UnitPicker />
          <ModuleMenu current="accounts" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar — folds to an icon rail ═══════════════════ */}
        <nav style={{ width: navOpen ? 220 : 54, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 6px", transition: "width .15s ease" }}>
          <button onClick={toggleNav}
            className="w-full rounded px-2 py-1.5 text-xs font-bold mb-1 text-left"
            style={{ color: "#8A94A0" }}
            title={navOpen ? "Fold the sidebar to icons" : "Open the sidebar"}>
            {navOpen ? "« fold" : "»"}
          </button>
          {NAV.map((g, gi) => (
            <div key={gi} className="mb-1">
              {g.header && navOpen && (
                <div className="px-2.5 pt-2 pb-1 text-xs font-bold" style={{ color: "#8A94A0", letterSpacing: 1 }}>{g.header}</div>
              )}
              {g.items.map((s) => (
                <button key={s.key} onClick={() => go(s.key)}
                  className="w-full text-left rounded px-2 py-1.5 text-sm font-semibold flex items-center gap-2 mb-0.5"
                  title={navOpen ? undefined : s.label}
                  style={openKey === s.key ? { background: "#16232F", color: "#fff" } : { color: "#5A6672" }}>
                  <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
                  {navOpen && s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* ═══════════════════ pane ═══════════════════ */}
        <main className="flex-1 p-5" style={{ minWidth: 0 }}>
          {openKey === "dashboard" && <KuberDashboard go={go} />}
          {openKey === "cashflow" && <CashFlowScreen go={go} />}
          {openKey === "receivables" && <AgeingScreen kind="receivable" />}
          {openKey === "payables" && <AgeingScreen kind="payable" />}
          {openKey === "reportcard" && <ReportCardScreen />}
          {openKey === "upload" && <UploadFiles />}
          {openKey === "ledgers" && <LedgerBrowser />}
          {openKey === "vouchers" && <VoucherBrowser />}
          {["bg", "fd", "insurance", "payplan", "cashitem"].includes(openKey) && <RegisterScreen kind={openKey} key={openKey} />}
          {openKey in STUBS && (
            <div className="bg-white rounded-lg border p-6" style={{ borderColor: "#E2E0DA", maxWidth: 720 }}>
              <div className="text-sm" style={{ color: "#5A6672", lineHeight: 1.6 }}>{STUBS[openKey]}</div>
            </div>
          )}
        </main>
      </div>
    </div>
    </MoneyProvider>
  );
}
