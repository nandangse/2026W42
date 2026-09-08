"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { swallow } from "@/lib/swallow";
import GenieShell from "@/components/GenieShell";
import PlaybookScreen from "@/components/Playbook";
import { DOCTYPES, doctypeBySlug, type Doctype, type Field } from "@/crm/doctypes";

import AnalyticsScreen from "./Analytics";
import DealsScreen from "./DealBoard";
import MailComposer, { type ComposeCtx } from "./MailComposer";
import MailQueue from "./MailQueue";
import Dashboard from "./Dashboard";
import ProspectQueue from "./ProspectQueue";

import VariableHelp from "./VariableHelp";
import VisitingCard from "./VisitingCard";
import Integrations from "./Integrations";
import SalesPersonPlan from "./SalesPersonPlan";
import SalesPlan from "./SalesPlan";
import { EmailQueue, WhatsAppQueue } from "./OutboundQueues";
import WaComposer, { type WaCtx } from "./WaComposer";

import { BORDER, INK, Links, MUTED, setMyEmail, setMyProfileId, NAV, NAVY, NAVY_DARK, NAVY_SOFT, ORANGE, PAPER, PINNED_W, Row, SPECIAL_SECTIONS, URL_OF, ViewState } from "./app/shared";
import { ContactActions, DateView, DateViewBar, MoneyBox, MultiFilter, TAGGABLE, TagFilterBox, dateRangeOf, isEmailish } from "./app/Widgets";
import { Cell, ColumnPicker, ConsultRaghuModal, LinkAutocomplete, rowContacts, stickyCell } from "./app/Record";
const RecordModal = dynamic(() => import("./app/Record").then((m) => m.RecordModal), { loading: () => <div className="text-sm p-6" style={{ color: "var(--muted)" }}>Opening…</div> });
const RecordForm = dynamic(() => import("./app/Record").then((m) => m.RecordForm), { loading: () => <div className="text-sm p-6" style={{ color: "var(--muted)" }}>Opening…</div> });

export default function CrmApp({
  email, displayName, version, initialSlug, initials = null, role = "user", profileId = null,
}: {
  email: string; displayName: string | null; version: string; initialSlug?: string;
  initials?: string | null; role?: string; profileId?: string | null;
}) {
  // the signed-in person's CRM profile id, readable from anywhere in this
  // client bundle — `default: "me"` on a profile link field resolves to it
  setMyProfileId(profileId);
  setMyEmail(email.toLowerCase());
  const [slug, setSlug] = useState(initialSlug ?? DOCTYPES[0].name);
  // CONSULT DR RAGHU ON A SALES PLAN (3 Sep 2026): opened from the plan tab,
  // not from a record -- the target is the person's profile.
  const [planConsult, setPlanConsult] = useState<{ profileId: string; title: string } | null>(null);
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
    } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
    setDateView({ field: fld, preset: "ytd", from: "", to: "" });
  }, [slug]);
  const applyDateView = (v: DateView | null) => {
    setDateView(v);
    try {
      if (v) localStorage.setItem(`crm.dateview.${slug}`, JSON.stringify(v));
      else localStorage.removeItem(`crm.dateview.${slug}`);
    } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
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
  // per-COLUMN widths, dragged by hand (Dr Raghu, 30 Aug 2026) — remembered
  // per list, like everything else about the view
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const dragRef = useRef<{ name: string; startX: number; startW: number } | null>(null);
  const startColDrag = (e: React.MouseEvent, name: string, currentW: number) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { name, startX: e.clientX, startW: currentW };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const w = Math.max(70, Math.min(800, d.startW + (ev.clientX - d.startX)));
      setColWidths((cur) => ({ ...cur, [d.name]: w }));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setColWidths((cur) => { try { localStorage.setItem(`crmColWidths.${slug}`, JSON.stringify(cur)); } catch (e) { swallow("crm/CrmApp", e); /* fine */ } return cur; });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
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
      try { localStorage.setItem("crmNavOpen", v ? "0" : "1"); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
      return !v;
    });
  };

  const special = SPECIAL_SECTIONS.find((s) => s.name === slug);
  const dt = useMemo(() => DOCTYPES.find((d) => d.name === slug), [slug]);

  // Switching doctype resets the working state, recalls its saved layout,
  // and keeps the address bar honest — every section has its URL.
  useEffect(() => {
    setAdding(false); setColsOpen(false); setView(null);
    // the person's LAST view comes back — filters, search, sort, tag —
    // surviving reloads (Dr Raghu, 30 Aug 2026); ✕ All filters clears it
    try {
      const saved = JSON.parse(localStorage.getItem(`crmView.${slug}`) || "{}") as { q?: string; filters?: Record<string, string>; sort?: { col: string; dir: "asc" | "desc" } | null; tag?: string };
      setQ(saved.q || ""); setQLive(saved.q || "");
      setFilters(saved.filters || {});
      setSort(saved.sort || null);
      setTagQ(saved.tag || "");
    } catch { setQ(""); setQLive(""); setFilters({}); setSort(null); setTagQ(""); }
    try {
      const c = localStorage.getItem(`crmCols.${slug}`);
      setCols(c ? (JSON.parse(c) as string[]) : null);
      setPin(Number(localStorage.getItem(`crmPin.${slug}`)) || 0);
      setColW(Number(localStorage.getItem(`crmW.${slug}`)) || 280);
      setColWidths(JSON.parse(localStorage.getItem(`crmColWidths.${slug}`) || "{}"));
    } catch { setCols(null); setPin(0); setColW(280); setColWidths({}); }
    try { window.history.replaceState(null, "", `/crm/${URL_OF[slug] ?? slug}`); } catch (e) { swallow("crm/CrmApp", e); /* SSR */ }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qLive), 300);
    return () => clearTimeout(t);
  }, [qLive]);

  // remember the view as it changes — reloads and tomorrow both find it
  useEffect(() => {
    try { localStorage.setItem(`crmView.${slug}`, JSON.stringify({ q, filters, sort, tag: tagQ })); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
  }, [slug, q, filters, sort, tagQ]);

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
  /**
   * KANBAN, AND IT REMEMBERS (Dr Raghu, 8 Sep 2026: "next to group by show
   * also KANBAN view. And in that u can add the KANBAN by. Keep in memory of
   * the peson and view so it can go there").
   *
   * Kept in this browser, keyed by the doctype — so opening Opportunities
   * takes him back to the board he left, and Quotations to its own, rather
   * than to a list he has to set up again every morning. Per person because
   * localStorage is; per view because the useful column differs by doctype.
   */
  const [kanban, setKanban] = useState(false);
  const [kanbanBy, setKanbanBy] = useState("");
  const [sumOn, setSumOn] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`crm-view-${slug}`);
      const v = raw ? JSON.parse(raw) as { kanban?: boolean; kanbanBy?: string } : null;
      setKanban(!!v?.kanban); setKanbanBy(String(v?.kanbanBy || ""));
    } catch { setKanban(false); setKanbanBy(""); }
  }, [slug]);
  useEffect(() => {
    try { localStorage.setItem(`crm-view-${slug}`, JSON.stringify({ kanban, kanbanBy })); } catch { /* private window */ }
  }, [slug, kanban, kanbanBy]);

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
    } catch (e) { swallow("crm/CrmApp", e); /* private mode -- layout just won't stick */ }
  };
  const saveColW = (n: number) => {
    setColW(n);
    try { localStorage.setItem(`crmW.${slug}`, String(n)); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
  };
  const savePin = (n: number) => {
    setPin(n);
    try { localStorage.setItem(`crmPin.${slug}`, String(n)); } catch (e) { swallow("crm/CrmApp", e); /* ditto */ }
  };

  const toggleSort = (col: string) =>
    setSort((s) => (s?.col !== col ? { col, dir: "asc" } : s.dir === "asc" ? { col, dir: "desc" } : null));

  // Filters live on every select / link / bool field -- the ones with a
  // finite set of answers. Free text already has the search box, and the
  // company filter types along instead of dropping 54k names down.
  const filterables = (dt?.fields ?? []).filter(
    (f) => !f.noFilter && !f.virtual
      && (f.type === "select" || f.type === "bool" || (f.type === "link" && f.link)
        || (f.type === "text" && f.filterDistinct)),
  );

  // a filterDistinct field's dropdown holds the values actually in the data —
  // Item Group on a product ("filter by product family", Dr Raghu, 30 Aug 2026)
  const [distinctOpts, setDistinctOpts] = useState<Record<string, { id: string; label: string }[]>>({});
  useEffect(() => {
    const wants = (dt?.fields ?? []).filter((f) => f.filterDistinct && !f.virtual);
    if (!wants.length) { setDistinctOpts({}); return; }
    let dead = false;
    void (async () => {
      const out: Record<string, { id: string; label: string }[]> = {};
      for (const f of wants) {
        try {
          const j = await (await fetch(`/api/crm/${slug}?groupby=${encodeURIComponent(f.name)}`, { cache: "no-store" })).json();
          out[f.name] = ((j.groups ?? []) as { key: string; label: string; count: number }[])
            .filter((g) => g.key !== "")
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((g) => ({ id: g.key, label: `${g.label} (${g.count})` }));
        } catch (e) { swallow("crm/CrmApp", e); /* the filter simply stays empty */ }
      }
      if (!dead) setDistinctOpts(out);
    })();
    return () => { dead = true; };
  }, [slug, dt]);
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
      <GenieShell module="crm" title="Nandan CRM" tagline={special?.label ?? dt?.plural ?? "enquiries to orders"} user={{ email, displayName, initials, role }}
        tools={
          <>
            <span className="genie-tagline text-xs font-bold px-2" style={{ color: "var(--amber)" }}>{special?.label ?? dt?.plural ?? ""}</span>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setQueueTray((v) => !v); if (!queueTray) refreshQueueCount(); }}
                title="My Prospecting Queue — dial one by one"
                aria-label="Prospecting queue"
                className="rounded-full border"
                style={{
                  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
                  borderColor: queueTray ? ORANGE : "var(--ink)", background: queueTray ? "#FFF3EC" : "#0D161F", color: "#fff",
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
          </>
        } />

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
                      className="crmrail rounded py-1.5 text-center" style={{ fontSize: 16, color: "var(--dim)" }}>
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
                        style={{ color: "var(--dim)" }}
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
                          : { color: "var(--dim)", background: "transparent" }
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
              <>
                <SalesPersonPlan onConsult={(profileId, title) => setPlanConsult({ profileId, title })} />
                {planConsult && (
                  <ConsultRaghuModal targetType="sales_plan" targetId={planConsult.profileId} title={planConsult.title} onClose={() => setPlanConsult(null)} />
                )}
              </>
            ) : (
              <SalesPlan />
            )}
          </main>
        )}

        {/* ---------- the doctype ---------- */}
        {!special && dt && (
        <main className="p-4 flex-1" style={{ minWidth: 0 }}>
          {dt.blurb && (
            <p className="text-xs mb-3" style={{ color: "var(--dim)", maxWidth: "80ch", lineHeight: 1.6 }}>
              {dt.blurb}
            </p>
          )}

          {/* The variables, named where they are used (Dr Raghu, 31 Aug 2026:
              "please put these variables in the settings so that I know. Also
              in the templates page showcase this"). */}
          {["message_variable", "email_template", "whatsapp_template"].includes(dt.name) && (
            <div className="mb-3" style={{ maxWidth: 980 }}><VariableHelp /></div>
          )}

          {/* ---------- toolbar: add · search · filters · columns ---------- */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button
              onClick={() => setAdding((v) => !v)}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={{ background: adding ? "var(--dim)" : ORANGE, color: "#fff" }}
            >
              {adding ? "Cancel" : `+ Add ${dt.label}`}
            </button>
            {/* THE OTHER DOOR INTO MEETINGS (Dr Raghu, 4 Sep 2026): every
                interaction logged as a Video Call or Zoom Meeting, brought
                in. New ones come by themselves on save; this walks the past. */}
            {dt.name === "meeting" && (
              <button
                onClick={async () => {
                  try {
                    const r = await fetch("/api/crm/meeting-sync", { method: "POST" });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || "Sync failed");
                    window.alert(`${j.interactions} Video Call / Zoom Meeting interactions found.\nBrought in: ${j.made} · refreshed: ${j.updated}${j.failed?.length ? `\nFailed: ${j.failed.length}` : ""}`);
                    void load();
                  } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold border"
                style={{ borderColor: NAVY, color: NAVY, background: "#fff" }}
                title="Bring every interaction logged as a Video Call or Zoom Meeting into Meetings"
              >
                ⟳ Sync from interactions
              </button>
            )}
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
                style={{ borderColor: BORDER, background: "#fff", color: "var(--dim)" }}
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
                style={{ background: "var(--red)", color: "#fff" }}
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
              /* KANBAN BY — the fields worth being columns. A board is only
                 useful when the field has few values and an order to them, so
                 it is the ladders and the owner, not every link on the form. */
              const KAN: [string, string][] = [["stage_id", "Stage"], ["status", "Status"], ["pipeline", "Pipeline"], ["owner_id", "Sales Person"], ["source", "Source"], ["product_family", "Product Family"]];
              const kopts = KAN.filter(([n]) => dt.fields.some((f) => f.name === n && !f.virtual));
              return (
                <span className="flex items-center gap-1 ml-auto">
                  {/* KANBAN, next to Group by (Dr Raghu, 8 Sep 2026) */}
                  {kopts.length > 0 && (
                    <>
                      <button onClick={() => { const on = !kanban; setKanban(on); if (on && !kanbanBy) setKanbanBy(kopts[0][0]); }}
                        title="See these as a board, in columns"
                        className="px-2 py-1.5 rounded text-sm font-bold border"
                        style={{ borderColor: kanban ? NAVY : BORDER, background: kanban ? NAVY_SOFT : "#fff", color: kanban ? NAVY : "var(--dim)" }}>
                        ▦ Kanban
                      </button>
                      {kanban && (
                        <select value={kanbanBy} onChange={(e) => setKanbanBy(e.target.value)}
                          className="px-2 py-1.5 rounded text-sm font-semibold border"
                          style={{ borderColor: NAVY, background: "#fff", color: INK }}>
                          {kopts.map(([n, l]) => <option key={n} value={n}>Kanban by {l}</option>)}
                        </select>
                      )}
                    </>
                  )}
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                    className="px-2 py-1.5 rounded text-sm font-semibold border"
                    style={{ borderColor: groupBy ? NAVY : BORDER, background: "#fff", color: groupBy ? INK : "var(--dim)" }}>
                    <option value="">Group by…</option>
                    {opts.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                  </select>
                  <button onClick={() => setSumOn((v) => !v)} title="Also show the value summation per group"
                    className="px-2 py-1.5 rounded text-sm font-bold border"
                    style={{ borderColor: sumOn ? NAVY : BORDER, background: sumOn ? NAVY_SOFT : "#fff", color: sumOn ? NAVY : "var(--dim)" }}>
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
              {(q || tagQ || Object.values(filters).some(Boolean) || sort || dateView) && (
                <button onClick={() => {
                  setQ(""); setQLive(""); setFilters({}); setSort(null); setTagQ("");
                  applyDateView(null);
                  try { localStorage.removeItem(`crmView.${slug}`); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
                }}
                  className="text-xs font-bold rounded px-2 py-1 text-white" style={{ background: "var(--red)" }}
                  title="Clear every filter, the search, the tag, the sort and the date view — see all">
                  ✕ All filters
                </button>
              )}
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
                    style={{ borderColor: filters[f.name] ? ORANGE : BORDER, background: "#fff", color: filters[f.name] ? INK : "var(--dim)", maxWidth: 190 }}
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
                      : f.filterDistinct
                      ? (distinctOpts[f.name] || [])
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
                        ) : bf.type === "money" ? (
                          <MoneyBox value={bulkValue} onChange={setBulkValue}
                            className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal tnum" style={{ borderColor: BORDER, background: "#fff" }} />
                        ) : (
                          <input type={bf.type === "date" ? "date" : bf.type === "number" ? "number" : "text"}
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
                          className="w-full mt-1 px-2 py-1.5 rounded text-sm border font-normal" style={{ borderColor: bulkReason.trim().length > 3 ? BORDER : "var(--accent)", background: "#fff" }} />
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
              role="button" tabIndex={0} onClick={() => setAdding(false)}
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

          {/* ───────────── THE BOARD ─────────────
              Columns are the values the loaded rows actually carry, in the
              order the ladder gives them where there is one. A card shows the
              row's own name and the two or three things worth seeing without
              opening it; clicking opens the same lightbox the table does, so
              nothing is learned twice. */}
          {rows.length > 0 && kanban && kanbanBy && (() => {
            const kf = dt.fields.find((f) => f.name === kanbanBy);
            const title = visible[0]?.name ?? "name";
            const money = visible.find((f) => f.type === "money" || /value|amount|total/i.test(f.name));
            /* a link field carries an id; its words live in `links`, keyed by
               the target doctype, exactly as the table reads them */
            const label = (r: Record<string, unknown>) => {
              const v = r[kanbanBy];
              if (v == null || v === "") return "— not set —";
              const opts = kf?.link ? links[kf.link] : undefined;
              const hit = Array.isArray(opts) ? opts.find((o) => String(o.id) === String(v)) : undefined;
              return String(hit?.label ?? v);
            };
            const cols = new Map<string, Record<string, unknown>[]>();
            for (const r of rows) { const k = label(r); (cols.get(k) ?? cols.set(k, []).get(k)!).push(r); }
            const order = [...cols.keys()].sort((a2, b2) => (a2 === "— not set —" ? 1 : b2 === "— not set —" ? -1 : cols.get(b2)!.length - cols.get(a2)!.length));
            return (
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
                {order.map((k) => {
                  const list = cols.get(k)!;
                  const sum = money ? list.reduce((a2, r) => a2 + (Number(r[money.name]) || 0), 0) : 0;
                  return (
                    <div key={k} style={{ minWidth: 262, maxWidth: 262, flex: "none", background: "#F4F2EC", borderRadius: 10, border: `1px solid ${BORDER}` }}>
                      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#F4F2EC", borderRadius: "10px 10px 0 0" }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{k}</div>
                        <div style={{ fontSize: 11.5, color: MUTED }}>
                          {list.length} {list.length === 1 ? "record" : "records"}
                          {money && sum ? ` · ₹${Math.round(sum).toLocaleString("en-IN")}` : ""}
                        </div>
                      </div>
                      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 330px)", overflowY: "auto" }}>
                        {list.map((r, i) => (
                          <div key={String(r.id ?? i)} role="button" tabIndex={0}
                            onClick={() => setView({ dt, row: r, links, mode: "view" })}
                            style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                            <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {String(r[title] ?? r.name ?? r.id ?? "")}
                            </div>
                            {money && r[money.name] != null && (
                              <div className="tnum" style={{ fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                                ₹{Math.round(Number(r[money.name]) || 0).toLocaleString("en-IN")}
                              </div>
                            )}
                            {visible.slice(1, 3).filter((f) => f.name !== kanbanBy && f !== money).map((f) => (
                              <div key={f.name} style={{ fontSize: 11.5, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                <Cell field={f} value={r[f.name]} links={links} onOpenLink={openLinked} short />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!kf && <div style={{ color: MUTED, fontSize: 13 }}>That field is not on this doctype.</div>}
              </div>
            );
          })()}

          {rows.length > 0 && !kanban && (
            <div
              className="rounded border"
              style={{
                borderColor: BORDER, background: "#fff",
                overflow: "auto", maxHeight: "calc(100vh - 250px)",
              }}
            >
              <table className="genie-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 520,
                // once a hand has sized any column, the table obeys hands —
                // fixed layout is the only mode where a dragged width is law
                tableLayout: Object.keys(colWidths).length ? "fixed" : undefined }}>
                {Object.keys(colWidths).length > 0 && (
                  <colgroup>
                    <col style={{ width: 30 }} />
                    {visible.map((f, ci) => (
                      <col key={f.name} style={{ width: ci < pin ? PINNED_W : colWidths[f.name] || Math.min(colW, 220) }} />
                    ))}
                    <col style={{ width: 84 }} />
                  </colgroup>
                )}
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
                          ...(ci < pin ? { left: ci * PINNED_W, width: PINNED_W, minWidth: PINNED_W }
                            : colWidths[f.name] ? { width: colWidths[f.name], minWidth: colWidths[f.name], maxWidth: colWidths[f.name] } : null),
                        }}
                      >
                        {ci >= pin && (
                          <span onMouseDown={(e) => startColDrag(e, f.name, colWidths[f.name] || (e.currentTarget.parentElement?.offsetWidth ?? 160))}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to size this column"
                            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "col-resize" }} />
                        )}
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
                      role="button" tabIndex={0} onClick={() => setView({ dt, row: r, links, mode: "view" })}
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
                            maxWidth: ci < pin ? PINNED_W : colWidths[f.name] ?? colW,
                            ...(ci >= pin && colWidths[f.name] ? { width: colWidths[f.name], minWidth: colWidths[f.name] } : null),
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