"use client";

/**
 * IMS — the Integrated Management System (Dr Raghu, 2 Sep 2026: "IMS separate
 * fork. Build.").
 *
 * ISO 9001, 14001, 45001 and 27001, AWS D1.1 and EN 1090-2 EXC3, plus the
 * non-ISO schemes. A separate fork exactly as the CRM is: its own Supabase
 * project, one Genie login, the email as the bridge.
 *
 * The nav is a left rail on a desktop and a horizontal strip on a phone. Not
 * a hamburger: the eight doors are the module, and hiding them behind a menu
 * on the device Dr Raghu actually reads this on would hide the module.
 */

import { useEffect, useState } from "react";
import GenieShell from "@/components/GenieShell";
import { BORDER, INK, MUTED, NAVY, NAVY_DARK, NAVY_SOFT, Note, PAPER, ORANGE, Empty } from "./ui";
import type { Boot } from "./types";
import Dashboard from "./Dashboard";
import Certifications from "./Certifications";
import Certificates from "./Certificates";
import Documents from "./Documents";
import Registers from "./Registers";
import Standards from "./Standards";
import Tasks from "./Tasks";
import Calendar from "./Calendar";
import Settings from "./Settings";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "certifications", label: "Certifications", icon: "🏅" },
  { key: "certificates", label: "Certificates & Statutory", icon: "📄" },
  { key: "documents", label: "Documents", icon: "📘" },
  { key: "registers", label: "Registers", icon: "🗂" },
  { key: "standards", label: "Standards", icon: "📐" },
  { key: "tasks", label: "Tasks", icon: "✓" },
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

const ROLE_WORDS: Record<string, string> = {
  ims_admin: "IMS Admin (MR)",
  dept_head: "Department head",
  auditor: "Auditor",
  member: "Member",
};

export default function ImsApp({
  section, email, displayName, initials, role,
}: {
  section: string; email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [here, setHere] = useState(SECTIONS.some((s) => s.key === section) ? section : "dashboard");
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootErr, setBootErr] = useState("");

  useEffect(() => {
    fetch("/api/ims/bootstrap", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
        return j;
      })
      .then(setBoot)
      .catch((e) => setBootErr(e instanceof Error ? e.message : String(e)));
  }, []);

  /** Every section at its own URL, so a link copied from anywhere still works. */
  const go = (k: string) => {
    setHere(k);
    window.history.replaceState(null, "", `/ims/${k}`);
  };

  const body = () => {
    if (bootErr) return <Note kind="error">{bootErr}</Note>;
    if (!boot) return <Empty>Opening the IMS…</Empty>;
    if (!boot.installed)
      return (
        <Note kind="warn">
          <div className="mb-1">The IMS tables are not in the database yet.</div>
          <div style={{ fontWeight: 500 }}>
            Run <b>supabase/migrations/0112_ims_core.sql</b> then <b>0113_ims_seed.sql</b> on Genie&apos;s
            project. The IMS lives in Genie&apos;s own database — there is no second project to create.
          </div>
        </Note>
      );
    switch (here) {
      case "certifications": return <Certifications boot={boot} />;
      case "certificates": return <Certificates boot={boot} />;
      case "documents": return <Documents boot={boot} />;
      case "registers": return <Registers boot={boot} />;
      case "standards": return <Standards boot={boot} />;
      case "tasks": return <Tasks boot={boot} />;
      case "calendar": return <Calendar boot={boot} />;
      case "settings": return <Settings boot={boot} />;
      default: return <Dashboard boot={boot} go={go} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* ------------------------------------------------------------ header */}
      <GenieShell module="ims" title="Nandan IMS" tagline="Integrated Management System" user={{ email, displayName, initials, role }}
        tools={boot?.installed ? <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: NAVY, color: "#CBD5E1" }}>{ROLE_WORDS[boot.role] ?? boot.role}</span> : null} />

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
One login, one database. Every IMS table is closed to the browser — reads go through the module, which checks your role first.
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

      {/* The strip is above main on mobile; this restores the order. */}
      <style>{`
        @media (max-width: 767px) {
          main { padding-top: 12px; }
        }
      `}</style>
    </div>
  );
}
