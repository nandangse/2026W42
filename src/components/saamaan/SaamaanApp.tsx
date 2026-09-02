"use client";

/**
 * Saamaan — the materials module (Dr Raghu, 2 Sep 2026: "lets make another
 * App now inside Genie. It will be called Saamaan").
 *
 * सामान — the goods, the stuff, the material a works runs on. Three doors to
 * start: the Dashboard (what the mirror holds), Items (the ERP's Item
 * master, every RM item with its rich description, its drawings and its
 * attachments) and Pull (the ERP walk, Raghu's hand only, and its ledger).
 * The Bill of Materials comes next, on this base.
 *
 * The furniture is the IMS's (components/ims/ui) rather than a ninth set of
 * hex codes — one navy that is exactly the same beats two that are nearly.
 * The nav is a left rail on a desktop and a horizontal strip on a phone.
 */

import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/changelog";
import ModuleMenu from "@/components/ModuleMenu";
import { BORDER, INK, MUTED, NAVY, NAVY_DARK, NAVY_SOFT, PAPER, ORANGE, Note, Empty, useLoad } from "@/components/ims/ui";
import Dashboard, { type Summary } from "./Dashboard";
import Items from "./Items";
import Pull from "./Pull";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "items", label: "Items", icon: "📦" },
  { key: "pull", label: "ERP pull", icon: "⇣" },
];

export default function SaamaanApp({
  section, email, displayName, initials, role, isOwner,
}: {
  section: string; email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean;
}) {
  const [here, setHere] = useState(SECTIONS.some((s) => s.key === section) ? section : "dashboard");
  /** A group picked on the dashboard opens Items already filtered to it. */
  const [groupPick, setGroupPick] = useState("");
  const [summary, , reloadSummary, summaryErr] = useLoad<Summary>("/api/saamaan/items?mode=summary");

  /** Every section at its own URL, so a link copied from anywhere still works. */
  const go = (k: string, group?: string) => {
    setHere(k);
    if (group !== undefined) setGroupPick(group);
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
            Run <b>supabase/migrations/0117_saamaan.sql</b> on Genie&apos;s project. Every table it makes begins
            with <b>material_</b> — that prefix is Saamaan&apos;s boundary inside the one database.
          </div>
        </Note>
      );
    switch (here) {
      case "items": return <Items summary={summary} initialGroup={groupPick} />;
      case "pull": return <Pull summary={summary} isOwner={isOwner} onDone={reloadSummary} />;
      default: return <Dashboard summary={summary} go={go} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* ------------------------------------------------------------ header */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap"
        style={{ background: NAVY_DARK, borderBottom: `1px solid ${NAVY}` }}>
        <span className="font-bold text-white" style={{ fontSize: 15, letterSpacing: 0.3 }}>
          📦 Nandan Saamaan
        </span>
        <span className="text-xs" style={{ color: "#8FA1B3" }}>
          Materials — the Item master, mirrored from the ERP
        </span>
        <span className="ml-auto flex items-center gap-2">
          {summary?.installed && (
            <span className="rounded px-2 py-0.5 text-xs font-bold tnum" style={{ background: NAVY, color: "#CBD5E1" }}
              title="Items in the mirror, not disabled">
              {summary.items.toLocaleString("en-IN")} items
            </span>
          )}
          <span className="text-xs" style={{ color: "#5F7183" }}>v{APP_VERSION}</span>
          <ModuleMenu current="saamaan" email={email} displayName={displayName} initials={initials} role={role} />
        </span>
      </div>

      <div className="flex" style={{ alignItems: "flex-start" }}>
        {/* -------------------------------------------------------- the rail */}
        <nav className="hidden md:block" style={{ width: 208, flexShrink: 0, borderRight: `1px solid ${BORDER}`, background: "#fff", minHeight: "calc(100vh - 41px)" }}>
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
