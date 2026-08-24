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
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { APP_VERSION } from "@/lib/changelog";
import type { HrmsEmployee } from "@/lib/hrms";
import { NAV, findNav, DEFAULT_KEY } from "@/lib/hrms-nav";
import EmployeeMaster, { type MasterView } from "./hrms/EmployeeMaster";
import { Pane, NotBuilt } from "./hrms/Pane";
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
      const h = window.location.hash.replace(/^#/, "");
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
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ═══════════════════ header ═══════════════════ */}
      <div className="no-print" style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <button
            onClick={() => (window.innerWidth < 860 ? setMobileNav((v) => !v) : setCollapsed((v) => !v))}
            className="rounded px-2 py-1.5 text-sm"
            style={{ background: "#22303C", color: "#8FA1B3" }}
            title={collapsed ? "Show the menu" : "Collapse the menu"}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div className="rounded bg-white px-1.5 py-1 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 22, display: "block" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>
              HRMS
              <span
                style={{ background: "#E8600A", color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6, letterSpacing: 0 }}
                title="Genie's version. HRMS is part of Genie and carries its number — it has none of its own."
              >
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              Employee master &amp; people records
            </div>
          </div>

          <a href="/" className="ml-auto text-xs font-semibold rounded px-2.5 py-1.5 flex-shrink-0"
            style={{ background: "#22303C", color: "#8FA1B3" }} title="Back to Genie">← Genie</a>

          {/* the same identity chip Genie shows — initials, not an email address */}
          <div className="flex items-center gap-2 flex-shrink-0" title={`${who} · ${role.replace("_", " ")}`}>
            <span className="rounded-full font-bold flex items-center justify-center"
              style={{ width: 26, height: 26, fontSize: 11, letterSpacing: 0.3, background: initials ? "#E8600A" : "#B3261E", color: "#fff" }}>
              {initials || "??"}
            </span>
            <span className="hidden sm:block" style={{ fontSize: 11, color: "#8FA1B3" }}>{who}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar ═══════════════════ */}
        {mobileNav && (
          <div className="fixed inset-0 no-print" style={{ background: "rgba(13,22,31,.4)", zIndex: 35 }} onClick={() => setMobileNav(false)} />
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
                      background: selfSelected ? "#E8600A" : undefined,
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
                            background: openKey === k.key ? "#E8600A" : undefined,
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
        {nav.key === "appraisal.summary" ? (
          <AppraisalAnalytics who={who}
            onOpenPerson={(id) => {
              try { window.sessionStorage.setItem("hrms.appraisal.person", id); } catch { /* fine */ }
              go("appraisal.card");
            }} />
        ) : nav.key === "appraisal.interviews" ? (
          <AppraisalInterviews who={who} />
        ) : nav.key === "appraisal.table" ? (
          <AppraisalTable who={who}
            onOpenPerson={(id) => {
              // the table is the index; the card is the page. Hand the person
              // across and switch — one click from the row to the discussion.
              try { window.sessionStorage.setItem("hrms.appraisal.person", id); } catch { /* fine */ }
              go("appraisal.card");
            }} />
        ) : nav.key === "appraisal.card" ? (
          <AppraisalCard who={who} isOwner={isOwner} />
        ) : nav.key === "idp.individual" ? (
          <IdpRecords who={who} />
        ) : nav.key === "salary" ? (
          <SalarySheets who={who} isOwner={isOwner} />
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
        <div className="px-4 pb-4 no-print" style={{ fontSize: 11, color: "#8A94A0" }}>
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
    style={{ fontSize: 8.5, fontWeight: 700, background: "#22303C", color: "#6E8194", marginLeft: "auto" }}
    title="No screen yet — open it to see what will go there"
  >
    soon
  </span>
);
