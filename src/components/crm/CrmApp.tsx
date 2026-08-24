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
import { DOCTYPES, DOCTYPE_GROUPS, doctypeBySlug, type Doctype, type Field } from "@/crm/doctypes";

const PAPER = "#F1EFE9";
const NAVY = "#16232F";
const INK = "#22303C";
const MUTED = "#8A94A0";
const BORDER = "#E2E0DA";
const ORANGE = "#E8600A";
const PINNED_W = 180; // pinned columns take a fixed width so sticky offsets add up

type Row = Record<string, unknown>;
type Links = Record<string, { id: string; label: string }[]>;
/** What the lightbox is showing: possibly another doctype than the page. */
type ViewState = { dt: Doctype; row: Row; links: Links; mode: "view" | "edit" };

export default function CrmApp({
  email, displayName, version,
}: {
  email: string; displayName: string | null; version: string;
}) {
  const [slug, setSlug] = useState(DOCTYPES[0].name);
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

  const dt = useMemo(() => DOCTYPES.find((d) => d.name === slug) as Doctype, [slug]);

  // Switching doctype resets the working state and recalls its saved layout.
  useEffect(() => {
    setQ(""); setQLive(""); setFilters({}); setSort(null); setAdding(false);
    setColsOpen(false); setView(null);
    try {
      const c = localStorage.getItem(`crmCols.${slug}`);
      setCols(c ? (JSON.parse(c) as string[]) : null);
      setPin(Number(localStorage.getItem(`crmPin.${slug}`)) || 0);
    } catch { setCols(null); setPin(0); }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qLive), 300);
    return () => clearTimeout(t);
  }, [qLive]);

  const load = useCallback(async () => {
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
  const defaultCols = useMemo(() => dt.fields.filter((f) => f.inList).map((f) => f.name), [dt]);
  const visibleNames = cols ?? defaultCols;
  const visible = visibleNames
    .map((n) => dt.fields.find((f) => f.name === n))
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
  // finite set of answers. Free text already has the search box.
  const filterables = dt.fields.filter(
    (f) => f.type === "select" || f.type === "bool" || (f.type === "link" && f.link),
  );

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
      {/* ---------- header ---------- */}
      <header
        style={{ background: NAVY, position: "sticky", top: 0, zIndex: 40 }}
        className="px-4 py-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3">
            <div className="text-xs font-bold tracking-widest" style={{ color: ORANGE }}>
              NANDAN CRM
              <span
                title="One Genie version number, across every module — the CRM does not version on its own."
                style={{ background: ORANGE, color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6 }}
              >
                {version}
              </span>
            </div>
            <h1 className="text-white font-bold" style={{ fontSize: 17, lineHeight: 1.2 }}>
              {dt.plural}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs font-semibold" style={{ color: "#9FB0C0" }}>
              ← Genie
            </a>
            <span className="text-xs" style={{ color: "#6B7C8C" }}>
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
            width: 190, flexShrink: 0, borderRight: `1px solid ${BORDER}`,
            background: "#fff", minHeight: "calc(100vh - 46px)", position: "sticky", top: 46,
          }}
        >
          {DOCTYPE_GROUPS.map((g) => {
            const items = DOCTYPES.filter((d) => d.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-3">
                <div
                  className="text-xs font-bold px-2 mb-1"
                  style={{ color: MUTED, letterSpacing: 1.1 }}
                >
                  {g.toUpperCase()}
                </div>
                {items.map((d) => (
                  <button
                    key={d.name}
                    onClick={() => setSlug(d.name)}
                    className="w-full text-left px-2 py-1.5 rounded text-sm font-semibold flex items-center gap-2"
                    style={
                      d.name === slug
                        ? { background: NAVY, color: "#fff" }
                        : { color: "#5A6672", background: "transparent" }
                    }
                  >
                    <span style={{ opacity: 0.7, fontSize: 11 }}>{d.icon}</span>
                    {d.plural}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* ---------- the doctype ---------- */}
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
          {filterables.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>FILTER</span>
              {filterables.map((f) => (
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
            <RecordForm
              dt={dt}
              links={links}
              onDone={() => { setAdding(false); void load(); }}
            />
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
      </div>

      {view && (
        <RecordModal
          view={view}
          onClose={() => setView(null)}
          onEdit={() => setView({ ...view, mode: "edit" })}
          onSaved={() => { setView(null); void load(); }}
          onOpenLink={openLinked}
        />
      )}
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
  view: ViewState; onClose: () => void; onEdit: () => void; onSaved: () => void;
  onOpenLink: (target: string, id: string) => void;
}) {
  const { dt, row, links, mode } = view;
  const title = String(row[dt.titleField] ?? dt.label);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

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
        style={{ background: "#fff", width: "min(880px, 100%)", boxShadow: "0 12px 40px rgba(22,35,47,.35)" }}
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
              style={{ background: "#2B3B4A", color: "#C8D2DC" }}
            >
              ✕
            </button>
          </div>
        </div>

        {mode === "view" ? (
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
 * The add/edit form. Built from the registry, so it can never miss a field.
 * With `initial` it edits (PATCH); without, it adds (POST).
 */
function RecordForm({
  dt, links, initial, onDone,
}: {
  dt: Doctype; links: Links; initial?: Row; onDone: () => void;
}) {
  const editable = dt.fields.filter((f) => f.type !== "readonly");

  const blank = useMemo(() => {
    const o: Record<string, string | boolean> = {};
    for (const f of editable) {
      if (initial) {
        const v = initial[f.name];
        if (f.type === "bool") o[f.name] = v === true;
        else if (f.type === "date" && typeof v === "string") o[f.name] = v.slice(0, 10);
        else o[f.name] = v === null || v === undefined ? "" : String(v);
      } else {
        o[f.name] = (f.default as string | boolean) ?? (f.type === "bool" ? false : "");
      }
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dt, initial]);

  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setForm(blank), [blank]);

  const set = (name: string, v: string | boolean) => setForm((f) => ({ ...f, [name]: v }));

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
      onDone();
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
        {editable.map((f) => (
          <label key={f.name} className="block">
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
                rows={3}
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
