"use client";
/**
 * HRMS — the shell.
 *
 * The structure Dr Raghu specified on 22 Aug 2026:
 *
 *   · a LEFT NAVBAR, collapsible, carrying the modules and their sub-modules
 *     (and sub-modules of those, when they come)
 *   · the RIGHT SIDE opens the relevant page, responsively
 *   · most of it is EMPTY TODAY, and says so — the structure is agreed first
 *
 * On a phone the nav is not a column at all; it slides over the page and
 * closes when something is chosen, because a 240px column on a 375px screen
 * is not navigation, it is an obstruction.
 *
 * The master is fetched ONCE, here, and handed to whichever pane wants it.
 * Every module in the list keys off a person, so a fetch per pane would mean
 * pulling the same few hundred records again on every click.
 */
import { swallow } from "@/lib/swallow";
import GenieShell from "@/components/GenieShell";
import PlaybookScreen from "@/components/Playbook";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import type { HrmsEmployee } from "@/lib/hrms";
import { NAV, findNav, DEFAULT_KEY } from "@/lib/hrms-nav";
import EmployeeMaster, { type MasterView } from "./hrms/EmployeeMaster";
import { Pane, NotBuilt } from "./hrms/Pane";
import ReportCard from "./hrms/ReportCard";
import ModuleMasters from "./hrms/ModuleMasters";
import RolesRegister from "./hrms/RolesRegister";
import ApprovalRecords from "./hrms/ApprovalRecords";
import IdpRecords from "./hrms/IdpRecords";
import AppraisalCard from "./hrms/AppraisalCard";
import AppraisalTable from "./hrms/AppraisalTable";
import AppraisalAnalytics from "./hrms/AppraisalAnalytics";
import AppraisalInterviews from "./hrms/AppraisalInterviews";
import ApprovalCommercial from "./hrms/ApprovalCommercial";
import ApprovalQueries from "./hrms/ApprovalQueries";
import SalarySheets from "./hrms/SalarySheets";
import SalarySlipsTable from "./hrms/SalarySlipsTable";
import StatutoryRecords from "./hrms/StatutoryRecords";
import Offers from "./hrms/Offers";
import StandardTexts from "./hrms/StandardTexts";
import Fnf from "./hrms/Fnf";
import HrQueries from "./hrms/HrQueries";
import WhatsAppBroadcast from "./hrms/WhatsAppBroadcast";
import Payroll from "./hrms/Payroll";
import Communications from "./hrms/Communications";
import Handbook from "./hrms/Handbook";
import SalaryRates from "./hrms/SalaryRates";

export default function Hrms({
  email, initials, displayName, role, isOwner,
}: {
  email: string;
  initials: string | null;
  displayName: string | null;
  role: string;
  isOwner: boolean;
}) {
  const [openKey, setOpenKey] = useState<string>(DEFAULT_KEY);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ master: true });

  const [rows, setRows] = useState<HrmsEmployee[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/hrms/employees");
      setRows(r.employees as HrmsEmployee[]);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Deep-linkable: /hrms#appraisal.table opens that pane, and choosing a pane
  // writes the hash, so a screen can be sent to somebody as a link.
  useEffect(() => {
    const apply = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) return;
      /**
       * #appraisal.card:6022 — the section, and who to open in it.
       *
       * A new tab does not inherit sessionStorage, which is how the person
       * used to be handed across (Dr Raghu, 7 Sep 2026: "open the appraisal
       * discussion with them in new tab"). So the person rides in the hash,
       * where a link can carry it — and the link can then be middle-clicked,
       * bookmarked, or sent to somebody.
       */
      const [h, person] = raw.split(":");
      if (person) {
        try { window.sessionStorage.setItem("hrms.appraisal.person", person); } catch (e) { swallow("Hrms", e); /* fine */ }
      }
      if (h) setOpenKey(findNav(h).key);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const go = (key: string) => {
    setOpenKey(key);
    setMobileNav(false);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${key}`);
  };

  const nav = useMemo(() => findNav(openKey), [openKey]);
  const who = displayName || email;

  const NAV_W = collapsed ? 56 : 236;

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* ═══════════════════ header ═══════════════════ */}
      <div className="no-print">
        <GenieShell module="hrms" title="Nandan HRMS" tagline="Employee master & people records" user={{ email, displayName, initials, role }}
          leading={
            <button
              onClick={() => (window.innerWidth < 860 ? setMobileNav((v) => !v) : setCollapsed((v) => !v))}
              className="rounded px-2 py-1.5 text-sm"
              style={{ background: "var(--ink)", color: "#8FA1B3" }}
              title={collapsed ? "Show the menu" : "Collapse the menu"}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
          } />
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar ═══════════════════ */}
        {mobileNav && (
          <div className="fixed inset-0 no-print" style={{ background: "rgba(13,22,31,.4)", zIndex: 35 }} role="button" tabIndex={0} onClick={() => setMobileNav(false)} />
        )}
        <nav
          className="no-print"
          style={{
            width: NAV_W,
            flexShrink: 0,
            background: "#0D161F",
            paddingBottom: 24,
            overflowY: "auto",
            position: "sticky",
            top: 46,
            height: "calc(100vh - 46px)",
            transition: "width .12s ease",
            // on a narrow screen it slides over rather than squeezing the page
            ...(mobileNav
              ? { position: "fixed", top: 46, left: 0, bottom: 0, height: "auto", width: 250, zIndex: 36 }
              : {}),
          }}
          data-open={mobileNav}
        >
          <div className="hrms-nav" style={{ display: mobileNav || typeof window === "undefined" || window.innerWidth >= 860 ? "block" : "none" }}>
            {NAV.map((s) => {
              const kids = s.items || [];
              const isOpen = expanded[s.key] ?? kids.some((k) => k.key === openKey);
              const selfSelected = !kids.length && openKey === s.key;
              const childSelected = kids.some((k) => k.key === openKey);
              return (
                <div key={s.key}>
                  <button
                    onClick={() => (kids.length ? setExpanded((e) => ({ ...e, [s.key]: !isOpen })) : go(s.key))}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    title={collapsed ? s.label : undefined}
                    style={{
                      color: selfSelected || childSelected ? "#fff" : "#8FA1B3",
                      background: selfSelected ? "var(--accent)" : undefined,
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>
                    {!collapsed && (
                      <>
                        <span className="truncate">{s.label}</span>
                        {!!kids.length && <span className="ml-auto" style={{ fontSize: 9, opacity: 0.7 }}>{isOpen ? "▾" : "▸"}</span>}
                        {!kids.length && s.built === false && <Soon />}
                      </>
                    )}
                  </button>
                  {!collapsed && !!kids.length && isOpen && (
                    <div style={{ paddingBottom: 4 }}>
                      {kids.map((k) => (
                        <button
                          key={k.key}
                          onClick={() => go(k.key)}
                          className="w-full flex items-center gap-1.5 pl-9 pr-3 py-1.5 text-left"
                          style={{
                            color: openKey === k.key ? "#fff" : "#6E8194",
                            background: openKey === k.key ? "var(--accent)" : undefined,
                            fontSize: 12,
                            fontWeight: openKey === k.key ? 700 : 500,
                          }}
                        >
                          <span className="truncate">{k.label}</span>
                          {k.built === false && <Soon />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!collapsed && (
              <div className="px-3 pt-3" style={{ fontSize: 10.5, color: "#4A5A6B", lineHeight: 1.5 }}>
                Modules marked <b>soon</b> have no screen yet. The menu is the agreed structure — each one says what
                will go in it and where that material sits today.
              </div>
            )}
          </div>
        </nav>

        {/* ═══════════════════ right side ═══════════════════ */}
        {nav.key === "playbook" ? (
          <div className="flex-1 p-5" style={{ minWidth: 0 }}>
            <PlaybookScreen kind="hr" email={email} />
          </div>
        ) : nav.key === "appraisal.summary" ? (
          <AppraisalAnalytics who={who}
            onOpenPerson={(id) => {
              try { window.sessionStorage.setItem("hrms.appraisal.person", id); } catch (e) { swallow("Hrms", e); /* fine */ }
              go("appraisal.card");
            }} />
        ) : nav.key === "appraisal.interviews" ? (
          <AppraisalInterviews who={who} />
        ) : nav.key === "appraisal.table" ? (
          <AppraisalTable who={who} isOwner={isOwner}
            onOpenPerson={(id) => {
              // the table is the index; the card is the page. Hand the person
              // across and switch — one click from the row to the discussion.
              try { window.sessionStorage.setItem("hrms.appraisal.person", id); } catch (e) { swallow("Hrms", e); /* fine */ }
              go("appraisal.card");
            }} />
        ) : nav.key === "appraisal.card" ? (
          <AppraisalCard who={who} isOwner={isOwner} />
        ) : nav.key === "idp.individual" ? (
          <IdpRecords who={who} />
        ) : nav.key === "card" ? (
          <ReportCard who={who} />
        ) : nav.key === "offers" ? (
          <Offers who={who} isOwner={isOwner} />
        ) : nav.key === "queries" ? (
          <HrQueries who={who} />
        ) : nav.key === "whatsapp" ? (
          <WhatsAppBroadcast who={who} />
        ) : nav.key === "communications" ? (
          <Communications who={who} />
        ) : nav.key === "policy.handbook" || nav.key === "policy.solved" || nav.key === "policy" ? (
          <Handbook who={who} />
        ) : nav.key === "payroll" ? (
          <Payroll who={who} isOwner={isOwner} />
        ) : nav.key === "fnf" ? (
          <Fnf who={who} isOwner={isOwner} />
        ) : nav.key === "texts" ? (
          <StandardTexts who={who} />
        ) : nav.key === "salary.sheets" || nav.key === "salary" ? (
          <SalarySheets who={who} isOwner={isOwner} />
        ) : nav.key === "salary.slips" ? (
          <SalarySlipsTable who={who} />
        ) : nav.key === "salary.statutory" ? (
          <StatutoryRecords who={who} />
        ) : nav.key === "approvals.commercial" ? (
          <ApprovalCommercial who={who} isOwner={isOwner} />
        ) : nav.key === "approvals.salary" ? (
          <ApprovalQueries who={who} isOwner={isOwner} />
        ) : nav.key === "approvals.records" ? (
          <ApprovalRecords who={who} isOwner={isOwner} />
        ) : nav.key === "idp.roles" ? (
          <RolesRegister who={who} isOwner={isOwner} />
        ) : nav.key === "masters" ? (
          <ModuleMasters who={who} />
        ) : nav.key === "master.rates" ? (
          <SalaryRates who={who} isOwner={isOwner} />
        ) : nav.key.startsWith("master.") ? (
          <EmployeeMaster
            view={nav.key.split(".")[1] as MasterView}
            rows={rows}
            reload={load}
            who={who}
            err={err}
          />
        ) : (
          <Pane
            title={nav.label}
            blurb={nav.item?.blurb ?? nav.sec.blurb}
            who={who}
          >
            <NotBuilt label={nav.label} source={nav.item?.source ?? nav.sec.source} />
          </Pane>
        )}
      </div>

      {isOwner && (
        <div className="px-4 pb-4 no-print" style={{ fontSize: 11, color: "var(--muted)" }}>
          Access to HRMS is granted in Genie → Admin → Users. HR data is isolated in its own hrms_ tables and is
          unreadable by any browser — see migration 0048.
        </div>
      )}
    </div>
  );
}

const Soon = () => (
  <span
    className="rounded px-1 flex-shrink-0"
    style={{ fontSize: 8.5, fontWeight: 700, background: "var(--ink)", color: "#6E8194", marginLeft: "auto" }}
    title="No screen yet — open it to see what will go there"
  >
    soon
  </span>
);
