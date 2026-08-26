"use client";

/**
 * NANDAN CRM — the shell.
 *
 * One screen that renders any doctype, because the doctype registry says what
 * the columns are and what the form needs. Dr Raghu's rule -- every doctype
 * can add records -- holds by construction: there is no per-doctype screen
 * that could be built without an Add button.
 *
 * The table earns its keep on 54k companies: filters and sort run in
 * Postgres (the list caps at 500 rows, so client-side sorting would sort a
 * fiction), columns can be pinned, chosen and re-chosen per doctype (kept in
 * localStorage), a row opens in a lightbox for reading, and Edit inside it
 * goes deeper. A link cell is a door: clicking the company on an opportunity
 * opens the company.
 *
 * It wears Genie's colours on purpose. Same company, same person using it,
 * one keystroke apart in the address bar; a second visual language would be
 * a cost with nothing bought.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOCTYPES, doctypeBySlug, type Doctype, type Field } from "@/crm/doctypes";
import AnalyticsScreen from "./Analytics";
import { DateRangeBar, DEFAULT_RANGE, type DateRange } from "./DateRange";

// Sales Genie's palette (src/sales-plan/styles.css), moved here on Dr Raghu's
// word 24 Aug 2026 — one look for the whole of sales.
const PAPER = "#F7F8FC";        // the page ground; cards sit white on it
const NAVY = "#1B2D6B";
const NAVY_DARK = "#14224F";
const NAVY_SOFT = "#EEF1FA";
const INK = "#22283A";
const MUTED = "#6B7280";
const BORDER = "#E5E8F0";
const ORANGE = "#F04E23";
const PINNED_W = 180; // pinned columns take a fixed width so sticky offsets add up

type Row = Record<string, unknown>;
type Links = Record<string, { id: string; label: string }[]>;
/** What the lightbox is showing: possibly another doctype than the page. */
type ViewState = { dt: Doctype; row: Row; links: Links; mode: "view" | "edit" };

/** Sections that are pages of their own rather than doctypes. Deals is real —
 *  the pipeline flow. The others' screens are coming; the URLs already answer. */
export const SPECIAL_SECTIONS = [
  { name: "dashboard", label: "Dashboard", icon: "◧", blurb: "The CEO cockpit — owner concentration, the funnel, the response clock. Being built next." },
  { name: "analytics", label: "Analytics", icon: "◫", blurb: "Win rates, stage velocity, source economics — read from the stage histories. Being built." },
  { name: "salespersonplan", label: "SalesPerson Plan", icon: "◐", blurb: "Each salesperson's plan against their pipeline. Being built." },
  { name: "deals", label: "Deals", icon: "◆", blurb: "" },
  { name: "communication", label: "Communication", icon: "✉", blurb: "Emails — automated, inbound and outbound, per user's own mailbox. Arrives with the channels phase." },
] as const;

/** The URL each doctype answers at — Dr Raghu's spellings. */
const URL_OF: Record<string, string> = {
  lead: "lead", company: "company", person: "contact", quotation: "quotation",
  quotation_line: "quoteline", opportunity: "opportunity", sales_order: "salesorder",
  interaction: "interactions", task: "task", address: "address", person_phone: "phone",
  product: "product", sales_invoice: "salesinvoice",
  sector: "sector", industry: "industry", stage: "stage", profile: "users",
};

/** The sidebar, in Dr Raghu's order (24 Aug 2026). `dt` names a doctype,
 *  `sp` a screen of its own, `href` a door to elsewhere in Genie. */
const NAV: { header?: string; collapsible?: boolean; items: ({ dt: string } | { sp: string } | { href: string; label: string; icon: string })[] }[] = [
  {
    items: [
      { sp: "dashboard" }, { sp: "analytics" }, { sp: "salespersonplan" },
      { href: "/sales-plan", label: "Sales Plan", icon: "◩" },
    ],
  },
  { header: "PIPELINE", items: [{ dt: "lead" }, { dt: "opportunity" }, { dt: "quotation" }, { dt: "sales_order" }] },
  { items: [{ sp: "deals" }] },
  {
    header: "ACCOUNTS",
    items: [{ dt: "company" }, { dt: "person" }, { dt: "address" }, { dt: "person_phone" }, { dt: "industry" }, { dt: "product" }, { dt: "sales_invoice" }],
  },
  { header: "MORE", items: [{ dt: "interaction" }, { dt: "task" }, { dt: "quotation_line" }, { sp: "communication" }] },
  { header: "SETTINGS", collapsible: true, items: [{ dt: "sector" }, { dt: "stage" }, { dt: "profile" }] },
];

export default function CrmApp({
  email, displayName, version, initialSlug,
}: {
  email: string; displayName: string | null; version: string; initialSlug?: string;
}) {
  const [slug, setSlug] = useState(initialSlug ?? DOCTYPES[0].name);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [links, setLinks] = useState<Links>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  // ---- table controls, per doctype, remembered ---------------------------
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");            // debounced into q
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);   // null = registry default
  const [pin, setPin] = useState(0);
  const [colsOpen, setColsOpen] = useState(false);
  const [view, setView] = useState<ViewState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The sidebar folds to an icon rail — open all the time was noise.
  const [navOpen, setNavOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("crmNavOpen") !== "0"; } catch { return true; }
  });
  const toggleNav = () => {
    setNavOpen((v) => {
      try { localStorage.setItem("crmNavOpen", v ? "0" : "1"); } catch { /* fine */ }
      return !v;
    });
  };

  const special = SPECIAL_SECTIONS.find((s) => s.name === slug);
  const dt = useMemo(() => DOCTYPES.find((d) => d.name === slug), [slug]);

  // Switching doctype resets the working state, recalls its saved layout,
  // and keeps the address bar honest — every section has its URL.
  useEffect(() => {
    setQ(""); setQLive(""); setFilters({}); setSort(null); setAdding(false);
    setColsOpen(false); setView(null);
    try {
      const c = localStorage.getItem(`crmCols.${slug}`);
      setCols(c ? (JSON.parse(c) as string[]) : null);
      setPin(Number(localStorage.getItem(`crmPin.${slug}`)) || 0);
    } catch { setCols(null); setPin(0); }
    try { window.history.replaceState(null, "", `/crm/${URL_OF[slug] ?? slug}`); } catch { /* SSR */ }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qLive), 300);
    return () => clearTimeout(t);
  }, [qLive]);

  const load = useCallback(async () => {
    if (!DOCTYPES.some((d) => d.name === slug)) { setLoading(false); setRows([]); return; }
    setLoading(true);
    setErr("");
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      for (const [k, v] of Object.entries(filters)) if (v !== "") p.set(`f_${k}`, v);
      if (sort) { p.set("sort", sort.col); p.set("dir", sort.dir); }
      const r = await fetch(`/api/crm/${slug}?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load");
      setRows(j.rows);
      setTotal(typeof j.total === "number" ? j.total : j.rows.length);
      setLinks(j.links || {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [slug, q, filters, sort]);

  useEffect(() => { void load(); }, [load]);

  // ---- columns -----------------------------------------------------------
  const defaultCols = useMemo(
    () => (dt ? dt.fields.filter((f) => f.inList).map((f) => f.name) : []),
    [dt],
  );
  const visibleNames = cols ?? defaultCols;
  const visible = visibleNames
    .map((n) => dt?.fields.find((f) => f.name === n))
    .filter((f): f is Field => !!f);

  const saveCols = (next: string[] | null) => {
    setCols(next);
    try {
      if (next) localStorage.setItem(`crmCols.${slug}`, JSON.stringify(next));
      else localStorage.removeItem(`crmCols.${slug}`);
    } catch { /* private mode -- layout just won't stick */ }
  };
  const savePin = (n: number) => {
    setPin(n);
    try { localStorage.setItem(`crmPin.${slug}`, String(n)); } catch { /* ditto */ }
  };

  const toggleSort = (col: string) =>
    setSort((s) => (s?.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : null));

  // Filters live on every select / link / bool field -- the ones with a
  // finite set of answers. Free text already has the search box, and the
  // company filter types along instead of dropping 54k names down.
  const filterables = (dt?.fields ?? []).filter(
    (f) => !f.noFilter && !f.virtual
      && (f.type === "select" || f.type === "bool" || (f.type === "link" && f.link)),
  );
  // Anything hanging off a company can also be filtered by the customer's industry.
  const industryFilter = !!dt && dt.name !== "company"
    && dt.fields.some((f) => f.name === "company_id") && (links.industry?.length ?? 0) > 0;

  /** A link cell is a door: open the record it points at. */
  const openLinked = async (target: string, id: string) => {
    const tDt = doctypeBySlug(target);
    if (!tDt) return;
    try {
      const r = await fetch(`/api/crm/${target}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not open");
      setView({ dt: tDt, row: j.row, links: j.links || {}, mode: "view" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK }}>
      {/* ---------- header — Sales Genie's: white, orange rule, navy title ---------- */}
      <header
        style={{ background: "#fff", borderBottom: `3px solid ${ORANGE}`, position: "sticky", top: 0, zIndex: 40 }}
        className="px-4 py-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3">
            <div className="font-extrabold tracking-wide" style={{ color: NAVY, fontSize: 16 }}>
              NANDAN <span style={{ color: ORANGE }}>CRM</span>
              <span
                title="One Genie version number, across every module — the CRM does not version on its own."
                style={{ background: ORANGE, color: "#fff", borderRadius: 4, padding: "1px 6px", marginLeft: 8, fontSize: 11, fontWeight: 700, verticalAlign: "middle" }}
              >
                {version}
              </span>
            </div>
            <h1 className="font-bold" style={{ fontSize: 15, lineHeight: 1.2, color: INK }}>
              {special?.label ?? dt?.plural ?? "CRM"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs font-bold" style={{ color: NAVY }}>
              ← Genie
            </a>
            <span className="text-xs" style={{ color: MUTED }}>
              {displayName || email}
            </span>
          </div>
        </div>
      </header>

      <div className="flex" style={{ alignItems: "flex-start" }}>
        {/* ---------- doctype nav ---------- */}
        <nav
          className="p-2"
          style={{
            width: navOpen ? 190 : 54, flexShrink: 0, borderRight: `1px solid ${BORDER}`,
            background: "#fff", minHeight: "calc(100vh - 50px)", position: "sticky", top: 50,
            transition: "width .15s ease",
          }}
        >
          <button
            onClick={toggleNav}
            title={navOpen ? "Collapse the sidebar" : "Expand the sidebar"}
            className="w-full rounded px-2 py-1.5 mb-2 text-left font-bold"
            style={{ color: MUTED, background: NAVY_SOFT, fontSize: 13, textAlign: navOpen ? "left" : "center" }}
          >
            {navOpen ? "⟨ collapse" : "⟩"}
          </button>
          {!navOpen && NAV.map((block, bi) => (
            <div key={bi} className="mb-2 flex flex-col gap-0.5">
              {block.items.map((it) => {
                if ("href" in it) {
                  return (
                    <a key={it.href} href={it.href} title={it.label}
                      className="rounded py-1.5 text-center" style={{ fontSize: 15, color: "#5A6672" }}>
                      {it.icon}
                    </a>
                  );
                }
                const name = "dt" in it ? it.dt : it.sp;
                const d = "dt" in it ? DOCTYPES.find((x) => x.name === it.dt) : undefined;
                const sp = "sp" in it ? SPECIAL_SECTIONS.find((x) => x.name === it.sp) : undefined;
                if (!d && !sp) return null;
                if (d?.onlyFor && !d.onlyFor.includes(email)) return null;
                return (
                  <button
                    key={name}
                    onClick={() => setSlug(name)}
                    title={d?.plural ?? sp?.label}
                    className="rounded py-1.5 text-center"
                    style={name === slug
                      ? { background: NAVY, color: "#fff", fontSize: 15 }
                      : { color: "#5A6672", fontSize: 15 }}
                  >
                    {d?.icon ?? sp?.icon}
                  </button>
                );
              })}
            </div>
          ))}
          {navOpen && NAV.map((block, bi) => {
            const open = !block.collapsible || settingsOpen
              || block.items.some((it) => "dt" in it ? it.dt === slug : "sp" in it ? it.sp === slug : false);
            return (
              <div key={bi} className="mb-3">
                {block.header && (
                  <button
                    onClick={() => block.collapsible && setSettingsOpen((v) => !v)}
                    className="w-full text-left text-xs font-bold px-2 mb-1 flex items-center justify-between"
                    style={{ color: MUTED, letterSpacing: 1.1, cursor: block.collapsible ? "pointer" : "default" }}
                  >
                    {block.header}
                    {block.collapsible && <span style={{ fontSize: 9 }}>{open ? "▾" : "▸"}</span>}
                  </button>
                )}
                {open && block.items.map((it) => {
                  if ("href" in it) {
                    return (
                      <a
                        key={it.href}
                        href={it.href}
                        className="w-full text-left px-2 py-1.5 rounded text-sm font-semibold flex items-center gap-2"
                        style={{ color: "#5A6672" }}
                      >
                        <span style={{ opacity: 0.7, fontSize: 11 }}>{it.icon}</span>
                        {it.label}
                      </a>
                    );
                  }
                  const name = "dt" in it ? it.dt : it.sp;
                  const d = "dt" in it ? DOCTYPES.find((x) => x.name === it.dt) : undefined;
                  const sp = "sp" in it ? SPECIAL_SECTIONS.find((x) => x.name === it.sp) : undefined;
                  if (!d && !sp) return null;
                  // Some doctypes are for named eyes only — the API enforces
                  // it; the sidebar simply doesn't show the door.
                  if (d?.onlyFor && !d.onlyFor.includes(email)) return null;
                  return (
                    <button
                      key={name}
                      onClick={() => setSlug(name)}
                      className="w-full text-left px-2 py-1.5 rounded text-sm font-semibold flex items-center gap-2"
                      style={
                        name === slug
                          ? { background: NAVY, color: "#fff" }
                          : { color: "#5A6672", background: "transparent" }
                      }
                    >
                      <span style={{ opacity: 0.7, fontSize: 11 }}>{d?.icon ?? sp?.icon}</span>
                      {d?.plural ?? sp?.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ---------- a screen of its own ---------- */}
        {special && (
          <main className="p-4 flex-1" style={{ minWidth: 0 }}>
            {special.name === "deals" ? (
              <PipelineFlow />
            ) : special.name === "analytics" ? (
              <AnalyticsScreen />
            ) : (
              <StubScreen label={special.label} blurb={special.blurb} dated={special.name !== "communication"} />
            )}
          </main>
        )}

        {/* ---------- the doctype ---------- */}
        {!special && dt && (
        <main className="p-4 flex-1" style={{ minWidth: 0 }}>
          {dt.blurb && (
            <p className="text-xs mb-3" style={{ color: "#5A6672", maxWidth: "80ch", lineHeight: 1.6 }}>
              {dt.blurb}
            </p>
          )}

          {/* ---------- toolbar: add · search · filters · columns ---------- */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button
              onClick={() => setAdding((v) => !v)}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={{ background: adding ? "#5A6672" : ORANGE, color: "#fff" }}
            >
              {adding ? "Cancel" : `+ Add ${dt.label}`}
            </button>
            <input
              value={qLive}
              onChange={(e) => setQLive(e.target.value)}
              placeholder={`Search ${dt.plural.toLowerCase()}`}
              className="px-2 py-1.5 rounded text-sm border"
              style={{ borderColor: BORDER, minWidth: 210 }}
            />
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setColsOpen((v) => !v)}
                className="px-2 py-1.5 rounded text-sm font-semibold border"
                style={{ borderColor: BORDER, background: "#fff", color: "#5A6672" }}
              >
                Columns ▾
              </button>
              {colsOpen && (
                <ColumnPicker
                  dt={dt}
                  visibleNames={visibleNames}
                  onChange={saveCols}
                  onClose={() => setColsOpen(false)}
                />
              )}
            </div>
            <span className="text-xs tnum" style={{ color: MUTED }}>
              {loading
                ? "loading…"
                : total !== null && total > rows.length
                  ? `showing ${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records — narrow with search or filters`
                  : `${(total ?? rows.length).toLocaleString("en-IN")} record${(total ?? rows.length) === 1 ? "" : "s"}`}
            </span>
          </div>

          {/* ---------- filter bar ---------- */}
          {(filterables.length > 0 || industryFilter) && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>FILTER</span>
              {filterables.filter((f) => f.link === "company").map((f) => (
                <div key={f.name} style={{ width: 210 }}>
                  <LinkAutocomplete
                    target="company"
                    value={filters[f.name] ?? ""}
                    valueLabel={(links.company || []).find((o) => o.id === (filters[f.name] ?? ""))?.label ?? ""}
                    onPick={(id) => setFilters((cur) => ({ ...cur, [f.name]: id }))}
                  />
                </div>
              ))}
              {industryFilter && (
                <select
                  value={filters.company_industry ?? ""}
                  onChange={(e) => setFilters((cur) => ({ ...cur, company_industry: e.target.value }))}
                  className="px-2 py-1 rounded text-xs border"
                  style={{
                    borderColor: filters.company_industry ? ORANGE : BORDER,
                    background: "#fff",
                    color: filters.company_industry ? INK : "#5A6672",
                    maxWidth: 190,
                  }}
                >
                  <option value="">Industry: all</option>
                  {(links.industry || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )}
              {filterables.filter((f) => f.link !== "company").map((f) => (
                <select
                  key={f.name}
                  value={filters[f.name] ?? ""}
                  onChange={(e) => setFilters((cur) => ({ ...cur, [f.name]: e.target.value }))}
                  className="px-2 py-1 rounded text-xs border"
                  style={{
                    borderColor: filters[f.name] ? ORANGE : BORDER,
                    background: "#fff",
                    color: filters[f.name] ? INK : "#5A6672",
                    maxWidth: 190,
                  }}
                >
                  <option value="">{f.label}: all</option>
                  {f.type === "bool" ? (
                    <>
                      <option value="true">{f.label}: yes</option>
                      <option value="false">{f.label}: no</option>
                    </>
                  ) : f.type === "select" ? (
                    (f.options || []).map((o) => <option key={o} value={o}>{o}</option>)
                  ) : (
                    (links[f.link as string] || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)
                  )}
                </select>
              ))}
              {Object.values(filters).some((v) => v !== "") && (
                <button
                  onClick={() => setFilters({})}
                  className="text-xs font-semibold"
                  style={{ color: ORANGE }}
                >
                  clear
                </button>
              )}
            </div>
          )}

          {adding && (
            <div
              onClick={() => setAdding(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 60, background: "rgba(27,45,107,.45)",
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                padding: "48px 16px", overflowY: "auto",
              }}
            >
              <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(880px, 100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
                  <div className="text-white font-bold" style={{ fontSize: 15 }}>New {dt.label.toLowerCase()}</div>
                  <button onClick={() => setAdding(false)} className="px-2.5 py-1 rounded text-sm font-semibold" style={{ background: NAVY_DARK, color: "#C8D2DC" }}>✕</button>
                </div>
                <div className="p-4">
                  <RecordForm
                    dt={dt}
                    links={links}
                    onDone={(saved) => {
                      setAdding(false);
                      void load();
                      // the record stays open — straight into its lightbox
                      if (saved?.id) void openLinked(dt.name, String(saved.id));
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {err && (
            <div
              className="rounded p-3 mb-3 text-sm"
              style={{ background: "#FBEAE8", color: "#8E2C20", border: "1px solid #F0C8C2", maxWidth: "80ch", lineHeight: 1.6 }}
            >
              {err}
            </div>
          )}

          {!err && !loading && rows.length === 0 && (
            <div
              className="rounded p-6 text-center"
              style={{ background: "#fff", border: `1px dashed ${BORDER}`, color: MUTED }}
            >
              <div className="text-sm font-semibold mb-1">No {dt.plural.toLowerCase()} here</div>
              <div className="text-xs">
                {q || Object.values(filters).some((v) => v) ? "Nothing matches the search and filters." : (
                  <>Press <b style={{ color: ORANGE }}>+ Add {dt.label}</b> to put the first one in.</>
                )}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div
              className="rounded border"
              style={{
                borderColor: BORDER, background: "#fff",
                overflow: "auto", maxHeight: "calc(100vh - 250px)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 520 }}>
                <thead>
                  <tr>
                    {visible.map((f, ci) => (
                      <th
                        key={f.name}
                        onClick={() => toggleSort(f.name)}
                        title="Click to sort · 📌 pins up to here"
                        style={{
                          textAlign: "left", padding: "8px 12px", fontSize: 11, cursor: "pointer",
                          letterSpacing: 0.6, color: sort?.col === f.name ? INK : MUTED,
                          whiteSpace: "nowrap",
                          background: "#fff", userSelect: "none",
                          // The header row is frozen; a pinned column's header
                          // freezes on both axes at once.
                          position: "sticky", top: 0, zIndex: ci < pin ? 7 : 6,
                          boxShadow: `inset 0 -2px 0 ${BORDER}` + (ci < pin ? `, inset -1px 0 0 ${BORDER}` : ""),
                          ...(ci < pin ? { left: ci * PINNED_W, width: PINNED_W, minWidth: PINNED_W } : null),
                        }}
                      >
                        {f.label.toUpperCase()}
                        {sort?.col === f.name && <span style={{ color: ORANGE }}> {sort.dir === "asc" ? "▲" : "▼"}</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); savePin(pin === ci + 1 ? 0 : ci + 1); }}
                          title={pin === ci + 1 ? "Unpin" : `Pin columns up to ${f.label}`}
                          style={{ marginLeft: 6, opacity: pin >= ci + 1 ? 1 : 0.25, fontSize: 10 }}
                        >
                          📌
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={String(r.id ?? i)}
                      onClick={() => setView({ dt, row: r, links, mode: "view" })}
                      style={{ cursor: "pointer" }}
                      className="crm-row"
                    >
                      {visible.map((f, ci) => (
                        <td
                          key={f.name}
                          style={{
                            padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #F0EEE8",
                            verticalAlign: "top", background: "#fff",
                            ...(ci < pin
                              ? { ...stickyCell(ci, 5), maxWidth: PINNED_W, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                              : null),
                          }}
                        >
                          <Cell field={f} value={r[f.name]} links={links} onOpenLink={openLinked} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
        )}
      </div>

      {view && (
        <RecordModal
          view={view}
          onClose={() => setView(null)}
          onEdit={() => setView({ ...view, mode: "edit" })}
          onSaved={(saved) => {
            void load();
            // stay on the record after saving — view mode, fresh from the server
            if (saved?.id && view) void openLinked(view.dt.name, String(saved.id));
            else setView(null);
          }}
          onOpenLink={openLinked}
        />
      )}
    </div>
  );
}

/** A named screen whose build is still ahead — it already wears the date bar
 *  every analytical screen shares, so the pattern is set. */
function StubScreen({ label, blurb, dated }: { label: string; blurb: string; dated: boolean }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  return (
    <div>
      {dated && <DateRangeBar value={range} onChange={setRange} />}
      <div className="rounded p-6" style={{ background: "#fff", border: `1px dashed ${BORDER}`, maxWidth: "70ch" }}>
        <div className="font-bold mb-1" style={{ fontSize: 15 }}>{label}</div>
        <p className="text-sm" style={{ color: "#5A6672", lineHeight: 1.6 }}>{blurb}</p>
      </div>
    </div>
  );
}

/**
 * The Deals screen: the pipeline, checked, for the chosen dates. Both
 * ladders, and per rung what came in and went out of it in the range, and
 * what is sitting there now — read from the two stage histories.
 */
function PipelineFlow() {
  type FlowRow = {
    entity: string; stage_id: number; code: string; name: string; sort_order: number;
    came_in: number; went_out: number; sitting: number; colour: string | null;
  };
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [flow, setFlow] = useState<FlowRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFlow(null); setErr("");
    fetch(`/api/crm/pipeline?from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the pipeline");
        setFlow(j.flow);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to]);

  const ladders: { key: string; title: string; note: string }[] = [
    { key: "opportunity", title: "Opportunities", note: "New enquiries being worked toward a quote." },
    { key: "quotation", title: "Quotations — hotness", note: "Sent through the buckets to Order Received." },
  ];

  if (err || !flow) {
    return (
      <div>
        <DateRangeBar value={range} onChange={setRange} />
        {err
          ? <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>
          : <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      </div>
    );
  }

  return (
    <div>
    <DateRangeBar value={range} onChange={setRange} />
    <div className="flex gap-4 flex-wrap" style={{ alignItems: "flex-start" }}>
      {ladders.map((l) => {
        const rows = flow.filter((r) => r.entity === l.key);
        const tot = (k: "came_in" | "went_out" | "sitting") => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
        return (
          <div key={l.key} className="rounded border" style={{ borderColor: BORDER, background: "#fff", minWidth: 360, flex: "1 1 420px", maxWidth: 620 }}>
            <div className="px-4 pt-3 pb-1">
              <div className="font-bold" style={{ fontSize: 15 }}>{l.title}</div>
              <div className="text-xs" style={{ color: MUTED }}>{l.note}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["STAGE", "CAME IN", "WENT OUT", "SITTING"].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? "left" : "right", padding: "6px 16px", fontSize: 10,
                      letterSpacing: 0.6, color: MUTED, borderBottom: `2px solid ${BORDER}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.stage_id}>
                    <td style={{ padding: "7px 16px", fontSize: 13, borderBottom: "1px solid #F0EEE8" }}>
                      <span style={{
                        display: "inline-block", width: 9, height: 9, borderRadius: 2,
                        background: r.colour || "#8A94A0", marginRight: 8, verticalAlign: "baseline",
                      }} />
                      {r.name}
                    </td>
                    {(["came_in", "went_out", "sitting"] as const).map((k) => (
                      <td key={k} className="tnum" style={{
                        textAlign: "right", padding: "7px 16px", fontSize: 13,
                        borderBottom: "1px solid #F0EEE8",
                        fontWeight: k === "sitting" && Number(r[k]) > 0 ? 700 : 400,
                        color: Number(r[k]) === 0 ? "#C7CCD2" : undefined,
                      }}>{Number(r[k]).toLocaleString("en-IN")}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>Total</td>
                  {(["came_in", "went_out", "sitting"] as const).map((k) => (
                    <td key={k} className="tnum" style={{ textAlign: "right", padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>
                      {tot(k).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-xs" style={{ color: MUTED, flexBasis: "100%", maxWidth: "80ch", lineHeight: 1.6 }}>
        Every stage move is written by the database the moment it happens, so
        this table is measured, not remembered. Came in and went out count the
        moves inside the chosen dates; sitting is who stands there today. The
        histories begin 24/08/2026 — the day the pipeline went live.
      </p>
    </div>
    </div>
  );
}

/** Sticky style for a pinned column: fixed width so the offsets add up. */
function stickyCell(ci: number, z: number): React.CSSProperties {
  return {
    position: "sticky", left: ci * PINNED_W, zIndex: z,
    width: PINNED_W, minWidth: PINNED_W,
    boxShadow: "inset -1px 0 0 " + BORDER,
  };
}

/** Render one value the way its field type deserves. */
function Cell({
  field, value, links, onOpenLink,
}: {
  field: Field; value: unknown; links: Links;
  onOpenLink?: (target: string, id: string) => void;
}) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#C7CCD2" }}>—</span>;

  if (field.type === "readonly") {
    if (field.format === "money")
      return <span className="tnum">₹ {Number(value).toLocaleString("en-IN")}</span>;
    if (field.format === "pct")
      return <span className="tnum">{Number(value).toLocaleString("en-IN")}%</span>;
    return <span className="tnum">{String(value)}</span>;
  }

  if (field.type === "bool")
    return value ? <span style={{ color: "#1E6B3E", fontWeight: 700 }}>Yes</span> : <span style={{ color: MUTED }}>No</span>;

  if (field.type === "link" && field.link) {
    const hit = (links[field.link] || []).find((o) => o.id === String(value));
    const label = hit ? hit.label : `${String(value).slice(0, 8)}…`;
    if (!onOpenLink) return <>{label}</>;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpenLink(field.link as string, String(value)); }}
        title={`Open this ${field.link}`}
        style={{ color: "#2C5B82", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        {label}
      </button>
    );
  }

  if (field.type === "money")
    return <span className="tnum">₹ {Number(value).toLocaleString("en-IN")}</span>;

  if (field.type === "number") return <span className="tnum">{String(value)}</span>;

  if (field.type === "date") return <span className="tnum">{fmtDate(String(value))}</span>;

  return <>{String(value)}</>;
}

/** DD/MM/YYYY — Dr Raghu's word on 24 Aug 2026, for every date the CRM shows. */
function fmtDate(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** Pick which columns show, per doctype. Kept in localStorage. */
function ColumnPicker({
  dt, visibleNames, onChange, onClose,
}: {
  dt: Doctype; visibleNames: string[];
  onChange: (next: string[] | null) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const toggle = (name: string) => {
    const has = visibleNames.includes(name);
    // Keep the registry's field order however the boxes are ticked.
    const next = dt.fields.map((f) => f.name)
      .filter((n) => (n === name ? !has : visibleNames.includes(n)));
    if (next.length) onChange(next);
  };

  return (
    <div
      ref={ref}
      className="rounded border p-2"
      style={{
        position: "absolute", top: "110%", left: 0, zIndex: 50, background: "#fff",
        borderColor: BORDER, boxShadow: "0 8px 24px rgba(22,35,47,.18)", minWidth: 230,
        maxHeight: 320, overflowY: "auto",
      }}
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>COLUMNS</span>
        <button className="text-xs font-semibold" style={{ color: ORANGE }} onClick={() => onChange(null)}>
          reset
        </button>
      </div>
      {dt.fields.map((f) => (
        <label key={f.name} className="flex items-center gap-2 px-1 py-0.5 text-sm" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={visibleNames.includes(f.name)}
            onChange={() => toggle(f.name)}
          />
          <span style={{ color: "#5A6672" }}>{f.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * The lightbox. Opens on a row click showing the record read-only -- the
 * basics at a glance -- and Edit goes deeper into the full form.
 */
function RecordModal({
  view, onClose, onEdit, onSaved, onOpenLink,
}: {
  view: ViewState; onClose: () => void; onEdit: () => void;
  onSaved: (saved?: Row) => void;
  onOpenLink: (target: string, id: string) => void;
}) {
  const { dt, row, links, mode } = view;
  const title = String(row[dt.titleField] ?? dt.label);
  const isCompany = dt.name === "company";
  const [tab, setTab] = useState("details");
  useEffect(() => setTab("details"), [row.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // The 360 tabs: everything that hangs off the record, one tab each. The
  // company gets the full set; the quotation gets its lines, the customer's
  // contacts (addable right there, pre-linked), and its interactions.
  type TabDef = {
    key: string; label: string; count?: unknown; slug?: string;
    filterField?: string; filterValue?: string | null; addPresets?: Row;
  };
  const rid = String(row.id ?? "");
  const companyId = row.company_id ? String(row.company_id) : null;
  const recordTabs: TabDef[] =
    dt.name === "company" ? [
      { key: "details", label: "Details" },
      { key: "person", label: "Contacts", count: row.contact_count, slug: "person", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } },
      { key: "address", label: "Addresses", slug: "address", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } },
      { key: "interaction", label: "Interactions", slug: "interaction", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } },
      { key: "communication", label: "Communication" },
      { key: "opportunity", label: "Opportunities", count: row.opp_count, slug: "opportunity", filterField: "company_id", filterValue: rid },
      { key: "quotation", label: "Quotations", slug: "quotation", filterField: "company_id", filterValue: rid },
      { key: "sales_order", label: "Sales Orders", count: row.so_count, slug: "sales_order", filterField: "company_id", filterValue: rid },
    ] : dt.name === "quotation" ? [
      { key: "details", label: "Details" },
      { key: "quotation_line", label: "Lines", slug: "quotation_line", filterField: "quotation_id", filterValue: rid, addPresets: { quotation_id: rid } },
      { key: "person", label: "Contacts", slug: "person", filterField: "company_id", filterValue: companyId, addPresets: companyId ? { company_id: companyId } : undefined },
      { key: "interaction", label: "Interactions", slug: "interaction", filterField: "quotation_id", filterValue: rid, addPresets: { quotation_id: rid, ...(companyId ? { company_id: companyId } : {}) } },
    ] : [];
  const hasTabs = recordTabs.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(22,35,47,.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded"
        style={{
          background: "#fff", width: hasTabs ? "min(1080px, 100%)" : "min(880px, 100%)",
          boxShadow: "0 12px 40px rgba(27,45,107,.35)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}
        >
          <div>
            <div className="text-xs font-bold" style={{ color: ORANGE, letterSpacing: 1 }}>
              {dt.label.toUpperCase()}
            </div>
            <div className="text-white font-bold" style={{ fontSize: 16 }}>{title}</div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "view" && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{ background: ORANGE, color: "#fff" }}
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 rounded text-sm font-semibold"
              style={{ background: NAVY_DARK, color: "#C8D2DC" }}
            >
              ✕
            </button>
          </div>
        </div>

        {mode === "view" && hasTabs && (
          <div
            className="flex flex-wrap"
            style={{ borderBottom: `2px solid ${BORDER}`, padding: "0 12px", gap: 2 }}
          >
            {recordTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="text-sm font-bold"
                style={{
                  padding: "10px 14px", color: tab === t.key ? ORANGE : MUTED,
                  borderBottom: `3px solid ${tab === t.key ? ORANGE : "transparent"}`,
                  marginBottom: -2,
                }}
              >
                {t.label}
                {t.count !== undefined && t.count !== null && (
                  <span style={{
                    background: NAVY_SOFT, color: NAVY, borderRadius: 10,
                    padding: "1px 8px", fontSize: 11, marginLeft: 6,
                  }}>
                    {String(t.count)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {mode === "view" ? (
          !hasTabs || tab === "details" ? (
            <div
              className="grid gap-x-6 gap-y-3 p-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
            >
              {dt.fields.map((f) => (
                <div key={f.name}>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{f.label}</div>
                  <div className="text-sm" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    <Cell field={f} value={row[f.name]} links={links} onOpenLink={onOpenLink} />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "communication" ? (
            <div className="p-6 text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
              Emails — automated, inbound and outbound — land here when the
              channels phase connects the mailboxes. The table is ready; the
              wires are not yet in.
            </div>
          ) : (() => {
            const t = recordTabs.find((x) => x.key === tab);
            return t?.slug ? (
              <RelatedTab
                slug={t.slug}
                filterField={t.filterField as string}
                filterValue={t.filterValue ?? null}
                addPresets={t.addPresets}
                onOpenLink={onOpenLink}
              />
            ) : null;
          })()
        ) : (
          <div className="p-4">
            <RecordForm dt={dt} links={links} initial={row} onDone={onSaved} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One tab of a record's 360: another doctype's rows filtered to this record,
 * fetched through the same route the list screens use — same columns, same
 * labels, same doors. A row click opens that record's own lightbox, and
 * where it makes sense the tab can add a row pre-linked to the record.
 */
function RelatedTab({
  slug, filterField, filterValue, addPresets, onOpenLink,
}: {
  slug: string; filterField: string; filterValue: string | null;
  addPresets?: Row; onOpenLink: (target: string, id: string) => void;
}) {
  const dt = doctypeBySlug(slug);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [links, setLinks] = useState<Links>({});
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (filterValue === null) return;
    setRows(null); setErr("");
    fetch(`/api/crm/${slug}?f_${filterField}=${encodeURIComponent(filterValue)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setRows(j.rows); setLinks(j.links || {}); setTotal(j.total ?? j.rows.length);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [slug, filterField, filterValue, tick]);

  if (!dt) return null;
  if (filterValue === null)
    return <div className="p-6 text-sm" style={{ color: MUTED }}>Link a company first — then this tab has somewhere to look.</div>;
  if (err) return <div className="p-4 text-sm" style={{ color: "#8E2C20" }}>{err}</div>;
  if (rows === null) return <div className="p-4 text-sm" style={{ color: MUTED }}>loading…</div>;

  const fields = dt.fields.filter((f) => f.inList && f.name !== filterField);

  return (
    <div style={{ maxHeight: "55vh", overflow: "auto" }}>
      {addPresets && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setAdding((v) => !v)}
            className="px-3 py-1 rounded text-xs font-bold"
            style={{ background: adding ? "#6B7280" : ORANGE, color: "#fff" }}
          >
            {adding ? "Cancel" : `+ Add ${dt.label.toLowerCase()}`}
          </button>
          {adding && (
            <div className="mt-2">
              <RecordForm
                dt={dt} links={links} presets={addPresets}
                onDone={() => { setAdding(false); setTick((t) => t + 1); }}
              />
            </div>
          )}
        </div>
      )}
      {!rows.length && (
        <div className="p-6 text-sm" style={{ color: MUTED }}>No {dt.plural.toLowerCase()} here yet.</div>
      )}
      {rows.length > 0 && (
      <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f.name} style={{
                textAlign: "left", padding: "8px 14px", fontSize: 10, letterSpacing: 0.6,
                color: MUTED, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap",
                position: "sticky", top: 0, background: "#fff",
              }}>{f.label.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={String(r.id ?? i)}
              onClick={() => onOpenLink(slug, String(r.id))}
              style={{ cursor: "pointer" }}
            >
              {fields.map((f) => (
                <td key={f.name} style={{ padding: "8px 14px", fontSize: 13, borderBottom: "1px solid #F0F1F6", verticalAlign: "top" }}>
                  <Cell field={f} value={r[f.name]} links={links} onOpenLink={onOpenLink} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <div className="p-3 text-xs" style={{ color: MUTED }}>
          Showing {rows.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} — the full list lives on the {dt.plural} screen.
        </div>
      )}
      </div>
      )}
    </div>
  );
}

/**
 * A type-along picker for the links too heavy for a dropdown — 54k
 * companies. Type, pick from the top matches, done.
 */
function LinkAutocomplete({
  target, value, valueLabel, onPick,
}: {
  target: string; value: string; valueLabel: string; onPick: (id: string) => void;
}) {
  const [text, setText] = useState(valueLabel);
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(valueLabel), [valueLabel]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/crm/${target}?pick=${encodeURIComponent(text)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setOptions(j.options ?? []))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, target]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={text}
        placeholder="Type to search…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (e.target.value === "") onPick(""); }}
        className="w-full px-2 py-1.5 rounded text-sm border"
        style={{ borderColor: value ? BORDER : BORDER }}
      />
      {open && options.length > 0 && (
        <div
          className="rounded border"
          style={{
            position: "absolute", top: "105%", left: 0, right: 0, zIndex: 70,
            background: "#fff", borderColor: BORDER, maxHeight: 220, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(27,45,107,.18)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              onMouseDown={(e) => { e.preventDefault(); onPick(o.id); setText(o.label); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-sm"
              style={{ color: INK }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The contact picker: type-and-choose, narrowed to the chosen company, and a
 * name that is not there yet is one click from existing — typed once, born
 * linked to the company (Dr Raghu, 25 Aug 2026).
 */
function PersonTypeAhead({
  value, valueLabel, companyId, onPick,
}: {
  value: string; valueLabel: string; companyId?: string; onPick: (id: string) => void;
}) {
  const [text, setText] = useState(valueLabel);
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(valueLabel), [valueLabel]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const f = companyId ? `&f_company_id=${encodeURIComponent(companyId)}` : "";
      fetch(`/api/crm/person?pick=${encodeURIComponent(text)}${f}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setOptions(j.options ?? []))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, companyId]);

  const createNew = async () => {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/crm/person", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ first_name: name, ...(companyId ? { company_id: companyId } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not add the contact");
      onPick(String(j.row.id));
      setOpen(false);
    } catch { /* the field keeps the typed text; picking again retries */ }
    finally { setBusy(false); }
  };

  const exact = options.some((o) => o.label.trim().toLowerCase() === text.trim().toLowerCase());

  return (
    <div style={{ position: "relative" }}>
      <input
        value={text}
        placeholder={companyId ? "Type to search this company's people…" : "Pick the company first, or type any name…"}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (e.target.value === "") onPick(""); }}
        className="w-full px-2 py-1.5 rounded text-sm border"
        style={{ borderColor: BORDER }}
      />
      {open && (options.length > 0 || text.trim()) && (
        <div
          className="rounded border"
          style={{
            position: "absolute", top: "105%", left: 0, right: 0, zIndex: 70,
            background: "#fff", borderColor: BORDER, maxHeight: 220, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(27,45,107,.18)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              onMouseDown={(e) => { e.preventDefault(); onPick(o.id); setText(o.label); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-sm"
              style={{ color: INK }}
            >
              {o.label}
            </button>
          ))}
          {text.trim() && !exact && (
            <button
              onMouseDown={(e) => { e.preventDefault(); void createNew(); }}
              className="w-full text-left px-2 py-1.5 text-sm font-bold"
              style={{ color: ORANGE, borderTop: `1px solid ${BORDER}` }}
            >
              {busy ? "Adding…" : `＋ Add "${text.trim()}" as a new contact${companyId ? " of this company" : ""}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The six BANTTC weights, as Dr Raghu weighs them. */
const BANTTC: { name: string; label: string; w: number }[] = [
  { name: "budget_pct", label: "Budget", w: 2 },
  { name: "authority_pct", label: "Authority", w: 1 },
  { name: "need_pct", label: "Need", w: 2 },
  { name: "timing_pct", label: "Timing", w: 2 },
  { name: "technically_qualified_pct", label: "Tech. Qualified", w: 1 },
  { name: "competitiveness_pct", label: "Competitiveness", w: 1 },
];

/**
 * The add/edit form. Built from the registry, so it can never miss a field.
 * With `initial` it edits (PATCH); without, it adds (POST). `presets`
 * pre-links a fresh record — a contact born on a quotation's tab already
 * knows its company.
 */
function RecordForm({
  dt, links, initial, presets, onDone,
}: {
  dt: Doctype; links: Links; initial?: Row; presets?: Row;
  onDone: (saved?: Row) => void;
}) {
  const editable = dt.fields.filter((f) => f.type !== "readonly" && !f.virtual);

  const blank = useMemo(() => {
    const o: Record<string, string | boolean> = {};
    for (const f of editable) {
      if (initial) {
        const v = initial[f.name];
        if (f.type === "bool") o[f.name] = v === true;
        else if (f.type === "date" && typeof v === "string") o[f.name] = v.slice(0, 10);
        else o[f.name] = v === null || v === undefined ? "" : String(v);
      } else {
        const preset = presets?.[f.name];
        o[f.name] = preset !== undefined && preset !== null
          ? String(preset)
          : (f.default as string | boolean) ?? (f.type === "bool" ? false : "");
      }
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dt, initial, presets]);

  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setForm(blank), [blank]);

  const set = (name: string, v: string | boolean) => setForm((f) => ({ ...f, [name]: v }));

  // Lost reason and Lost to only come into the picture when the chosen stage
  // is a dead end — before that they are noise on the form.
  const stageOpt = (links["stage"] || []).find((o) => o.id === String(form["stage_id"] ?? ""));
  const stageDead = !!stageOpt && ["Lost", "Not Target"].includes(stageOpt.label);
  const hasStage = editable.some((f) => f.name === "stage_id");
  const isDeal = dt.name === "opportunity";
  const banttcNames = BANTTC.map((b) => b.name);
  const gridFields = editable.filter((f) =>
    !(isDeal && banttcNames.includes(f.name))
    && !(hasStage && !stageDead && (f.name === "lost_reason" || f.name === "lost_to_competitor")));

  const score = (() => {
    let s = 0, d = 0;
    for (const b of BANTTC) {
      const v = form[b.name];
      if (v === "" || v === null || v === undefined || v === false) continue;
      s += Number(v) * b.w; d += b.w;
    }
    return d > 0 ? Math.round(s / d) : null;
  })();

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const url = initial
        ? `/api/crm/${dt.name}?id=${encodeURIComponent(String(initial.id))}`
        : `/api/crm/${dt.name}`;
      const r = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      onDone(j.row as Row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded border p-3 mb-3"
      style={{ borderColor: initial ? BORDER : ORANGE, background: "#fff" }}
    >
      <div className="font-bold text-sm mb-2">
        {initial ? `Edit ${dt.label.toLowerCase()}` : `New ${dt.label.toLowerCase()}`}
      </div>
      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
      >
        {gridFields.map((f) => (
          <label key={f.name} className="block" style={f.big ? { gridColumn: "1 / -1" } : undefined}>
            <div className="text-xs font-semibold mb-1" style={{ color: MUTED }}>
              {f.label}
              {f.required && <span style={{ color: ORANGE }}> *</span>}
            </div>

            {f.type === "bool" ? (
              <label className="flex items-center gap-2 text-sm" style={{ paddingTop: 4 }}>
                <input
                  type="checkbox"
                  checked={!!form[f.name]}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
                <span style={{ color: "#5A6672" }}>{f.label}</span>
              </label>
            ) : f.type === "textarea" ? (
              <textarea
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                rows={f.big ? 8 : 3}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER }}
              />
            ) : f.type === "select" ? (
              <select
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER, background: "#fff" }}
              >
                <option value="">—</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : f.type === "link" && f.link === "person" ? (
              <PersonTypeAhead
                value={String(form[f.name] ?? "")}
                valueLabel={(links.person || []).find((o) => o.id === String(form[f.name] ?? ""))?.label ?? ""}
                companyId={String(form["company_id"] ?? "") || undefined}
                onPick={(id) => set(f.name, id)}
              />
            ) : f.type === "link" && f.link === "company" ? (
              <LinkAutocomplete
                target="company"
                value={String(form[f.name] ?? "")}
                valueLabel={(links.company || []).find((o) => o.id === String(form[f.name] ?? ""))?.label ?? ""}
                onPick={(id) => set(f.name, id)}
              />
            ) : f.type === "link" ? (
              <select
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER, background: "#fff" }}
              >
                <option value="">—</option>
                {(links[f.link as string] || []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "number" || f.type === "money" ? "number" : "text"}
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER }}
              />
            )}

            {f.help && (
              <div className="text-xs mt-1" style={{ color: "#A6AEB6", lineHeight: 1.45 }}>{f.help}</div>
            )}
          </label>
        ))}
      </div>

      {isDeal && (
        <div className="mb-3" style={{ overflowX: "auto" }}>
          <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 0.8 }}>
            BANTTC
          </div>
          <table style={{ borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                {BANTTC.map((b) => (
                  <th key={b.name} style={{
                    textAlign: "center", padding: "4px 10px", fontSize: 11,
                    color: MUTED, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap",
                  }}>
                    {b.label}{b.w > 1 && <span style={{ color: ORANGE }}> ×{b.w}</span>}
                  </th>
                ))}
                <th style={{
                  textAlign: "center", padding: "4px 10px", fontSize: 11,
                  color: NAVY, borderBottom: `2px solid ${BORDER}`, fontWeight: 800,
                }}>
                  SCORE
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {BANTTC.map((b) => (
                  <td key={b.name} style={{ padding: "6px 8px", textAlign: "center" }}>
                    <select
                      value={String(form[b.name] ?? "")}
                      onChange={(e) => set(b.name, e.target.value)}
                      className="px-1 py-1 rounded text-sm border"
                      style={{ borderColor: BORDER, background: "#fff", width: 76 }}
                    >
                      <option value="">—</option>
                      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                        <option key={n} value={n}>{n}%</option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="tnum" style={{
                  padding: "6px 10px", textAlign: "center", fontWeight: 800,
                  color: score === null ? MUTED : score >= 60 ? "#1A7F4E" : score >= 35 ? "#B45309" : "#C0392B",
                  fontSize: 15,
                }}>
                  {score === null ? "—" : `${score}%`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {err && (
        <div className="text-sm mb-2 rounded p-2" style={{ background: "#FBEAE8", color: "#8E2C20" }}>
          {err}
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="px-4 py-1.5 rounded text-sm font-semibold"
        style={{ background: busy ? "#B9BEC4" : ORANGE, color: "#fff" }}
      >
        {busy ? "Saving…" : initial ? "Save changes" : `Save ${dt.label.toLowerCase()}`}
      </button>
    </div>
  );
}
