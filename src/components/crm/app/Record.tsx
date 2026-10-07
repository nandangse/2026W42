"use client";
// split out of CrmApp.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";

import { doctypeBySlug, type Doctype, type Field } from "@/crm/doctypes";

import MailComposer, { type ComposeCtx } from "../MailComposer";

import RichTextEditor, { RichContent, looksHtml } from "../../RichTextEditor";
import VariableHelp from "../VariableHelp";
import { PersonCardPanel } from "../VisitingCard";

import { BORDER, INK, Links, MUTED, MY_EMAIL, MY_PROFILE_ID, NAVY, NAVY_DARK, NAVY_SOFT, ORANGE, PINNED_W, Row, ViewState } from "./shared";
import { ContactActions, MoneyBox, StageQuickEdit, TAGGABLE, TagStrip, isEmailish, isPhoneish } from "./Widgets";
import { ProductBasicTab, ProductPricingTab, ProductQuotesTab, ProductTrainingTab } from "./Product";
import { AddressSelect, QuoteDocDesk, QuoteItemsTab, QuoteRecipients } from "./Quote";

/** The first actionable email and phone in a row, whichever fields hold them. */
export function rowContacts(dt: Doctype, r: Row): { email: string | null; phone: string | null } {
  let email: string | null = null, phone: string | null = null;
  for (const f of dt.fields) {
    const v = r[f.name];
    if (!email && isEmailish(v)) email = v.trim();
    if (!phone && isPhoneish(v)) phone = v.trim();
  }
  return { email, phone };
}

/** Sticky style for a pinned column: fixed width so the offsets add up. */
export function stickyCell(ci: number, z: number, left?: number, width?: number): React.CSSProperties {
  return {
    position: "sticky", left: left ?? ci * PINNED_W, zIndex: z,
    width: width ?? PINNED_W, minWidth: width ?? PINNED_W,
    boxShadow: "inset -1px 0 0 " + BORDER,
  };
}

/** Render one value the way its field type deserves. */
const PLAIN_LINKS = new Set(["stage", "sector", "profile", "product", "tax", "terms_template"]);
/** warmth by the stage's name — the opportunity ladder and the quotation closures share the scale */
export function stageWarmth(name: string): { bg: string; fg: string } {
  const n = name.toLowerCase();
  if (/lost|regret|not target|cancel|dropped|expired/.test(n)) return { bg: "#ECECEC", fg: "#6B6B6B" };          // closed — cold ash
  if (/won|order|accepted|submitted/.test(n)) return { bg: "#DDF3E4", fg: "#1E6B3E" };                              // won — green
  if (/quote|hotlist|live|late handling|negotiat/.test(n)) return { bg: "#FDE2D3", fg: "#B3391E" };                 // hot
  if (/consultative|presentation|proposal|demo|site/.test(n)) return { bg: "#FFE9C2", fg: "#8A5B00" };              // warm
  if (/waiting|data|follow|qualif|prospect|handled/.test(n)) return { bg: "#FFF4D6", fg: "#9A6B00" };               // warming
  return { bg: "#E6EEF6", fg: "#3A5F80" };                                                                          // new — cool
}

export function Cell({
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

  // a product image stands SMALL wherever it appears; a click opens it whole
  if (field.name === "image" && /^(https?:|\/)/.test(String(value))) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(value)} alt="" style={{ maxHeight: 36, maxWidth: 72, borderRadius: 4, cursor: "zoom-in" }}
      onClick={(e) => { e.stopPropagation(); window.open(String(value), "_blank", "noopener"); }} />;
  }

  // NGSE/QTN/26-27/39514 reads as 39514 in a list; the whole id is the tooltip.
  if (short && ["opportunity_no", "quote_no", "so_no"].includes(field.name)) {
    const m = String(value).match(/(\d+)\s*$/);
    // an ERP record hand-titled with a company name is not a number —
    // the number column shows a dash and the full title waits in the tooltip
    if (!m) return <span title={String(value)} style={{ color: "#C7CCD2" }}>—</span>;
    return <span className="tnum" title={String(value)}>{m[1]}</span>;
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
    /* THE STAGE WEARS ITS WARMTH (Dr Raghu, 7 Oct 2026: "colour-code it.
       Make the stages different colours depending upon the warmth of the
       project") — cold grey for a fresh enquiry, through amber as it is
       worked, hot at a quote, and the closed ones dark. */
    if (field.link === "stage") {
      const w = stageWarmth(label);
      return <span title={label} style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: w.bg, color: w.fg, whiteSpace: "nowrap" }}>{label}</span>;
    }
    /* "Don't make all the sectors, etc., clickable because that is way too
       much" — sector, salesperson, pipeline and product read as words; the
       company and the people stay doors. */
    if (!onOpenLink || PLAIN_LINKS.has(field.link)) return <>{label}</>;
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
export function fmtDate(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** Pick which columns show, per doctype. Kept in localStorage. */
export function ColumnPicker({
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
          <span style={{ color: "var(--dim)" }}>{f.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * The lightbox. Opens on a row click showing the record read-only -- the
 * basics at a glance -- and Edit goes deeper into the full form.
 */
export function RecordModal({
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
  const [consultOpen, setConsultOpen] = useState(false);
  useEffect(() => {
    let t0 = "details";
    try {
      if (dt.name === "person" && window.sessionStorage.getItem("crm.apollo.auto") === String(row.id)) t0 = "card";
    } catch (e) { swallow("crm/CrmApp", e); /* details it is */ }
    setTab(t0); setApolloMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  useEffect(() => { setConsultOpen(false); }, [row.id]);
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
    // the Qualification tab retired (Dr Raghu, 30 Aug 2026) — BANTTC lives
    // inside Enquiry Info now, editable in place
    if (dt.name === "company") {
      recordTabs.push(
        { key: "addresses", label: "Addresses", slug: "address", filterField: "company_id", filterValue: rid, addPresets: { company_id: rid } },
        // A company's own funnel starts HERE (Dr Raghu, 31 Aug 2026: "in this
        // also make a button to add opportunity"). Both tabs could list but
        // not add, so the one screen that knows the customer sent you
        // elsewhere to raise their enquiry. The company rides in pre-chosen.
        { key: "opps", label: "Opportunities", count: row.opp_count, slug: "opportunity", filterField: "company_id", filterValue: rid,
          addPresets: { company_id: rid }, presetOptions: { company: [{ id: rid, label: title }] } },
        { key: "quotes", label: "Quotations", slug: "quotation", filterField: "company_id", filterValue: rid,
          addPresets: { company_id: rid }, presetOptions: { company: [{ id: rid, label: title }] } },
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
      recordTabs.push({ key: "lines", label: "Quote items", slug: "quotation_line", filterField: "quotation_id", filterValue: rid, addPresets: { quotation_id: rid } });
      // Situational, Terms, Cover/Back/About and Review all live INSIDE the
      // Covering Letter desk now (Dr Raghu, 30 Aug 2026)
      recordTabs.push({ key: "letterdesk", label: "Covering Letter" });
    }
    if (dt.name === "person") recordTabs.push({ key: "card", label: "Visiting Card" });
    if (dt.name === "sales_order") recordTabs.push({ key: "soitems", label: "Order items" });
    recordTabs.push(
      { key: "comms", label: "Communication" },
      { key: "notes", label: "Notes" },
    );
    if (dt.name === "company" || dt.name === "person")
      recordTabs.push({ key: "merge", label: "Merge" });
    // IFS before Genie (Dr Raghu, 30 Aug 2026) — bought by Raghu, read by all
    if (dt.name === "company") recordTabs.push({ key: "ifs", label: "₹ IFS" });
    recordTabs.push({ key: "genie", label: "Genie" });
  }
  // the product record's own tabs (Dr Raghu, 30 Aug 2026: "in this have
  // tabs — first one is the default, basic content; quotations; training
  // about product family; pricing; notes; keep the provision to merge")
  if (dt.name === "product") {
    recordTabs.push(
      { key: "details", label: "Basic" },
      { key: "pquotes", label: "Quotations" },
      { key: "ppricing", label: "Pricing" },
      { key: "ptraining", label: "Training" },
      { key: "notes", label: "Notes" },
      { key: "merge", label: "Merge" },
    );
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
      role="button" tabIndex={0} onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(22,35,47,.45)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: "10px 16px",
      }}
    >
      <div
        role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}
        className="rounded"
        style={{
          background: "#fff", width: hasTabs ? "min(1080px, 100%)" : "min(880px, 100%)",
          boxShadow: "0 12px 40px rgba(27,45,107,.35)",
          height: "calc(100vh - 20px)", display: "flex", flexDirection: "column", minHeight: 0,
        }}
      >
        {consultOpen && (
          <ConsultRaghuModal targetType={dt.name} targetId={rid} title={title} onClose={() => setConsultOpen(false)} />
        )}
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
              {dt.name === "opportunity" && row.opportunity_no != null && /\d\s*$/.test(String(row.opportunity_no)) && (
                <span title={String(row.opportunity_no)} className="font-bold rounded px-1.5" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}>
                  № {(String(row.opportunity_no).match(/(\d+)\s*$/) || [])[1] ?? String(row.opportunity_no)}
                </span>
              )}
              {/* the quote's STATUS lives in the header, always and in colour
                  (Dr Raghu, 30 Aug 2026: "show status live here") */}
              {/* THE CIN ON THE FIRST PAGE (Dr Raghu, 4 Sep 2026: "also put
                  the CIN number here and also on the first page") */}
              {dt.name === "company" && !!row.cin && (
                <span title="Corporate Identification Number" className="tnum font-bold rounded px-1.5" style={{ background: "rgba(255,255,255,.12)", color: "#fff", letterSpacing: 0.3 }}>
                  CIN {String(row.cin)}
                </span>
              )}
              {dt.name === "quotation" && !!row.status && (() => {
                const st = String(row.status);
                const tint: Record<string, string> = {
                  draft: "var(--muted)", live: "#1A7F4E", hotlist: "var(--accent)", submitted: "#2C5B82",
                  cancelled: "#7A2E24", lost: "var(--red)", expired: "#6B7280",
                };
                return (
                  <span className="font-bold rounded px-1.5" style={{ background: tint[st] ?? "rgba(255,255,255,.12)", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {st}
                  </span>
                );
              })()}
              {/* the quote's stage rides beside it when it has one */}
              {dt.name === "quotation" && row.stage_id != null && (
                <span className="font-bold rounded px-1.5" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}>
                  {linkLabel("stage", row.stage_id) ?? "—"}
                </span>
              )}
              {row.company_id != null && <span><b style={{ color: "#fff" }}>{linkLabel("company", row.company_id) ?? "—"}</b></span>}
              {row.owner_id != null && <span>: {linkLabel("profile", row.owner_id) ?? "—"}</span>}
              {ageDays !== null && (
                <span style={{ fontWeight: 800, color: ageDays > 2 ? "#FF6B5E" : "#8FD5A6" }}>
                  : {ageDays} day{ageDays === 1 ? "" : "s"}
                </span>
              )}
              {queueMsg && <span style={{ color: "var(--amber)", fontWeight: 700 }}>{queueMsg}</span>}
              {apolloMsg && apolloMsg !== "asking Apollo…" && <span style={{ color: apolloMsg.startsWith("✓") ? "#8FD5A6" : "var(--amber)", fontWeight: 700 }}>{apolloMsg}</span>}
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
            {mode === "view" && ["opportunity", "quotation", "sales_order", "company", "person", "industry", "product"].includes(dt.name) && (
              <button onClick={() => setConsultOpen(true)} title="Consult Dr Raghu"
                style={{ padding: 0, border: "2px solid rgba(255,255,255,.5)", borderRadius: "50%", overflow: "hidden", width: 38, height: 38, flexShrink: 0, background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/consult-raghu.png" alt="Consult Dr Raghu" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            )}
            {/* "allow to duplicate quote" (Dr Raghu, 30 Aug 2026) */}
            {mode === "view" && dt.name === "quotation" && (
              <button
                onClick={async () => {
                  if (!window.confirm(`Duplicate ${title}?\n\nA fresh quote number carries every field and every line, born at Draft with today's date.`)) return;
                  try {
                    const r = await fetch("/api/crm/quote-duplicate", {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ quotation_id: rid }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || "Could not duplicate");
                    onSaved();
                    onOpenLink("quotation", String(j.id));
                  } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}
              >
                ⧉ Duplicate
              </button>
            )}
            {/* BACKFLUSH (Dr Raghu, 31 Aug 2026: "when Opportunity is empty,
                can you create one to backflush it? make it the same day!").
                Only where the quote genuinely stands alone. */}
            {mode === "view" && dt.name === "quotation" && !row.opportunity_id && (
              <button
                onClick={async () => {
                  if (!window.confirm(
                    `Write the missing enquiry behind ${title}?\n\n`
                    + `It takes this quote's own company, contact, salesperson and value — and THIS QUOTE'S DATE, `
                    + `not today's, so the funnel reads the enquiry as having come before the quote it produced.\n\n`
                    + `The quote is then linked to it.`)) return;
                  try {
                    const r = await fetch("/api/crm/quote-backflush", {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ quotation_id: rid }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || "Could not create the enquiry");
                    onSaved();
                    onOpenLink("opportunity", String(j.opportunity_id));
                  } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}
                title="This quote has no enquiry behind it — write one from the quote, dated the same day"
              >
                ⤴ Create the enquiry
              </button>
            )}
            {/* LEAD OR CONTACT, INTERCHANGEABLE (Dr Raghu, 16 Sep 2026:
                "always interchangeable. Make a toggle saying convert lead to
                contact, and then vice versa").

                A lead is somebody with no opportunity and no quotation, which
                is a good default and not a truth — so it can be set by hand,
                and once it has been, the automatic rule leaves the row alone.
                A badge that changed back on its own would read as the screen
                lying rather than a rule working. */}
            {mode === "view" && (dt.name === "company" || dt.name === "person") && (
              <button
                onClick={async () => {
                  const nowLead = (row as Record<string, unknown>).is_lead !== false;
                  if (!window.confirm(nowLead
                    ? `Make ${title} a contact?\n\nIt keeps everything it has and simply stops being counted as a lead. The automatic rule — no opportunity and no quotation means lead — will leave it alone from now on.`
                    : `Put ${title} back among the leads?\n\nNothing is deleted. It stops being counted as a contact, and the automatic rule will leave it alone from now on.`)) return;
                  try {
                    const r = await fetch("/api/crm/clean", { method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "set_lead", kind: dt.name, id: rid, is_lead: !nowLead }) });
                    const j = await r.json();
                    if (!r.ok) throw new Error(String(j.error || r.status));
                    onSaved({ id: rid });
                  } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
                }}
                className="rounded px-2.5 py-1 text-xs font-bold"
                style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}
                title="A lead is somebody with no opportunity and no quotation. You can overrule that either way."
              >
                {(row as Record<string, unknown>).is_lead !== false ? "→ Convert lead to contact" : "← Back to a lead"}
              </button>
            )}
            {mode === "view" && (dt.name === "company" || dt.name === "person") && (
              <button
                onClick={async () => {
                  // Apollo bills for what it answers — the consent is here
                  if (!window.confirm(`Enrich with Apollo? APOLLO CREDITS WILL BE CONSUMED.\n\n${dt.name === "company"
                    ? "Fills the company's empty fields, brings in up to 10 people as contacts, and files the rest into Notes."
                    : "Looks this contact up — you tick which suggestions to apply on the Visiting Card tab."}`)) return;
                  if (dt.name === "person") {
                    try { window.sessionStorage.setItem("crm.apollo.auto", rid); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
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
                onClick={async () => {
                  // AMEND a submitted quote = a revision: old one CANCELLED,
                  // every item MOVES to <no>-1 (Dr Raghu, 30 Aug 2026)
                  if (dt.name === "quotation" && String(row.status) === "submitted") {
                    if (!window.confirm(`Amend ${title}?\n\nThis quote will stand CANCELLED and every item MOVES to a new revision named ${String(row.quote_no).replace(/-\d+$/, "")}-${(Number(row.revision) || 0) + 1}.`)) return;
                    try {
                      const r = await fetch("/api/crm/quote-amend", {
                        method: "POST", headers: { "content-type": "application/json" },
                        body: JSON.stringify({ quotation_id: rid }),
                      });
                      const j = await r.json();
                      if (!r.ok) throw new Error(j.error || "Could not amend");
                      onSaved();
                      onOpenLink("quotation", String(j.id));
                    } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
                    return;
                  }
                  onEdit();
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{ background: ORANGE, color: "#fff" }}
              >
                {dt.name === "quotation" && String(row.status) === "submitted" ? "Amend" : "Edit"}
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
          dt.name === "meeting" && (!hasTabs || tab === "details") ? (
            <MeetingTab row={row} onSaved={onSaved} />
          ) : !hasTabs || tab === "details" ? (
            dt.name === "product" ? (
              <ProductBasicTab row={row} onSaved={onSaved} />
            ) : (
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
              {/* the quote's To and CC live on the main screen
                  (Dr Raghu, 30 Aug 2026) */}
              {dt.name === "quotation" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <QuoteRecipients row={row} onSaved={onSaved} />
                </div>
              )}
            </div>
            )
          ) : tab === "lines" && dt.name === "quotation" ? (
            <QuoteItemsTab quote={row} onSaved={onSaved} />
          ) : tab === "letterdesk" && dt.name === "quotation" ? (
            <QuoteDocDesk row={row} onSaved={onSaved} />
          ) : tab === "pquotes" ? (
            <ProductQuotesTab id={rid} />
          ) : tab === "ppricing" ? (
            <ProductPricingTab id={rid} onSaved={() => onSaved()} />
          ) : tab === "ptraining" ? (
            <ProductTrainingTab id={rid} group={row.item_group ? String(row.item_group) : null} />
          ) : tab === "enquiry" ? (
            dt.name === "opportunity"
              ? <>
                  <EnquiryInfoTab row={row} onSaved={onSaved} />
                  {/* qualification lives HERE now, and the numbers EDIT in
                      place (Dr Raghu, 30 Aug 2026: "BANTTC can be edited
                      regularly") */}
                  <div className="px-4 pb-4"><BanttcEditor oppId={rid} initial={row} onSaved={(r2) => onSaved(r2)} /></div>
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
          ) : tab === "soitems" ? (
            <SoItemsTab id={rid} />
          ) : tab === "comms" ? (
            <CommsFeed
              type={dt.name} id={rid} companyId={companyId} onOpenLink={onOpenLink}
              contactEmail={
                [row.primary_email, row.contact_email].find(isEmailish) as string | undefined ?? null
              }
            />
          ) : tab === "notes" ? (
            <>
              <WhereFrom type={dt.name} id={rid} />
              <NotesTab type={dt.name} id={rid} />
            </>
          ) : tab === "ifs" ? (
            <IfsTab row={row} onSaved={onSaved} />
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
export function RelatedTab({
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
  const [apollo, setApollo] = useState("");
  /** "in this also let me search!" (Dr Raghu, 31 Aug 2026) — 43 contacts on
   *  one company is a list nobody scrolls twice. */
  const [q, setQ] = useState("");

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
  // Apollo stands wherever the client's people stand (Dr Raghu, 30 Aug
  // 2026: "on this page as well as in Companies show enrich with apollo")
  const apolloHere = slug === "person" && filterField === "company_id" && !!filterValue;

  /**
   * The search (Dr Raghu, 31 Aug 2026: "in this also let me search!").
   *
   * It reads every column the tab shows, and a linked column by the LABEL on
   * screen rather than the uuid behind it — searching "Raghunandan" must find
   * the row that reads Raghunandan, not fail because the cell holds a key.
   * Filtering happens here rather than at the server: the tab already holds
   * every row, so the list narrows as the letters land.
   */
  const allRows = rows;
  const needle = q.trim().toLowerCase();
  const shown = !needle ? allRows : allRows.filter((r) =>
    fields.some((f) => {
      const raw = r[f.name];
      if (raw === null || raw === undefined || raw === "") return false;
      const asLabel = f.link ? (links[f.link] || []).find((o) => o.id === String(raw))?.label : null;
      return String(asLabel ?? raw).toLowerCase().includes(needle);
    }));

  return (
    <div style={{ maxHeight: "calc(100vh - 260px)", overflow: "auto" }}>
      {allRows.length > 5 && (
        <div className="px-4 pt-3">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={`🔍 Search ${dt.plural.toLowerCase()} — ${fields.map((f) => f.label.toLowerCase()).slice(0, 4).join(", ")}…`}
            className="px-2 py-1.5 rounded border text-sm"
            style={{ borderColor: needle ? ORANGE : BORDER, width: "min(420px, 100%)" }}
          />
          {needle && (
            <span className="text-xs ml-2" style={{ color: MUTED }}>
              {shown.length} of {allRows.length}
              {" · "}<button onClick={() => setQ("")} style={{ color: ORANGE, fontWeight: 700 }}>clear</button>
            </span>
          )}
        </div>
      )}
      {(addPresets || apolloHere) && (
        <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
          {addPresets && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="px-3 py-1 rounded text-xs font-bold"
            style={{ background: adding ? "#6B7280" : ORANGE, color: "#fff" }}
          >
            {adding ? "Cancel" : `+ Add ${dt.label.toLowerCase()}`}
          </button>
          )}
          {apolloHere && (
            <button
              onClick={async () => {
                if (!window.confirm("Enrich with Apollo? APOLLO CREDITS WILL BE CONSUMED.\n\nFills the company's empty fields, brings in up to 10 people as contacts, and files the rest into Notes.")) return;
                setApollo("asking Apollo…");
                try {
                  const r = await fetch("/api/crm/enrich", {
                    method: "POST", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "company", company_id: filterValue }),
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(String(j.error || r.status));
                  setApollo(!j.found ? "Apollo has no match" : `✓ ${j.contacts_created} contact${j.contacts_created === 1 ? "" : "s"} in`);
                  setTick((t) => t + 1);
                } catch (e) { setApollo(e instanceof Error ? e.message : String(e)); }
              }}
              className="px-3 py-1 rounded text-xs font-bold"
              style={{ background: "#2C5B82", color: "#fff" }}
              title="Fetch the company's people from Apollo.io — credits will be consumed"
            >
              {apollo === "asking Apollo…" ? "Asking Apollo…" : "🔎 Enrich with Apollo"}
            </button>
          )}
          {apollo && apollo !== "asking Apollo…" && <span className="text-xs font-semibold" style={{ color: apollo.startsWith("✓") ? "#1A7F4E" : "#8E2C20" }}>{apollo}</span>}
          {adding && addPresets && (
            <div className="mt-2" style={{ width: "100%" }}>
              <RecordForm
                dt={dt} links={links} presets={addPresets}
                onDone={() => { setAdding(false); setTick((t) => t + 1); }}
              />
            </div>
          )}
        </div>
      )}
      {!shown.length && (
        <div className="p-6 text-sm" style={{ color: MUTED }}>
          {allRows.length ? `Nothing here matches “${q.trim()}”.` : `No ${dt.plural.toLowerCase()} here yet.`}
        </div>
      )}
      {shown.length > 0 && (
      <div>
      <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f.name} style={{
                textAlign: "left", padding: "8px 14px", fontSize: 10, letterSpacing: 0.6,
                color: MUTED, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap",
                position: "sticky", top: 0, background: "#fff",
              }}>{f.label.toUpperCase()}</th>
            ))}
            {apolloHere && <th style={{ borderBottom: `2px solid ${BORDER}`, position: "sticky", top: 0, background: "#fff", width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr
              key={String(r.id ?? i)}
              role="button" tabIndex={0} onClick={() => onOpenLink(slug, String(r.id))}
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
              {apolloHere && (
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0F1F6", textAlign: "right" }}>
                  <button
                    title="Enrich this contact with Apollo — credits will be consumed"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm("Enrich this contact with Apollo? APOLLO CREDITS WILL BE CONSUMED.\n\nOpens the contact on the Visiting Card tab where the suggestions apply.")) return;
                      try { window.sessionStorage.setItem("crm.apollo.auto", String(r.id)); } catch (e) { swallow("crm/CrmApp", e); /* fine */ }
                      onOpenLink(slug, String(r.id));
                    }}
                    style={{ fontSize: 13, opacity: 0.75 }}>🔎</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {total > allRows.length && (
        <div className="p-3 text-xs" style={{ color: MUTED }}>
          Showing {allRows.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} — the full list lives on the {dt.plural} screen.
          {/* Said plainly: the box searches what this tab loaded, not the
              whole table, so a miss here is not proof of absence. */}
          {needle && <> The search reads these {allRows.length.toLocaleString("en-IN")} only.</>}
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
export function LinkAutocomplete({
  target, value, valueLabel, onPick, extraQuery,
}: {
  target: string; value: string; valueLabel: string; onPick: (id: string, label?: string) => void;
  /** Extra f_ filters for the pick search — a quote line's group throttles its items. */
  extraQuery?: string;
}) {
  const [text, setText] = useState(valueLabel);
  const [options, setOptions] = useState<{ id: string; label: string; hint?: string }[]>([]);
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
      onPick(String(j.row.id), name);
      setOpen(false);
    } catch (e) { swallow("crm/CrmApp", e); /* the typed text stays; picking again retries */ }
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
      fetch(`/api/crm/${target}?pick=${encodeURIComponent(text)}${extraQuery ? `&${extraQuery}` : ""}`, { cache: "no-store" })
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
        onChange={(e) => { setText(e.target.value); setOpen(true); if (e.target.value === "") onPick("", ""); }}
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
              onMouseDown={(e) => { e.preventDefault(); onPick(o.id, o.label); setText(o.label); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-sm"
              style={{ color: INK }}
            >
              {o.label}
              {/* the organization, so three namesakes are three people
                  (Dr Raghu, 31 Aug 2026) */}
              {o.hint && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.35 }}>{o.hint}</div>}
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
export function RichTextArea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
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
export const isErpFile = (u: string) => /^https?:\/\/[^/]*nandanerp[^/]*\/(private\/)?files?\//i.test(u);

export const viaDoor = (u: string) => (isErpFile(u) ? `/api/crm/erp-file?u=${encodeURIComponent(u)}` : u);

export const looksImage = (u: string) => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(u) || /\/files?\//i.test(u) || u.startsWith("data:image/");

export function RichText({ text }: { text: string }) {
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
      if ((/🖼/.test(m[3]) || m[4].includes("opp-attach") || m[4].startsWith("data:image/")) && looksImage(m[4])) parts.push(img(m[4], m[3]));
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
export function QualView({ dt, row, links }: { dt: Doctype; row: Row; links: Links }) {
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
          <table className="genie-table" style={{ borderCollapse: "collapse", minWidth: 560 }}>
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
export function EvaBriefTab({ companyId, initial, initialAt }: { companyId: string; initial: string | null; initialAt: string | null }) {
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
            : <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded text-sm font-bold border" style={{ borderColor: BORDER, color: "var(--dim)", background: "#fff" }}>✎ Edit</button>
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

export function CommsFeed({
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
    if (!contactEmail && type !== "opportunity" && type !== "quotation") return;
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
            {(contactEmail || type === "opportunity" || type === "quotation") && (
              <button
                onClick={() => void pullMail()}
                disabled={mailBusy}
                className="px-3 py-1 rounded text-xs font-bold border"
                style={{ borderColor: BORDER, background: "#fff", color: NAVY }}
                title={type === "opportunity"
                  ? "Search your mailbox for mail with ALL this opportunity's contacts, from 7 days before the enquiry onward, and land it here"
                  : type === "quotation"
                    ? "Search your mailbox for mail with ALL this quote's contacts, from 7 days before it was raised through to now, and land it here"
                    : `Fetch your recent Gmail with ${contactEmail} onto this record`}
              >
                {mailBusy ? "Working…" : (type === "opportunity" || type === "quotation") ? "⟳ Pull Gmail with the contacts" : `⟳ Pull Gmail with ${contactEmail}`}
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

/** One door for editor pictures — uploads through opp-attach, lands in the
 *  record's store AND the Drive archive, returns the login-gated URL. */
export async function uploadEditorImage(fd: FormData): Promise<string> {
  const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Upload failed");
  return String(j.url);
}

export 
/* ══════════════════════════════════════════════════════════════════════════
   WHERE THIS CAME FROM, AND WHEN

   Dr Raghu, 16 Sep 2026: "this also doesn't tell me where it was added from
   and when! show all that in notes."

   All of it was already written down and none of it was shown. A person
   carries the day they were made; every list carries the FILE that put them
   there and the day it did; a scanned card and a meeting carry their own
   dates. Four hundred exhibitor books went in this week, and without this a
   name is a name with no history — which is the state the whole import was
   meant to rescue it from.

   Nothing here is computed. It is the record's own history, read back.
   ══════════════════════════════════════════════════════════════════════ */
type Prov = {
  created_at: string; created_by: string | null; source: string | null;
  lists: { list: string; source: string | null; added_at: string; by: string | null }[];
  cards: { at: string; by: string }[];
  met: { at: string; event: string | null; context: string | null }[];
};

function WhereFrom({ type, id }: { type: string; id: string }) {
  const [p, setP] = useState<Prov | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/crm/provenance?type=${type}&id=${id}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(String(j.error || r.status)); setP(j); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [type, id]);
  const day = (v: string) => (v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  if (err) return null;
  if (!p) return <div className="text-xs" style={{ color: "var(--muted)" }}>reading its history…</div>;
  return (
    <div className="rounded border p-2 mb-3" style={{ borderColor: "var(--line)", background: "#FAFBFD" }}>
      <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: .8 }}>WHERE THIS CAME FROM</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        <div>Made <b>{day(p.created_at)}</b>{p.created_by ? <> by {p.created_by.split("@")[0]}</> : null}{p.source ? <> · source <b>{p.source}</b></> : null}</div>
        {p.lists.map((l, i) => (
          <div key={i}>
            On <b>{l.list}</b>{l.source ? <> from the file <b>{l.source}</b></> : <> <span style={{ color: "var(--muted)" }}>(the file was not recorded — added before Genie kept that)</span></>} · {day(l.added_at)}
          </div>
        ))}
        {p.cards.map((c, i) => <div key={"c" + i}>A visiting card was scanned <b>{day(c.at)}</b> by {String(c.by).split("@")[0]}</div>)}
        {p.met.map((m, i) => (
          <div key={"m" + i}>Met <b>{day(m.at)}</b>{m.event ? <> at <b>{m.event}</b></> : null}{m.context ? <span style={{ color: "var(--muted)" }}> — {m.context.slice(0, 120)}</span> : null}</div>
        ))}
        {!p.lists.length && !p.cards.length && !p.met.length && (
          <div style={{ color: "var(--muted)" }}>Not on any list, no card scanned, no meeting recorded. It was typed straight in.</div>
        )}
      </div>
    </div>
  );
}

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
            onSave={(html) => { setText(html); void saveRich(html); }}
            onUploadImage={async (f) => { const fd = new FormData(); fd.set("target_type", type); fd.set("target_id", id); fd.set("file", f); return uploadEditorImage(fd); }} />
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
          <div className="text-sm mt-0.5" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}><RichContent text={n.body} thumbs legacy={(s2) => <RichText text={s2} />} /></div>
        </div>
      ))}
    </div>
  );
}

/** The Genie tab: Claude's read on the record, on demand — same voice as the
 *  Job Plan's brief, never asked to invent a number. */
export function GenieTab({ type, id }: { type: string; id: string }) {
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
export function mdToEditorHtml(md: string): string {
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

export function editorHtmlToMd(h: string): string {
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

export function RichEditor({ initial, onSave, onCancel, busy }: { initial: string; onSave: (md: string) => void; onCancel: () => void; busy: boolean }) {
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
          className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--green)" }}>
          {busy ? "Saving…" : "✓ Save"}
        </button>
        <button onClick={onCancel} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
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
export function EnquiryInfoTab({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const rid = String(row.id);
  const [text, setText] = useState(String(row.enquiry_info ?? ""));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // the stored brief opens already written — asked once, kept on the record
  const [brief, setBrief] = useState(String(row.genie_brief ?? ""));
  useEffect(() => { setText(String(row.enquiry_info ?? "")); setEditing(false); setBrief(String(row.genie_brief ?? "")); setMsg(""); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

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
              className="text-xs rounded border px-1.5 py-0.5 font-bold" style={{ borderColor: BORDER, color: "var(--dim)", background: "#fff" }}>✎</button>
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
              className="text-xs rounded border px-2 py-0.5 font-bold" style={{ borderColor: "var(--green)", color: "var(--green)", background: "#fff" }}>
              {busy === "erp" ? "Walking it over…" : "⬆ Push to ERP"}
            </button>
          ) : (
            <span className="text-xs rounded px-2 py-0.5" style={{ background: "#E6F4EA", color: "var(--green)", fontWeight: 700 }}
              title={String(row.erp_opportunity_name || row.opportunity_no)}>✓ in ERP</span>
          )}
          {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
        </div>
        {editing ? (
          <RichTextEditor initial={draft} busy={busy === "save"} onCancel={() => setEditing(false)} onSave={(html) => void save(html)} placeholder="The enquiry, as it should look."
              onUploadImage={async (f) => { const fd = new FormData(); fd.set("opportunity_id", rid); fd.set("file", f); return uploadEditorImage(fd); }} />
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
          <div className="text-xs mb-2" style={{ color: "var(--dim)", lineHeight: 1.5 }}>
            Checks the customer, the contact and the enquiry — have we done this before, what is the relation
            with the customer, what is the scope in the industry. A quick read of the CRM record, no web.
          </div>
          {brief
            ? <div className="rounded bg-white border p-3 text-sm" style={{ borderColor: "var(--line)", lineHeight: 1.6, maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}><RichText text={brief} /></div>
            : busy === "genie"
              ? <div className="text-xs py-4 text-center" style={{ color: MUTED }}>Opus is reading the customer, the history and the enquiry…</div>
              : null}
        </div>
      </div>
    </div>
  );
}

export function OppEnquiryTab({ oppId }: { oppId: string | null }) {
  const [text, setText] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [briefAt, setBriefAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setBrief(""); setBriefAt(""); setErr("");
    if (!oppId) { setText(""); return; }
    fetch(`/api/crm/opportunity?id=${encodeURIComponent(oppId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setText(String(j?.row?.enquiry_info ?? ""));
        // the brief Genie wrote ON THE OPPORTUNITY, shown — never re-run
        // from here (Dr Raghu, 30 Aug 2026)
        setBrief(String(j?.row?.genie_brief ?? ""));
        setBriefAt(String(j?.row?.genie_brief_at ?? ""));
      })
      .catch(() => setText(""));
  }, [oppId]);
  // the same quick Opus read the opportunity has — pulled up onto the quote
  // (Dr Raghu, 30 Aug 2026: "in enquiry info pull up all the genie content")
  const askGenie = async () => {
    if (!oppId) return;
    setBusy(true); setErr(""); setBrief("");
    try {
      const r = await fetch("/api/crm/opp-brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: oppId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Genie could not answer");
      setBrief(String(j.brief || ""));
      setBriefAt(String(j.at || new Date().toISOString()));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4">
      <div className="flex gap-3 flex-wrap" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 420px", minWidth: 320 }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>FROM THE OPPORTUNITY — always its current text, never a copy</div>
          <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "calc(100vh - 380px)", overflowY: "auto", overflowWrap: "anywhere" }}>
            {text === null ? <span style={{ color: MUTED }}>reading…</span>
              : text.trim() ? <RichText text={text} />
              : <span style={{ color: MUTED }}>The opportunity holds no enquiry text.</span>}
          </div>
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 300 }}>
          <div className="rounded-lg border p-3" style={{ borderColor: "#D9CFF2", background: "#FBFAFE", borderTop: "3px solid #7C3AED" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold" style={{ color: "#7C3AED", letterSpacing: 0.8 }}>✨ GENIE&apos;S BRIEF — from the opportunity</span>
              {!brief && (
                <button onClick={() => void askGenie()} disabled={busy || !oppId}
                  className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: busy ? "#B9BEC4" : "#7C3AED" }}>
                  {busy ? "Reading the record…" : "Write it once"}
                </button>
              )}
            </div>
            {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
            {brief ? (
              <>
                {briefAt && <div className="text-xs mb-1.5" style={{ color: MUTED }}>written {briefAt.slice(0, 10).split("-").reverse().join("/")} on the opportunity — Ask Genie there to refresh it</div>}
                <div className="rounded bg-white border p-3 text-sm" style={{ borderColor: "var(--line)", lineHeight: 1.6, maxHeight: "calc(100vh - 460px)", overflowY: "auto" }}><RichText text={brief} /></div>
              </>
            ) : !busy && (
              <div className="text-xs" style={{ color: "var(--dim)", lineHeight: 1.5 }}>
                The opportunity has no Genie brief yet — one click writes it there once, and every quote from it shows the same brief.
              </div>
            )}
          </div>
        </div>
      </div>
      {oppId && <div className="mt-3"><BanttcEditor oppId={oppId} /></div>}
    </div>
  );
}

/** BANTTC, edited in place (Dr Raghu, 30 Aug 2026: "BANTTC can be edited
 *  regularly") — every % is a dropdown that saves onto the OPPORTUNITY the
 *  moment it changes; quote and opportunity read the same numbers. */
export function BanttcEditor({ oppId, initial, onSaved }: { oppId: string; initial?: Row; onSaved?: (r: Row) => void }) {
  const [row, setRow] = useState<Row | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (initial) { setRow(initial); return; }
    fetch(`/api/crm/opportunity?id=${encodeURIComponent(oppId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setRow((j?.row ?? null) as Row | null))
      .catch(() => setRow(null));
  }, [oppId, initial]);
  const setPct = async (name: string, v: string) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/opportunity?id=${encodeURIComponent(oppId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ [name]: v === "" ? null : Number(v) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      setRow(j.row as Row); onSaved?.(j.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  if (!row) return <div className="text-xs" style={{ color: MUTED }}>reading BANTTC…</div>;
  const score = (() => {
    let sum = 0, den = 0;
    for (const b of BANTTC) {
      const v = row[b.name];
      if (v === null || v === undefined || v === "") continue;
      sum += Number(v) * b.w; den += b.w;
    }
    return den > 0 ? Math.round(sum / den) : null;
  })();
  return (
    <div>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>
        BANTTC — edits save instantly {busy && <span style={{ fontWeight: 500 }}>· saving…</span>}
        {err && <span className="ml-2 font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="genie-table" style={{ borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr>
            {BANTTC.map((b) => (
              <th key={b.name} style={{ textAlign: "center", padding: "4px 10px", fontSize: 11, color: MUTED, borderBottom: `2px solid ${BORDER}`, whiteSpace: "nowrap" }}>
                {b.label}{b.w > 1 && <span style={{ color: ORANGE }}> ×{b.w}</span>}
              </th>
            ))}
            <th style={{ textAlign: "center", padding: "4px 10px", fontSize: 11, color: NAVY, borderBottom: `2px solid ${BORDER}`, fontWeight: 800 }}>SCORE</th>
          </tr></thead>
          <tbody><tr>
            {BANTTC.map((b) => (
              <td key={b.name} style={{ textAlign: "center", padding: "6px 10px" }}>
                <select value={row[b.name] === null || row[b.name] === undefined ? "" : String(row[b.name])} disabled={busy}
                  onChange={(e) => void setPct(b.name, e.target.value)}
                  className="tnum rounded border px-1 py-0.5" style={{ borderColor: BORDER, fontSize: 14, fontWeight: 700, background: "#fff" }}>
                  <option value="">—</option>
                  {[0, 10, 25, 50, 75, 90, 100].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </td>
            ))}
            <td className="tnum" style={{ textAlign: "center", padding: "6px 10px", fontWeight: 800, fontSize: 17,
              color: score === null ? MUTED : score >= 60 ? "#1A7F4E" : score >= 35 ? "#B45309" : "#C0392B" }}>
              {score === null ? "—" : `${score}%`}
            </td>
          </tr></tbody>
        </table>
      </div>
    </div>
  );
}

export function MergeTab({
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
export function PersonTypeAhead({
  value, valueLabel, companyId, opportunityId, onPick,
}: {
  value: string; valueLabel: string; companyId?: string;
  /** A deal carries no company of its own — the picker borrows the
   *  opportunity's, and PREFERS its people rather than restricting to them
   *  (Dr Raghu, 31 Aug 2026: "first show the contacts of the company"). A
   *  deal's people genuinely can come from elsewhere — a consultant, a PMC —
   *  so this must sort, never exclude. */
  opportunityId?: string;
  onPick: (id: string, label: string) => void;
}) {
  const [preferCo, setPreferCo] = useState("");
  useEffect(() => {
    if (!opportunityId || companyId) { setPreferCo(""); return; }
    let dead = false;
    fetch(`/api/crm/opportunity?id=${encodeURIComponent(opportunityId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!dead) setPreferCo(String(j?.row?.company_id ?? "")); })
      .catch(() => { /* the picker still works unsorted */ });
    return () => { dead = true; };
  }, [opportunityId, companyId]);
  const [text, setText] = useState(valueLabel);
  const [options, setOptions] = useState<{ id: string; label: string; hint?: string }[]>([]);
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
      const f = companyId
        ? `&f_company_id=${encodeURIComponent(companyId)}`
        : preferCo ? `&prefer_company=${encodeURIComponent(preferCo)}` : "";
      fetch(`/api/crm/person?pick=${encodeURIComponent(text)}${f}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setOptions(j.options ?? []))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, companyId, preferCo]);

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
      onPick(String(j.row.id), name);
      setOpen(false);
    } catch (e) { swallow("crm/CrmApp", e); /* the field keeps the typed text; picking again retries */ }
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
        onChange={(e) => { setText(e.target.value); setOpen(true); if (e.target.value === "") onPick("", ""); }}
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
              onMouseDown={(e) => { e.preventDefault(); onPick(o.id, o.label); setText(o.label); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-sm"
              style={{ color: INK }}
            >
              {o.label}
              {/* the organization, so three namesakes are three people
                  (Dr Raghu, 31 Aug 2026) */}
              {o.hint && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.35 }}>{o.hint}</div>}
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
export const BANTTC: { name: string; label: string; w: number }[] = [
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
export function RecordForm({
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
        // default: "end_next_month" = the LAST DATE OF NEXT MONTH — a
        // quote's valid-until (Dr Raghu, 30 Aug 2026)
        if (f.type === "date" && f.default === "end_next_month") {
          const n = new Date(Date.now() + 330 * 60000);
          dv = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
        }
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

  // a quote line that picks a product starts from the APPROVED price
  // (Dr Raghu, 30 Aug 2026: "when choosing quote this will come by default")
  const pricedProduct = useRef<string>("");
  const productPick = dt.name === "quotation_line" ? String(form.product_id ?? "") : "";
  useEffect(() => {
    if (!productPick || productPick === pricedProduct.current) return;
    pricedProduct.current = productPick;
    void (async () => {
      try {
        const j = await (await fetch(`/api/crm/product?id=${encodeURIComponent(productPick)}`, { cache: "no-store" })).json();
        const p = j?.row as Row | undefined;
        if (!p) return;
        setForm((f) => ({
          ...f,
          ...(String(f.unit_price ?? "") === "" && p.approved_price_inr != null ? { unit_price: String(p.approved_price_inr) } : {}),
          ...(String(f.description ?? "") === "" && p.name ? { description: String(p.name) } : {}),
        }));
      } catch (e) { swallow("crm/CrmApp", e); /* the hand can still type a price */ }
    })();
  }, [productPick]);

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
                <span style={{ color: "var(--dim)" }}>{f.label}</span>
              </label>
            ) : f.type === "textarea" && f.rich ? (
              /* the COMMON rich editor, live — an HTML page, not raw markup
                 (Dr Raghu, 30 Aug 2026: "we need to have an HTML page here") */
              <RichTextEditor live initial={String(form[f.name] ?? "")}
                onChangeHtml={(v) => set(f.name, v)} minHeight={f.big ? 220 : 130} />
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
            ) : f.type === "link" && f.link === "address" ? (
              <AddressSelect
                companyId={String(form.company_id ?? "")}
                value={String(form[f.name] ?? "")}
                onPick={(id) => set(f.name, id)}
              />
            ) : f.personText ? (
              /* SPOKE WITH COMES FROM THE DATABASE TOO (Dr Raghu, 8 Sep 2026:
                 "in interaction, please make these two persons from the
                 database, and also make it suitable to add to the database").
                 Person already searched and could create; Spoke with was a
                 free box beside it, so the same man was typed one way here and
                 picked another way there. It is the same picker now — and
                 choosing somebody fills BOTH: the name into this column, and
                 the person into person_id, so the interaction is joined to a
                 real contact rather than to a spelling. A name nobody in the
                 database has can still be created from the same box. */
              <PersonTypeAhead
                value={String(form["person_id"] ?? "")}
                valueLabel={String(form[f.name] ?? "")}
                companyId={String(form["company_id"] ?? "") || undefined}
                opportunityId={String(form["opportunity_id"] ?? "") || undefined}
                onPick={(id, label) => { set(f.name, label); set("person_id", id); }}
              />
            ) : f.type === "link" && f.link === "person" ? (
              <PersonTypeAhead
                value={String(form[f.name] ?? "")}
                valueLabel={(links.person || []).find((o) => o.id === String(form[f.name] ?? ""))?.label ?? ""}
                companyId={String(form["company_id"] ?? "") || undefined}
                opportunityId={String(form["opportunity_id"] ?? "") || undefined}
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
            ) : f.type === "money" ? (
              <MoneyBox
                value={form[f.name]}
                onChange={(raw) => set(f.name, raw)}
                className="w-full px-2 py-1.5 rounded text-sm border tnum"
                style={{ borderColor: BORDER }}
              />
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER }}
              />
            )}

            {f.help && (
              <div className="text-xs mt-1" style={{ color: "#A6AEB6", lineHeight: 1.45 }}>{f.help}</div>
            )}

            {/* Under a template's body: what may be typed into it. The list
                is read from the code that fills the variables rather than
                written out here, which is how it came to be missing what it
                needed and to omit half of what exists (Dr Raghu, 31 Aug
                2026). */}
            {f.name === "body" && (dt.name === "email_template" || dt.name === "whatsapp_template") && (
              <div className="mt-1.5"><VariableHelp compact /></div>
            )}
          </label>
        ))}
      </div>

      {isDeal && (tabKey === undefined || tabKey === "qual") && (
        <div className="mb-3" style={{ overflowX: "auto" }}>
          <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 0.8 }}>
            BANTTC
          </div>
          <table className="genie-table" style={{ borderCollapse: "collapse", minWidth: 640 }}>
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

/** IFS — the InstaFinancials InstaSummary on a company (Dr Raghu, 30 Aug
 *  2026). Bought by Raghu's hand alone (75 credits a pull), read by all:
 *  the MCA profile, seven years of financials, directors, charges and
 *  credit ratings. */
export function IfsTab({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const rid = String(row.id ?? "");
  const isRaghu = MY_EMAIL === "raghu@nandan.co.in";
  const [cin, setCin] = useState(String(row.cin ?? ""));
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<{ cin: string; name: string }[]>([]);
  const [err, setErr] = useState("");
  const findCin = async () => {
    setFinding(true); setErr(""); setCandidates([]);
    try {
      const r = await fetch("/api/crm/ifs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: rid, action: "find_cin" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "GetCIN failed");
      const cands = (j.candidates ?? []) as { cin: string; name: string }[];
      if (cands.length === 1) setCin(cands[0].cin);
      else setCandidates(cands);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setFinding(false); }
  };
  const data = (row.ifs_summary as { InstaSummary?: Record<string, unknown> } | null)?.InstaSummary;

  const buy = async () => {
    if (!window.confirm(`Buy the InstaFinancials summary for ${String(row.name)}?\n\n75 INSTAFINANCIALS CREDITS WILL BE CONSUMED.`)) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/ifs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: rid, cin: cin.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The buy failed");
      const rr = await (await fetch(`/api/crm/company?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
      if (rr?.row) onSaved(rr.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const V = (v: unknown) => {
    const s2 = String(v ?? "");
    return !s2 || s2 === "null" ? "—" : s2;
  };
  const crn = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    if (!n) return "—";
    return n >= 1e7 ? `₹ ${(n / 1e7).toFixed(1)} Cr` : `₹ ${Math.round(n).toLocaleString("en-IN")}`;
  };
  const master = (data?.CompanyMasterSummary ?? null) as Record<string, unknown> | null;
  const fy = ((data?.FinancialsSummary as { FinancialsYearWise?: Record<string, unknown>[] } | undefined)?.FinancialsYearWise ?? []) as Record<string, unknown>[];
  const dirs = (((data?.DirectorSignatoryMasterSummary as Record<string, unknown> | undefined)?.DirectorCurrentMasterSummary as { Director?: Record<string, unknown>[] } | undefined)?.Director ?? []) as Record<string, unknown>[];
  const ratings = (((data?.CreditRatingDetail as Record<string, unknown> | undefined)?.CreditRating ?? []) as Record<string, unknown>[]).slice(0, 8);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm font-bold" style={{ color: NAVY }}>₹ InstaFinancials Summary</span>
        {row.ifs_at != null && <span className="text-xs" style={{ color: MUTED }}>bought {String(row.ifs_at).slice(0, 10).split("-").reverse().join("/")} by {String(row.ifs_by ?? "")}</span>}
        {!!row.cin && <span className="tnum text-xs font-bold rounded px-1.5" style={{ background: "#EEF1FA", color: NAVY }} title="Corporate Identification Number">CIN {String(row.cin)}</span>}
        {row.ifs_source === "pdf" && <span className="text-xs" style={{ color: MUTED }}>· read from the Drive report</span>}
        {row.ifs_pdf != null && String(row.ifs_pdf) && (
          row.ifs_pdf_url
            ? <a href={String(row.ifs_pdf_url)} target="_blank" rel="noreferrer" className="text-xs hover:underline" title={String(row.ifs_pdf)} style={{ color: "#2C5B82", fontWeight: 600 }}>
                📄 report PDF on Drive: {String(row.ifs_pdf).split("/").pop()} ↗
              </a>
            : <span className="text-xs" title={String(row.ifs_pdf)} style={{ color: "#2C5B82" }}>📄 report PDF on Drive: {String(row.ifs_pdf).split("/").pop()} <i style={{ color: MUTED }}>(scan the folder to link it)</i></span>
        )}
        {isRaghu ? (
          <>
            <input value={cin} onChange={(e) => setCin(e.target.value)} placeholder="CIN (21 characters)"
              className="px-2 py-1 rounded border text-xs tnum" style={{ borderColor: BORDER, width: 220 }} />
            <button onClick={() => void findCin()} disabled={finding || busy}
              title="GetCIN by company name — 1 InstaFinancials credit (toggle GetCIN Active on instafinancials.com first)"
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#EEF3F8", color: NAVY, border: "1px solid #C9D6E2" }}>
              {finding ? "Searching…" : "🔍 Find CIN (1 credit)"}
            </button>
            <button onClick={() => void buy()} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: busy ? "#B9BEC4" : "var(--green)" }}>
              {busy ? "Buying…" : data ? "🪙 Buy fresh (75 credits)" : "🪙 Buy InstaFinancial Summary"}
            </button>
            {/* THE DRIVE ROAD (Dr Raghu, 4 Sep 2026: "when we have the
                instafinancials then pl put it here"). Read the report already
                in Drive instead of buying it again — 0 credits. Raghu's hand,
                like the buy. */}
            {!!row.ifs_pdf_id && (
              <button onClick={async () => {
                setBusy(true); setErr("");
                try {
                  const r = await fetch("/api/crm/ifs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: rid, action: "import_pdf" }) });
                  const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not read the report");
                  const rr = await (await fetch(`/api/crm/company?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
                  if (rr?.row) onSaved(rr.row as Row);
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                setBusy(false);
              }} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#2C5B82", color: "#fff" }}
                title="Read the Drive report into the summary and the CIN — no credits">
                {busy ? "Reading…" : data ? "⬇ Re-read from the Drive report" : "⬇ Import from the Drive report (0 credits)"}
              </button>
            )}
            <button onClick={async () => {
              setBusy(true); setErr("");
              try {
                const r = await fetch("/api/crm/ifs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: rid, action: "scan_drive" }) });
                const j = await r.json(); if (!r.ok) throw new Error(j.error || "Scan failed");
                window.alert(`Scanned ${j.pdfs} PDFs.\nLinked: ${j.linked.length}\nAmbiguous (not linked): ${j.ambiguous.length}\nNo company matched: ${j.unmatched.length}` + (j.ambiguous.length ? `\n\nAmbiguous:\n${j.ambiguous.slice(0, 8).map((a: { file: string; companies: string[] }) => `• ${a.file} → ${a.companies.join(" / ")}`).join("\n")}` : "") + (j.unmatched.length ? `\n\nUnmatched:\n${j.unmatched.slice(0, 12).map((f: string) => `• ${f}`).join("\n")}${j.unmatched.length > 12 ? `\n…and ${j.unmatched.length - 12} more` : ""}` : ""));
                const rr = await (await fetch(`/api/crm/company?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
                if (rr?.row) onSaved(rr.row as Row);
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              setBusy(false);
            }} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5 border" style={{ borderColor: "#2C5B82", color: "#2C5B82", background: "#fff" }}
              title="Match every PDF in the Drive folder 'All Instafinancial downloads' to its company — Raghu">
              🗂 Scan the Drive folder
            </button>
            <button onClick={async () => {
              if (!window.confirm("Read EVERY linked Drive report that has no summary yet — 25 at a time? Each costs one AI read, no InstaFinancials credits.")) return;
              setBusy(true); setErr("");
              try {
                const r = await fetch("/api/crm/ifs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: rid, action: "import_all" }) });
                const j = await r.json(); if (!r.ok) throw new Error(j.error || "Import failed");
                window.alert(`Read ${j.done.length} report(s).${j.failed.length ? `\nFailed ${j.failed.length}: ${j.failed.slice(0, 5).map((f: { name: string; error: string }) => `${f.name} — ${f.error}`).join("; ")}` : ""}\n${j.remaining} still to read — press again for the next batch.`);
                const rr = await (await fetch(`/api/crm/company?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
                if (rr?.row) onSaved(rr.row as Row);
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              setBusy(false);
            }} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5 border" style={{ borderColor: BORDER, color: MUTED, background: "#fff" }}
              title="Every company with a linked report and no summary — 25 per press, Raghu">
              ⬇ Import all linked reports
            </button>
          </>
        ) : !data && <span className="text-xs" style={{ color: MUTED }}>Only Dr Raghu can buy this summary — ask him.</span>}
        {err && <span className="text-xs font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
      </div>
      {candidates.length > 1 && (
        <div className="rounded border p-2.5 mb-3" style={{ borderColor: "#C9D6E2", background: "#F7FAFD" }}>
          <div className="text-xs font-bold mb-1" style={{ color: NAVY }}>GetCIN found more than one — pick the right company:</div>
          {candidates.map((c) => (
            <button key={c.cin} onClick={() => { setCin(c.cin); setCandidates([]); }}
              className="block text-left text-sm py-0.5" style={{ color: "#2C5B82" }}>
              <b className="tnum">{c.cin}</b>{c.name ? ` — ${c.name}` : ""}
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <div className="rounded p-6 text-sm" style={{ background: "#FAF9F5", border: `1px dashed ${BORDER}`, color: MUTED }}>
          No summary bought yet. It brings the MCA profile, seven years of financials, the directors, open charges and credit ratings — from instafinancials.com.
        </div>
      ) : (
        <>
          {master && (
            <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER }}>
              <div className="font-bold text-sm mb-2">{V(master.CompanyName)} <span className="tnum text-xs" style={{ color: MUTED }}>· {V(master.CompanyCIN)}</span></div>
              <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", fontSize: 13 }}>
                {([["MCA status", master.CompanyMcaStatus], ["Incorporated", master.CompanyDateOfInc], ["Class", master.CompanyClass],
                   ["Category", master.CompanySubCategory], ["Paid-up capital", crn(master.CompanyPaidUpCapital)], ["Authorised capital", crn(master.CompanyAuthCapital)],
                   ["Last AGM", master.CompanyLastAgmDate], ["Last balance sheet", master.CompanyLastBsDate], ["Email", master.CompanyEmail],
                   ["Industry", master.CompanyMcaIndustry], ["Registered address", master.CompanyFullAddress]] as const).map(([l, v]) => (
                  <div key={l}><div className="text-xs font-semibold" style={{ color: MUTED }}>{l}</div><div>{V(v)}</div></div>
                ))}
              </div>
            </div>
          )}
          {fy.length > 0 && (
            <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER, overflowX: "auto" }}>
              <div className="font-bold text-sm mb-2">Financials, year-wise</div>
              <table className="genie-table" style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
                <thead><tr style={{ textAlign: "right", color: MUTED, fontSize: 11 }}>
                  <th className="py-1 pr-4" style={{ textAlign: "left" }}>FY</th><th className="py-1 pr-4">TOTAL INCOME</th>
                  <th className="py-1 pr-4">EXPENSE</th><th className="py-1 pr-4">PBT</th><th className="py-1 pr-4">PAT</th><th className="py-1">NET WORTH</th></tr></thead>
                <tbody>
                  {fy.map((y) => (
                    <tr key={String(y.FinancialYear)} style={{ borderTop: `1px solid ${BORDER}`, textAlign: "right" }}>
                      <td className="py-1 pr-4 font-bold" style={{ textAlign: "left" }}>{V(y.FinancialYear)}</td>
                      <td className="py-1 pr-4 tnum">{crn(y.TotalIncome)}</td>
                      <td className="py-1 pr-4 tnum">{crn(y.TotalExpense)}</td>
                      <td className="py-1 pr-4 tnum">{crn(y.ProfitBeforeTax)}</td>
                      <td className="py-1 pr-4 tnum font-bold" style={{ color: Number(String(y.ProfitAfterTax).replace(/[^0-9.-]/g, "")) >= 0 ? "var(--green)" : "var(--red)" }}>{crn(y.ProfitAfterTax)}</td>
                      <td className="py-1 tnum">{crn(y.NetWorth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dirs.length > 0 && (
            <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER }}>
              <div className="font-bold text-sm mb-2">Current directors <span className="text-xs" style={{ color: MUTED }}>({dirs.length})</span></div>
              {dirs.map((d2) => {
                const email = String(d2.DirectorEmail ?? "") !== "null" ? String(d2.DirectorEmail ?? "") : "";
                const phone = String(d2.DirectorContactNo ?? "") !== "null" ? String(d2.DirectorContactNo ?? "") : "";
                const dob = String(d2.DirectorDateOfBirth ?? "") !== "null" ? String(d2.DirectorDateOfBirth ?? "") : "";
                return (
                  <div key={String(d2.DirectorDin)} className="text-sm py-1 flex gap-3 flex-wrap items-baseline" style={{ borderTop: `1px solid #F0F1F6` }}>
                    <b style={{ minWidth: 190 }}>{V(d2.DirectorName)}</b>
                    <span style={{ color: MUTED, minWidth: 120 }}>{V(d2.DirectorDesignation)}</span>
                    {email && <span style={{ color: "#2C5B82" }}>{email}</span>}
                    {phone && <span className="tnum">{phone}</span>}
                    {dob && <span className="text-xs" title="Date of birth — a birthday wish opens doors">🎂 {dob}</span>}
                    <span className="tnum text-xs" style={{ color: MUTED }}>DIN {V(d2.DirectorDin)}</span>
                    <button title="File this director as a contact of the company"
                      onClick={async () => {
                        try {
                          const r3 = await fetch("/api/crm/person", {
                            method: "POST", headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              first_name: String(d2.DirectorName ?? "").trim(),
                              job_title: String(d2.DirectorDesignation ?? "Director"),
                              primary_email: email || null, primary_phone: phone || null,
                              company_id: rid,
                            }),
                          });
                          const j3 = await r3.json();
                          if (!r3.ok) throw new Error(j3.error || "Could not file");
                          window.alert(`✓ ${d2.DirectorName} filed as a contact.`);
                          onSaved();
                        } catch (e3) { window.alert(e3 instanceof Error ? e3.message : String(e3)); }
                      }}
                      className="text-xs font-bold rounded border px-1.5 py-0.5" style={{ borderColor: BORDER, color: ORANGE, background: "#fff" }}>
                      ＋ contact
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {ratings.length > 0 && (
            <div className="rounded border p-3" style={{ borderColor: BORDER }}>
              <div className="font-bold text-sm mb-2">Credit ratings</div>
              {ratings.map((r2, i) => (
                <div key={i} className="text-sm py-0.5 flex gap-3 flex-wrap">
                  <b style={{ minWidth: 80 }}>{V(r2.RatingAgency)}</b>
                  <span>{V(r2.RatingAssigned)}</span>
                  <span style={{ color: MUTED }}>{V(r2.RatingInstrumentName)}</span>
                  <span className="text-xs" style={{ color: MUTED }}>{V(r2.RatingAssignedDate)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * THE MEETING, AS A PAGE (Dr Raghu, 4 Sep 2026: "make this visually more
 * appealing! the minutes is rich text. Recording make a tab so link can be
 * put and also an embed to play it live there").
 *
 * The generic grid drew a meeting as thirteen labelled cells and printed the
 * minutes as raw markup. A meeting reads as a page: the room and the deal at
 * the top; then four panes -- Minutes (rich text, saved on blur), Recording
 * (the Zoom link, the Drive copy, and the Drive copy PLAYING right here),
 * Zoom's summary, and the who/when. The Edit button above still opens every
 * field the old way.
 */
export function MeetingTab({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const rid = String(row.id ?? "");
  const [pane, setPane] = useState<"minutes" | "recording" | "summary" | "people">("minutes");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [zoomLink, setZoomLink] = useState(String(row.recording_url ?? ""));
  const [driveLink, setDriveLink] = useState(String(row.recording_drive_url ?? ""));
  useEffect(() => { setZoomLink(String(row.recording_url ?? "")); setDriveLink(String(row.recording_drive_url ?? "")); }, [row]);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/meeting?id=${encodeURIComponent(rid)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not save");
      onSaved(j.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const driveId = (u: string) => (/\/d\/([A-Za-z0-9_-]{10,})/.exec(u) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(u))?.[1] ?? null;
  const dId = driveId(driveLink);
  const attendees = (Array.isArray(row.attendees) ? row.attendees : []) as { name?: string; email?: string | null }[];
  const when = row.started_at ? new Date(String(row.started_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const Chip = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: BORDER, background: "#fff", minWidth: 150 }}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>{label}</div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: INK }}>{value}</div>
    </div>
  );
  const linkTo = (dtName: string, id: unknown, label: unknown) => id
    ? <a href={`/crm/${dtName}/${encodeURIComponent(String(id))}`} className="hover:underline" style={{ color: NAVY }}>{String(label || id)}</a>
    : <span style={{ color: "#C9CDD6" }}>not tagged</span>;
  const panes: [typeof pane, string][] = [["minutes", "📝 Minutes"], ["recording", "▶ Recording"], ["summary", "✨ Zoom summary"], ["people", "👥 Who & when"]];

  return (
    <div className="p-4">
      {/* the room and the deal, at a glance */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Chip label="When" value={when} />
        <Chip label="Minutes long" value={row.duration_min ? `${row.duration_min} min` : "—"} />
        <Chip label="Attendees" value={attendees.length ? attendees.map((a) => a.name || a.email).filter(Boolean).join(", ") : String(row.attendee_names || "—")} />
        <Chip label="Company" value={linkTo("company", row.company_id, row.company_id ? String((row as Record<string, unknown>).company_name || "") || "open" : "")} />
        <Chip label="Opportunity" value={linkTo("opportunity", row.opportunity_id, "open")} />
        <Chip label="Status" value={<span className="rounded px-1.5 font-bold" style={{ fontSize: 11, background: row.status === "done" ? "#E6F4EB" : row.status === "tagged" ? "#EEF1FA" : "#FFF7E6", color: row.status === "done" ? "#1A7F4E" : row.status === "tagged" ? NAVY : "#8A5B00" }}>{String(row.status || "new")}</span>} />
      </div>
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "var(--red)" }}>{err}</div>}

      <div className="flex gap-1 mb-3 flex-wrap">
        {panes.map(([k, l]) => (
          <button key={k} onClick={() => setPane(k)} className="rounded-full px-3 py-1 text-xs font-bold border"
            style={pane === k ? { background: NAVY, color: "#fff", borderColor: NAVY } : { color: NAVY, borderColor: BORDER, background: "#fff" }}>{l}</button>
        ))}
      </div>

      {pane === "minutes" && (
        <div className="rounded-lg border p-3" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: .5 }}>Minutes of meeting — your hand · saves when you click away</div>
          <RichTextEditor live initial={String(row.mom ?? "")} onChangeHtml={(v) => { if (v !== String(row.mom ?? "")) void patch({ mom: v }); }} minHeight={260} />
        </div>
      )}

      {pane === "recording" && (
        <div className="rounded-lg border p-3" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>Zoom link</div>
              <div className="flex gap-1 mt-1">
                <input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/rec/share/…" className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} />
                <button onClick={() => void patch({ recording_url: zoomLink || null })} disabled={busy} className="rounded px-2 text-xs font-bold text-white" style={{ background: NAVY }}>Save</button>
                {!!row.recording_url && <a href={String(row.recording_url)} target="_blank" rel="noreferrer" className="rounded px-2 text-xs font-bold border flex items-center" style={{ borderColor: BORDER, color: NAVY }}>open ↗</a>}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>Copy in Drive · Uploaded files / Zoom meetings</div>
              <div className="flex gap-1 mt-1">
                <input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/file/d/…" className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} />
                <button onClick={() => void patch({ recording_drive_url: driveLink || null })} disabled={busy} className="rounded px-2 text-xs font-bold text-white" style={{ background: NAVY }}>Save</button>
                {!!row.recording_drive_url && <a href={String(row.recording_drive_url)} target="_blank" rel="noreferrer" className="rounded px-2 text-xs font-bold border flex items-center" style={{ borderColor: BORDER, color: NAVY }}>open ↗</a>}
              </div>
              <div className="text-xs mt-1" style={{ color: MUTED }}>Zoom-born recordings are copied here by themselves, within the hour.</div>
            </div>
          </div>
          {/* PLAY IT HERE. Zoom's own share page refuses to be framed; the
              Drive copy plays inline, which is one more reason the copy exists. */}
          {dId ? (
            <div className="mt-3 rounded overflow-hidden border" style={{ borderColor: BORDER, background: "#000", aspectRatio: "16 / 9" }}>
              <iframe src={`https://drive.google.com/file/d/${dId}/preview`} allow="autoplay; fullscreen" style={{ width: "100%", height: "100%", border: 0 }} title="Recording" />
            </div>
          ) : (
            <div className="mt-3 rounded border p-6 text-center text-sm" style={{ borderColor: BORDER, color: MUTED, borderStyle: "dashed" }}>
              {row.recording_url ? "The recording plays here once its copy is in Drive — paste the Drive link above, or wait for the hourly copy." : "No recording on this meeting yet."}
            </div>
          )}
        </div>
      )}

      {pane === "summary" && (
        <div className="rounded-lg border p-3" style={{ borderColor: BORDER, background: "#FBFAFE" }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: .5 }}>Zoom AI Companion — as it came</div>
          {String(row.summary || "").trim()
            ? <div className="text-sm" style={{ color: INK, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{String(row.summary)}</div>
            : <div className="text-sm" style={{ color: MUTED }}>No summary from Zoom on this meeting.</div>}
          {Array.isArray(row.next_steps) && (row.next_steps as unknown[]).length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: .5 }}>Next steps Zoom heard</div>
              <ul className="text-sm mt-1" style={{ paddingLeft: 18, listStyle: "disc", color: INK, lineHeight: 1.6 }}>
                {(row.next_steps as unknown[]).map((x, i) => <li key={i}>{String(x)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {pane === "people" && (
        <div className="rounded-lg border p-3" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: .5 }}>In the room</div>
          {attendees.length ? (
            <table className="text-sm genie-table" style={{ borderCollapse: "collapse" }}>
              <tbody>{attendees.map((a, i) => (
                <tr key={i} style={{ borderTop: "1px solid #F2F4F8" }}>
                  <td className="py-1 pr-4 font-semibold" style={{ color: INK }}>{a.name || "—"}</td>
                  <td className="py-1 pr-4" style={{ color: MUTED }}>{a.email || ""}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="text-sm" style={{ color: MUTED }}>{String(row.attendee_names || "Nobody recorded.")}</div>}
          <div className="text-xs mt-3" style={{ color: MUTED }}>
            Host {String(row.host_email || "—")}{row.zoom_meeting_id ? ` · Zoom meeting ${String(row.zoom_meeting_id)}` : ""}{row.interaction_id ? " · on the deal's timeline as an interaction" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/** CONSULT RAGHU (Dr Raghu, 30 Aug 2026) — his advisory voice at every
 *  record. Greets by first name, asks before it advises, and grows sharper
 *  as the knowledgebase grows. Speak or type; 🎤 dictates. */
export function ConsultRaghuModal({ targetType, targetId, title, onClose }: {
  targetType: string; targetId: string; title: string; onClose: () => void;
}) {
  type M = { role: "user" | "assistant"; content: string; files?: { name: string }[] | null };
  const [msgs, setMsgs] = useState<M[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pend, setPend] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [msgs, busy]);

  const send = useCallback(async (text: string, cid: string | null, files?: { name: string; path: string }[]) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/consult", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: cid, target_type: targetType, target_id: targetId, message: text, files: files ?? [] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The chair went quiet");
      setChatId(String(j.chat_id));
      setMsgs((cur) => [...(cur ?? []), { role: "assistant", content: String(j.reply) }]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [targetType, targetId]);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const j = await (await fetch(`/api/crm/consult?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`, { cache: "no-store" })).json();
        if (dead) return;
        if (j.needsMigration) { setErr("Run CRM migration 0044 first — the chair is not built yet."); setMsgs([]); return; }
        const hist = ((j.messages ?? []) as M[]).filter((m) => !m.content.startsWith("(The salesperson has just sat down"));
        setMsgs(hist);
        setChatId(j.chat_id);
        if (!hist.length) void send("__open__", j.chat_id);
      } catch { if (!dead) setMsgs([]); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  const speak = () => {
    type SR = { new (): { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void } };
    const W = window as unknown as { webkitSpeechRecognition?: SR; SpeechRecognition?: SR };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) { setErr("This browser has no dictation — Chrome does."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Rec();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; setListening(true); rec.start();
  };

  const attach = async (f: File) => {
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("target_type", "consult"); fd.set("target_id", targetId); fd.set("file", f);
      const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      const path = new URLSearchParams(String(j.url).split("?")[1] || "").get("path") || "";
      setPend((p) => [...p, { name: f.name, path }]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setUploading(false); }
  };

  const submit = () => {
    const text = input.trim();
    if ((!text && !pend.length) || busy) return;
    const files = pend;
    setMsgs((cur) => [...(cur ?? []), { role: "user", content: text || `(Attached: ${files.map((f) => f.name).join(", ")})`, files }]);
    setInput(""); setPend([]);
    void send(text, chatId, files);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(460px, 100%)", height: "min(680px, calc(100vh - 32px))", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.4)" }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/consult-raghu.png" alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.4)" }} />
          <div style={{ minWidth: 0 }}>
            <div className="text-white font-bold" style={{ fontSize: 15 }}>Consult Dr Raghu</div>
            <div className="text-xs" style={{ color: "#C8D2DC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white font-bold px-2">✕</button>
        </div>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, background: "#FAF9F5" }}>
          {msgs === null && <div className="text-sm" style={{ color: MUTED }}>taking the chair…</div>}
          {(msgs ?? []).map((m, i) => (
            <div key={i} className="mb-2.5 flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div className="rounded-lg px-3 py-2 text-sm" style={{
                maxWidth: "85%", lineHeight: 1.55, whiteSpace: "pre-wrap",
                background: m.role === "user" ? NAVY : "#fff",
                color: m.role === "user" ? "#fff" : INK,
                border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
              }}>
                {m.content}
                {!!m.files?.length && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {m.files.map((f, k) => (
                      <span key={k} className="rounded px-1.5 py-0.5 text-xs" style={{ background: m.role === "user" ? "rgba(255,255,255,.18)" : "var(--line-soft)" }}>📎 {f.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs" style={{ color: MUTED }}>Raghu is thinking…</div>}
          {err && <div className="rounded p-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
        </div>
        {(pend.length > 0 || uploading) && (
          <div className="flex gap-1.5 flex-wrap px-2.5 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            {pend.map((f, i) => (
              <span key={i} className="rounded border px-2 py-0.5 text-xs flex items-center gap-1" style={{ borderColor: BORDER, background: "#FAF9F5" }}>
                📎 {f.name}
                <button onClick={() => setPend((p) => p.filter((_, k) => k !== i))} style={{ color: MUTED }}>✕</button>
              </span>
            ))}
            {uploading && <span className="text-xs" style={{ color: MUTED }}>uploading…</span>}
          </div>
        )}
        <div className="flex gap-1.5 items-end p-2.5" style={{ borderTop: pend.length > 0 || uploading ? "none" : `1px solid ${BORDER}` }}>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }}
            onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void attach(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} title="Attach a file — an email, a drawing, a PDF; Raghu reads images and PDFs himself"
            className="rounded px-2.5 py-2 text-sm" style={{ background: "var(--line-soft)" }}>📎</button>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Tell him what's on your mind… (Enter sends, Shift+Enter for a new line)"
            className="flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, resize: "none" }} />
          <button onClick={speak} title={listening ? "Stop dictating" : "Dictate — speak instead of typing"}
            className="rounded px-2.5 py-2 text-sm" style={{ background: listening ? "var(--red)" : "var(--line-soft)" }}>
            {listening ? "⏹" : "🎤"}
          </button>
          <button onClick={submit} disabled={busy || (!input.trim() && !pend.length)}
            className="rounded px-3 py-2 text-sm font-bold text-white" style={{ background: busy || (!input.trim() && !pend.length) ? "#B9BEC4" : ORANGE }}>
            ➤
          </button>
        </div>
        <div className="text-center pb-1.5" style={{ fontSize: 10, color: MUTED }}>
          His advice, your judgement — don&apos;t follow it blindly.
        </div>
      </div>
    </div>
  );
}

/** ORDER ITEMS (Dr Raghu, 30 Aug 2026) — the sales order's lines from the
 *  ERP, read-only: the order is a fact, not a draft. */
export function SoItemsTab({ id }: { id: string }) {
  type L = { line_no: number; description: string | null; item_group: string | null; quantity: number; uom: string | null; unit_price: number; amount: number };
  const [lines, setLines] = useState<L[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/crm/so-lines?so=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not read the items"); setLines(j.lines ?? []); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setLines([]); });
  }, [id]);
  const inr = (n: number) => Number(n).toLocaleString("en-IN");
  return (
    <div className="p-4" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {lines === null && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {lines !== null && lines.length === 0 && !err && <div className="text-sm" style={{ color: MUTED }}>No items on record for this order.</div>}
      {lines !== null && lines.length > 0 && (
        <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
            <th className="py-1 pr-3">SR</th><th className="py-1 pr-3">ITEM</th><th className="py-1 pr-3">GROUP</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>QTY</th><th className="py-1 pr-3">UOM</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>RATE</th><th className="py-1" style={{ textAlign: "right" }}>AMOUNT</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td className="py-1.5 pr-3 tnum">{l.line_no}</td>
                <td className="py-1.5 pr-3 font-semibold">{l.description ?? "—"}</td>
                <td className="py-1.5 pr-3" style={{ color: MUTED }}>{l.item_group ?? "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{inr(l.quantity)}</td>
                <td className="py-1.5 pr-3">{l.uom ?? "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>₹ {inr(l.unit_price)}</td>
                <td className="py-1.5 tnum" style={{ textAlign: "right", fontWeight: 700 }}>₹ {inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}