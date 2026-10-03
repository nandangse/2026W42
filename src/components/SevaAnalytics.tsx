"use client";

/**
 * TICKET ANALYTICS (Dr Raghu, 3 Oct 2026: "make an analytics page for this.
 * support tickets. Show graphs and tables that make sense of what's
 * happening. We should also be able to drill it down").
 *
 * One rule runs the page: EVERY NUMBER IS A FILTER. Click a bar, a row, a
 * month, an ageing band, and it becomes a chip at the top; the whole page
 * re-answers for that slice, down to the tickets behind it. Chips stack —
 * "Breakdown · Reliance · Rameez · this year" is three clicks — and each
 * has its ×. The server does the counting (api/seva/analytics); this file
 * only draws.
 *
 * The drawing keeps to the house rules for charts: thin bars with a gap, a
 * fixed two-hue pair for opened/closed with a legend, direct labels on the
 * few, text in ink not in series colour, and a table under every picture.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { dmy as fmtD, rupee } from "@/lib/fmt";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", RED = "var(--red)", GREEN = "var(--green)";
const BLUE = "#1F6FB2", AMBER = "#D97706";
const S = (v: unknown) => String(v ?? "").trim();
const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : rupee(n));

interface Brk { rows: { key: string; n: number; open: number; avg_days: number | null; cost: number; billed: number; warranty: number }[]; more: number; distinct: number }
interface Ticket { id: string; erp_name: string; title: string; customer: string; machine: string; location: string; job: string; type: string; problem: string; status: string; engineer: string; agreement: string; opened: string; resolved: string | null; days: number; cost: number; billed: number }
interface Data {
  today: string; total_all: number;
  head: { n: number; open: number; closed: number; resolved: number; avg_days: number | null; median_days: number | null; within_7_pct: number | null; cost: number; billed: number; mandays: number; warranty: number; warranty_cost: number; nc: number };
  monthly: { month: string; opened: number; closed: number; cost: number; billed: number }[];
  by: Record<string, Brk>;
  ageing: { label: string; n: number; cost: number }[];
  list: Ticket[]; list_total: number;
}
type Filters = Record<string, string>;
const DIM_LABEL: Record<string, string> = {
  type: "Type of support", problem: "Problem", customer: "Customer", machine: "Machine", location: "Site", engineer: "Engineer (attended)", coordinator: "Coordinator (handled)",
  agreement: "Agreement", status: "Status", rating: "Closure rating", job: "Job", pending: "Pending action",
};
const PRESETS: [string, () => Filters][] = [
  ["this FY", () => { const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); const fy = t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`; return { from: fy, to: "" }; }],
  ["last 12 months", () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10), to: "" }; }],
  ["last 3 months", () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return { from: d.toISOString().slice(0, 10), to: "" }; }],
  ["all time", () => ({ from: "", to: "" })],
];

export default function SevaAnalytics({ onOpen }: { onOpen: (t: Ticket) => void }) {
  const [f, setF] = useState<Filters>(() => PRESETS[1][1]());
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === typed.trim() ? x : { ...x, q: typed.trim() })), 350); return () => clearTimeout(t); }, [typed]);

  const qs = useMemo(() => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"), [f]);
  const load = useCallback(() => {
    setErr("");
    fetch(`/api/seva/analytics?${qs}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then((j) => setData(j)).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); });
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: x[k] === v ? "" : v }));
  const clear = (k: string) => setF((x) => ({ ...x, [k]: "" }));
  const chips = Object.entries(f).filter(([k, v]) => v && k !== "q");
  const h = data?.head;

  /* ------------------------------------------------------------ pieces */
  const Tile = ({ label, value, sub, colour = INK, onClick }: { label: string; value: string; sub?: string; colour?: string; onClick?: () => void }) => (
    <button onClick={onClick} disabled={!onClick} className="bg-white rounded-lg border p-3 text-left" style={{ borderColor: BORDER, cursor: onClick ? "pointer" : "default" }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color: colour }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: MUTED }}>{sub}</div>}
    </button>
  );

  /** A breakdown: horizontal bars with the count beside, and the figures in a table under. Click a row to drill. */
  const Panel = ({ dim, title, full = false }: { dim: string; title: string; full?: boolean }) => {
    const b = data?.by[dim];
    if (!b) return null;
    const rows = full ? b.rows : b.rows.slice(0, 8);
    const max = Math.max(1, ...rows.map((r) => r.n));
    const active = f[dim];
    return (
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>{title.toUpperCase()}</div>
          <div className="text-xs" style={{ color: MUTED }}>{b.distinct} distinct{b.more ? ` · top ${rows.length} shown` : ""}</div>
        </div>
        {!rows.length ? <div className="text-xs" style={{ color: MUTED }}>nothing in this slice</div> : (
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ color: MUTED }}>
              <th className="text-left font-semibold pb-1" style={{ width: "40%" }}>{DIM_LABEL[dim]}</th><th className="text-left font-semibold pb-1"></th>
              <th className="text-right font-semibold pb-1 pl-2">Tickets</th><th className="text-right font-semibold pb-1 pl-2">Open</th><th className="text-right font-semibold pb-1 pl-2" title="average days from opening to resolution, resolved tickets only">Days</th><th className="text-right font-semibold pb-1 pl-2">Cost</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} role="button" tabIndex={0} onClick={() => set(dim, r.key)} className="cursor-pointer hover:bg-gray-50" style={{ background: active === r.key ? "#FFF7F3" : undefined }} title={`drill into ${r.key}`}>
                  <td className="py-0.5 pr-2" style={{ color: INK, fontWeight: active === r.key ? 700 : 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</td>
                  <td className="py-0.5"><div style={{ height: 8, width: `${Math.max(2, (r.n / max) * 100)}%`, background: active === r.key ? ORANGE : BLUE, borderRadius: 4 }} /></td>
                  <td className="py-0.5 text-right tnum font-bold pl-2" style={{ color: INK }}>{r.n}</td>
                  <td className="py-0.5 text-right tnum pl-2" style={{ color: r.open ? RED : MUTED }}>{r.open || "·"}</td>
                  <td className="py-0.5 text-right tnum pl-2" style={{ color: MUTED }}>{r.avg_days ?? "·"}</td>
                  <td className="py-0.5 text-right tnum pl-2" style={{ color: r.cost ? INK : MUTED }}>{r.cost ? lakh(r.cost) : "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  /** Opened vs closed, month by month — two thin bars a month, a legend, the month a click away. */
  const Monthly = () => {
    const m = (data?.monthly ?? []).slice(-24);
    if (!m.length) return null;
    const max = Math.max(1, ...m.map((x) => Math.max(x.opened, x.closed)));
    const W = 920, H = 180, L = 36, B = 28, T = 10;
    const bw = (W - L - 10) / m.length;
    const y = (v: number) => T + (H - T - B) * (1 - v / max);
    return (
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-4 mb-1 flex-wrap">
          <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>OPENED AND CLOSED, MONTH BY MONTH</div>
          <span className="text-xs flex items-center gap-1" style={{ color: INK }}><span style={{ width: 10, height: 10, background: BLUE, borderRadius: 2, display: "inline-block" }} /> opened</span>
          <span className="text-xs flex items-center gap-1" style={{ color: INK }}><span style={{ width: 10, height: 10, background: AMBER, borderRadius: 2, display: "inline-block" }} /> closed</span>
          <span className="text-xs ml-auto" style={{ color: MUTED }}>click a month to drill into it</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="opened and closed tickets by month">
          {[0, 0.5, 1].map((g) => <g key={g}><line x1={L} x2={W - 10} y1={y(max * g)} y2={y(max * g)} stroke="#EEECE6" /><text x={L - 4} y={y(max * g) + 3} fontSize={9} textAnchor="end" fill="#8A8A8A">{Math.round(max * g)}</text></g>)}
          {m.map((x, i) => {
            const x0 = L + i * bw, w = Math.max(2, (bw - 6) / 2);
            const on = f.from === `${x.month}-01` && f.to && f.to.startsWith(x.month);
            return (
              <g key={x.month} role="button" style={{ cursor: "pointer" }} onClick={() => { const last = new Date(Number(x.month.slice(0, 4)), Number(x.month.slice(5, 7)), 0).getDate(); setF((p) => (on ? { ...p, from: "", to: "" } : { ...p, from: `${x.month}-01`, to: `${x.month}-${String(last).padStart(2, "0")}` })); }}>
                <rect x={x0} y={T} width={bw} height={H - T - B} fill={on ? "#FFF7F3" : "transparent"} />
                <rect x={x0 + 2} y={y(x.opened)} width={w} height={Math.max(0, H - B - y(x.opened))} fill={BLUE} rx={2}><title>{`${x.month}: ${x.opened} opened`}</title></rect>
                <rect x={x0 + 2 + w + 2} y={y(x.closed)} width={w} height={Math.max(0, H - B - y(x.closed))} fill={AMBER} rx={2}><title>{`${x.month}: ${x.closed} closed`}</title></rect>
                {(i % Math.ceil(m.length / 12) === 0 || m.length <= 12) && <text x={x0 + bw / 2} y={H - B + 12} fontSize={9} textAnchor="middle" fill="#8A8A8A">{x.month.slice(2).replace("-", "/")}</text>}
                {x.opened === max && <text x={x0 + 2 + w / 2} y={y(x.opened) - 3} fontSize={9} textAnchor="middle" fill={INK} fontWeight={700}>{x.opened}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Ticket Analytics</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 760, lineHeight: 1.5 }}>
            What is happening with support — by type, problem, customer, machine, site and engineer; how fast it closes and what it costs. Every bar and every row is a filter: click to drill, click again to let go.
          </div>
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          {PRESETS.map(([l, mk]) => <button key={l} onClick={() => setF((p) => ({ ...p, ...mk() }))} className="rounded px-2 py-1 text-xs font-bold" style={{ background: "#F3F1EB", color: INK }}>{l}</button>)}
          <input type="date" value={f.from || ""} onChange={(e) => setF((p) => ({ ...p, from: e.target.value }))} className="border rounded px-1.5 py-1 text-xs" style={{ borderColor: BORDER }} />
          <span className="text-xs" style={{ color: MUTED }}>to</span>
          <input type="date" value={f.to || ""} onChange={(e) => setF((p) => ({ ...p, to: e.target.value }))} className="border rounded px-1.5 py-1 text-xs" style={{ borderColor: BORDER }} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="🔍 words" className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER, width: 140 }} />
        </div>
      </div>

      {/* THE CHIPS — what the page is answering for */}
      <div className="flex items-center gap-1 mb-3 flex-wrap text-xs">
        <span style={{ color: MUTED }}>Showing:</span>
        {!chips.length && <span style={{ color: MUTED }}>every ticket{data ? ` (${data.total_all.toLocaleString("en-IN")})` : ""}</span>}
        {chips.map(([k, v]) => (
          <button key={k} onClick={() => clear(k)} className="rounded-full px-2 py-0.5 font-bold" style={{ background: "#FFF7F3", color: INK, border: `1px solid ${ORANGE}` }} title="click to remove">
            {k === "from" ? `from ${fmtD(v)}` : k === "to" ? `to ${fmtD(v)}` : k === "open" ? "open only" : k === "warranty" ? "warranty only" : k === "nc" ? "raised as NC" : `${DIM_LABEL[k] || k}: ${v}`} ×
          </button>
        ))}
        {chips.length > 0 && <button onClick={() => setF({})} className="ml-1" style={{ color: MUTED }}>clear all</button>}
      </div>

      {err && <div className="rounded border px-3 py-2 text-sm mb-3" style={{ borderColor: RED, color: RED, background: "#FBEAE8" }}>{err}</div>}
      {!data && !err && <div className="text-sm" style={{ color: MUTED }}>counting…</div>}

      {h && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
          <Tile label="TICKETS" value={h.n.toLocaleString("en-IN")} sub="in this slice" />
          <Tile label="STILL OPEN" value={String(h.open)} sub={h.n ? `${Math.round((h.open / h.n) * 100)}% of the slice` : ""} colour={h.open ? RED : GREEN} onClick={() => set("open", "1")} />
          <Tile label="DAYS TO RESOLVE" value={h.median_days === null ? "·" : `${h.median_days}`} sub={h.avg_days === null ? `the ERP's resolution clock is blank on all ${h.closed} closed here` : `median · average ${h.avg_days} · ${h.within_7_pct}% within a week · the ERP's clock on ${h.resolved} of ${h.closed} closed`} />
          <Tile label="COST SPENT" value={lakh(h.cost)} sub={`${h.mandays.toLocaleString("en-IN")} man-days · billed ${lakh(h.billed)}`} />
          <Tile label="UNDER WARRANTY" value={String(h.warranty)} sub={`cost ${lakh(h.warranty_cost)}`} colour={h.warranty ? AMBER : GREEN} onClick={() => set("warranty", "1")} />
          <Tile label="RAISED AS NC" value={String(h.nc)} sub="non-conformances" colour={h.nc ? RED : GREEN} onClick={() => set("nc", "1")} />
        </div>

        <div className="mb-3"><Monthly /></div>

        <div className="grid md:grid-cols-2 gap-2 mb-2">
          <Panel dim="type" title="By type of support" />
          <Panel dim="problem" title="By problem" />
          <Panel dim="customer" title="By customer" />
          <Panel dim="engineer" title="By engineer who attended" />
        </div>

        {/* AGEING of what is open in the slice */}
        {h.open > 0 && (
          <div className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: BORDER }}>
            <div className="text-xs font-bold mb-2" style={{ color: MUTED, letterSpacing: 0.8 }}>OPEN TICKETS BY AGE — {h.open} still open</div>
            <div className="flex gap-2 flex-wrap">
              {data!.ageing.map((a) => (
                <div key={a.label} className="rounded border px-3 py-2 text-xs" style={{ borderColor: BORDER, minWidth: 130 }}>
                  <div style={{ color: MUTED }}>{a.label}</div>
                  <div className="text-lg font-bold tnum" style={{ color: a.n ? (a.label.startsWith("0") ? INK : a.label.startsWith("8") ? AMBER : RED) : MUTED }}>{a.n}</div>
                  <div className="tnum" style={{ color: MUTED }}>{a.cost ? lakh(a.cost) : "·"}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setMore((v) => !v)} className="text-xs font-bold mb-2" style={{ color: BLUE }}>{more ? "▾" : "▸"} More cuts — machine, site, job, agreement, status, closure rating, pending action, coordinator</button>
        {more && (
          <div className="grid md:grid-cols-2 gap-2 mb-3">
            <Panel dim="machine" title="By machine" full />
            <Panel dim="location" title="By site" full />
            <Panel dim="job" title="By job" full />
            <Panel dim="agreement" title="By agreement status" full />
            <Panel dim="status" title="By status" full />
            <Panel dim="rating" title="By closure rating" full />
            <Panel dim="pending" title="By pending action" full />
            <Panel dim="coordinator" title="By coordinator" full />
          </div>
        )}

        {/* THE TICKETS BEHIND THE FIGURES */}
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "60vh" }}>
          <div className="px-3 py-2 text-xs font-bold flex items-baseline gap-2" style={{ color: MUTED, letterSpacing: 0.8 }}>
            THE TICKETS BEHIND THESE FIGURES <span className="font-semibold" style={{ letterSpacing: 0 }}>· {Math.min(300, data!.list_total)} of {data!.list_total.toLocaleString("en-IN")}, newest first · click one to open it</span>
          </div>
          <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1100 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              {["Ticket", "Customer", "Machine", "Site", "Job", "Type", "Problem", "Status", "Engineer", "Opened", "Days", "Cost"].map((c, i) => (
                <th key={c} className={`px-2 py-1.5 ${i >= 10 ? "text-right" : "text-left"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{c}</th>
              ))}
            </tr></thead>
            <tbody>
              {data!.list.map((t, i) => (
                <tr key={t.id} role="button" tabIndex={0} onClick={() => onOpen(t)} className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="tnum font-bold mr-1" style={{ color: BLUE }}>{t.erp_name}</span>{t.title}</td>
                  <td className="px-2 py-1" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.customer || "·"}</td>
                  <td className="px-2 py-1" style={{ color: MUTED, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.machine || "·"}</td>
                  <td className="px-2 py-1" style={{ color: MUTED, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.location || "·"}</td>
                  <td className="px-2 py-1 tnum">{t.job || "·"}</td>
                  <td className="px-2 py-1" style={{ color: MUTED }}>{t.type || "·"}</td>
                  <td className="px-2 py-1" style={{ color: MUTED }}>{t.problem || "·"}</td>
                  <td className="px-2 py-1 font-semibold" style={{ color: /closed|resolved/i.test(t.status) ? GREEN : RED }}>{t.status}</td>
                  <td className="px-2 py-1">{t.engineer || "·"}</td>
                  <td className="px-2 py-1 tnum" style={{ color: MUTED }}>{fmtD(t.opened)}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: /closed|resolved/i.test(t.status) ? MUTED : t.days > 30 ? RED : INK }}>{t.days}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: t.cost ? INK : MUTED }}>{t.cost ? rupee(t.cost) : "·"}</td>
                </tr>
              ))}
              {!data!.list.length && <tr><td colSpan={12} className="px-3 py-4 text-center" style={{ color: MUTED }}>No ticket in this slice{data!.total_all ? "" : " — the hourly pull is bringing the tickets in"}.</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}
