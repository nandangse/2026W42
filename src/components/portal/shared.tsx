"use client";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

/* ------------------------------------------------------------ the look --
   The portal is Nandan's face to a customer: the company navy and orange,
   paper behind, plain sans type. Nothing of Genie's own chrome — no module
   menu, no version badge — because the person reading it is not staff. */
export const P = {
  ink: "#22303c", navy: "#16232f", navyDark: "#0d161f", paper: "#f1efe9", card: "#ffffff", line: "#e2e0da", soft: "#f7f5ef",
  accent: "#e8600a", amber: "#f5b32b", red: "#b3261e", green: "#0d7a3f", blue: "#1b3a5c", muted: "#8a94a0", dim: "#5a6672",
};

export interface Org { slug: string; name: string; kind: "customer" | "supplier"; match_names: string[]; intro: string; logo_path: string | null; active: boolean }
export interface Me {
  id: string; email: string; name: string; role: string; org_slug: string | null; locations: string[]; via: "portal" | "genie"; must_change: boolean;
  staff: boolean; admin: boolean; all: boolean; commercials: boolean;
}
export interface Boot {
  me: Me; scope: { kind: "org" | "all" | "locations"; slug: string; locations: string[] }; org: Org | null;
  orgs: { slug: string; name: string; kind: string; active: boolean }[]; locations: { name: string }[]; tabs: string[]; today: string;
}
export interface PortalJob {
  id: string; job: string; project: string; so_no: string; po_no: string; po_date: string | null;
  customer: string; fam: string; engine_no: string; chassis_no: string; model: string; vehicle_type: string;
  tdd: string | null; otd: string | null; stat: string; pct: number; on_floor: boolean;
  delivered: boolean; delivered_on: string | null;
  vehicle_no: string; invoice_no: string; location: string; remarks: string; client_update: string | null;
  commercials?: { value: number | null; so_amount: number | null; advance: number | null; pay_on_delivery: number | null; amt_needed: number | null; pct_on: number | null; pct_30: number | null; pct_60: number | null; pct_90: number | null; gst: number | null };
}
export interface PortalIssue {
  id: string; title: string; customer: string; location: string; machine: string; status: string; job_number: string;
  issue_date: string | null; resolved_at: string | null; category: string; description: string; resolution: string;
}
export interface PortalPo {
  name: string; supplier: string; status: string; date: string | null; schedule: string | null; grand_total: number | null;
  per_received: number; per_billed: number; project: string;
  items: { item: string; qty: number | null; uom: string; rate: number | null; amount: number | null; received: number | null; schedule: string | null }[];
}
export interface Query { id: string; org_slug: string; job_id: string | null; subject: string; body: string; status: string; by_name: string; by_side: string; at: string; updated_at: string }
export interface Reply { id: string; query_id: string; body: string; by_name: string; by_side: string; internal: boolean; at: string }
export interface Content { id: string; kind: string; title: string; body: string; org_slug: string | null; audience: string; published: boolean; pinned: boolean; published_on: string | null; by: string | null; at: string; updated_at: string }

export const TABS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: "home", label: "Orders & jobs", icon: "🚚", blurb: "what is open, what is under delivery" },
  { key: "customers", label: "Customer portal", icon: "🏢", blurb: "the customers, and each one's Jobmaster" },
  { key: "rfqs", label: "RFQs", icon: "📝", blurb: "what Nandan wants quoted" },
  { key: "queries", label: "Query solver", icon: "💬", blurb: "ask, and read the answers" },
  { key: "commercials", label: "Commercials", icon: "₹", blurb: "values and payment terms" },
  { key: "previous", label: "Previous jobs", icon: "📜", blurb: "everything delivered" },
  { key: "issues", label: "Service calls & issues", icon: "🛠", blurb: "the tickets on your machines" },
  { key: "faq", label: "FAQs", icon: "❓", blurb: "the questions that come up" },
  { key: "newsletter", label: "Newsletters", icon: "📰", blurb: "news from Nandan" },
  { key: "advisory", label: "Advisories & bulletins", icon: "📣", blurb: "what you should know" },
  { key: "settings", label: "Settings & admin", icon: "⚙️", blurb: "organisations, people, locations" },
];

/* ------------------------------------------------------------- helpers */
export async function api<T = Record<string, unknown>>(path: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export function useBoot(slug: string | null): { boot: Boot | null; error: string | null; reload: () => void; notInstalled: boolean } {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notInstalled, setNI] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/portal/boot${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!live) return;
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); setNI(!!j.notInstalled); return; }
      setBoot(j as Boot); setError(null);
    }).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [n, slug]);
  return { boot, error, reload: () => setN((x) => x + 1), notInstalled };
}
/** A GET that re-runs when its URL changes; `reload` runs it again. */
export function useGet<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) { setData(null); setLoading(false); return; }
    let live = true; setLoading(true);
    fetch(url, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); setData(null); } else { setData(j as T); setError(null); }
      setLoading(false);
    }).catch((e) => { if (live) { setError(String(e)); setLoading(false); } });
    return () => { live = false; };
  }, [url, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dmy = (d?: string | null) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${Number(dd)} ${MON[Number(m) - 1]} ${y}`; };
export const inr = (n: number | null | undefined) => (n == null ? "" : "₹" + Math.round(n).toLocaleString("en-IN"));
export const lakh = (n: number | null | undefined) => (n == null ? "" : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : inr(n));
export const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export const btn = (kind: "primary" | "ghost" | "danger" = "primary", extra?: CSSProperties): CSSProperties => ({
  border: kind === "ghost" ? `1px solid ${P.line}` : "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  background: kind === "primary" ? P.accent : kind === "danger" ? P.red : "#fff", color: kind === "ghost" ? P.ink : "#fff", ...extra,
});
export const input: CSSProperties = { width: "100%", border: `1px solid ${P.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: P.ink, fontFamily: "inherit" };
export const label: CSSProperties = { display: "block", fontSize: 12, color: P.dim, marginBottom: 4, fontWeight: 600 };
export const pill = (bg: string, fg = "#fff"): CSSProperties => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" });
export const statusPill = (s: string) => {
  const k = s.toLowerCase();
  const bg = /closed|resolved|delivered|completed/.test(k) ? P.green : /open|pending|breakdown/.test(k) ? P.red : /answered|progress|waiting/.test(k) ? P.amber : P.muted;
  return <span style={pill(bg)}>{s || "—"}</span>;
};

export function Card({ title, right, children, style, pad = 16 }: { title?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <section style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: 12, padding: pad, boxShadow: "0 1px 2px rgba(34,48,60,.04)", ...style }}>
      {(title || right) && (
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          {title && <h2 style={{ margin: 0, fontSize: 16, color: P.navy, fontWeight: 700 }}>{title}</h2>}
          {right && <div style={{ fontSize: 12, color: P.muted, display: "flex", gap: 8, alignItems: "center" }}>{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => <div style={{ padding: "18px 6px", color: P.muted, fontSize: 13 }}>{children}</div>;
export const Loading = () => <div style={{ padding: 18, color: P.muted, fontSize: 13 }}>Loading…</div>;
export const Err = ({ e }: { e: string }) => <div style={{ padding: 12, color: P.red, fontSize: 13 }}>{e}</div>;
export const H1 = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <div className="portal-h1"><h1 style={{ fontSize: 22, margin: 0, color: P.navy }}>{children}</h1>{sub && <p style={{ color: P.dim, margin: "4px 0 0", fontSize: 13 }}>{sub}</p>}</div>
);
/** Every page prints: the browser's own PDF, with the chrome hidden by print CSS. */
export const PrintButton = () => <button onClick={() => window.print()} style={btn("ghost", { padding: "5px 10px", fontSize: 12 })} className="no-print" title="Print, or save as PDF">⎙ PDF</button>;

/* ------------------------------------------------- the sortable table --
   Frozen header, every column sorts on click, a search box that filters on
   every cell, numbers right-aligned. The same table on every portal page. */
export interface Col<T> { key: string; label: string; get: (r: T) => ReactNode; sort?: (r: T) => string | number | null; num?: boolean; width?: number | string }
export function Table<T>({ cols, rows, rowKey, onRow, search = true, maxHeight = "70vh", empty = "Nothing here yet." }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void; search?: boolean; maxHeight?: string | number; empty?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) => cols.some((c) => { const v = c.sort ? c.sort(r) : textOf(c.get(r)); return String(v ?? "").toLowerCase().includes(needle); }));
    }
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      if (c) {
        const val = (r: T) => (c.sort ? c.sort(r) : textOf(c.get(r)));
        out = [...out].sort((a, b) => { const x = val(a), y = val(b); if (x == null || x === "") return 1; if (y == null || y === "") return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
      }
    }
    return out;
  }, [rows, cols, q, sortKey, dir]);
  const click = (k: string) => { if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(1); } };
  return (
    <div>
      {search && rows.length > 8 && (
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input style={{ ...input, maxWidth: 320, padding: "6px 10px", fontSize: 13 }} placeholder="Search this table…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span style={{ fontSize: 12, color: P.muted }}>{shown.length} of {rows.length}</span>
        </div>
      )}
      <div className="genie-scroll" style={{ maxHeight, overflow: "auto", border: `1px solid ${P.line}`, borderRadius: 10 }}>
        <table className="genie-table portal-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>{cols.map((c) => (
              <th key={c.key} onClick={() => click(c.key)} style={{ position: "sticky", top: 0, zIndex: 2, background: P.navy, color: "#fff", textAlign: c.num ? "right" : "left", padding: "8px 10px", cursor: "pointer", whiteSpace: "nowrap", width: c.width, userSelect: "none" }} title="Sort">
                {c.label}{sortKey === c.key ? (dir === 1 ? " ▲" : " ▼") : ""}
              </th>))}</tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={cols.length} style={{ padding: 16, color: P.muted }}>{empty}</td></tr>}
            {shown.map((r) => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} style={{ cursor: onRow ? "pointer" : undefined }} className={onRow ? "portal-row" : undefined}>
                {cols.map((c) => <td key={c.key} className={c.num ? "num" : undefined} style={{ padding: "7px 10px", borderTop: `1px solid ${P.line}`, textAlign: c.num ? "right" : "left", verticalAlign: "top" }}>{c.get(r)}</td>)}
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function textOf(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  if (typeof n === "object" && "props" in (n as { props?: { children?: ReactNode } })) return textOf((n as { props: { children?: ReactNode } }).props.children);
  return "";
}

/* ------------------------------------------- a small markdown renderer --
   Headings, paragraphs, bold, italics, links, lists, pipe tables. Enough
   for an organisation's front page, an FAQ or a newsletter; no HTML in. */
export function Markdown({ text, small = false }: { text: string; small?: boolean }) {
  const blocks = parse(text || "");
  const fs = small ? 13 : 15;
  return (
    <div style={{ fontSize: fs, lineHeight: 1.55, color: P.ink }}>
      {blocks.map((b, i) => {
        if (b.t === "h") return b.n === 1 ? <h1 key={i} style={{ fontSize: 24, margin: "16px 0 8px", color: P.navy }}>{inline(b.s)}</h1> : b.n === 2 ? <h2 key={i} style={{ fontSize: 19, margin: "14px 0 6px", color: P.navy }}>{inline(b.s)}</h2> : <h3 key={i} style={{ fontSize: 16, margin: "12px 0 4px", color: P.navy }}>{inline(b.s)}</h3>;
        if (b.t === "ul") return <ul key={i} style={{ margin: "6px 0 10px", paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ margin: "2px 0" }}>{inline(it)}</li>)}</ul>;
        if (b.t === "ol") return <ol key={i} style={{ margin: "6px 0 10px", paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ margin: "2px 0" }}>{inline(it)}</li>)}</ol>;
        if (b.t === "table") return (
          <div key={i} className="genie-scroll" style={{ maxHeight: "none", margin: "8px 0 14px" }}>
            <table className="genie-table"><thead><tr>{b.head.map((h, j) => <th key={j} style={{ background: P.navy }}>{inline(h)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={/^[\d,.\s₹-]+$/.test(c) ? "num" : undefined}>{inline(c)}</td>)}</tr>)}</tbody></table>
          </div>);
        return b.t === "p" ? <p key={i} style={{ margin: "0 0 10px" }}>{inline(b.s)}</p> : null;
      })}
    </div>
  );
}
type Block = { t: "h"; n: number; s: string } | { t: "p"; s: string } | { t: "ul" | "ol"; items: string[] } | { t: "table"; head: string[]; rows: string[][] };
function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = []; let i = 0;
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { out.push({ t: "h", n: h[1].length, s: h[2] }); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = cells(l); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push({ t: "table", head, rows }); continue;
    }
    if (/^\s*[-*]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; } out.push({ t: "ul", items }); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; } out.push({ t: "ol", items }); continue; }
    const para: string[] = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\|/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push({ t: "p", s: para.join(" ") });
  }
  return out;
}
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g; let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    else { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!; out.push(<a key={k++} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: P.blue }}>{mm[1]}</a>); }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/* ------------------------------------------------------------- a drawer */
export function Drawer({ title, onClose, children, width = 560 }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,22,31,.35)", zIndex: 60 }} />
      <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: `min(${width}px, 100vw)`, background: P.card, zIndex: 61, boxShadow: "-12px 0 30px rgba(0,0,0,.2)", display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${P.line}`, background: P.soft }}>
          <div style={{ flex: 1, fontWeight: 700, color: P.navy, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={btn("ghost", { padding: "4px 10px" })} aria-label="Close">✕</button>
        </header>
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</div>
      </aside>
    </>
  );
}
export const Field = ({ k, v }: { k: string; v: ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, padding: "5px 0", borderBottom: `1px solid ${P.line}`, fontSize: 13 }}>
    <div style={{ color: P.dim }}>{k}</div><div style={{ color: P.ink }}>{v || <span style={{ color: P.muted }}>—</span>}</div>
  </div>
);
