"use client";
// split out of CrmApp.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import { useCallback, useEffect, useState } from "react";

import { type Doctype } from "@/crm/doctypes";

import { DateRangeBar, DEFAULT_RANGE, type DateRange } from "../DateRange";
import { BORDER, INK, Links, MUTED, NAVY, ORANGE, Row } from "./shared";

/** A named screen whose build is still ahead — it already wears the date bar
 *  every analytical screen shares, so the pattern is set. */
export function StubScreen({ label, blurb, dated }: { label: string; blurb: string; dated: boolean }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  return (
    <div>
      {dated && <DateRangeBar value={range} onChange={setRange} />}
      <div className="rounded p-6" style={{ background: "#fff", border: `1px dashed ${BORDER}`, maxWidth: "70ch" }}>
        <div className="font-bold mb-1" style={{ fontSize: 15 }}>{label}</div>
        <p className="text-sm" style={{ color: "var(--dim)", lineHeight: 1.6 }}>{blurb}</p>
      </div>
    </div>
  );
}

/** Does this value read as an address you can act on? */
export const isEmailish = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const isPhoneish = (v: unknown): v is string =>
  typeof v === "string" && !/^\d{4}-\d{2}-\d{2}/.test(v.trim()) &&
  /^\+?[\d\s()-]{8,18}$/.test(v.trim()) && /\d{8,}/.test(v.replace(/\D/g, ""));

/** ✉ 📞 💬 — click starts the mail, the call, the WhatsApp. */
export function ContactActions({ email, phone, compact, onCompose, onWa }: {
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
export function StageQuickEdit({ dtName, row, links, onChanged }: {
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
            className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: reason.trim().length > 3 ? BORDER : "var(--accent)" }} />
          <span className="flex gap-1.5 mt-1">
            <button onClick={() => void save(pending, reason.trim())} disabled={busy || reason.trim().length <= 3}
              className="rounded px-2 py-0.5 text-xs font-bold"
              style={{ background: reason.trim().length > 3 ? ORANGE : "#B9BEC4", color: "#fff" }}>
              Move to {labelOf(pending)}
            </button>
            <button onClick={() => { setPending(null); setReason(""); }} className="rounded px-2 py-0.5 text-xs font-bold border" style={{ borderColor: BORDER, color: "var(--dim)" }}>Cancel</button>
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
export function MultiFilter({ label, options, value, onChange }: {
  label: string; options: { id: string; label: string }[];
  value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // typing narrows the list; Enter ticks every match — multiple picks by
  // keyboard alone (Dr Raghu, 30 Aug 2026: "allow me to choose multiple by
  // typing too")
  const [q, setQ] = useState("");
  const chosen = new Set(value ? value.split(",") : []);
  const toggle = (id: string) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id); else n.add(id);
    onChange([...n].join(","));
  };
  const shown = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;
  const tickShown = () => {
    if (!shown.length) return;
    const n = new Set(chosen);
    for (const o of shown) n.add(o.id);
    onChange([...n].join(","));
    setQ("");
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
        style={{ borderColor: chosen.size ? ORANGE : BORDER, background: "#fff", color: chosen.size ? INK : "var(--dim)", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title} ▾
      </button>
      {open && (
        <>
          <div onClick={() => { setOpen(false); setQ(""); }} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div className="rounded border" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, background: "#fff", borderColor: BORDER, boxShadow: "0 8px 24px rgba(27,45,107,.18)", minWidth: 220, maxHeight: 320, overflowY: "auto", padding: 6 }}>
            <div className="flex items-center gap-3 px-1.5 pb-1.5 mb-1 text-xs font-bold" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <button onClick={() => onChange("")} style={{ color: NAVY }}>All</button>
              <button onClick={() => { if (q.trim()) tickShown(); else onChange(options.map((o) => o.id).join(",")); }} style={{ color: NAVY }}
                title={q.trim() ? "Tick every match" : "Tick every option"}>Every ✓</button>
              <button onClick={() => { setOpen(false); setQ(""); }} className="ml-auto" style={{ color: MUTED }}>✕</button>
            </div>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tickShown(); } if (e.key === "Escape") { setOpen(false); setQ(""); } }}
              placeholder="Type to find… Enter ticks all matches"
              className="w-full mb-1 px-1.5 py-1 rounded text-xs border"
              style={{ borderColor: BORDER, outline: "none" }}
            />
            {shown.length === 0 && (
              <div className="px-1.5 py-1 text-xs" style={{ color: MUTED }}>Nothing matches “{q.trim()}”.</div>
            )}
            {shown.map((o) => (
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

/* ============================== THE PRODUCT RECORD (Dr Raghu, 30 Aug 2026)
   Tabs: Basic (default, image on the right, a pencil next to each field,
   description full width as rich text) · Quotations · Pricing (the approved
   row leads and is the quote default) · Training (per product family) ·
   Notes · Merge. */

export const dIN = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * MONEY, GROUPED WHEREVER IT IS TYPED (Dr Raghu, 31 Aug 2026: "in quotation
 * show commas").
 *
 * The quote lines already grouped; the masters behind them did not, so an
 * approved price read "20000000" and nobody could tell two crore from twenty
 * lakh without counting zeros. These are the quote's own two helpers, lifted
 * up here so every money box in the CRM shares them: `groupIn` puts the
 * Indian grouping on, `ungroup` takes it off before the number is stored.
 *
 * A grouped box cannot be <input type="number"> — a browser refuses commas
 * there and simply shows nothing. So money boxes are text boxes with a
 * decimal keypad, which is what MoneyBox below is.
 */
export const groupIn = (raw: string): string => {
  if (!raw) return "";
  const [i, d] = String(raw).replace(/,/g, "").split(".");
  const n = Number(i);
  if (isNaN(n)) return raw;
  return n.toLocaleString("en-IN") + (d !== undefined ? "." + d : "");
};

export const ungroup = (v: string) => v.replace(/[^0-9.]/g, "");

/** A money box: grouped as you read it, plain digits stored. */
export function MoneyBox({ value, onChange, className, style, placeholder, onKeyDown, autoFocus }: {
  value: unknown;
  onChange: (raw: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={groupIn(String(value ?? ""))}
      onChange={(e) => onChange(ungroup(e.target.value))}
      onKeyDown={onKeyDown}
      className={className}
      style={{ textAlign: "right", ...style }}
    />
  );
}

export const money = (v: unknown, cur = "INR") =>
  v === null || v === undefined || v === "" ? "—"
    : `${cur === "USD" ? "$" : cur === "EUR" ? "€" : "₹"} ${Number(v).toLocaleString("en-IN")}`;

/** One line of the Basic tab: label, value, and the pencil that edits it. */
export function PencilField({ label, value, type = "text", options, display, onSave }: {
  label: string; value: unknown; type?: "text" | "number" | "select" | "money";
  options?: string[]; display?: (v: unknown) => React.ReactNode;
  onSave?: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const commit = async () => {
    if (!onSave) return;
    setBusy(true); setErr("");
    try { await onSave(v.trim()); setEditing(false); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{label}</div>
      {!editing ? (
        <div className="text-sm flex items-baseline gap-1.5" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
          <span>{display ? display(value) : (value === null || value === undefined || value === "" ? <span style={{ color: "#C7CCD2" }}>—</span> : String(value))}</span>
          {onSave && (
            <button title={`Edit ${label}`} onClick={() => { setV(value === null || value === undefined ? "" : String(value)); setEditing(true); }}
              style={{ fontSize: 12, opacity: 0.6 }}>✏️</button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {type === "select" ? (
            <select value={v} onChange={(e) => setV(e.target.value)} className="px-2 py-1 rounded text-sm border" style={{ borderColor: ORANGE, background: "#fff" }}>
              <option value="">—</option>
              {(options || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : type === "money" ? (
            <MoneyBox value={v} onChange={setV} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") setEditing(false); }}
              className="px-2 py-1 rounded text-sm border tnum" style={{ borderColor: ORANGE, width: 150 }} />
          ) : (
            <input value={v} onChange={(e) => setV(e.target.value)} autoFocus type={type === "number" ? "number" : "text"}
              onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") setEditing(false); }}
              className="px-2 py-1 rounded text-sm border" style={{ borderColor: ORANGE, width: type === "number" ? 130 : 200 }} />
          )}
          <button onClick={() => void commit()} disabled={busy} className="rounded px-2 py-1 text-xs font-bold text-white" style={{ background: "var(--green)" }}>{busy ? "…" : "✓"}</button>
          <button onClick={() => setEditing(false)} className="text-xs" style={{ color: MUTED }}>✕</button>
          {err && <span className="text-xs" style={{ color: "#8E2C20" }}>{err}</span>}
        </div>
      )}
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
export interface DateView { field: string; preset: string; from: string; to: string }

/** Where tags live (28 Aug 2026: "this will have the tags" — a quotation). */
export const TAGGABLE = ["company", "person", "opportunity", "quotation", "sales_order", "lead"];

export const DATE_PRESETS: [string, string][] = [
  ["all", "All time"],
  ["last7", "Last 7 Days"], ["last15", "Last 15 Days"], ["last30", "Last 30 Days"],
  ["thisWeek", "This Week"], ["lastWeek", "Last Week"], ["lastTwoWeeks", "Last Two Weeks"],
  ["thisMonth", "This Month"], ["lastMonth", "Last Month"], ["lastTwoMonths", "Last Two Months"],
  ["thisQuarter", "This Quarter"], ["lastQuarter", "Last Quarter"], ["lastTwoQuarters", "Last Two Quarters"],
  ["ytd", "This YTD"], ["lastFy", "Last FY"],
  ["gt", "Greater Than"], ["lt", "Less Than"], ["custom", "Custom"],
];

export function dateRangeOf(v: DateView): { from: string; to: string } {
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

export function DateViewBar({ dt, value, onChange }: { dt: Doctype; value: DateView; onChange: (v: DateView) => void }) {
  const dateFields = dt.fields.filter((f) => f.type === "date" && !f.virtual).map((f) => ({ name: f.name, label: f.label }));
  const fields = [...dateFields, { name: "created_at", label: "Created" }];
  const needsFrom = ["gt", "custom"].includes(value.preset);
  const needsTo = ["lt", "custom"].includes(value.preset);
  const active = value.preset !== "all";
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <select value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })}
        className="px-1.5 py-1.5 rounded text-sm border bg-white" style={{ borderColor: BORDER, color: "var(--dim)" }}>
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
export function TagStrip({ entity, id }: { entity: string; id: string }) {
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
    // several at once, comma-separated (Dr Raghu, 30 Aug 2026)
    const parts = name.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setText("");
    for (const n of parts) {
      await fetch("/api/crm/tags", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", entity, id, name: n }),
      });
    }
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
export function TagFilterBox({ value, onSet }: { value: string; onSet: (v: string) => void }) {
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