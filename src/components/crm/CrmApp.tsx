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
import ModuleMenu from "@/components/ModuleMenu";
import PlaybookScreen from "@/components/Playbook";
import { DOCTYPES, doctypeBySlug, type Doctype, type Field } from "@/crm/doctypes";
import { LOGO } from "@/lib/logo";
import AnalyticsScreen from "./Analytics";
import DealsScreen from "./DealBoard";
import MailComposer, { type ComposeCtx } from "./MailComposer";
import MailQueue from "./MailQueue";
import Dashboard from "./Dashboard";
import ProspectQueue from "./ProspectQueue";
import RichTextEditor, { RichContent, looksHtml } from "../RichTextEditor";
import VisitingCard, { PersonCardPanel } from "./VisitingCard";
import Integrations from "./Integrations";
import SalesPersonPlan from "./SalesPersonPlan";
import SalesPlan from "./SalesPlan";
import { EmailQueue, WhatsAppQueue } from "./OutboundQueues";
import WaComposer, { type WaCtx } from "./WaComposer";
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

/** Set once when CrmApp mounts — one user per page, so module scope is safe. */
let MY_PROFILE_ID: string | null = null;
/** What the lightbox is showing: possibly another doctype than the page. */
type ViewState = { dt: Doctype; row: Row; links: Links; mode: "view" | "edit" };

/** Sections that are pages of their own rather than doctypes. Deals is real —
 *  the pipeline flow. The others' screens are coming; the URLs already answer. */
export const SPECIAL_SECTIONS = [
  { name: "dashboard", label: "Dashboard", icon: "◧", blurb: "The CEO cockpit — owner concentration, the funnel, the response clock. Being built next." },
  { name: "analytics", label: "Analytics", icon: "◫", blurb: "Win rates, stage velocity, source economics — read from the stage histories. Being built." },
  { name: "salespersonplan", label: "SalesPerson Plan", icon: "◐", blurb: "" },
  { name: "salesplan", label: "Sales Plan", icon: "◩", blurb: "" },
  { name: "deals", label: "Deals", icon: "◆", blurb: "" },
  { name: "visitingcard", label: "Add Visiting Card", icon: "🪪", blurb: "" },
  { name: "integrations", label: "Integrations", icon: "🔌", blurb: "" },
  { name: "emailqueue", label: "Email", icon: "📮", blurb: "" },
  { name: "playbook", label: "Sales Playbook", icon: "📖", blurb: "" },
  { name: "waqueue", label: "WhatsApp Queue", icon: "💬", blurb: "" },
  { name: "communication", label: "Communication", icon: "✉", blurb: "Emails — automated, inbound and outbound, per user's own mailbox. Arrives with the channels phase." },
] as const;

/** The URL each doctype answers at — Dr Raghu's spellings. */
const URL_OF: Record<string, string> = {
  lead: "lead", company: "company", person: "contact", quotation: "quotation",
  quotation_line: "quoteline", opportunity: "opportunity", sales_order: "salesorder",
  interaction: "interactions", task: "task", address: "address", person_phone: "phone",
  product: "product", sales_invoice: "salesinvoice", message_variable: "variables",
  email_template: "emailtemplates", whatsapp_template: "whatsapptemplates",
  sector: "sector", industry: "industry", stage: "stage", profile: "users",
};

/** The sidebar, in Dr Raghu's order (24 Aug 2026). `dt` names a doctype,
 *  `sp` a screen of its own, `href` a door to elsewhere in Genie. */
const NAV: { header?: string; collapsible?: boolean; items: ({ dt: string } | { sp: string } | { href: string; label: string; icon: string })[] }[] = [
  {
    items: [
      { sp: "dashboard" }, { sp: "analytics" }, { sp: "salespersonplan" }, { sp: "salesplan" },
    ],
  },
  { header: "TOOLS", collapsible: true, items: [{ sp: "visitingcard" }, { sp: "emailqueue" }, { sp: "waqueue" }, { sp: "playbook" }] },
  { header: "PIPELINE", items: [{ dt: "lead" }, { dt: "opportunity" }, { dt: "quotation" }, { dt: "sales_order" }] },
  { items: [{ sp: "deals" }] },
  {
    header: "ACCOUNTS",
    items: [{ dt: "company" }, { dt: "person" }, { dt: "address" }, { dt: "person_phone" }, { dt: "industry" }, { dt: "product" }, { dt: "sales_invoice" }],
  },
  { header: "MORE", items: [{ dt: "interaction" }, { dt: "task" }, { dt: "quotation_line" }, { sp: "communication" }] },
  { header: "SETTINGS", collapsible: true, items: [{ sp: "integrations" }, { dt: "sector" }, { dt: "stage" }, { dt: "profile" }, { dt: "message_variable" }, { dt: "email_template" }, { dt: "whatsapp_template" }] },
];

export default function CrmApp({
  email, displayName, version, initialSlug, initials = null, role = "user", profileId = null,
}: {
  email: string; displayName: string | null; version: string; initialSlug?: string;
  initials?: string | null; role?: string; profileId?: string | null;
}) {
  // the signed-in person's CRM profile id, readable from anywhere in this
  // client bundle — `default: "me"` on a profile link field resolves to it
  MY_PROFILE_ID = profileId;
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
  const [tagQ, setTagQ] = useState("");
  // the date view (Dr Raghu, 28 Aug 2026): YTD by default, the salesperson's
  // last view remembered per list, the saved views on the menu.
  const [dateView, setDateView] = useState<DateView | null>(null);
  useEffect(() => {
    const dts = DOCTYPES.find((d2) => d2.name === slug);
    const fld = dts?.fields.find((f) => f.type === "date" && !f.virtual)?.name ?? "created_at";
    try {
      const kept = localStorage.getItem(`crm.dateview.${slug}`);
      if (kept) { setDateView(JSON.parse(kept)); return; }
    } catch { /* fine */ }
    setDateView({ field: fld, preset: "ytd", from: "", to: "" });
  }, [slug]);
  const applyDateView = (v: DateView | null) => {
    setDateView(v);
    try {
      if (v) localStorage.setItem(`crm.dateview.${slug}`, JSON.stringify(v));
      else localStorage.removeItem(`crm.dateview.${slug}`);
    } catch { /* fine */ }
  };
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);   // null = registry default
  const [pin, setPin] = useState(0);
  const [colsOpen, setColsOpen] = useState(false);
  const [view, setView] = useState<ViewState | null>(null);
  // one open-flag per collapsible header — Tools and Settings fold independently
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState<ComposeCtx | null>(null);
  const [pageSize, setPageSize] = useState<string>("500");   // 100|500|2500|10000|50000|all
  const [colW, setColW] = useState<number>(280);             // narrow 140 · normal 280 · wide 440
  const [moreBusy, setMoreBusy] = useState(false);
  // The sidebar folds to an icon rail — open all the time was noise.
  const [navOpen, setNavOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("crmNavOpen");
      if (saved !== null) return saved !== "0";
      // a phone starts folded — the rail is one tap away
      return typeof window === "undefined" || window.innerWidth >= 768;
    } catch { return true; }
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
      setColW(Number(localStorage.getItem(`crmW.${slug}`)) || 280);
    } catch { setCols(null); setPin(0); setColW(280); }
    try { window.history.replaceState(null, "", `/crm/${URL_OF[slug] ?? slug}`); } catch { /* SSR */ }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qLive), 300);
    return () => clearTimeout(t);
  }, [qLive]);

  /** Multi-select for the bulk Edit — checked row ids. */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState<string>("");
  const toggleSel = (id: string) => setSel((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /** Group-by: aggregate the filtered set, shown in a right-side drawer. */
  const [groupBy, setGroupBy] = useState("");
  const [sumOn, setSumOn] = useState(false);
  const [groups, setGroups] = useState<{ field: string; hasMoney: boolean; total: number; sumTotal: number; groups: { key: string; label: string; count: number; sum: number }[] } | null>(null);
  /** Such records total in lakhs and crores (Dr Raghu, 26 Aug 2026). */
  const lakhCr = (n: number) => n >= 1e7 ? `₹ ${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹ ${(n / 1e5).toFixed(1)} L` : `₹ ${Math.round(n).toLocaleString("en-IN")}`;

  const listParams = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    for (const [k, v] of Object.entries(filters)) if (v !== "") p.set(`f_${k}`, v);
    if (tagQ.trim()) p.set("tag", tagQ.trim());
    if (dateView && dateView.preset !== "all") {
      const r = dateRangeOf(dateView);
      if (r.from) p.set(`f_${dateView.field}_gte`, r.from);
      if (r.to) p.set(`f_${dateView.field}_lte`, r.to);
    }
    if (sort) { p.set("sort", sort.col); p.set("dir", sort.dir); }
    p.set("limit", pageSize);
    return p;
  }, [q, filters, tagQ, dateView, sort, pageSize]);

  useEffect(() => {
    if (!groupBy) { setGroups(null); return; }
    const p = listParams();
    p.delete("limit"); p.delete("offset");
    p.set("groupby", groupBy);
    setGroups(null);
    fetch(`/api/crm/${slug}?${p}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (r.ok) setGroups(j); })
      .catch(() => {});
  }, [groupBy, slug, listParams]);
  useEffect(() => { setGroupBy(""); setSel(new Set()); setBulkOpen(false); }, [slug]);

  const load = useCallback(async () => {
    if (!DOCTYPES.some((d) => d.name === slug)) { setLoading(false); setRows([]); return; }
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/crm/${slug}?${listParams()}`, { cache: "no-store" });
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
  }, [slug, listParams]);

  // Show More: the next helping of the same size, appended in place.
  const showMore = useCallback(async () => {
    setMoreBusy(true);
    try {
      const p = listParams();
      p.set("offset", String(rows.length));
      const r = await fetch(`/api/crm/${slug}?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load more");
      setRows((cur) => [...cur, ...j.rows]);
      setLinks((cur) => {
        const merged: Links = { ...cur };
        for (const [t, list] of Object.entries((j.links || {}) as Links)) {
          const have = new Set((merged[t] ?? []).map((o) => o.id));
          merged[t] = [...(merged[t] ?? []), ...list.filter((o) => !have.has(o.id))];
        }
        return merged;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMoreBusy(false);
    }
  }, [slug, listParams, rows.length]);

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
  const saveColW = (n: number) => {
    setColW(n);
    try { localStorage.setItem(`crmW.${slug}`, String(n)); } catch { /* fine */ }
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

  const [waCtx, setWaCtx] = useState<WaCtx | null>(null);

  /** The refs + chain a message hangs on, from a record — shared by the mail
   *  and WhatsApp doors. */
  const refsFor = (d: Doctype, r: Row) => {
    const refs: ComposeCtx["refs"] = {};
    const chain: string[] = [];
    const put = (k: keyof ComposeCtx["refs"], v: unknown, label: string) => {
      if (v) { refs[k] = String(v); chain.push(label); }
    };
    if (d.name === "person") put("person_id", r.id, `Contact ${r.full_name ?? ""}`.trim());
    if (d.name === "lead") put("lead_id", r.id, "Lead");
    if (d.name === "opportunity") put("opportunity_id", r.id, `Opportunity ${r.opportunity_no ?? ""}`.trim());
    if (d.name === "quotation") { put("quotation_id", r.id, `Quotation ${r.quote_no ?? ""}`.trim()); put("opportunity_id", r.opportunity_id, "Opportunity"); }
    if (d.name === "sales_order") put("opportunity_id", r.opportunity_id, `SO ${r.so_no ?? ""} → Opportunity`);
    if (d.name === "company") put("company_id", r.id, `Company ${r.name ?? ""}`.trim());
    else put("company_id", r.company_id, "Company");
    if (d.name !== "person") put("person_id", r.point_of_contact_id ?? r.contact_id ?? r.person_id, "Contact");
    return { refs, chain };
  };
  const composeFor = (d: Doctype, r: Row, email?: string | null) => {
    const { refs, chain } = refsFor(d, r);
    const to = email ?? ([r.primary_email, r.contact_email].find(isEmailish) as string | undefined) ?? null;
    setCompose({ to, refs, chain });
  };
  /** 💬 quick — the hello forms server-side, gets LOGGED, and opens the
   *  salesperson's own WhatsApp. 💬+ opens the template lightbox instead. */
  const waFor = (d: Doctype, r: Row, phone: string, mode: "quick" | "compose") => {
    const { refs, chain } = refsFor(d, r);
    if (mode === "compose") { setWaCtx({ phone, refs, chain }); return; }
    const w = window.open("", "_blank");
    fetch("/api/crm/wa/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, body: "Hello,\n\nRegards\n{{sales_person}}", ...refs }),
    })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Could not open WhatsApp");
        if (w) w.location.href = j.url; else window.location.href = j.url;
      })
      .catch((e) => { if (w) w.close(); window.alert(e instanceof Error ? e.message : String(e)); });
  };

  // THE QUEUE LIVES ON THE TOP BAR (Dr Raghu, 29 Aug 2026): a ☎ with the
  // open count, dropping the dial list like a notification tray.
  const [queueTray, setQueueTray] = useState(false);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const refreshQueueCount = useCallback(() => {
    fetch("/api/crm/prospect?marks=1", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (r.ok) setQueueCount((j.open || []).length); })
      .catch(() => null);
  }, []);
  useEffect(() => { refreshQueueCount(); }, [refreshQueueCount, slug]);

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
            <div className="font-extrabold tracking-wide flex items-center gap-2" style={{ color: NAVY, fontSize: 16 }}>
              {/* the Genie logo, same asset the planning header wears */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 30, width: "auto" }} />
              <span style={{ color: ORANGE }}>CRM</span>
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
            {/* the way home, visible — not only behind the account menu
                (Dr Raghu, 29 Aug 2026: "back to genie button has disappeared") */}
            <a href="/" className="rounded-full border px-3 flex items-center gap-1 font-bold flex-shrink-0"
              title="Back to Main Genie"
              style={{ height: 34, borderColor: BORDER, background: "#fff", color: NAVY, fontSize: 12.5, textDecoration: "none" }}>
              🧞 Genie
            </a>
            {/* the Prospecting Queue, folded into the top bar like a bell */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setQueueTray((v) => !v); if (!queueTray) refreshQueueCount(); }}
                title="My Prospecting Queue — dial one by one"
                aria-label="Prospecting queue"
                className="rounded-full border"
                style={{
                  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                  borderColor: queueTray ? ORANGE : BORDER, background: queueTray ? "#FFF3EC" : "#fff",
                  fontSize: 15, cursor: "pointer", position: "relative",
                }}
              >
                ☎
                {(queueCount ?? 0) > 0 && (
                  <span style={{
                    position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px",
                    borderRadius: 9, background: ORANGE, color: "#fff", fontSize: 10.5, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{queueCount}</span>
                )}
              </button>
              {queueTray && (
                <>
                  <div onClick={() => setQueueTray(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div style={{
                    position: "absolute", right: 0, top: "calc(100% + 10px)", zIndex: 60,
                    width: "min(440px, 92vw)", maxHeight: "72vh", overflowY: "auto",
                    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10,
                    boxShadow: "0 14px 44px rgba(27,45,107,.28)", padding: 12,
                  }}>
                    <ProspectQueue compact onOpen={(t, id) => { setQueueTray(false); void openLinked(t, id); }} />
                  </div>
                </>
              )}
            </div>
            <span className="text-xs" style={{ color: MUTED }}>
              {displayName || email}
            </span>
            {/* the account menu — modules, Reload, Logout — same as the main header's */}
            <ModuleMenu current="crm" email={email} displayName={displayName} initials={initials} role={role} />
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
          {!navOpen && (
            <style>{`
              .crmrail{position:relative}
              .crmrail .railtip{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);
                background:${NAVY};color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;
                white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .1s;z-index:60;
                box-shadow:0 4px 14px rgba(27,45,107,.3)}
              .crmrail:hover .railtip{opacity:1}
            `}</style>
          )}
          {!navOpen && NAV.map((block, bi) => (
            <div key={bi} className="mb-2 flex flex-col gap-0.5">
              {block.items.map((it) => {
                if ("href" in it) {
                  return (
                    <a key={it.href} href={it.href}
                      className="crmrail rounded py-1.5 text-center" style={{ fontSize: 16, color: "#5A6672" }}>
                      {it.icon}<span className="railtip">{it.label}</span>
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
                    className="crmrail rounded py-1.5 text-center w-full"
                    style={name === slug
                      ? { background: NAVY, fontSize: 16 }
                      : { fontSize: 16 }}
                  >
                    {d?.icon ?? sp?.icon}
                    <span className="railtip">{d?.plural ?? sp?.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {navOpen && NAV.map((block, bi) => {
            const open = !block.collapsible || !!openBlocks[block.header || ""]
              || block.items.some((it) => "dt" in it ? it.dt === slug : "sp" in it ? it.sp === slug : false);
            return (
              <div key={bi} className="mb-3">
                {block.header && (
                  <button
                    onClick={() => block.collapsible && setOpenBlocks((m) => ({ ...m, [block.header || ""]: !m[block.header || ""] }))}
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
              <DealsScreen onOpen={openLinked} />
            ) : special.name === "analytics" ? (
              <AnalyticsScreen />
            ) : special.name === "communication" ? (
              <MailQueue onOpen={openLinked} />
            ) : special.name === "dashboard" ? (
              <Dashboard onOpen={openLinked} />
            ) : special.name === "visitingcard" ? (
              <VisitingCard onOpen={openLinked} />
            ) : special.name === "integrations" ? (
              <Integrations />
            ) : special.name === "emailqueue" ? (
              <EmailQueue />
            ) : special.name === "playbook" ? (
              <PlaybookScreen kind="sales" email={email} />
            ) : special.name === "waqueue" ? (
              <WhatsAppQueue />
            ) : special.name === "salespersonplan" ? (
              <SalesPersonPlan />
            ) : (
              <SalesPlan />
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
            {TAGGABLE.includes(dt.name) && (
              <TagFilterBox value={tagQ} onSet={setTagQ} />
            )}
            {dateView && <DateViewBar dt={dt} value={dateView} onChange={applyDateView} />}
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
                  colWidth={colW}
                  onWidth={saveColW}
                />
              )}
            </div>
            {sel.size > 0 && (
              <button onClick={() => { setBulkOpen(true); setBulkField(""); setBulkValue(""); setBulkReason(""); setBulkBusy(""); }}
                className="px-3 py-1.5 rounded text-sm font-bold"
                style={{ background: NAVY, color: "#fff" }}>
                ✎ Edit {sel.size} selected
              </button>
            )}
            {sel.size > 0 && slug === "profile" && (
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete ${sel.size} user${sel.size === 1 ? "" : "s"}? A user who owns records will be refused — deactivate those instead.`)) return;
                  let done = 0, refused = 0, why = "";
                  for (const rid of sel) {
                    const r = await fetch(`/api/crm/profile?id=${encodeURIComponent(rid)}`, { method: "DELETE" });
                    if (r.ok) done++;
                    else { refused++; if (!why) why = String((await r.json()).error ?? ""); }
                  }
                  window.alert(`Deleted ${done}.${refused ? ` ${refused} refused${why ? ` — ${why}` : ""}` : ""}`);
                  setSel(new Set());
                  void load();
                }}
                className="px-3 py-1.5 rounded text-sm font-bold"
                style={{ background: "#B3261E", color: "#fff" }}
                title="Admin only — a user who owns records is refused; deactivate those instead">
                🗑 Delete {sel.size}
              </button>
            )}
            <span className="text-xs tnum" style={{ color: MUTED }}>
              {loading
                ? "loading…"
                : total !== null && total > rows.length
                  ? `showing ${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records — narrow with search or filters`
                  : `${(total ?? rows.length).toLocaleString("en-IN")} record${(total ?? rows.length) === 1 ? "" : "s"}`}
            </span>
            {(() => {
              // Group by lives top right: Salesperson / Product family / Source,
              // whichever this doctype carries.
              const CANDIDATES: [string, string][] = [["owner_id", "Sales Person"], ["product_family", "Product Family"], ["source", "Source"], ["sector_id", "Sector"], ["industry_id", "Industry"], ["company_industry", "Industry"]];
              const opts = CANDIDATES.filter(([n]) => dt.fields.some((f) => f.name === n && !f.virtual));
              if (!opts.length) return null;
              return (
                <span className="flex items-center gap-1 ml-auto">
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                    className="px-2 py-1.5 rounded text-sm font-semibold border"
                    style={{ borderColor: groupBy ? NAVY : BORDER, background: "#fff", color: groupBy ? INK : "#5A6672" }}>
                    <option value="">Group by…</option>
                    {opts.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                  </select>
                  <button onClick={() => setSumOn((v) => !v)} title="Also show the value summation per group"
                    className="px-2 py-1.5 rounded text-sm font-bold border"
                    style={{ borderColor: sumOn ? NAVY : BORDER, background: sumOn ? NAVY_SOFT : "#fff", color: sumOn ? NAVY : "#5A6672" }}>
                    ∑
                  </button>
                </span>
              );
            })()}
          </div>

          {/* the aggregate, docked right — biggest group first */}
          {groupBy && (
            <div style={{ position: "fixed", top: 110, right: 12, bottom: 24, width: 320, zIndex: 60,
              background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: "0 10px 32px rgba(27,45,107,.22)",
              display: "flex", flexDirection: "column" }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ background: NAVY, borderRadius: "8px 8px 0 0" }}>
                <b className="text-sm" style={{ color: "#fff" }}>By {groups?.field ?? "…"}</b>
                <span className="text-xs" style={{ color: "#C8D2EC" }}>
                  {groups ? `${groups.total.toLocaleString("en-IN")} records` : "counting…"}
                </span>
                <button onClick={() => setGroupBy("")} className="font-bold" style={{ color: "#C8D2EC" }}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {!groups && <div className="p-4 text-sm" style={{ color: MUTED }}>aggregating the filtered set…</div>}
                {groups?.groups.map((g) => (
                  <div key={g.key || "∅"} className="flex items-baseline gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid #F0F1F6" }}>
                    <span className="text-sm" style={{ flex: 1, color: g.key ? INK : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.label}>{g.label}</span>
                    <b className="text-sm tnum" style={{ color: NAVY }}>{g.count.toLocaleString("en-IN")}</b>
                    {sumOn && groups.hasMoney && (
                      <span className="text-xs tnum" style={{ color: "#7C3AED", minWidth: 76, textAlign: "right" }}>{lakhCr(g.sum)}</span>
                    )}
                  </div>
                ))}
                {groups && sumOn && groups.hasMoney && (
                  <div className="flex items-baseline gap-2 px-3 py-2" style={{ background: "#F7F5F0" }}>
                    <b className="text-sm" style={{ flex: 1 }}>Total</b>
                    <b className="text-sm tnum" style={{ color: NAVY }}>{groups.total.toLocaleString("en-IN")}</b>
                    <b className="text-xs tnum" style={{ color: "#7C3AED", minWidth: 76, textAlign: "right" }}>{lakhCr(groups.sumTotal)}</b>
                  </div>
                )}
              </div>
            </div>
          )}

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
                <MultiFilter
                  label="Industry"
                  options={links.industry || []}
                  value={filters.company_industry ?? ""}
                  onChange={(v) => setFilters((cur) => ({ ...cur, company_industry: v }))}
                />
              )}
              {filterables.filter((f) => f.link !== "company").map((f) =>
                f.type === "bool" ? (
                  <select
                    key={f.name}
                    value={filters[f.name] ?? ""}
                    onChange={(e) => setFilters((cur) => ({ ...cur, [f.name]: e.target.value }))}
                    className="px-2 py-1 rounded text-xs border"
                    style={{ borderColor: filters[f.name] ? ORANGE : BORDER, background: "#fff", color: filters[f.name] ? INK : "#5A6672", maxWidth: 190 }}
                  >
                    <option value="">{f.label}: all</option>
                    <option value="true">{f.label}: yes</option>
                    <option value="false">{f.label}: no</option>
                  </select>
                ) : (
                  <MultiFilter
                    key={f.name}
                    label={f.label}
                    options={f.type === "select"
                      ? (f.options || []).map((o) => ({ id: o, label: o }))
                      : (links[f.link as string] || [])}
                    value={filters[f.name] ?? ""}
                    onChange={(v) => setFilters((cur) => ({ ...cur, [f.name]: v }))}
                  />
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

          {bulkOpen && (() => {
            const editable = dt.fields.filter((f) => !f.virtual && f.type !== "readonly" && f.name !== dt.autoNumber?.field);
            const bf = editable.find((f) => f.name === bulkField);
            const isTagAdd = bulkField === "__tag";
            // A move to Lost or Not Target refuses without a reason — the
            // database's rule, so the box asks for it up front.
            const stageLabel = bf?.name === "stage_id" ? (links["stage"] ?? []).find((o) => o.id === bulkValue)?.label ?? null : null;
            const needsReason = stageLabel === "Lost" || stageLabel === "Not Target";
            const apply = async () => {
              setBulkBusy("working");
              let done = 0, failed = 0, why = "";
              for (const rid of sel) {
                try {
                  const r = isTagAdd
                    ? await fetch("/api/crm/tags", {
                        method: "POST", headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "add", entity: dt.name, id: rid, name: bulkValue }),
                      })
                    : await fetch(`/api/crm/${slug}?id=${encodeURIComponent(rid)}`, {
                    method: "PATCH", headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      [bulkField]: bf?.type === "bool" ? bulkValue === "true" : bulkValue,
                      ...(needsReason ? { lost_reason: bulkReason.trim() } : {}),
                    }),
                  });
                  if (r.ok) done++;
                  else { failed++; if (!why) why = String((await r.json()).error ?? ""); }
                } catch { failed++; }
                setBulkBusy(`${done + failed}/${sel.size}…`);
              }
              setBulkBusy(`Changed ${done}${failed ? ` · ${failed} refused${why ? ` — ${why.slice(0, 140)}` : ""}` : ""}`);
              await load();
              if (!failed) { setBulkOpen(false); setSel(new Set()); }
            };
            return (
              <div onClick={() => bulkBusy === "" || bulkBusy.startsWith("Changed") ? setBulkOpen(false) : null}
                style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(27,45,107,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px" }}>
                <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(440px,100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
                    <b className="text-white text-sm">✎ Edit {sel.size} selected {sel.size === 1 ? dt.label.toLowerCase() : dt.plural.toLowerCase()}</b>
                    <button onClick={() => setBulkOpen(false)} className="font-bold" style={{ color: "#C8D2DC" }}>✕</button>
                  </div>
                  <div className="p-4" style={{ display: "grid", gap: 10 }}>
                    <label className="text-xs font-bold" style={{ color: MUTED }}>
                      FIELD
                      <select value={bulkField} onChange={(e) => { setBulkField(e.target.value); setBulkValue(""); }}
                        className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER, background: "#fff" }}>
                        <option value="">— choose —</option>
                        {TAGGABLE.includes(dt.name) && <option value="__tag">🏷 Add a tag (yours)</option>}
                        {editable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                      </select>
                    </label>
                    {isTagAdd && (
                      <label className="text-xs font-bold" style={{ color: MUTED }}>
                        THE TAG — added to every selected record (a new name becomes yours)
                        <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} list="tagfilter-names"
                          className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER }} placeholder="type or pick…" />
                      </label>
                    )}
                    {bf && (
                      <label className="text-xs font-bold" style={{ color: MUTED }}>
                        NEW VALUE — set on every selected record
                        {bf.type === "select" ? (
                          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER, background: "#fff" }}>
                            <option value="">—</option>
                            {(bf.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : bf.type === "link" ? (
                          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER, background: "#fff" }}>
                            <option value="">—</option>
                            {(links[bf.link as string] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        ) : bf.type === "bool" ? (
                          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER, background: "#fff" }}>
                            <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                          </select>
                        ) : (
                          <input type={bf.type === "date" ? "date" : bf.type === "number" || bf.type === "money" ? "number" : "text"}
                            value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
                            className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: BORDER, background: "#fff" }} />
                        )}
                      </label>
                    )}
                    {needsReason && (
                      <label className="text-xs font-bold" style={{ color: MUTED }}>
                        REASON — a {stageLabel} move refuses to save without one
                        <textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} rows={2}
                          placeholder="Why it was lost — goes on every selected record"
                          className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: bulkReason.trim().length > 3 ? BORDER : "#E8600A", background: "#fff" }} />
                      </label>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => void apply()} disabled={!bulkField || bulkValue === "" || (needsReason && bulkReason.trim().length <= 3) || bulkBusy === "working" || /\d\//.test(bulkBusy)}
                        className="px-4 py-1.5 rounded text-sm font-bold"
                        style={{ background: !bulkField || bulkValue === "" || (needsReason && bulkReason.trim().length <= 3) ? "#B9BEC4" : ORANGE, color: "#fff" }}>
                        Apply to {sel.size}
                      </button>
                      {bulkBusy && <span className="text-xs font-semibold" style={{ color: bulkBusy.includes("refused") ? "#8E2C20" : MUTED }}>{bulkBusy}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                    <th style={{ position: "sticky", top: 0, zIndex: 8, background: "#fff", boxShadow: `inset 0 -2px 0 ${BORDER}`, width: 30, padding: "8px 4px 8px 10px" }}>
                      <input type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => sel.has(String(r.id)))}
                        onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => String(r.id))) : new Set())}
                        title="Select everything on screen" style={{ accentColor: NAVY }} />
                    </th>
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
                    <th style={{ position: "sticky", top: 0, zIndex: 6, background: "#fff", boxShadow: `inset 0 -2px 0 ${BORDER}`, width: 84 }} />
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
                      <td onClick={(e) => { e.stopPropagation(); toggleSel(String(r.id)); }}
                        style={{ padding: "8px 4px 8px 10px", borderBottom: "1px solid #F0EEE8", background: "#fff", width: 30 }}>
                        <input type="checkbox" checked={sel.has(String(r.id))} readOnly style={{ accentColor: NAVY, pointerEvents: "none" }} />
                      </td>
                      {visible.map((f, ci) => (
                        <td
                          key={f.name}
                          title={typeof r[f.name] === "string" && (r[f.name] as string).length > 40 ? (r[f.name] as string) : undefined}
                          style={{
                            // one line per cell — the row is a scan, the
                            // lightbox is the read (Dr Raghu, 26 Aug 2026)
                            padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #F0EEE8",
                            verticalAlign: "top", background: "#fff",
                            maxWidth: ci < pin ? PINNED_W : colW,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            ...(ci < pin ? stickyCell(ci, 5) : null),
                          }}
                        >
                          <Cell field={f} value={r[f.name]} links={links} onOpenLink={openLinked} short />
                        </td>
                      ))}
                      {(() => {
                        const c = rowContacts(dt, r);
                        return (
                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EEE8", background: "#fff", textAlign: "right", whiteSpace: "nowrap" }}>
                            <ContactActions email={c.email} phone={c.phone} compact
                              onCompose={c.email ? () => composeFor(dt, r, c.email) : undefined}
                              onWa={c.phone ? (m) => waFor(dt, r, c.phone as string, m) : undefined} />
                          </td>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- the footer: how much of the book to hold ---------- */}
          {rows.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>SHOW</span>
              {["100", "500", "2500", "10000", "50000", "all"].map((sz) => (
                <button
                  key={sz}
                  onClick={() => setPageSize(sz)}
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold border"
                  style={pageSize === sz
                    ? { background: NAVY, borderColor: NAVY, color: "#fff" }
                    : { background: "#fff", borderColor: BORDER, color: MUTED }}
                >
                  {sz === "all" ? "All" : Number(sz).toLocaleString("en-IN")}
                </button>
              ))}
              {total !== null && rows.length < total && (
                <button
                  onClick={() => void showMore()}
                  disabled={moreBusy}
                  className="px-3 py-1 rounded text-xs font-bold"
                  style={{ background: moreBusy ? "#B9BEC4" : ORANGE, color: "#fff" }}
                >
                  {moreBusy ? "Loading…" : "Show more ↓"}
                </button>
              )}
              <span className="text-xs tnum" style={{ color: MUTED }}>
                showing {rows.length.toLocaleString("en-IN")}{total !== null ? ` of ${total.toLocaleString("en-IN")}` : ""}
              </span>
            </div>
          )}
        </main>
        )}
      </div>

      {compose && (
        <MailComposer
          ctx={compose}
          onClose={() => setCompose(null)}
          onSent={() => setCompose(null)}
        />
      )}

      {waCtx && (
        <WaComposer
          ctx={waCtx}
          onClose={() => setWaCtx(null)}
          onSent={() => setWaCtx(null)}
        />
      )}

      {view && (
        <RecordModal
          view={view}
          onClose={() => setView(null)}
          onCompose={(email) => composeFor(view.dt, view.row, email)}
          onWa={(phone, m) => waFor(view.dt, view.row, phone, m)}
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

/** Does this value read as an address you can act on? */
const isEmailish = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isPhoneish = (v: unknown): v is string =>
  typeof v === "string" && !/^\d{4}-\d{2}-\d{2}/.test(v.trim()) &&
  /^\+?[\d\s()-]{8,18}$/.test(v.trim()) && /\d{8,}/.test(v.replace(/\D/g, ""));

/** ✉ 📞 💬 — click starts the mail, the call, the WhatsApp. */
function ContactActions({ email, phone, compact, onCompose, onWa }: {
  email?: string | null; phone?: string | null; compact?: boolean;
  /** When given, the envelope opens the mail lightbox instead of mailto. */
  onCompose?: () => void;
  /** When given: 💬 fires the quick logged hello, 💬+ opens the WhatsApp
   *  lightbox with templates. Without it the icons stay plain wa.me links. */
  onWa?: (mode: "quick" | "compose") => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const digits = phone ? phone.replace(/\D/g, "") : "";
  const size = compact ? 13 : 15;
  if (!email && !phone) return null;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ marginLeft: compact ? 0 : 8, verticalAlign: "baseline" }}>
      {email && onCompose && (
        <button onClick={(e) => { stop(e); onCompose(); }} title={`Write to ${email} — from your connected mailbox`} style={{ fontSize: size }}>✉️</button>
      )}
      {email && !onCompose && (
        <a href={`mailto:${email}`} onClick={stop} title={`Write to ${email}`} style={{ fontSize: size, textDecoration: "none" }}>✉️</a>
      )}
      {phone && (
        <a href={`tel:${phone}`} onClick={stop} title={`Call ${phone}`} style={{ fontSize: size, textDecoration: "none" }}>📞</a>
      )}
      {phone && digits.length >= 10 && onWa && (
        <>
          <button onClick={(e) => { stop(e); onWa("quick"); }} title={`WhatsApp ${phone} — opens with the hello, and logs it`} style={{ fontSize: size }}>💬</button>
          <button onClick={(e) => { stop(e); onWa("compose"); }} title={`WhatsApp ${phone} with a template — logged in Communication`} style={{ fontSize: size - 2, fontWeight: 800, color: "#1FA855" }}>💬+</button>
        </>
      )}
      {phone && digits.length >= 10 && !onWa && (
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" onClick={stop} title={`WhatsApp ${phone}`} style={{ fontSize: size, textDecoration: "none" }}>💬</a>
      )}
    </span>
  );
}

/**
 * The stage, editable RIGHT ON THE DETAILS VIEW (Dr Raghu, 26 Aug 2026) —
 * pick, it saves; a move to Lost or Not Target asks for its reason first,
 * because the database will refuse without one.
 */
function StageQuickEdit({ dtName, row, links, onChanged }: {
  dtName: string; row: Row; links: Links; onChanged: (r: Row) => void;
}) {
  const [val, setVal] = useState(String(row.stage_id ?? ""));
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => setVal(String(row.stage_id ?? "")), [row.stage_id]);
  const opts = links["stage"] ?? [];
  const labelOf = (id: string) => opts.find((o) => o.id === id)?.label ?? "";

  const save = async (stageId: string, lostReason?: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/crm/${dtName}?id=${encodeURIComponent(String(row.id))}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, ...(lostReason ? { lost_reason: lostReason } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not move the stage");
      setVal(stageId); setPending(null); setReason("");
      onChanged((j.row ?? { ...row, stage_id: stageId }) as Row);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const choose = (id: string) => {
    if (!id || id === val) return;
    if (["Lost", "Not Target"].includes(labelOf(id))) { setPending(id); setMsg(""); return; }
    void save(id);
  };

  return (
    <span>
      <select value={pending ?? val} onChange={(e) => choose(e.target.value)} disabled={busy}
        onClick={(e) => e.stopPropagation()}
        className="rounded border px-1.5 py-0.5 text-sm font-semibold"
        style={{ borderColor: BORDER, background: "#fff", color: INK, maxWidth: 220 }}>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {pending && (
        <span className="block mt-1">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus
            placeholder={`Why ${labelOf(pending)}? The move refuses to save without a reason.`}
            className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: reason.trim().length > 3 ? BORDER : "#E8600A" }} />
          <span className="flex gap-1.5 mt-1">
            <button onClick={() => void save(pending, reason.trim())} disabled={busy || reason.trim().length <= 3}
              className="rounded px-2 py-0.5 text-xs font-bold"
              style={{ background: reason.trim().length > 3 ? ORANGE : "#B9BEC4", color: "#fff" }}>
              Move to {labelOf(pending)}
            </button>
            <button onClick={() => { setPending(null); setReason(""); }} className="rounded px-2 py-0.5 text-xs font-bold border" style={{ borderColor: BORDER, color: "#5A6672" }}>Cancel</button>
          </span>
        </span>
      )}
      {msg && <span className="block text-xs mt-0.5" style={{ color: "#8E2C20" }}>{msg}</span>}
    </span>
  );
}

/**
 * A filter that PICKS MANY (Dr Raghu, 27 Aug 2026): the dropdown becomes a
 * checkbox popover — one, several, or All. Empty means all; the value rides
 * as a comma list and the API answers with IN.
 */
function MultiFilter({ label, options, value, onChange }: {
  label: string; options: { id: string; label: string }[];
  value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(value ? value.split(",") : []);
  const toggle = (id: string) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id); else n.add(id);
    onChange([...n].join(","));
  };
  const title = !chosen.size
    ? `${label}: all`
    : chosen.size === 1
      ? `${label}: ${options.find((o) => o.id === [...chosen][0])?.label ?? "1"}`
      : `${label}: ${chosen.size} ✓`;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded text-xs border"
        style={{ borderColor: chosen.size ? ORANGE : BORDER, background: "#fff", color: chosen.size ? INK : "#5A6672", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div className="rounded border" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, background: "#fff", borderColor: BORDER, boxShadow: "0 8px 24px rgba(27,45,107,.18)", minWidth: 220, maxHeight: 320, overflowY: "auto", padding: 6 }}>
            <div className="flex items-center gap-3 px-1.5 pb-1.5 mb-1 text-xs font-bold" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <button onClick={() => onChange("")} style={{ color: NAVY }}>All</button>
              <button onClick={() => onChange(options.map((o) => o.id).join(","))} style={{ color: NAVY }}>Every ✓</button>
              <button onClick={() => setOpen(false)} className="ml-auto" style={{ color: MUTED }}>✕</button>
            </div>
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-1.5 py-1 text-sm cursor-pointer rounded hover:bg-[#F7F5F0]">
                <input type="checkbox" checked={chosen.has(o.id)} onChange={() => toggle(o.id)} style={{ accentColor: NAVY }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The first actionable email and phone in a row, whichever fields hold them. */
function rowContacts(dt: Doctype, r: Row): { email: string | null; phone: string | null } {
  let email: string | null = null, phone: string | null = null;
  for (const f of dt.fields) {
    const v = r[f.name];
    if (!email && isEmailish(v)) email = v.trim();
    if (!phone && isPhoneish(v)) phone = v.trim();
  }
  return { email, phone };
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
  field, value, links, onOpenLink, short,
}: {
  field: Field; value: unknown; links: Links;
  onOpenLink?: (target: string, id: string) => void;
  /** list views show just the number; the record inside shows the full
   *  string (Dr Raghu, 28 Aug 2026: "In the view only show number.
   *  Inside show full!"). */
  short?: boolean;
}) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#C7CCD2" }}>—</span>;

  // NGSE/QTN/26-27/39514 reads as 39514 in a list; the whole id is the tooltip.
  if (short && ["opportunity_no", "quote_no", "so_no"].includes(field.name)) {
    const m = String(value).match(/(\d+)\s*$/);
    return <span className="tnum" title={String(value)}>{m ? m[1] : String(value)}</span>;
  }

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
  dt, visibleNames, onChange, onClose, colWidth, onWidth,
}: {
  dt: Doctype; visibleNames: string[];
  onChange: (next: string[] | null) => void; onClose: () => void;
  colWidth: number; onWidth: (w: number) => void;
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
      <div className="flex items-center gap-1 px-1 pb-1 mb-1" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>WIDTH</span>
        {([["Narrow", 140], ["Normal", 280], ["Wide", 440]] as const).map(([l, w]) => (
          <button key={w} onClick={() => onWidth(w)}
            className="px-2 py-0.5 rounded-full text-xs font-bold border"
            style={colWidth === w ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}>
            {l}
          </button>
        ))}
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
  view, onClose, onEdit, onSaved, onOpenLink, onCompose, onWa,
}: {
  view: ViewState; onClose: () => void; onEdit: () => void;
  onSaved: (saved?: Row) => void;
  onOpenLink: (target: string, id: string) => void;
  onCompose: (email: string) => void;
  onWa: (phone: string, mode: "quick" | "compose") => void;
}) {
  const { dt, row, links, mode } = view;
  const title = String(row[dt.titleField] ?? dt.label);
  const isCompany = dt.name === "company";
  const [queueMsg, setQueueMsg] = useState("");

  /** A linked row's label, off the options already fetched for the form. */
  const linkLabel = (target: string, id: unknown): string | null => {
    if (!id) return null;
    return (links[target] || []).find((o) => String(o.id) === String(id))?.label ?? null;
  };
  /**
   * The header strip (Dr Raghu, 28 Aug 2026): enquiry · customer ·
   * salesperson · and the AGE — red past two days, because an enquiry that
   * sat three days is already an apology.
   */
  // opportunity_on is a plain date; the created_at fallback is a timestamp,
  // shifted to IST before the date is read (a 00:30 IST enquiry is today's)
  const oppDate = row.opportunity_on
    ? String(row.opportunity_on).slice(0, 10)
    : row.created_at ? new Date(new Date(String(row.created_at)).getTime() + 330 * 60000).toISOString().slice(0, 10) : "";
  const ageDays = /^\d{4}-\d{2}-\d{2}$/.test(oppDate)
    ? Math.floor((Date.now() - new Date(oppDate + "T00:00:00").getTime()) / 864e5)
    : null;
  // companies and contacts joined the dial queue on 29 Aug 2026
  const QUEUEABLE = ["opportunity", "quotation", "sales_order", "lead", "company", "person"];
  const queueThis = async () => {
    try {
      const r = await fetch("/api/crm/prospect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", kind: dt.name, id: String(row.id) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      setQueueMsg(j.already ? "already in your queue" : "queued ✓");
      window.setTimeout(() => setQueueMsg(""), 2400);
    } catch (e) { setQueueMsg(e instanceof Error ? e.message : String(e)); }
  };
  const [tab, setTab] = useState("details");
  const [apolloMsg, setApolloMsg] = useState("");
  useEffect(() => { setTab("details"); setApolloMsg(""); }, [row.id]);

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
    presetOptions?: Links;
  };
  const rid = String(row.id ?? "");
  const companyId = row.company_id ? String(row.company_id) : null;
  const hasEnquiry = dt.fields.some((f) => f.tab === "enquiry");
  const hasQual = dt.fields.some((f) => f.tab === "qual");
  const TABBED = ["company", "person", "opportunity", "quotation", "sales_order"];
  const recordTabs: TabDef[] = [];
  if (TABBED.includes(dt.name)) {
    recordTabs.push({ key: "details", label: "Details" });
    if (dt.name === "company") recordTabs.push({ key: "eva", label: "✨ EVA Brief" });
    if (hasEnquiry) recordTabs.push({ key: "enquiry", label: "Enquiry Info" });
    // Contacts: the company's people, addable right there
    if (dt.name === "company")
      recordTabs.push({ key: "contacts", label: "Contacts", count: row.contact_count, slug: "person", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } });
    else if (dt.name !== "person")
      recordTabs.push({ key: "contacts", label: "Contacts", slug: "person", filterField: "company_id", filterValue: companyId, addPresets: companyId ? { company_id: companyId } : undefined });
    if (hasQual) recordTabs.push({ key: "qual", label: "Qualification" });
    if (dt.name === "company") {
      recordTabs.push(
        { key: "addresses", label: "Addresses", slug: "address", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } },
        { key: "opps", label: "Opportunities", count: row.opp_count, slug: "opportunity", filterField: "company_id", filterValue: rid },
        { key: "quotes", label: "Quotations", slug: "quotation", filterField: "company_id", filterValue: rid },
        { key: "sos", label: "Sales Orders", count: row.so_count, slug: "sales_order", filterField: "company_id", filterValue: rid },
      );
    }
    if (dt.name === "opportunity")
      recordTabs.push({ key: "dealppl", label: "Deal contacts", slug: "opportunity_contact", filterField: "opportunity_id", filterValue: rid, addPresets: { opportunity_id: rid }, presetOptions: { opportunity: [{ id: rid, label: String(row.name || "this opportunity") }] } });
    if (dt.name === "opportunity")
      recordTabs.push({ key: "quotes", label: "Quotations", slug: "quotation", filterField: "opportunity_id", filterValue: rid, addPresets: { opportunity_id: rid, ...(companyId ? { company_id: companyId } : {}) }, presetOptions: { opportunity: [{ id: rid, label: String(row.name || "this opportunity") }] } });
    if (dt.name === "quotation") {
      const qOpp = row.opportunity_id ? String(row.opportunity_id) : null;
      // THE TRANSFER (Dr Raghu, 29 Aug 2026): a quotation made from an
      // opportunity carries its enquiry info, deal contacts, attachments and
      // communication — shown FROM the opportunity, always in step, never a
      // stale copy.
      if (qOpp) {
        recordTabs.push({ key: "oppenquiry", label: "Enquiry Info" });
        recordTabs.push({ key: "dealppl", label: "Deal Contacts", slug: "opportunity_contact", filterField: "opportunity_id", filterValue: qOpp, addPresets: { opportunity_id: qOpp }, presetOptions: { opportunity: [{ id: qOpp, label: "this quotation's opportunity" }] } });
      }
      recordTabs.push({ key: "lines", label: "Lines", slug: "quotation_line", filterField: "quotation_id", filterValue: rid, addPresets: { quotation_id: rid } });
    }
    if (dt.name === "person") recordTabs.push({ key: "card", label: "Visiting Card" });
    recordTabs.push(
      { key: "comms", label: "Communication" },
      { key: "notes", label: "Notes" },
    );
    if (dt.name === "company" || dt.name === "person")
      recordTabs.push({ key: "merge", label: "Merge" });
    recordTabs.push({ key: "genie", label: "Genie" });
  }
  const hasTabs = recordTabs.length > 0;
  const EDITABLE_TABS = ["details", "enquiry", "qual"];
  const editTabKey = (EDITABLE_TABS.includes(tab) ? tab : "details") as "details" | "enquiry" | "qual";
  useEffect(() => {
    if (mode === "edit" && hasTabs && !EDITABLE_TABS.includes(tab)) setTab("details");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(22,35,47,.45)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: "10px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded"
        style={{
          background: "#fff", width: hasTabs ? "min(1080px, 100%)" : "min(880px, 100%)",
          boxShadow: "0 12px 40px rgba(27,45,107,.35)",
          height: "calc(100vh - 20px)", display: "flex", flexDirection: "column", minHeight: 0,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: NAVY, borderRadius: "6px 6px 0 0", position: "relative", flexShrink: 0 }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="text-xs font-bold" style={{ color: ORANGE, letterSpacing: 1 }}>
              {dt.label.toUpperCase()}
            </div>
            <div className="text-white font-bold" style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ fontSize: 12, color: "#C8D2DC", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline", marginTop: 2 }}>
              {/* the enquiry number, trailing digits — the whole dress on hover
                  (Dr Raghu, 30 Aug 2026: "show this in the header, the last digits") */}
              {dt.name === "opportunity" && row.opportunity_no != null && (
                <span title={String(row.opportunity_no)} className="font-bold rounded px-1.5" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}>
                  № {(String(row.opportunity_no).match(/(\d+)\s*$/) || [])[1] ?? String(row.opportunity_no)}
                </span>
              )}
              {row.company_id != null && <span><b style={{ color: "#fff" }}>{linkLabel("company", row.company_id) ?? "—"}</b></span>}
              {row.owner_id != null && <span>: {linkLabel("profile", row.owner_id) ?? "—"}</span>}
              {ageDays !== null && (
                <span style={{ fontWeight: 800, color: ageDays > 2 ? "#FF6B5E" : "#8FD5A6" }}>
                  : {ageDays} day{ageDays === 1 ? "" : "s"}
                </span>
              )}
              {queueMsg && <span style={{ color: "#F5B32B", fontWeight: 700 }}>{queueMsg}</span>}
              {apolloMsg && apolloMsg !== "asking Apollo…" && <span style={{ color: apolloMsg.startsWith("✓") ? "#8FD5A6" : "#F5B32B", fontWeight: 700 }}>{apolloMsg}</span>}
            </div>
            {QUEUEABLE.includes(dt.name) && (
              <button
                onClick={queueThis}
                title="Save to my Prospecting Queue — it appears on the Dashboard, to dial one by one"
                aria-label="Save to my prospecting queue"
                style={{
                  position: "absolute", right: 10, bottom: 6, width: 24, height: 24,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 6, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)",
                  color: "#fff", fontSize: 12, cursor: "pointer",
                }}
              >
                ☎
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode === "view" && (dt.name === "company" || dt.name === "person") && (
              <button
                onClick={async () => {
                  // Apollo bills for what it answers — the consent is here
                  if (!window.confirm(`Enrich with Apollo? APOLLO CREDITS WILL BE CONSUMED.\n\n${dt.name === "company"
                    ? "Fills the company's empty fields, brings in up to 10 people as contacts, and files the rest into Notes."
                    : "Looks this contact up — you tick which suggestions to apply on the Visiting Card tab."}`)) return;
                  if (dt.name === "person") {
                    try { window.sessionStorage.setItem("crm.apollo.auto", rid); } catch { /* fine */ }
                    setTab("card");
                    return;
                  }
                  setApolloMsg("asking Apollo…");
                  try {
                    const r = await fetch("/api/crm/enrich", {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "company", company_id: rid }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(String(j.error || r.status));
                    setApolloMsg(!j.found ? "Apollo has no match" :
                      `✓ ${j.contacts_created} contact${j.contacts_created === 1 ? "" : "s"} in · ${j.filled.length ? "filled " + j.filled.join(", ") : "fields already full"}${j.noted ? " · noted" : ""}`);
                    onSaved();
                  } catch (e) { setApolloMsg(e instanceof Error ? e.message : String(e)); }
                }}
                title="Fetch from Apollo.io — Apollo credits will be consumed"
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}
              >
                {apolloMsg === "asking Apollo…" ? "Asking Apollo…" : "🔎 Enrich with Apollo"}
              </button>
            )}
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

        {hasTabs && (
          <div
            className="flex flex-wrap"
            style={{ borderBottom: `2px solid ${BORDER}`, padding: "0 12px", gap: 2 }}
          >
            {recordTabs.map((t) => (
              <button
                key={t.key}
                disabled={mode === "edit" && !EDITABLE_TABS.includes(t.key)}
                onClick={() => setTab(t.key)}
                className="text-sm font-bold"
                style={{
                  padding: "10px 14px", color: tab === t.key ? ORANGE : MUTED,
                  borderBottom: `3px solid ${tab === t.key ? ORANGE : "transparent"}`,
                  marginBottom: -2,
                  opacity: mode === "edit" && !EDITABLE_TABS.includes(t.key) ? 0.35 : 1,
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

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {mode === "view" ? (
          !hasTabs || tab === "details" ? (
            <div
              className="grid gap-x-6 gap-y-3 p-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
            >
              {dt.fields.filter((f) => (!hasTabs || !f.tab) && !(f.tenderOnly && row.is_tender !== true)).map((f) => (
                <div key={f.name}>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{f.label}</div>
                  <div className="text-sm" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {f.name === "stage_id" && (dt.name === "opportunity" || dt.name === "quotation")
                      ? <StageQuickEdit dtName={dt.name} row={row} links={links} onChanged={(r2) => onSaved(r2)} />
                      : <Cell field={f} value={row[f.name]} links={links} onOpenLink={onOpenLink} />}
                    {f.type !== "date" && isEmailish(row[f.name]) && (
                      <ContactActions email={row[f.name] as string}
                        onCompose={() => onCompose(row[f.name] as string)} />
                    )}
                    {f.type !== "date" && isPhoneish(row[f.name]) && (
                      <ContactActions phone={row[f.name] as string}
                        onWa={(m) => onWa(row[f.name] as string, m)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "enquiry" ? (
            dt.name === "opportunity"
              ? <>
                  <EnquiryInfoTab row={row} onSaved={onSaved} />
                  {/* qualification lives HERE now (Dr Raghu, 30 Aug 2026) —
                      the BANTTC strip under the enquiry, its own tab gone */}
                  <div className="px-4 pb-4"><QualView dt={dt} row={row} links={links} /></div>
                </>
              : <div className="p-4">
                  <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "calc(100vh - 260px)", overflowY: "auto", overflowWrap: "anywhere" }}>
                    {String(row.enquiry_info ?? "").trim()
                      ? <RichText text={String(row.enquiry_info)} />
                      : <span style={{ color: MUTED }}>No enquiry text recorded.</span>}
                  </div>
                </div>
          ) : tab === "oppenquiry" ? (
            <OppEnquiryTab oppId={row.opportunity_id ? String(row.opportunity_id) : null} />
          ) : tab === "qual" ? (
            <div className="p-4">
              <QualView dt={dt} row={row} links={links} />
            </div>
          ) : tab === "eva" ? (
            <EvaBriefTab companyId={rid} initial={row.eva_brief ? String(row.eva_brief) : null} initialAt={row.eva_brief_at ? String(row.eva_brief_at) : null} />
          ) : tab === "card" ? (
            <PersonCardPanel personId={rid} personRow={row} onSaved={() => onSaved()} />
          ) : tab === "comms" ? (
            <CommsFeed
              type={dt.name} id={rid} companyId={companyId} onOpenLink={onOpenLink}
              contactEmail={
                [row.primary_email, row.contact_email].find(isEmailish) as string | undefined ?? null
              }
            />
          ) : tab === "notes" ? (
            <NotesTab type={dt.name} id={rid} />
          ) : tab === "merge" ? (
            <MergeTab type={dt.name} id={rid} title={title} onMerged={() => onSaved({ id: rid })} />
          ) : tab === "genie" ? (
            <GenieTab type={dt.name} id={rid} />
          ) : (() => {
            const t = recordTabs.find((x) => x.key === tab);
            return t?.slug ? (
              <RelatedTab
                slug={t.slug}
                filterField={t.filterField as string}
                filterValue={t.filterValue ?? null}
                addPresets={t.addPresets}
                presetOptions={t.presetOptions}
                onOpenLink={onOpenLink}
                onCompose={onCompose}
                onWa={onWa}
              />
            ) : null;
          })()
        ) : (
          <div className="p-4">
            <RecordForm
              dt={dt} links={links} initial={row} onDone={onSaved}
              tabKey={hasTabs ? editTabKey : undefined}
            />
          </div>
        )}
        </div>
        {TAGGABLE.includes(dt.name) && mode === "view" && (
          <TagStrip entity={dt.name} id={rid} />
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
  slug, filterField, filterValue, addPresets, presetOptions, onOpenLink, onCompose, onWa,
}: {
  slug: string; filterField: string; filterValue: string | null;
  addPresets?: Row;
  /** Options injected into the add-form's link dropdowns so a PRESET link
   *  reads as chosen — a quotation raised from an opportunity arrives with
   *  that opportunity already picked (Dr Raghu, 28 Aug 2026). */
  presetOptions?: Links;
  onOpenLink: (target: string, id: string) => void;
  onCompose?: (email: string) => void;
  onWa?: (phone: string, mode: "quick" | "compose") => void;
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
        const merged: Links = { ...(j.links || {}) };
        for (const [k, opts] of Object.entries(presetOptions || {})) {
          const have = new Set((merged[k] || []).map((o) => o.id));
          merged[k] = [...(merged[k] || []), ...opts.filter((o) => !have.has(o.id))];
        }
        setRows(j.rows); setLinks(merged); setTotal(j.total ?? j.rows.length);
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
    <div style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto" }}>
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
                <td key={f.name}
                  title={typeof r[f.name] === "string" && (r[f.name] as string).length > 40 ? (r[f.name] as string) : undefined}
                  style={{
                    padding: "8px 14px", fontSize: 13, borderBottom: "1px solid #F0F1F6", verticalAlign: "top",
                    maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                  <Cell field={f} value={r[f.name]} links={links} onOpenLink={onOpenLink} short />
                  {f.type !== "date" && isEmailish(r[f.name]) && (
                    <ContactActions email={r[f.name] as string} compact
                      onCompose={onCompose ? () => onCompose(r[f.name] as string) : undefined} />
                  )}
                  {f.type !== "date" && isPhoneish(r[f.name]) && (
                    <ContactActions phone={r[f.name] as string} compact
                      onWa={onWa ? (m) => onWa(r[f.name] as string, m) : undefined} />
                  )}
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
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (valueLabel) setText(valueLabel); }, [valueLabel]);

  // "add new should be there" (Dr Raghu, 28 Aug 2026): a company typed but
  // not found is one click from existing — same move the contact picker has.
  const creatable = target === "company";
  const createNew = async () => {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/${target}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not add it");
      onPick(String(j.row.id));
      setOpen(false);
    } catch { /* the typed text stays; picking again retries */ }
    finally { setBusy(false); }
  };

  // A preset id whose name is beyond the dropdown's horizon still shows its
  // name — fetched once, so "auto-chosen" reads as chosen, not empty.
  useEffect(() => {
    if (!value || valueLabel) return;
    let dead = false;
    fetch(`/api/crm/${target}?id=${encodeURIComponent(value)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (dead || !j?.row) return;
        const t = doctypeBySlug(target);
        setText(String(j.row[t?.titleField ?? "id"] ?? ""));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [value, valueLabel, target]);

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
      {open && (options.length > 0 || (creatable && text.trim())) && (
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
          {creatable && text.trim() && !options.some((o) => o.label.trim().toLowerCase() === text.trim().toLowerCase()) && (
            <button
              onMouseDown={(e) => { e.preventDefault(); void createNew(); }}
              className="w-full text-left px-2 py-1.5 text-sm font-bold"
              style={{ color: ORANGE, borderTop: `1px solid ${BORDER}` }}
            >
              {busy ? "Adding…" : `＋ Add "${text.trim()}" as a new company`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The enquiry, writable rich (Dr Raghu, 28 Aug 2026: "enquiry info make rich
 * text as well as keep attachments possible to add"): the same markdown the
 * RichText reader renders — **bold**, [label](link) — plus a 📎 that puts
 * the file in Drive (through the Gmail connection's door, ~4 MB) and drops
 * its link at the cursor. Live preview below, so what you type is what the
 * reader sees.
 */
function RichTextArea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uerr, setUerr] = useState("");

  const insert = (snippet: string, wrap?: boolean) => {
    const ta = taRef.current;
    if (!ta) { onChange(value + snippet); return; }
    const a = ta.selectionStart ?? value.length, b = ta.selectionEnd ?? a;
    const next = wrap
      ? value.slice(0, a) + "**" + (value.slice(a, b) || "bold") + "**" + value.slice(b)
      : value.slice(0, a) + snippet + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); const at = a + (wrap ? 2 : snippet.length); ta.setSelectionRange(at, wrap ? at + Math.max(4, b - a) : at); });
  };

  const attach = async (file: File) => {
    setUploading(true); setUerr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/crm/gmail/attach", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The upload failed");
      const isImg = /^image\//.test(file.type);
      insert(`${value && !value.endsWith("\n") ? "\n" : ""}${isImg ? "!" : ""}[📎 ${j.name || file.name}](${j.link})\n`);
    } catch (e) { setUerr(e instanceof Error ? e.message : String(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <button type="button" onClick={() => insert("", true)}
          className="rounded border px-2 py-0.5 text-xs font-extrabold" style={{ borderColor: BORDER, color: INK }} title="**bold** around the selection">B</button>
        <button type="button" onClick={() => insert("[label](https://)")}
          className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: BORDER, color: "#2C5B82" }} title="A markdown link">🔗 Link</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: BORDER, color: ORANGE }}
          title="Up to ~4 MB — lands in Drive via your Gmail connection, links here">
          {uploading ? "Uploading…" : "📎 Attach"}
        </button>
        <span className="text-xs" style={{ color: MUTED }}>**bold** and [label](link) read rich</span>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); }} />
      </div>
      {uerr && <div className="text-xs mb-1" style={{ color: "#8E2C20" }}>{uerr}</div>}
      <textarea
        ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full px-2 py-1.5 rounded text-sm border" style={{ borderColor: BORDER }}
      />
      {value.trim() !== "" && (
        <div className="rounded border px-2 py-1.5 text-sm mt-1" style={{ borderColor: BORDER, background: "#FAF9F5", whiteSpace: "pre-wrap", lineHeight: 1.6, overflowWrap: "anywhere", maxHeight: 160, overflowY: "auto" }}>
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}

/**
 * The enquiry as it arrived, readable: markdown links and images become
 * clickable links, bare URLs link themselves, bold reads bold. Rendered as
 * React nodes — never injected HTML, so a pasted enquiry cannot run code.
 */
/** An ERP file URL needs the ERP's login — those travel through Genie's own
 *  door instead, fetched server-side with the stored token (29 Aug 2026), so
 *  images EMBED and attachments open for anyone signed into Genie. */
const isErpFile = (u: string) => /^https?:\/\/[^/]*nandanerp[^/]*\/(private\/)?files?\//i.test(u);
const viaDoor = (u: string) => (isErpFile(u) ? `/api/crm/erp-file?u=${encodeURIComponent(u)}` : u);
const looksImage = (u: string) => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(u) || /\/files?\//i.test(u);

function RichText({ text }: { text: string }) {
  // new content wears sanitized HTML (the common rich box, 30 Aug 2026);
  // everything below is the legacy markdown-ish reader
  if (looksHtml(text)) return <RichContent text={text} legacy={(s2) => <>{s2}</>} />;
  const parts: React.ReactNode[] = [];
  // ![alt](url) · [label](url) · bare http(s) URLs · **bold**
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  const img = (url: string, alt: string) => (
    <a key={k++} href={viaDoor(url)} target="_blank" rel="noreferrer" title={alt || "open full size"} style={{ display: "block", margin: "6px 0" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={viaDoor(url)} alt={alt || "image"} loading="lazy"
        style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 6, border: "1px solid #E2E0DA", display: "block" }} />
    </a>
  );
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(img(m[2], m[1]));
    else if (m[4]) {
      // a "[🖼 image](…)" from the ERP import EMBEDS, and so does an uploaded
      // opp-attach image (Dr Raghu, 30 Aug 2026: "if it's a jpg, show it
      // there, small, with a scroll"); other links stay links
      if ((/🖼/.test(m[3]) || m[4].includes("opp-attach")) && looksImage(m[4])) parts.push(img(m[4], m[3]));
      else parts.push(<a key={k++} href={viaDoor(m[4])} target="_blank" rel="noreferrer" style={{ color: "#2C5B82", fontWeight: 600, textDecoration: "underline" }}>{m[3]}</a>);
    }
    else if (m[5]) parts.push(<a key={k++} href={viaDoor(m[5])} target="_blank" rel="noreferrer" style={{ color: "#2C5B82", textDecoration: "underline" }}>{m[5].length > 60 ? m[5].slice(0, 57) + "…" : m[5]}</a>);
    else if (m[6]) parts.push(<b key={k++}>{m[6]}</b>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Qualification, read-only: the BANTTC row with its weighted score, and the
 *  loss record where the stage is a dead end. */
function QualView({ dt, row, links }: { dt: Doctype; row: Row; links: Links }) {
  const score = (() => {
    let sum = 0, den = 0;
    for (const b of BANTTC) {
      const v = row[b.name];
      if (v === null || v === undefined || v === "") continue;
      sum += Number(v) * b.w; den += b.w;
    }
    return den > 0 ? Math.round(sum / den) : null;
  })();
  const lostFields = dt.fields.filter((f) => f.tab === "qual" && !BANTTC.some((b) => b.name === f.name));
  return (
    <div>
      {dt.name === "opportunity" && (
        <div className="mb-4" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr>
              {BANTTC.map((b) => (
                <th key={b.name} style={{ textAlign: "center", padding: "4px 12px", fontSize: 11, color: MUTED, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                  {b.label}{b.w > 1 && <span style={{ color: ORANGE }}> ×{b.w}</span>}
                </th>
              ))}
              <th style={{ textAlign: "center", padding: "4px 12px", fontSize: 11, color: NAVY, borderBottom: `2px solid ${BORDER}`, fontWeight: 800 }}>SCORE</th>
            </tr></thead>
            <tbody><tr>
              {BANTTC.map((b) => (
                <td key={b.name} className="tnum" style={{ textAlign: "center", padding: "8px 12px", fontSize: 15, fontWeight: 700 }}>
                  {row[b.name] === null || row[b.name] === undefined ? "—" : `${row[b.name]}%`}
                </td>
              ))}
              <td className="tnum" style={{ textAlign: "center", padding: "8px 12px", fontWeight: 800, fontSize: 17,
                color: score === null ? MUTED : score >= 60 ? "#1A7F4E" : score >= 35 ? "#B45309" : "#C0392B" }}>
                {score === null ? "—" : `${score}%`}
              </td>
            </tr></tbody>
          </table>
        </div>
      )}
      <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {lostFields.map((f) => (
          <div key={f.name}>
            <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{f.label}</div>
            <div className="text-sm" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
              <Cell field={f} value={row[f.name]} links={links} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every communication on the record — calls, WhatsApp, email, visits, video
 *  calls — one feed, newest first, with a ＋ to log the next one. */
/**
 * ✨ EVA BRIEF (Dr Raghu, 26 Aug 2026) — the company dossier: internet,
 * LinkedIn, industry brief, dated news, our correspondence and warmth, and
 * the similar-industry work that gives us credibility. Generated server-side
 * by EVA with web search; editable by hand afterwards.
 */
function EvaBriefTab({ companyId, initial, initialAt }: { companyId: string; initial: string | null; initialAt: string | null }) {
  const [brief, setBrief] = useState(initial ?? "");
  const [at, setAt] = useState(initialAt);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");

  const generate = async () => {
    setBusy(true); setMsg("EVA is researching — the web takes a minute or two…");
    try {
      const r = await fetch("/api/crm/eva-brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "EVA could not research this one");
      setBrief(j.brief); setAt(j.at);
      setMsg(j.allotment ? `${j.allotment.used} of your ${j.allotment.limit} briefs this week used — resets Monday` : "");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    setMsg("");
    try {
      const r = await fetch(`/api/crm/company?id=${encodeURIComponent(companyId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ eva_brief: brief }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not save");
      setEditing(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button onClick={() => void generate()} disabled={busy}
          className="px-3 py-1.5 rounded text-sm font-bold"
          style={{ background: busy ? "#B9BEC4" : ORANGE, color: "#fff" }}>
          {busy ? "✨ Researching…" : brief ? "✨ Refresh the brief" : "✨ Generate the brief"}
        </button>
        {brief && !busy && (
          editing
            ? <button onClick={() => void saveEdit()} className="px-3 py-1.5 rounded text-sm font-bold" style={{ background: NAVY, color: "#fff" }}>Save</button>
            : <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded text-sm font-bold border" style={{ borderColor: BORDER, color: "#5A6672", background: "#fff" }}>✎ Edit</button>
        )}
        {at && <span className="text-xs" style={{ color: MUTED }}>researched {new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        {msg && <span className="text-xs font-semibold" style={{ color: busy ? MUTED : "#8E2C20" }}>{msg}</span>}
      </div>
      {editing ? (
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={18}
          className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: BORDER, lineHeight: 1.6 }} />
      ) : brief ? (
        <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.65, maxHeight: "calc(100vh - 250px)", overflowY: "auto", overflowWrap: "anywhere" }}>
          {brief}
        </div>
      ) : !busy ? (
        <div className="rounded p-6 text-sm" style={{ background: "#FBFAF7", border: `1px dashed ${BORDER}`, color: MUTED }}>
          Nothing yet. ✨ Generate asks EVA to research this company — the internet, their LinkedIn,
          the industry, dated news — and weave in our own correspondence, warmth and the
          similar-industry work that gives us credibility.
        </div>
      ) : null}
    </div>
  );
}

function CommsFeed({
  type, id, companyId, onOpenLink, contactEmail,
}: {
  type: string; id: string; companyId: string | null;
  onOpenLink: (target: string, id: string) => void;
  contactEmail?: string | null;
}) {
  type FeedRow = {
    kind: string; at: string; type: string; by: string | null; with: string | null;
    result: string | null; text: string | null; next_action: string | null; next_action_on: string | null;
    channel?: string | null; direction?: string | null; subject?: string | null;
    from_handle?: string | null; to_handles?: string[] | null;
    thread_key?: string | null; rfc_message_id?: string | null;
  };
  const [feed, setFeed] = useState<FeedRow[] | null>(null);
  const [err, setErr] = useState("");
  const [logging, setLogging] = useState(false);
  const [replyCtx, setReplyCtx] = useState<ComposeCtx | null>(null);
  const [tick, setTick] = useState(0);
  const [logLinks, setLogLinks] = useState<Links | null>(null);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [composing, setComposing] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailSub, setMailSub] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailMsg, setMailMsg] = useState("");
  void onOpenLink;

  useEffect(() => {
    fetch("/api/crm/gmail/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setGmail({ connected: !!j.connected, email: j.email ?? null }))
      .catch(() => setGmail({ connected: false, email: null }));
  }, []);
  useEffect(() => { if (contactEmail) setMailTo(contactEmail); }, [contactEmail]);

  const refs = () => ({
    ...(type === "person" ? { person_id: id } : {}),
    ...(type === "company" ? { company_id: id } : companyId ? { company_id: companyId } : {}),
    ...(type === "opportunity" ? { opportunity_id: id } : {}),
    ...(type === "quotation" ? { quotation_id: id } : {}),
  });

  const sendMail = async () => {
    setMailBusy(true); setMailMsg("");
    try {
      const r = await fetch("/api/crm/gmail/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: mailTo, subject: mailSub, body: mailBody, ...refs() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send");
      setMailMsg("Sent."); setComposing(false); setMailSub(""); setMailBody("");
      setTick((t) => t + 1);
    } catch (e) { setMailMsg(e instanceof Error ? e.message : String(e)); }
    finally { setMailBusy(false); }
  };

  const pullMail = async () => {
    if (!contactEmail && type !== "opportunity") return;
    setMailBusy(true); setMailMsg("");
    try {
      const r = await fetch("/api/crm/gmail/pull", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: contactEmail ?? "", ...refs() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not pull");
      setMailMsg(`Pulled ${j.found} mail${j.found === 1 ? "" : "s"}${contactEmail ? ` with ${contactEmail}` : " with the contacts"}.`);
      setTick((t) => t + 1);
    } catch (e) { setMailMsg(e instanceof Error ? e.message : String(e)); }
    finally { setMailBusy(false); }
  };

  // The log form's dropdowns (salespeople, stages…) fetched once, on first open.
  useEffect(() => {
    if (!logging || logLinks) return;
    fetch("/api/crm/interaction?f_by_id=00000000-0000-0000-0000-000000000000", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setLogLinks(j.links || {}))
      .catch(() => setLogLinks({}));
  }, [logging, logLinks]);

  useEffect(() => {
    setFeed(null); setErr("");
    fetch(`/api/crm/comms?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load");
        setFeed(j.feed);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [type, id, tick]);

  const icon = (t: string) => {
    const x = t.toLowerCase();
    if (x.includes("visit")) return "🚶";
    if (x.includes("video")) return "🎥";
    if (x.includes("whatsapp") || x.includes("sms")) return "💬";
    if (x.includes("mail")) return "✉️";
    if (x.includes("internal")) return "🏠";
    return "📞";
  };
  const resultColor = (r: string | null) =>
    r === "Warmer" || r === "Closed Won" ? "#1A7F4E" : r === "Colder" || r === "Closed Lost" ? "#C0392B" : MUTED;

  const interactionDt = doctypeBySlug("interaction");
  const fkField = type === "company" ? "company_id" : type === "person" ? "person_id"
    : type === "opportunity" ? "opportunity_id" : type === "quotation" ? "quotation_id" : "sales_order_id";

  return (
    <div className="p-4" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setLogging((v) => !v)}
          className="px-3 py-1 rounded text-xs font-bold"
          style={{ background: logging ? MUTED : ORANGE, color: "#fff" }}
        >
          {logging ? "Cancel" : "＋ Log a call / visit"}
        </button>
        {gmail?.connected ? (
          <>
            <button
              onClick={() => setComposing((v) => !v)}
              className="px-3 py-1 rounded text-xs font-bold"
              style={{ background: composing ? MUTED : NAVY, color: "#fff" }}
            >
              {composing ? "Cancel" : "✉ Send email"}
            </button>
            {(contactEmail || type === "opportunity") && (
              <button
                onClick={() => void pullMail()}
                disabled={mailBusy}
                className="px-3 py-1 rounded text-xs font-bold border"
                style={{ borderColor: BORDER, background: "#fff", color: NAVY }}
                title={type === "opportunity"
                  ? "Search your mailbox for mail with ALL this opportunity's contacts, from 7 days before the enquiry onward, and land it here"
                  : `Fetch your recent Gmail with ${contactEmail} onto this record`}
              >
                {mailBusy ? "Working…" : type === "opportunity" ? "⟳ Pull Gmail with the contacts" : `⟳ Pull Gmail with ${contactEmail}`}
              </button>
            )}
            <span className="text-xs" style={{ color: MUTED }}>as {gmail.email}</span>
          </>
        ) : gmail && (
          <span className="text-xs" style={{ color: MUTED }}>
            ✉ Mail from here once Gmail is connected — Profile → Gmail connection.
          </span>
        )}
      </div>
      {mailMsg && (
        <div className="rounded p-2 mb-2 text-xs font-semibold"
          style={mailMsg === "Sent." || mailMsg.startsWith("Pulled")
            ? { background: "#E6F4EB", color: "#1A7F4E" } : { background: "#FBEAE8", color: "#8E2C20" }}>
          {mailMsg}
        </div>
      )}
      {composing && (
        <div className="rounded border p-3 mb-3" style={{ borderColor: NAVY, background: "#fff" }}>
          <input value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="to@company.com"
            className="w-full rounded border px-2 py-1.5 text-sm mb-2" style={{ borderColor: BORDER }} />
          <input value={mailSub} onChange={(e) => setMailSub(e.target.value)} placeholder="Subject — {{variables}} work here"
            className="w-full rounded border px-2 py-1.5 text-sm mb-2" style={{ borderColor: BORDER }} />
          <textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={6}
            placeholder={"Dear {{name}},\n\n…\n\n{{qtn_no}}, {{next_monday}}, {{khalapur_address}} — all the variables render on send."}
            className="w-full rounded border px-2 py-1.5 text-sm mb-2" style={{ borderColor: BORDER }} />
          <div className="flex justify-end">
            <button onClick={() => void sendMail()} disabled={mailBusy}
              className="px-4 py-1.5 rounded text-sm font-bold"
              style={{ background: mailBusy ? "#B9BEC4" : NAVY, color: "#fff" }}>
              {mailBusy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {logging && interactionDt && (
        <RecordForm
          dt={interactionDt} links={logLinks ?? {}}
          presets={{ [fkField]: id, ...(companyId && fkField !== "company_id" ? { company_id: companyId } : {}) }}
          onDone={() => { setLogging(false); setTick((t) => t + 1); }}
        />
      )}
      {err && <div className="text-sm" style={{ color: "#8E2C20" }}>{err}</div>}
      {feed === null && !err && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {feed !== null && feed.length === 0 && (
        <div className="text-sm" style={{ color: MUTED }}>Nothing said yet — the first call starts the trail.</div>
      )}
      {replyCtx && (
        <MailComposer ctx={replyCtx} onClose={() => setReplyCtx(null)}
          onSent={() => { setReplyCtx(null); setTick((t) => t + 1); }} />
      )}
      {(feed ?? []).map((f, i) => (
        <div key={i} className="rounded border p-2.5 mb-2" style={{ borderColor: BORDER, borderLeft: `3px solid ${resultColor(f.result) === MUTED ? BORDER : resultColor(f.result)}` }}>
          <div className="flex items-baseline gap-2 flex-wrap text-xs" style={{ color: MUTED }}>
            <span style={{ fontSize: 14 }}>{icon(f.type)}</span>
            {f.channel === "email" && f.subject
              ? <b style={{ color: INK }}>{f.direction === "inbound" ? "⬇" : "⬆"} {f.subject}</b>
              : <b style={{ color: INK }}>{f.type}</b>}
            {f.result && <b style={{ color: resultColor(f.result) }}>{f.result}</b>}
            <span className="tnum">{fmtDate(String(f.at))}</span>
            {f.by && <span>{f.channel === "email" ? "from" : "by"} {f.by}</span>}
            {f.with && <span>with {f.with}</span>}
            {f.channel === "email" && (
              <button
                onClick={() => {
                  // reply to whoever ISN'T us: the sender of an inbound, the
                  // recipient of our own outbound
                  const pick = (h: string | null | undefined) => (h?.match(/[^\s<>,;"']+@[^\s<>,;"']+/) ?? [null])[0];
                  const to = f.direction === "inbound" ? pick(f.from_handle) : pick(f.to_handles?.[0]);
                  setReplyCtx({
                    to, refs: refs() as ComposeCtx["refs"], chain: [],
                    reply: {
                      subject: f.subject ?? null, threadKey: f.thread_key ?? null,
                      rfcMessageId: f.rfc_message_id ?? null,
                      quoted: f.text ?? null, quotedFrom: f.from_handle ?? null,
                      quotedAt: fmtDate(String(f.at)),
                    },
                  });
                }}
                className="rounded px-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY }}>
                ↩ Reply
              </button>
            )}
          </div>
          {f.text && (
            <div className="text-sm mt-1" style={{ lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: f.channel === "email" ? "pre-wrap" : undefined, maxHeight: 220, overflowY: "auto" }}>
              {f.text}
            </div>
          )}
          {f.next_action && (
            <div className="text-xs mt-1" style={{ color: "#B45309" }}>
              → {f.next_action}{f.next_action_on ? ` · ${fmtDate(String(f.next_action_on))}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Notes on the record — the polymorphic note + record_link the schema always had. */
function NotesTab({ type, id }: { type: string; id: string }) {
  type NoteRow = { id: string; title: string | null; body: string; author: string | null; created_at: string };
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [text, setText] = useState("");
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const saveRich = async (md: string) => {
    if (!md.trim()) { setComposing(false); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/notes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_type: type, target_id: id, body: md.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the note");
      setComposing(false); setTick((t) => t + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    fetch(`/api/crm/notes?target_type=${encodeURIComponent(type)}&target_id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setNotes(j.notes ?? []))
      .catch(() => setNotes([]));
  }, [type, id, tick]);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/notes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_type: type, target_id: id, body: text.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the note");
      setText(""); setTick((t) => t + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
      <div className="mb-3">
        {composing ? (
          <RichTextEditor initial="" minHeight={120} busy={busy} onCancel={() => setComposing(false)}
            onSave={(html) => { setText(html); void saveRich(html); }} />
        ) : (
          <button onClick={() => setComposing(true)} className="w-full rounded border px-3 py-2 text-sm text-left"
            style={{ borderColor: BORDER, color: MUTED, background: "#fff" }}>
            ✎ Write a note — bold, bullets and links; it stays on this record, signed and dated.
          </button>
        )}
        {err && <div className="text-xs mt-1" style={{ color: "#8E2C20" }}>{err}</div>}
      </div>
      {notes === null && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {notes !== null && notes.length === 0 && (
        <div className="text-sm" style={{ color: MUTED }}>No notes yet.</div>
      )}
      {(notes ?? []).map((n) => (
        <div key={n.id} className="rounded border p-2.5 mb-2" style={{ borderColor: BORDER }}>
          <div className="text-xs" style={{ color: MUTED }}>
            {n.author ?? "—"} · <span className="tnum">{fmtDate(n.created_at)}</span>
          </div>
          {n.title && <div className="text-sm font-bold mt-0.5">{n.title}</div>}
          {/* comments read as rich text (Dr Raghu, 30 Aug 2026) */}
          <div className="text-sm mt-0.5" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}><RichText text={n.body} /></div>
        </div>
      ))}
    </div>
  );
}

/** The Genie tab: Claude's read on the record, on demand — same voice as the
 *  Job Plan's brief, never asked to invent a number. */
function GenieTab({ type, id }: { type: string; id: string }) {
  const [read, setRead] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ask = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/genie", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Genie could not read this record");
      if (j.missing) throw new Error(j.missing);
      setRead(j.read);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4">
      {read === null && (
        <div className="rounded p-4" style={{ background: NAVY_SOFT }}>
          <div className="text-sm mb-2" style={{ color: INK, lineHeight: 1.6 }}>
            ✨ Genie reads the record — where it stands, what the trail says, and what would
            actually move it. From the facts on file, nothing invented.
          </div>
          <button onClick={ask} disabled={busy}
            className="px-3 py-1.5 rounded text-sm font-bold"
            style={{ background: busy ? "#B9BEC4" : NAVY, color: "#fff" }}>
            {busy ? "Reading…" : "Ask Genie"}
          </button>
          {err && <div className="text-xs mt-2 font-semibold" style={{ color: "#8E2C20" }}>{err}</div>}
        </div>
      )}
      {read !== null && (
        <div className="rounded border p-4" style={{ borderColor: BORDER, borderLeft: `3px solid ${ORANGE}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: ORANGE, letterSpacing: 1 }}>✨ GENIE — THE READ ON THIS RECORD</div>
          <div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{read}</div>
          <button onClick={ask} disabled={busy} className="text-xs font-bold mt-3" style={{ color: NAVY }}>
            {busy ? "Reading…" : "↻ Read again"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Merge: Genie suggests the likely twins — identical names first, then same
 * email or phone, then names that start the same — and one click absorbs the
 * duplicate: every reference on it moves to this record, everywhere.
 */
/** The linked opportunity's enquiry, worn by the quotation (Dr Raghu,
 *  29 Aug 2026) — read live from the opportunity, attachments included. */
/**
 * A REAL rich-text editor (Dr Raghu, 30 Aug 2026: "it's not rich text") —
 * bold, bullets and links pressed on a toolbar, seen as they will look,
 * stored as the same markdown the RichText renderer reads everywhere else.
 */
function mdToEditorHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]*)\]\(([^()\s]+)\)/g, '<a href="$2">$1</a>');
  let html = "", inUl = false;
  for (const line of md.split("\n")) {
    if (/^\s*-\s+/.test(line)) {
      if (!inUl) { html += "<ul>"; inUl = true; }
      html += "<li>" + inline(line.replace(/^\s*-\s+/, "")) + "</li>";
    } else {
      if (inUl) { html += "</ul>"; inUl = false; }
      html += inline(line) + "<br>";
    }
  }
  if (inUl) html += "</ul>";
  return html;
}
function editorHtmlToMd(h: string): string {
  return h
    .replace(/<div><br\s*\/?><\/div>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<(div|p)[^>]*>/gi, "")
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "")
    .replace(/<\/?[uo]l[^>]*>/gi, "\n")
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, " [🖼 image]($1) ")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, u, t) => `[${String(t).replace(/<[^>]+>/g, "").trim() || "link"}](${u})`)
    .replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function RichEditor({ initial, onSave, onCancel, busy }: { initial: string; onSave: (md: string) => void; onCancel: () => void; busy: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); };
  const TB = ({ label, title, onClick, strong }: { label: string; title: string; onClick: () => void; strong?: boolean }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: BORDER, background: "#fff", fontWeight: strong ? 800 : 500 }}>{label}</button>
  );
  return (
    <div>
      <div className="flex gap-1 mb-1">
        <TB label="B" title="Bold" strong onClick={() => cmd("bold")} />
        <TB label="• List" title="Bullet list" onClick={() => cmd("insertUnorderedList")} />
        <TB label="🔗 Link" title="Turn the selection into a link" onClick={() => { const u = window.prompt("Link to:", "https://"); if (u) cmd("createLink", u); }} />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        className="w-full rounded border p-3 text-sm"
        style={{ borderColor: ORANGE, lineHeight: 1.6, minHeight: 260, maxHeight: "calc(100vh - 360px)", overflowY: "auto", outline: "none", background: "#fff" }}
        dangerouslySetInnerHTML={{ __html: mdToEditorHtml(initial) }} />
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => onSave(editorHtmlToMd(ref.current?.innerHTML || ""))} disabled={busy}
          className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "#0D7A3F" }}>
          {busy ? "Saving…" : "✓ Save"}
        </button>
        <button onClick={onCancel} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "#EFEDE7", color: "#5A6672" }}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * THE ENQUIRY DESK (Dr Raghu, 30 Aug 2026): the enquiry text on the left —
 * rich text, pencil-edited in place, attachments woven in as links — and
 * ASK GENIE on the right: a quick Opus read of the customer, the contact and
 * the enquiry, from the CRM's own record alone.
 */
function EnquiryInfoTab({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const rid = String(row.id);
  const [text, setText] = useState(String(row.enquiry_info ?? ""));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [brief, setBrief] = useState("");
  useEffect(() => { setText(String(row.enquiry_info ?? "")); setEditing(false); setBrief(""); setMsg(""); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: string) => {
    setBusy("save"); setMsg("");
    try {
      const r = await fetch(`/api/crm/opportunity?id=${encodeURIComponent(rid)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ enquiry_info: next }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not save");
      setText(next); setEditing(false); onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const attach = async (file: File) => {
    setBusy("attach"); setMsg("");
    try {
      const fd = new FormData();
      fd.set("opportunity_id", rid); fd.set("file", file);
      const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      const isImg = /\.(png|jpe?g|gif|webp)$/i.test(String(j.name));
      // the marker rides INSIDE the label — that is what tells RichText to embed
      await save((text ? text + "\n\n" : "") + `[${isImg ? "🖼 " : "📎 "}${j.name}](${j.url})`);
      setMsg("Attached ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const askGenie = async () => {
    setBusy("genie"); setBrief("");
    try {
      const r = await fetch("/api/crm/opp-brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: rid }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Genie could not answer");
      setBrief(String(j.brief || ""));
    } catch (e) { setBrief(""); setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const [draft, setDraft] = useState("");
  return (
    <div className="p-4 flex gap-3 flex-wrap" style={{ alignItems: "flex-start" }}>
      {/* LEFT — the enquiry, half the room */}
      <div style={{ flex: "1 1 420px", minWidth: 320 }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>ENQUIRY INFO</span>
          {!editing && (
            <button onClick={() => { setDraft(text); setEditing(true); }} title="Edit the enquiry text right here"
              className="text-xs rounded border px-1.5 py-0.5 font-bold" style={{ borderColor: BORDER, color: "#5A6672", background: "#fff" }}>✎</button>
          )}
          <label className="text-xs rounded border px-2 py-0.5 font-bold cursor-pointer" style={{ borderColor: BORDER, color: NAVY, background: "#fff" }}>
            {busy === "attach" ? "Attaching…" : "📎 Add Attachment"}
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} />
          </label>
          {!row.erp_opportunity_name && !/^ENQ-/.test(String(row.opportunity_no || "")) ? (
            <button onClick={async () => {
              if (!window.confirm("Create this enquiry in ERPNext? The customer and contact are created there too if the ERP lacks them.")) return;
              setBusy("erp"); setMsg("");
              try {
                const r = await fetch("/api/crm/erp-create-enquiry", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ opportunity_id: rid }),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "The ERP refused");
                setMsg(`✓ In the ERP as ${j.erp_name}${j.made_customer ? " · customer created" : ""}${j.made_contact ? " · contact created" : ""}`);
                onSaved();
              } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
              setBusy("");
            }} disabled={busy === "erp"}
              className="text-xs rounded border px-2 py-0.5 font-bold" style={{ borderColor: "#0D7A3F", color: "#0D7A3F", background: "#fff" }}>
              {busy === "erp" ? "Walking it over…" : "⬆ Push to ERP"}
            </button>
          ) : (
            <span className="text-xs rounded px-2 py-0.5" style={{ background: "#E6F4EA", color: "#0D7A3F", fontWeight: 700 }}
              title={String(row.erp_opportunity_name || row.opportunity_no)}>✓ in ERP</span>
          )}
          {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{msg}</span>}
        </div>
        {editing ? (
          <RichTextEditor initial={draft} busy={busy === "save"} onCancel={() => setEditing(false)} onSave={(html) => void save(html)} placeholder="The enquiry, as it should look." />
        ) : (
          <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "calc(100vh - 300px)", overflowY: "auto", overflowWrap: "anywhere" }}>
            {text.trim() ? <RichText text={text} /> : <span style={{ color: MUTED }}>No enquiry text recorded — ✎ writes it right here.</span>}
          </div>
        )}
      </div>

      {/* RIGHT — Ask Genie */}
      <div style={{ flex: "1 1 380px", minWidth: 300 }}>
        <div className="rounded-lg border p-3" style={{ borderColor: "#D9CFF2", background: "#FBFAFE", borderTop: "3px solid #7C3AED" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold" style={{ color: "#7C3AED", letterSpacing: 0.8 }}>✨ ASK GENIE</span>
            <button onClick={() => void askGenie()} disabled={busy === "genie"}
              className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: busy === "genie" ? "#B9BEC4" : "#7C3AED" }}>
              {busy === "genie" ? "Reading the record…" : brief ? "Ask again" : "Ask Genie"}
            </button>
          </div>
          <div className="text-xs mb-2" style={{ color: "#5A6672", lineHeight: 1.5 }}>
            Checks the customer, the contact and the enquiry — have we done this before, what is the relation
            with the customer, what is the scope in the industry. A quick read of the CRM record, no web.
          </div>
          {brief
            ? <div className="rounded bg-white border p-3 text-sm" style={{ borderColor: "#E2E0DA", lineHeight: 1.6, maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}><RichText text={brief} /></div>
            : busy === "genie"
              ? <div className="text-xs py-4 text-center" style={{ color: MUTED }}>Opus is reading the customer, the history and the enquiry…</div>
              : null}
        </div>
      </div>
    </div>
  );
}

function OppEnquiryTab({ oppId }: { oppId: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!oppId) { setText(""); return; }
    fetch(`/api/crm/opportunity?id=${encodeURIComponent(oppId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setText(String(j?.row?.enquiry_info ?? "")))
      .catch(() => setText(""));
  }, [oppId]);
  return (
    <div className="p-4">
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>FROM THE OPPORTUNITY — always its current text, never a copy</div>
      <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "calc(100vh - 280px)", overflowY: "auto", overflowWrap: "anywhere" }}>
        {text === null ? <span style={{ color: MUTED }}>reading…</span>
          : text.trim() ? <RichText text={text} />
          : <span style={{ color: MUTED }}>The opportunity holds no enquiry text.</span>}
      </div>
    </div>
  );
}

/**
 * THE DATE VIEWS (Dr Raghu, 28 Aug 2026): every list with a date opens on
 * YTD, remembers the salesperson's last view, and offers the saved views —
 * Last 7/15/30 Days, This/Last/Last-Two Weeks, Months, Quarters, This YTD,
 * Last FY, Greater Than, Less Than, Custom. Quarters and the year run the
 * Indian way, April first.
 */
interface DateView { field: string; preset: string; from: string; to: string }

/** Where tags live (28 Aug 2026: "this will have the tags" — a quotation). */
const TAGGABLE = ["company", "person", "opportunity", "quotation", "sales_order", "lead"];

const DATE_PRESETS: [string, string][] = [
  ["all", "All time"],
  ["last7", "Last 7 Days"], ["last15", "Last 15 Days"], ["last30", "Last 30 Days"],
  ["thisWeek", "This Week"], ["lastWeek", "Last Week"], ["lastTwoWeeks", "Last Two Weeks"],
  ["thisMonth", "This Month"], ["lastMonth", "Last Month"], ["lastTwoMonths", "Last Two Months"],
  ["thisQuarter", "This Quarter"], ["lastQuarter", "Last Quarter"], ["lastTwoQuarters", "Last Two Quarters"],
  ["ytd", "This YTD"], ["lastFy", "Last FY"],
  ["gt", "Greater Than"], ["lt", "Less Than"], ["custom", "Custom"],
];

function dateRangeOf(v: DateView): { from: string; to: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const D = (iso: string, n: number) => {
    const t = new Date(iso + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const monday = (iso: string) => {
    const t = new Date(iso + "T00:00:00Z");
    return D(iso, -((t.getUTCDay() + 6) % 7));
  };
  const monthStart = (iso: string, back: number) => {
    let y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - back;
    while (m <= 0) { m += 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}-01`;
  };
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const fyStart = m >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
  const qBack = (back: number) => {
    // FY quarters: Apr Jul Oct Jan
    const qi = Math.floor(((m + 8) % 12) / 3) - back;
    let qy2 = m >= 4 ? y : y - 1, q2 = qi;
    while (q2 < 0) { q2 += 4; qy2 -= 1; }
    const qm = 4 + q2 * 3;
    return `${qm <= 12 ? qy2 : qy2 + 1}-${String(qm <= 12 ? qm : qm - 12).padStart(2, "0")}-01`;
  };
  switch (v.preset) {
    case "last7": return { from: D(today, -6), to: today };
    case "last15": return { from: D(today, -14), to: today };
    case "last30": return { from: D(today, -29), to: today };
    case "thisWeek": return { from: monday(today), to: today };
    case "lastWeek": return { from: D(monday(today), -7), to: D(monday(today), -1) };
    case "lastTwoWeeks": return { from: D(monday(today), -14), to: D(monday(today), -1) };
    case "thisMonth": return { from: monthStart(today, 0), to: today };
    case "lastMonth": return { from: monthStart(today, 1), to: D(monthStart(today, 0), -1) };
    case "lastTwoMonths": return { from: monthStart(today, 2), to: D(monthStart(today, 0), -1) };
    case "thisQuarter": return { from: qBack(0), to: today };
    case "lastQuarter": return { from: qBack(1), to: D(qBack(0), -1) };
    case "lastTwoQuarters": return { from: qBack(2), to: D(qBack(0), -1) };
    case "ytd": return { from: fyStart, to: today };
    case "lastFy": return { from: D(fyStart, -365).slice(0, 4) + "-04-01", to: D(fyStart, -1) };
    case "gt": return { from: v.from, to: "" };
    case "lt": return { from: "", to: v.to };
    case "custom": return { from: v.from, to: v.to };
    default: return { from: "", to: "" };
  }
}

function DateViewBar({ dt, value, onChange }: { dt: Doctype; value: DateView; onChange: (v: DateView) => void }) {
  const dateFields = dt.fields.filter((f) => f.type === "date" && !f.virtual).map((f) => ({ name: f.name, label: f.label }));
  const fields = [...dateFields, { name: "created_at", label: "Created" }];
  const needsFrom = ["gt", "custom"].includes(value.preset);
  const needsTo = ["lt", "custom"].includes(value.preset);
  const active = value.preset !== "all";
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <select value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })}
        className="px-1.5 py-1.5 rounded text-sm border bg-white" style={{ borderColor: BORDER, color: "#5A6672" }}>
        {fields.map((f) => (<option key={f.name} value={f.name}>{f.label}</option>))}
      </select>
      <select value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value })}
        className="px-1.5 py-1.5 rounded text-sm border bg-white font-semibold" style={{ borderColor: active ? ORANGE : BORDER }}>
        {DATE_PRESETS.map(([k, lbl]) => (<option key={k} value={k}>{lbl}</option>))}
      </select>
      {needsFrom && <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="px-1.5 py-1 rounded text-sm border tnum" style={{ borderColor: BORDER }} />}
      {needsTo && <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="px-1.5 py-1 rounded text-sm border tnum" style={{ borderColor: BORDER }} />}
    </span>
  );
}

/**
 * TAGS (Dr Raghu, 28 Aug 2026): the section below every company, contact and
 * opportunity. Type-along, one or more; each salesperson sees only their own
 * — typing a name that already exists opens that tag's records; Raghu and
 * the Sales Head see everyone's, owner named on the chip.
 */
function TagStrip({ entity, id }: { entity: string; id: string }) {
  const [tags, setTags] = useState<{ link_id: string; name: string; owner: string | null }[]>([]);
  const [installed, setInstalled] = useState(true);
  const [text, setText] = useState("");
  const [sugs, setSugs] = useState<string[]>([]);
  const load = useCallback(() => {
    fetch(`/api/crm/tags?entity=${entity}&id=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setTags(j.tags || []); setInstalled(j.installed !== false); })
      .catch(() => {});
  }, [entity, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/crm/tags?pick=${encodeURIComponent(text)}`, { cache: "no-store" })
        .then((r) => r.json()).then((j) => setSugs(j.names || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  const add = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    setText("");
    await fetch("/api/crm/tags", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", entity, id, name: n }),
    });
    load();
  };
  if (!installed) return (
    <div className="px-4 py-2 text-xs font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
      Run CRM migration 0025 — the tags have nowhere to live yet.
    </div>
  );
  return (
    <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap border-t" style={{ borderColor: BORDER, background: "#FAF9F5", justifyContent: "flex-end" }}>
      <span className="text-xs font-bold mr-auto" style={{ color: MUTED, letterSpacing: 0.6 }}>TAGS</span>
      {tags.map((t) => (
        <span key={t.link_id} className="rounded-full border px-2 py-0.5 text-xs font-semibold flex items-center gap-1"
          style={{ borderColor: "#C9D6E4", background: "#EEF1FA", color: "#1B2D6B" }}>
          {t.name}{t.owner ? <i style={{ color: MUTED, fontStyle: "normal", fontWeight: 400 }} title={t.owner}> · {t.owner.split(/\s+/).map((w) => w[0]).join("").toUpperCase()}</i> : null}
          <button onClick={async () => {
            await fetch("/api/crm/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove", entity, id, link_id: t.link_id }) });
            load();
          }} style={{ color: MUTED }} title="Take this tag off">✕</button>
        </span>
      ))}
      <input
        value={text} list={`tags-${entity}-${id}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void add(text); }}
        onBlur={() => { if (text.trim() && sugs.some((s2) => s2.toLowerCase() === text.trim().toLowerCase())) void add(text); }}
        placeholder="＋ tag… (Enter adds; new names are yours alone)"
        className="border rounded-full px-2 py-0.5 text-xs" style={{ borderColor: BORDER, width: 220, background: "#fff" }}
      />
      <datalist id={`tags-${entity}-${id}`}>{sugs.map((s2) => (<option key={s2} value={s2} />))}</datalist>
    </div>
  );
}

/** The list's tag filter: an EXACT existing name opens that tag's records. */
function TagFilterBox({ value, onSet }: { value: string; onSet: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [sugs, setSugs] = useState<string[]>([]);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/crm/tags?pick=${encodeURIComponent(text)}`, { cache: "no-store" })
        .then((r) => r.json()).then((j) => setSugs(j.names || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <span className="flex items-center gap-1">
      <input
        value={text} list="tagfilter-names"
        onChange={(e) => { setText(e.target.value); if (e.target.value === "") onSet(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") onSet(text.trim()); }}
        placeholder="🏷 tag filter — exact name, Enter"
        className="px-2 py-1.5 rounded text-sm border"
        style={{ borderColor: value ? ORANGE : BORDER, minWidth: 180 }}
      />
      <datalist id="tagfilter-names">{sugs.map((s2) => (<option key={s2} value={s2} />))}</datalist>
      {value && <button onClick={() => onSet("")} className="text-xs font-bold" style={{ color: ORANGE }}>✕</button>}
    </span>
  );
}

function MergeTab({
  type, id, title, onMerged,
}: {
  type: string; id: string; title: string; onMerged: () => void;
}) {
  type Sug = { id: string; label: string; detail: string; why: string };
  const [sugs, setSugs] = useState<Sug[] | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // find-it-yourself (Dr Raghu, 28 Aug 2026): search ANY record and merge it
  // in — the suggestions are a head start, not a fence.
  const [pickId, setPickId] = useState("");
  const [pickLabel, setPickLabel] = useState("");

  useEffect(() => {
    setSugs(null); setErr("");
    fetch(`/api/crm/merge?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not look for twins");
        setSugs(j.suggestions);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [type, id]);

  const doMerge = async (s: Sug) => {
    if (!window.confirm(`Merge "${s.label}" into "${title}"?

Everything on it — ${type === "company" ? "contacts, opportunities, quotations, orders, interactions" : "interactions, quotes, leads, phones"} — moves here. This is kept in the audit and the duplicate is retired.`))
      return;
    setBusyId(s.id); setErr("");
    try {
      const r = await fetch("/api/crm/merge", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, keep_id: id, drop_id: s.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The merge did not go through");
      setDone(`Merged. ${j.moved} linked record${j.moved === 1 ? "" : "s"} moved across.`);
      setSugs((cur) => (cur ?? []).filter((x) => x.id !== s.id));
      onMerged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="p-4" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "70ch", lineHeight: 1.6 }}>
        Genie&apos;s suggested twins of <b style={{ color: INK }}>{title}</b>. Merging keeps THIS record
        and moves everything from the duplicate onto it — the duplicate retires into the audit.
      </p>
      {done && <div className="rounded p-2 mb-2 text-sm font-semibold" style={{ background: "#E6F4EB", color: "#1A7F4E" }}>{done}</div>}
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {sugs === null && !err && <div className="text-sm" style={{ color: MUTED }}>looking for twins…</div>}
      {sugs !== null && sugs.length === 0 && (
        <div className="text-sm" style={{ color: MUTED }}>No likely duplicates found below. Clean as it stands — or find one yourself:</div>
      )}
      <div className="rounded border p-2.5 mb-3" style={{ borderColor: BORDER, background: "#FAF9F5" }}>
        <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>OR FIND THE DUPLICATE YOURSELF</div>
        <div className="flex items-center gap-2 flex-wrap">
          <div style={{ flex: 1, minWidth: 240 }}>
            <LinkAutocomplete
              target={type}
              value={pickId}
              valueLabel={pickLabel}
              onPick={async (pid) => {
                setPickId(pid);
                if (!pid) { setPickLabel(""); return; }
                try {
                  const j = await (await fetch(`/api/crm/${type}?id=${encodeURIComponent(pid)}`, { cache: "no-store" })).json();
                  const t2 = doctypeBySlug(type);
                  setPickLabel(String(j?.row?.[t2?.titleField ?? "id"] ?? pid));
                } catch { setPickLabel(pid); }
              }}
            />
          </div>
          <button
            disabled={!pickId || pickId === id || busyId !== null}
            onClick={() => void doMerge({ id: pickId, label: pickLabel || "the picked record", detail: "", why: "picked by hand" })}
            className="rounded px-3 py-1.5 text-sm font-bold text-white"
            style={{ background: !pickId || pickId === id ? "#B9BEC4" : ORANGE }}>
            Merge it into this one
          </button>
        </div>
        {pickId === id && <div className="text-xs mt-1" style={{ color: "#8E2C20" }}>That is this record itself.</div>}
      </div>
      {(sugs ?? []).map((s) => (
        <div key={s.id} className="rounded border p-2.5 mb-2 flex items-center gap-3 flex-wrap" style={{ borderColor: BORDER }}>
          <div className="flex-1" style={{ minWidth: 200 }}>
            <div className="text-sm font-bold">{s.label}</div>
            <div className="text-xs" style={{ color: MUTED }}>{s.detail || "—"} · <i>{s.why}</i></div>
          </div>
          <button
            onClick={() => doMerge(s)}
            disabled={busyId !== null}
            className="rounded px-3 py-1.5 text-xs font-bold"
            style={{ background: busyId === s.id ? "#B9BEC4" : ORANGE, color: "#fff" }}
          >
            {busyId === s.id ? "Merging…" : "⇤ Merge into this record"}
          </button>
        </div>
      ))}
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
  useEffect(() => { if (valueLabel) setText(valueLabel); }, [valueLabel]);
  useEffect(() => {
    if (!value || valueLabel) return;
    let dead = false;
    fetch(`/api/crm/person?id=${encodeURIComponent(value)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!dead && j?.row) setText(String(j.row.full_name ?? "")); })
      .catch(() => {});
    return () => { dead = true; };
  }, [value, valueLabel]);

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
  dt, links, initial, presets, onDone, tabKey,
}: {
  dt: Doctype; links: Links; initial?: Row; presets?: Row;
  onDone: (saved?: Row) => void;
  /** Edit one lightbox tab at a time; absent = the whole form (Add). */
  tabKey?: "details" | "enquiry" | "qual";
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
        let dv: string | boolean = (f.default as string | boolean) ?? (f.type === "bool" ? false : "");
        // default: "today" on a date field means exactly that (28 Aug 2026)
        if (f.type === "date" && f.default === "today")
          dv = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        // default: "me" on a profile link = the signed-in person (29 Aug 2026)
        if (f.link === "profile" && f.default === "me")
          dv = MY_PROFILE_ID ?? "";
        // The close is expected by the LAST DATE OF NEXT MONTH unless said
        // otherwise (Dr Raghu, 26 Aug 2026).
        if (dt.name === "opportunity" && f.name === "expected_close_on") {
          const n = new Date();
          const last = new Date(n.getFullYear(), n.getMonth() + 2, 0);
          dv = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
        }
        o[f.name] = preset !== undefined && preset !== null ? String(preset) : dv;
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
  const tabMatch = (f: Field) =>
    tabKey === undefined ? true : tabKey === "details" ? !f.tab : f.tab === tabKey;
  const tenderOn = form["is_tender"] === true;
  // A dead stage DRAGS the reason fields into whichever form chose it —
  // they normally live on the Qualification tab, but a Lost move from the
  // Details form must be able to say why right there.
  const isLostField = (f: Field) => f.name === "lost_reason" || f.name === "lost_to_competitor";
  const gridFields = editable.filter((f) =>
    (tabMatch(f) || (stageDead && isLostField(f)))
    && !(f.tenderOnly && !tenderOn)
    && !(isDeal && banttcNames.includes(f.name))
    && !(hasStage && !stageDead && isLostField(f)));

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
            ) : f.type === "textarea" && f.name === "enquiry_info" ? (
              <RichTextArea value={String(form[f.name] ?? "")} onChange={(v) => set(f.name, v)} rows={f.big ? 8 : 3} />
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

            {/* Under a template's body: the variables valid for its module. */}
            {f.name === "body" && (dt.name === "email_template" || dt.name === "whatsapp_template") && (
              <div className="text-xs mt-1.5 rounded p-2" style={{ background: NAVY_SOFT, color: NAVY, lineHeight: 1.6 }}>
                <b>Variables for {String(form["module"] ?? "Enquiry")}:</b>{" "}
                {"{{name}} {{small_name}} {{company_name}} {{today}} {{next_monday}} … {{next_saturday}}"}
                {" · "}{"{{enq_no}} {{qtn_subject}}"}
                {String(form["module"] ?? "Enquiry") === "Quotation" && <> · <b>{"{{qtn_no}}"}</b></>}
                {" — plus every static Message Variable ({{khalapur_address}}, …). Unknown ones stay visible as {{key}}."}
              </div>
            )}
          </label>
        ))}
      </div>

      {isDeal && (tabKey === undefined || tabKey === "qual") && (
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
