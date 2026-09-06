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
import GenieShell from "@/components/GenieShell";
import { swallow } from "@/lib/swallow";
import UploadFiles from "@/components/kuber/UploadFiles";
import RegisterScreen from "@/components/kuber/Registers";
import KuberTasking from "@/components/kuber/Tasking";
import { KuberDashboard, AgeingScreen, ReportCardScreen, CashFlowScreen, LedgerBrowser, VoucherBrowser, PnLScreen, BalanceSheetScreen, ExpensesScreen, ActualCashFlowScreen, FundFlowScreen, RatioScreen, CfoNoteScreen, VoucherRegister } from "@/components/kuber/Books";
import { MoneyProvider, UnitPicker } from "@/components/kuber/money";
import PlaybookScreen from "@/components/Playbook";
import ComplianceCalendar from "@/components/kuber/Compliance";
import { LOGO } from "@/lib/logo";

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
    header: "REGISTERS",
    items: [
      { key: "salesreg", label: "Sales Register", icon: "▤" },
      { key: "purchreg", label: "Purchase Register", icon: "▥" },
      { key: "loan", label: "Bank Loan Register", icon: "◨" },
      { key: "bg", label: "Bank Guarantees", icon: "🏦" },
      { key: "fd", label: "Fixed Deposits", icon: "▤" },
      { key: "insurance", label: "Insurance", icon: "☂" },
    ],
  },
  {
    header: "INSTRUMENTS",
    items: [
      { key: "bankreco", label: "Bank Reconciliation", icon: "◫" },
      { key: "bounce", label: "Bounced Cheques", icon: "↩" },
      { key: "release", label: "Payments to Release", icon: "➤" },
    ],
  },
  {
    header: "STATEMENTS",
    items: [
      { key: "cfonote", label: "CFO Note", icon: "✎" },
      { key: "pnl", label: "Profit & Loss", icon: "∑" },
      { key: "bs", label: "Balance Sheet", icon: "⚖" },
      { key: "ratios", label: "Ratio Analysis", icon: "∿" },
      { key: "targets", label: "Targets — Plan vs Actual", icon: "◎" },
      { key: "acf", label: "Actual Cash Flow", icon: "≋" },
      { key: "fundflow", label: "Fund Flow", icon: "⇄" },
      { key: "expreg", label: "Expenses Register", icon: "▙" },
      { key: "oereg", label: "OE Register", icon: "▚" },
      { key: "tvcreg", label: "TVC Register", icon: "▞" },
      { key: "compliance", label: "Compliance Calendar", icon: "▦" },
    ],
  },
  {
    header: "CORRESPONDENCE",
    items: [{ key: "tasking", label: "Tasking", icon: "☑" }],
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
    header: "TOOLS",
    items: [{ key: "playbook", label: "Finance Playbook", icon: "📖" }],
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
  bankreco: "Bank Reconciliation — the statement against the books, line by line, feeding the cash flow's opening balance. It needs the bank statement data in; the moment Dr Raghu names the format (CSV export from the bank / manual), it is built.",
  targets: "Targets — the JSA business-dashboard parameters, PLAN against ACTUAL: GP%, NP%, ROI, inventory turn, current and quick ratios, debtor/inventory/creditor days, CCC, working capital, cash & bank, net worth. The ACTUAL side computes from the books; the PLAN side is typed once. Being built next — the plan figures come from Dr Raghu.",

  bank: "Bank & Cash — the balances, the BRS and the PDC register (the sheet's Bank Reco tab), feeding the cash flow's opening balance. Being built next.",
  gst: "GST & Statutory returns detail — the Compliance Calendar under Statements now carries the due-date discipline; deeper GST workings land here later.",
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
  // And the groups fold too, CLOSED BY DEFAULT (same day) — the group
  // holding the open screen opens itself; choices are remembered.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setNavOpen(localStorage.getItem("kuber.nav") !== "0"); } catch (e) { swallow("Accounts", e); /* fine */ }
    try { setOpenGroups(JSON.parse(localStorage.getItem("kuber.nav.groups") || "{}")); } catch (e) { swallow("Accounts", e); /* fine */ }
  }, []);
  const toggleGroup = (h: string) => setOpenGroups((g) => {
    const next = { ...g, [h]: !g[h] };
    try { localStorage.setItem("kuber.nav.groups", JSON.stringify(next)); } catch (e) { swallow("Accounts", e); /* fine */ }
    return next;
  });
  const toggleNav = () => setNavOpen((v) => {
    try { localStorage.setItem("kuber.nav", v ? "0" : "1"); } catch (e) { swallow("Accounts", e); /* fine */ }
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
    try { window.history.replaceState(null, "", `#${key}`); } catch (e) { swallow("Accounts", e); /* SSR */ }
  };

  return (
    <MoneyProvider>
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* ═══════════════════ header ═══════════════════ */}
      <GenieShell module="accounts" title="Nandan Kuber" tagline="The books, the bank and the balances" user={{ email, displayName, initials, role }} tools={<UnitPicker />} />

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar — folds to an icon rail ═══════════════════ */}
        <nav style={{ width: navOpen ? 220 : 54, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 6px", transition: "width .15s ease" }}>
          <button onClick={toggleNav}
            className="w-full rounded px-2 py-1.5 text-xs font-bold mb-1 text-left"
            style={{ color: "var(--muted)" }}
            title={navOpen ? "Fold the sidebar to icons" : "Open the sidebar"}>
            {navOpen ? "« fold" : "»"}
          </button>
          {NAV.map((g, gi) => {
            const holdsOpen = g.items.some((s) => s.key === openKey);
            const folded = navOpen && !!g.header && !openGroups[g.header] && !holdsOpen;
            return (
            <div key={gi} className="mb-1">
              {g.header && navOpen && (
                <button onClick={() => toggleGroup(g.header!)}
                  className="w-full text-left px-2.5 pt-2 pb-1 text-xs font-bold"
                  style={{ color: "var(--blue)", letterSpacing: 1 }}>
                  {folded ? "▸ " : "▾ "}{g.header}
                </button>
              )}
              {!folded && g.items.map((s) => (
                <button key={s.key} onClick={() => go(s.key)}
                  className="w-full text-left rounded px-2 py-1.5 text-sm font-semibold flex items-center gap-2 mb-0.5"
                  title={navOpen ? undefined : s.label}
                  style={openKey === s.key ? { background: "var(--navy)", color: "#fff" } : { color: "var(--dim)" }}>
                  <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
                  {navOpen && s.label}
                </button>
              ))}
            </div>
            );
          })}
        </nav>

        {/* ═══════════════════ pane ═══════════════════ */}
        <main className="flex-1 p-5" style={{ minWidth: 0 }}>
          {openKey === "dashboard" && <KuberDashboard go={go} />}
          {openKey === "cashflow" && <CashFlowScreen go={go} />}
          {openKey === "receivables" && <AgeingScreen kind="receivable" />}
          {openKey === "payables" && <AgeingScreen kind="payable" />}
          {openKey === "reportcard" && <ReportCardScreen />}
          {openKey === "tasking" && <KuberTasking />}
          {openKey === "upload" && <UploadFiles email={email} />}
          {openKey === "ledgers" && <LedgerBrowser />}
          {openKey === "vouchers" && <VoucherBrowser />}
          {openKey === "pnl" && <PnLScreen />}
          {openKey === "bs" && <BalanceSheetScreen />}
          {openKey === "playbook" && <PlaybookScreen kind="finance" email={email} />}
          {openKey === "expreg" && <ExpensesScreen mode="all" />}
          {openKey === "tvcreg" && <ExpensesScreen mode="tvc" />}
          {openKey === "oereg" && <ExpensesScreen mode="oe" />}
          {openKey === "acf" && <ActualCashFlowScreen />}
          {openKey === "fundflow" && <FundFlowScreen />}
          {openKey === "ratios" && <RatioScreen />}
          {openKey === "compliance" && <ComplianceCalendar />}
          {openKey === "cfonote" && <CfoNoteScreen go={go} />}
          {openKey === "salesreg" && <VoucherRegister kind="sales" key="s" />}
          {openKey === "purchreg" && <VoucherRegister kind="purchase" key="p" />}
          {["bg", "fd", "insurance", "payplan", "cashitem", "loan", "bounce", "release"].includes(openKey) && <RegisterScreen kind={openKey} key={openKey} />}
          {openKey in STUBS && (
            <div className="bg-white rounded-lg border p-6" style={{ borderColor: "var(--line)", maxWidth: 720 }}>
              <div className="text-sm" style={{ color: "var(--dim)", lineHeight: 1.6 }}>{STUBS[openKey]}</div>
            </div>
          )}
        </main>
      </div>
    </div>
    </MoneyProvider>
  );
}
