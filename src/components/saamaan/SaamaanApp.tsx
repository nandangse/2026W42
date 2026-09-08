"use client";

/**
 * Saamaan — the materials module (Dr Raghu, 2 Sep 2026: "lets make another
 * App now inside Genie. It will be called Saamaan").
 *
 * सामान — the goods, the stuff, the material a works runs on. Three doors to
 * start: the Dashboard (what the mirror holds), Items (the ERP's Item
 * master, every RM item with its rich description, its drawings and its
 * attachments), Projects (each with the BOM it mentions) and Pull (the ERP
 * walk, Raghu's hand only, and its ledger).
 * The Bill of Materials comes next, on this base.
 *
 * The furniture is the IMS's (components/ims/ui) rather than a ninth set of
 * hex codes — one navy that is exactly the same beats two that are nearly.
 * The nav is a left rail on a desktop and a horizontal strip on a phone.
 */

import { useEffect, useState } from "react";
import GenieShell from "@/components/GenieShell";
import { BORDER, INK, MUTED, NAVY, NAVY_DARK, NAVY_SOFT, PAPER, ORANGE, Note, Empty, useLoad } from "@/components/ims/ui";
import Dashboard, { type Summary } from "./Dashboard";
import Items from "./Items";
import Pull from "./Pull";
import Projects from "./Projects";
import Bom from "./Bom";
import Masters from "./Masters";
import Wip from "./Wip";
import Mrp, { MrpRun } from "./Mrp";
import Kitting from "./Kitting";
import Slips from "./Slips";
import PurchaseOrders from "./PurchaseOrders";
import { LOGO } from "@/lib/logo";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "items", label: "Items", icon: "📦" },
  { key: "projects", label: "Projects", icon: "🏗" },
  { key: "bom", label: "BOM", icon: "🧾" },
  { key: "wip", label: "WIP", icon: "🏭" },
  { key: "mrp", label: "MRP", icon: "📐" },
  { key: "kitting", label: "Kitting register", icon: "✓" },
  { key: "slips", label: "Issue slips", icon: "📨" },
  /* THREE DOORS, NOT ONE (Dr Raghu, 8 Sep 2026: "where r the GRN and PO and
     supliers?"). All three were pulled and all three were on the screen —
     as tabs inside one nav row called "Purchase orders", which is a place
     nobody looks for a supplier. A thing that is not in the navbar does not
     exist. Same screen, opened on its own tab. */
  { key: "po", label: "Purchase orders", icon: "🧾" },
  { key: "suppliers", label: "Suppliers", icon: "🏢" },
  { key: "grn", label: "GRNs", icon: "📥" },
  { key: "masters", label: "Masters", icon: "⚙" },
  { key: "pull", label: "ERP pull", icon: "⇣" },
];

export default function SaamaanApp({
  section, email, displayName, initials, role, isOwner, mrpId,
}: {
  section: string; email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean; mrpId?: string;
}) {
  const [here, setHere] = useState(SECTIONS.some((s) => s.key === section) ? section : "dashboard");
  /** A group picked on the dashboard opens Items already filtered to it. */
  const [groupPick, setGroupPick] = useState("");
  const [summary, , reloadSummary, summaryErr] = useLoad<Summary>("/api/saamaan/items?mode=summary");

  /** Every section at its own URL, so a link copied from anywhere still works. */
  const go = (k: string, group?: string) => {
    setHere(k);
    if (group !== undefined) setGroupPick(group);
    // From a run's own page the sections are real navigations, so the
    // address always says where you are.
    if (mrpId) { window.location.href = `/saamaan/${k}`; return; }
    window.history.replaceState(null, "", `/saamaan/${k}`);
  };
  useEffect(() => { document.title = "Nandan Saamaan Genie"; }, []);

  const body = () => {
    if (summaryErr) return <Note kind="error">{summaryErr}</Note>;
    if (!summary) return <Empty>Opening Saamaan…</Empty>;
    if (!summary.installed)
      return (
        <Note kind="warn">
          <div className="mb-1">Saamaan&apos;s tables are not in the database yet.</div>
          <div style={{ fontWeight: 500 }}>
            Run <b>supabase/migrations/0118_saamaan.sql</b> on Genie&apos;s project. Every table it makes begins
            with <b>material_</b> — that prefix is Saamaan&apos;s boundary inside the one database.
          </div>
        </Note>
      );
    switch (here) {
      case "items": return <Items summary={summary} initialGroup={groupPick} />;
      case "projects": return <Projects summary={summary} />;
      case "bom": return <Bom summary={summary} />;
      case "wip": return <Wip erpBase={summary.erpBase} role={role} summary={summary} />;
      case "mrp": return mrpId ? <MrpRun id={mrpId} role={role} email={email} /> : <Mrp />;
      case "kitting": return <Kitting />;
      case "slips": return <Slips />;
      case "po": return <PurchaseOrders erpBase={summary.erpBase} />;
      case "suppliers": return <PurchaseOrders erpBase={summary.erpBase} openOn="suppliers" />;
      case "grn": return <PurchaseOrders erpBase={summary.erpBase} openOn="grn" />;
      case "masters": return <Masters />;
      case "pull": return <Pull summary={summary} isOwner={isOwner} onDone={reloadSummary} />;
      default: return <Dashboard summary={summary} go={go} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* ------------------------------------------------------------ header
          Dr Raghu, 3 Sep 2026: "in the header also put the logo. Call it
          there NANDAN SAAMAAN. dont need to write the other details! Keep
          version no on the left — Nandan Genie · <version> in small." */}
      {/* Frozen (Dr Raghu, 3 Sep 2026: "keep top header of the menu and side menu frozen"). */}
      <GenieShell module="saamaan" title="Nandan Saamaan" tagline="Materials — items, kitting, purchase orders, suppliers" user={{ email, displayName, initials, role }} />

      <div className="flex" style={{ alignItems: "flex-start" }}>
        {/* -------------------------------------------------------- the rail */}
        <nav className="hidden md:block" style={{ width: 208, flexShrink: 0, borderRight: `1px solid ${BORDER}`, background: "#fff", minHeight: "calc(100vh - 43px)", position: "sticky", top: 43, alignSelf: "flex-start", maxHeight: "calc(100vh - 43px)", overflowY: "auto" }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => go(s.key)}
              className="w-full text-left px-3 py-2.5 text-sm font-bold flex items-center gap-2"
              style={{
                color: here === s.key ? NAVY_DARK : INK,
                background: here === s.key ? NAVY_SOFT : "transparent",
                borderLeft: `3px solid ${here === s.key ? ORANGE : "transparent"}`,
              }}>
              <span style={{ width: 18 }}>{s.icon}</span> {s.label}
            </button>
          ))}
          <div className="px-3 py-3 text-xs" style={{ color: MUTED, lineHeight: 1.6, borderTop: `1px solid ${BORDER}`, marginTop: 8 }}>
            The ERP owns the Item master. Saamaan holds a mirror of it — every field, every attachment, as they are — and
            nothing here is hand-edited. Who may open this door is a tick on Admin → module access.
          </div>
        </nav>

        {/* --------------------------------- the strip, on a phone or tablet */}
        <div className="md:hidden w-full" style={{ position: "sticky", top: 0, zIndex: 20 }}>
          <div className="flex overflow-x-auto" style={{ background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => go(s.key)}
                className="px-3 py-2.5 text-xs font-bold whitespace-nowrap"
                style={{
                  color: here === s.key ? NAVY_DARK : MUTED,
                  borderBottom: `3px solid ${here === s.key ? ORANGE : "transparent"}`,
                }}>
                <span className="mr-1">{s.icon}</span>{s.label}
              </button>
            ))}
          </div>
        </div>

        <main className="p-3 md:p-4" style={{ flex: 1, minWidth: 0 }}>{body()}</main>
      </div>

      <style>{`
        @media (max-width: 767px) {
          main { padding-top: 12px; }
        }
      `}</style>
    </div>
  );
}
