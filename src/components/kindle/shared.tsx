"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/* ------------------------------------------------------------ the look --
   Kindle is not Genie: warm paper, ember and amber, serif headings. The
   ten people who open it are entrepreneurs at a table, not staff at a
   machine, and the site should feel like the room. */
export const K = {
  ink: "#2a2420", paper: "#faf6ef", card: "#ffffff", line: "#e8e0d2", soft: "#f3ede2",
  ember: "#f26b1d", emberDark: "#b3331a", amber: "#f5b32b", muted: "#8a7f72", dim: "#5c5248",
  green: "#2f7d4a", red: "#b3261e", blue: "#2c4f7c", charcoal: "#1c1917",
};
export const serif: CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

export interface Member {
  id: string; email: string; name: string; short_name: string | null; company: string | null; sector: string | null;
  designation: string | null; phone: string | null; linkedin: string | null; city: string | null; birthday: string | null;
  stay_at: string | null; office_at: string | null; about: string | null; photo_path: string | null;
  roles: string[]; is_admin: boolean; active: boolean; joined_on: string | null; left_on: string | null; sort_order: number;
  last_login_at?: string | null; onboarded_at?: string | null;
}
export interface Meeting {
  id: string; meeting_on: string; date_exact: boolean; kind: string; title: string | null; venue: string | null;
  starts_at: string | null; ends_at: string | null; agenda: string | null; minutes: string | null; minutes_url: string | null;
  guru: string | null; presenters: string[]; status: string;
}
export interface Attendance { meeting_id: string; member_id: string; status: string; late_min: number; early_min: number; note: string | null }
export interface Fine { id: string; member_id: string; meeting_id: string | null; rule_code: string | null; amount: number; reason: string | null; levied_on: string; paid_on: string | null; paid_amount: number | null; waived: boolean }
export interface Family { id: string; member_id: string; relation: string; name: string; birthday: string | null; is_legal: boolean; mail_wishes: boolean }
export interface Participation { meetings: [number, number]; checkins: [number, number]; one21: [number, number]; feedback: [number, number]; ontime: [number, number]; score: number | null }
export interface Tally { present: number; absent: number; zoom: number; late: number; late_min: number; out_of: number; year_absent: number }
export interface Boot {
  me: { id: string; email: string; name: string; short_name: string | null; roles: string[]; is_admin: boolean; must_change: boolean; onboarded: boolean; admin: boolean; treasurer: boolean; via: string; photo_path: string | null };
  members: Member[]; family: Family[]; settings: Record<string, string>;
  constitution: { id: string; version: string; revised_on: string | null; passed_by: string[]; body: string; created_at: string } | null;
  meetings: Meeting[]; attendance: Attendance[]; fines: Fine[]; tally: Record<string, Tally>; due: Record<string, number>;
  next: Meeting | null; last: Meeting | null; birthdays: { who: string; of: string | null; on: string; relation: string }[]; today: string;
  /** 1.5.0 — each member's participation this calendar year, computed in boot */
  participation?: Record<string, Participation>;
}

export const ROLE_LABEL: Record<string, string> = { facilitator: "Facilitator", co_facilitator: "Co-facilitator", treasurer: "Treasurer", scribe: "Scribe", timekeeper: "Time keeper" };

/* ------------------------------------------------------------- helpers */
export async function api<T = Record<string, unknown>>(path: string, body?: Record<string, unknown>, init?: RequestInit): Promise<T> {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...init } : { cache: "no-store", ...init });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export function useBoot(): { boot: Boot | null; error: string | null; reload: () => void; notInstalled: boolean } {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notInstalled, setNI] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/kindle/boot", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!live) return;
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); setNI(!!j.notInstalled); return; }
      setBoot(j as Boot); setError(null);
    }).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [n]);
  return { boot, error, reload: () => setN((x) => x + 1), notInstalled };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dmy = (d?: string | null) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${Number(dd)} ${MON[Number(m) - 1]} ${y}`; };
export const monthYear = (d?: string | null) => { if (!d) return ""; const [y, m] = String(d).slice(0, 10).split("-"); return `${MON[Number(m) - 1]} ${y}`; };
export const dayName = (d: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00:00").getDay()];
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function Avatar({ m, size = 40 }: { m: Pick<Member, "name" | "photo_path">; size?: number }) {
  const [broken, setBroken] = useState(false);
  const bg = `hsl(${(m.name.charCodeAt(0) * 37 + m.name.length * 11) % 360} 45% 40%)`;
  if (m.photo_path && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/kindle/file?path=${encodeURIComponent(m.photo_path)}`} alt={m.name} width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none", border: `2px solid ${K.line}` }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.38, flex: "none", ...serif }}>{initials(m.name)}</div>;
}

export function Card({ title, right, children, style, pad = 16 }: { title?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <section style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: 14, padding: pad, boxShadow: "0 1px 2px rgba(42,36,32,.04)", ...style }}>
      {(title || right) && (
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          {title && <h2 style={{ margin: 0, fontSize: 17, ...serif, color: K.ink }}>{title}</h2>}
          {right && <div style={{ fontSize: 12, color: K.muted }}>{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
export const btn = (kind: "primary" | "ghost" | "danger" = "primary", extra?: CSSProperties): CSSProperties => ({
  border: kind === "ghost" ? `1px solid ${K.line}` : "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  background: kind === "primary" ? K.ember : kind === "danger" ? K.red : "#fff", color: kind === "ghost" ? K.ink : "#fff", ...extra,
});
export const input: CSSProperties = { width: "100%", border: `1px solid ${K.line}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, background: "#fff", color: K.ink, fontFamily: "inherit" };
export const label: CSSProperties = { display: "block", fontSize: 12, color: K.dim, marginBottom: 4, fontWeight: 600 };
export const pill = (bg: string, fg = "#fff"): CSSProperties => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 });

/* ------------------------------------------- a small markdown renderer --
   Headings, paragraphs, bold, italics, links, bullet and numbered lists,
   pipe tables. Enough for a constitution and a set of minutes; no HTML in,
   so nothing a member types can run. */
export function Markdown({ text, small = false }: { text: string; small?: boolean }) {
  const blocks = parse(text || "");
  const fs = small ? 13 : 15;
  return (
    <div style={{ fontSize: fs, lineHeight: 1.55, color: K.ink }}>
      {blocks.map((b, i) => {
        if (b.t === "h") return b.n === 1 ? <h1 key={i} style={{ ...serif, fontSize: 26, margin: "18px 0 8px" }}>{inline(b.s)}</h1> : b.n === 2 ? <h2 key={i} style={{ ...serif, fontSize: 20, margin: "22px 0 6px", color: K.emberDark }}>{inline(b.s)}</h2> : <h3 key={i} style={{ fontSize: 15, margin: "14px 0 4px" }}>{inline(b.s)}</h3>;
        if (b.t === "ul") return <ul key={i} style={{ margin: "6px 0 10px", paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ margin: "2px 0" }}>{inline(it)}</li>)}</ul>;
        if (b.t === "ol") return <ol key={i} style={{ margin: "6px 0 10px", paddingLeft: 22 }}>{b.items.map((it, j) => <li key={j} style={{ margin: "2px 0" }}>{inline(it)}</li>)}</ol>;
        if (b.t === "table") return (
          <div key={i} className="genie-scroll" style={{ maxHeight: "none", margin: "8px 0 14px" }}>
            <table className="genie-table"><thead><tr>{b.head.map((h, j) => <th key={j} style={{ background: K.charcoal }}>{inline(h)}</th>)}</tr></thead>
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
    else { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!; out.push(<a key={k++} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: K.blue }}>{mm[1]}</a>); }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
