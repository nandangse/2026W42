"use client";
/**
 * THE CEO MODULE (Dr Raghu, 14 Oct 2026). A menu on the left — Dashboard,
 * People, Strategy, Execution, Cash, Reviews, Exceptions — and every number
 * on it opens a lightbox of what makes it, each line opening in a new tab.
 * Every figure is read live from the module that owns it; nothing is typed.
 */
import { useEffect, useState } from "react";
import GenieShell from "@/components/GenieShell";
import RollingYear, { type Trend } from "@/components/ceo/RollingYear";
import { DrillProvider, useDrill, cr } from "@/components/ceo/Drill";
import { Card, Section } from "@/components/ceo/ui";
import { PeopleRoom, StrategyRoom, ExecutionRoom, CashRoom, ReviewsRoom, ExceptionsRoom } from "@/components/ceo/CeoRooms";
import { swallow } from "@/lib/swallow";

type Err = { error: string };
type D = {
  from: string; to: string; today: string;
  books: { empty?: boolean; sales: number; oe: number; byHead: Record<string, number>; books_to: string | null } | Err;
  owed: { receivable: number; receivable_overdue: number; receivable_180: number; advances: number; payable: number; payable_180: number } | Err;
  orders: { orders: number; order_value: number; quotes_live: number; quote_value: number } | Err;
  floor: { live: number; live_value: number; late: number; delivered: number; delivered_value: number } | Err;
  service: { open_tickets: number; amc_valid: number; amc_value: number } | Err;
  people: { headcount: number; by_department: Record<string, number> } | Err;
  trend: (Trend & { empty?: boolean }) | { empty: true } | Err;
};
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)", GREEN = "var(--green)";
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed((a / b) * 100 < 10 ? 1 : 0)}%` : "—");
const isErr = (x: unknown): x is Err => !!x && typeof x === "object" && "error" in (x as object);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fyStart = (t: string) => (t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`);
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ctl: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "#fff" };

const ROOMS = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "people", label: "People", icon: "👥" },
  { key: "strategy", label: "Strategy", icon: "🧭" },
  { key: "execution", label: "Execution", icon: "⚙" },
  { key: "cash", label: "Cash", icon: "₹" },
  { key: "reviews", label: "Reviews", icon: "📋" },
  { key: "exceptions", label: "Exceptions", icon: "⚠" },
] as const;

function Dashboard() {
  const t0 = today();
  const [from, setFrom] = useState(fyStart(t0)); const [to, setTo] = useState(t0);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
  const open = useDrill();
  useEffect(() => { setD(null); fetch(`/api/ceo?from=${from}&to=${to}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e))); }, [from, to]);
  const win = (k: "12m" | "ytd" | "qtd" | "mtd") => {
    const y = Number(t0.slice(0, 4)), m = Number(t0.slice(5, 7));
    if (k === "ytd") setFrom(fyStart(t0));
    if (k === "mtd") setFrom(t0.slice(0, 8) + "01");
    if (k === "qtd") { const q = Math.floor((m - 1) / 3) * 3 + 1; setFrom(`${y}-${String(q).padStart(2, "0")}-01`); }
    if (k === "12m") { const x = new Date(t0 + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() - 1); x.setUTCDate(x.getUTCDate() + 1); setFrom(x.toISOString().slice(0, 10)); }
    setTo(t0);
  };
  const b = d && !isErr(d.books) && !d.books.empty ? d.books : null;
  const R = { from, to };
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <h1 className="font-bold" style={{ fontSize: 22, color: NAVY }}>The company, {dmy(from)} – {dmy(to)}</h1>
        <span className="ml-auto" />
        {(["12m", "ytd", "qtd", "mtd"] as const).map((k) => <button key={k} onClick={() => win(k)} style={{ ...ctl, fontWeight: 700 }}>{k === "12m" ? "12 M" : k.toUpperCase()}</button>)}
        <span className="text-xs font-bold" style={{ color: MUTED }}>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={ctl} />
        <span className="text-xs font-bold" style={{ color: MUTED }}>To</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={ctl} />
      </div>
      {err && <div className="text-sm font-bold" style={{ color: RED }}>{err}</div>}
      {!d && !err && <div className="text-sm" style={{ color: MUTED }}>Reading the books, the order book, the floor…</div>}
      {d && (
        <>
          <Section title="THE BOOKS — KUBER" err={isErr(d.books) ? d.books.error : undefined}>
            {b && <>
              <Card label="SALES" value={cr(b.sales)} sub={`books to ${dmy(b.books_to)}`} ask={{ what: "sales", ...R }} tone={GREEN} />
              <Card label="OE" value={cr(b.oe)} sub={`${pct(b.oe, b.sales)} of sales`} ask={{ what: "oe", ...R }} tone="#B45309" />
              <Card label="SALES LESS OE" value={cr(b.sales - b.oe)} sub="before materials and the floor's own cost — opens the OE" ask={{ what: "oe", ...R, label: "OE — what is taken from sales" }} />
            </>}
          </Section>
          {isErr(d.trend) ? <div className="text-xs mb-3" style={{ color: RED }}>The rolling year could not be read: {d.trend.error}</div> : !d.trend.empty && <RollingYear t={d.trend as Trend} />}
          {b && (
            <Section title="OE BY HEAD">
              {Object.entries(b.byHead).filter(([, v]) => v).sort((x, y) => y[1] - x[1]).map(([h, v]) => <Card key={h} label={h.toUpperCase()} value={cr(v)} sub={`${pct(v, b.sales)} of sales · ${pct(v, b.oe)} of OE`} ask={{ what: `head:${h}`, ...R, label: h }} tone="#B45309" />)}
            </Section>
          )}
          <Section title="WHAT IS OWED — TODAY" err={isErr(d.owed) ? d.owed.error : undefined}>
            {!isErr(d.owed) && <>
              <Card label="RECEIVABLES" value={cr(d.owed.receivable)} ask={{ what: "receivable" }} tone={RED} sub={<><span onClick={(e) => { e.stopPropagation(); open({ what: "receivable_overdue", label: "Receivables past due" }); }} className="hover:underline" style={{ cursor: "pointer" }}>{cr(d.owed.receivable_overdue)} past due</span> · <span onClick={(e) => { e.stopPropagation(); open({ what: "receivable_180", label: "Receivables over 180 days" }); }} className="hover:underline" style={{ color: RED, cursor: "pointer" }}>{cr(d.owed.receivable_180)} over 180 days</span></>} />
              <Card label="ADVANCES HELD" value={cr(d.owed.advances)} sub="received before the bill" ask={{ what: "advances" }} />
              <Card label="PAYABLES" value={cr(d.owed.payable)} ask={{ what: "payable" }} sub={<span onClick={(e) => { e.stopPropagation(); open({ what: "payable_180", label: "Payables over 180 days" }); }} className="hover:underline" style={{ cursor: "pointer" }}>{cr(d.owed.payable_180)} over 180 days</span>} />
            </>}
          </Section>
          <Section title="THE ORDER BOOK — CRM" err={isErr(d.orders) ? d.orders.error : undefined}>
            {!isErr(d.orders) && <>
              <Card label="ORDERS BOOKED" value={cr(d.orders.order_value)} sub={`${d.orders.orders} sales orders in the dates`} ask={{ what: "orders", ...R }} tone={GREEN} />
              <Card label="LIVE QUOTATIONS" value={cr(d.orders.quote_value)} sub={`${d.orders.quotes_live.toLocaleString("en-IN")} live, hot-listed or submitted`} ask={{ what: "quotes" }} />
            </>}
          </Section>
          <Section title="THE FLOOR — PLANNING" err={isErr(d.floor) ? d.floor.error : undefined}>
            {!isErr(d.floor) && <>
              <Card label="LIVE JOBS" value={String(d.floor.live)} ask={{ what: "live_jobs" }} tone={d.floor.late ? RED : NAVY} sub={<>{cr(d.floor.live_value)} · <span onClick={(e) => { e.stopPropagation(); open({ what: "late_jobs", label: "Jobs past their delivery date" }); }} className="hover:underline" style={{ color: d.floor.late ? RED : undefined, cursor: "pointer" }}>{d.floor.late} past their delivery date</span></>} />
              <Card label="DELIVERED" value={cr(d.floor.delivered_value)} sub={`${d.floor.delivered} jobs in the dates`} ask={{ what: "delivered", ...R }} tone={GREEN} />
            </>}
          </Section>
          <Section title="SERVICE — SEVA" err={isErr(d.service) ? d.service.error : undefined}>
            {!isErr(d.service) && <>
              <Card label="OPEN TICKETS" value={String(d.service.open_tickets)} ask={{ what: "tickets" }} tone={d.service.open_tickets ? RED : GREEN} />
              <Card label="AMC VALID" value={cr(d.service.amc_value)} sub={`${d.service.amc_valid} contracts, per annum`} ask={{ what: "amc" }} />
            </>}
          </Section>
          <Section title="PEOPLE — HRMS" err={isErr(d.people) ? d.people.error : undefined}>
            {!isErr(d.people) && <Card label="ON THE ROLL" value={String(d.people.headcount)} ask={{ what: "people" }} sub={Object.entries(d.people.by_department).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(" · ")} />}
          </Section>
        </>
      )}
    </>
  );
}

export default function CeoCockpit({ email, displayName, initials, role }: { email: string; displayName: string | null; initials: string | null; role: string }) {
  const [room, setRoom] = useState<string>("dashboard");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    try { setNarrow(localStorage.getItem("ceo.nav") === "0"); } catch (e) { swallow("ceo", e); }
    const apply = () => { const h = window.location.hash.replace(/^#/, ""); if (ROOMS.some((r) => r.key === h)) setRoom(h); };
    apply(); window.addEventListener("hashchange", apply); return () => window.removeEventListener("hashchange", apply);
  }, []);
  const go = (k: string) => { setRoom(k); try { window.history.replaceState(null, "", `#${k}`); } catch { /* fine */ } };
  const fold = () => setNarrow((v) => { try { localStorage.setItem("ceo.nav", v ? "1" : "0"); } catch { /* fine */ } return !v; });
  return (
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <GenieShell module="ceo" title="Nandan CEO" tagline="The company on one page" user={{ email, displayName, initials, role }} />
      <DrillProvider>
        <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
          <nav style={{ width: narrow ? 54 : 210, flexShrink: 0, background: "#fff", borderRight: `1px solid ${LINE}`, padding: "10px 6px", transition: "width .15s ease" }}>
            <button onClick={fold} className="w-full rounded px-2 py-1.5 text-xs font-bold mb-1 text-left" style={{ color: MUTED }}>{narrow ? "»" : "« fold"}</button>
            {ROOMS.map((r) => (
              <button key={r.key} onClick={() => go(r.key)} title={narrow ? r.label : undefined} className="w-full text-left rounded px-2 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5" style={room === r.key ? { background: "var(--navy)", color: "#fff" } : { color: "var(--dim)" }}>
                <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>{!narrow && r.label}
              </button>
            ))}
          </nav>
          <main className="flex-1 p-5" style={{ minWidth: 0, maxWidth: 1400 }}>
            {room === "dashboard" && <Dashboard />}
            {room === "people" && <PeopleRoom />}
            {room === "strategy" && <StrategyRoom />}
            {room === "execution" && <ExecutionRoom />}
            {room === "cash" && <CashRoom />}
            {room === "reviews" && <ReviewsRoom />}
            {room === "exceptions" && <ExceptionsRoom />}
            <div className="text-xs mt-6" style={{ color: MUTED }}>Open to three: Dr Raghu, J C Kumar and Tushar Giri. Every figure is read from the module that owns it; click any number for what makes it.</div>
          </main>
        </div>
      </DrillProvider>
    </div>
  );
}
