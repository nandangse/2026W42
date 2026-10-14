"use client";
/**
 * THE CEO COCKPIT (Dr Raghu, 14 Oct 2026). The company on one page — the
 * books, what is owed, the order book, the floor, service, the people — each
 * figure read live from the module that owns it, each card opening that
 * module. Financial year to date unless other dates are picked.
 */
import { useEffect, useState } from "react";
import GenieShell from "@/components/GenieShell";

type Err = { error: string };
type D = {
  from: string; to: string; today: string;
  books: { empty?: boolean; sales: number; oe: number; byHead: Record<string, number>; months: string[]; salesByMonth: Record<string, number>; oeByMonth: Record<string, number>; books_to: string | null } | Err;
  owed: { receivable: number; receivable_overdue: number; receivable_180: number; advances: number; payable: number; payable_180: number } | Err;
  orders: { orders: number; order_value: number; quotes_live: number; quote_value: number } | Err;
  floor: { live: number; live_value: number; late: number; delivered: number; delivered_value: number } | Err;
  service: { open_tickets: number; amc_valid: number; amc_value: number } | Err;
  people: { headcount: number; by_department: Record<string, number> } | Err;
};
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)", GREEN = "var(--green)";
const cr = (n: number) => { const v = Math.abs(n); const s = v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : Math.round(v).toLocaleString("en-IN"); return `${n < 0 ? "−" : ""}₹${s}`; };
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed((a / b) * 100 < 10 ? 1 : 0)}%` : "—");
const isErr = (x: unknown): x is Err => !!x && typeof x === "object" && "error" in (x as object);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fyStart = (t: string) => (t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`);
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const mon = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const ctl: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "#fff" };

function Card({ label, value, sub, href, tone }: { label: string; value: string; sub?: React.ReactNode; href?: string; tone?: string }) {
  const body = (
    <div className="bg-white rounded-lg p-3 h-full" style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${tone || NAVY}` }}>
      <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>{label}</div>
      <div className="font-bold tnum" style={{ fontSize: 22, color: "var(--ink)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: "none" }}>{body}</a> : body;
}
function Section({ title, err, children }: { title: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-bold mb-1.5" style={{ color: NAVY, letterSpacing: 1 }}>{title}</div>
      {err ? <div className="text-xs" style={{ color: RED }}>Could not be read: {err}</div> : <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>{children}</div>}
    </div>
  );
}

export default function CeoCockpit({ email, displayName, initials, role }: { email: string; displayName: string | null; initials: string | null; role: string }) {
  const t0 = today();
  const [from, setFrom] = useState(fyStart(t0)); const [to, setTo] = useState(t0);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
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
  return (
    <div className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <GenieShell module="ceo" title="Nandan CEO" tagline="The company on one page" user={{ email, displayName, initials, role }} />
      <main className="p-5" style={{ maxWidth: 1280, margin: "0 auto" }}>
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
                <Card label="SALES" value={cr(b.sales)} sub={`books to ${dmy(b.books_to)}`} href="/kuber#pnl" tone={GREEN} />
                <Card label="OE" value={cr(b.oe)} sub={`${pct(b.oe, b.sales)} of sales`} href="/kuber#oereg" tone="#B45309" />
                <Card label="SALES LESS OE" value={cr(b.sales - b.oe)} sub="before materials and the floor's own cost" href="/kuber#pnl" />
              </>}
              {!isErr(d.books) && d.books.empty && <div className="text-xs" style={{ color: MUTED }}>No books uploaded yet.</div>}
            </Section>
            {b && (
              <div className="rounded-lg bg-white mb-4" style={{ border: `1px solid ${LINE}`, overflow: "auto" }}>
                <table className="genie-table" style={{ minWidth: 560 }}>
                  <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3 }}>By month</th>{b.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{mon(m)}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-bold" style={{ position: "sticky", left: 0, background: "#fff" }}>Sales</td>{b.months.map((m) => <td key={m} className="tnum text-right">{cr(b.salesByMonth[m] || 0)}</td>)}</tr>
                    <tr><td className="font-bold" style={{ position: "sticky", left: 0, background: "#fff" }}>OE</td>{b.months.map((m) => <td key={m} className="tnum text-right">{cr(b.oeByMonth[m] || 0)}</td>)}</tr>
                    <tr><td style={{ position: "sticky", left: 0, background: "#fff", color: MUTED }}>OE % of sales</td>{b.months.map((m) => <td key={m} className="tnum text-right text-xs" style={{ color: MUTED }}>{pct(b.oeByMonth[m] || 0, b.salesByMonth[m] || 0)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
            {b && (
              <Section title="OE BY HEAD">
                {Object.entries(b.byHead).filter(([, v]) => v).sort((x, y) => y[1] - x[1]).map(([h, v]) => <Card key={h} label={h.toUpperCase()} value={cr(v)} sub={`${pct(v, b.sales)} of sales · ${pct(v, b.oe)} of OE`} href="/kuber#oereg" tone="#B45309" />)}
              </Section>
            )}
            <Section title="WHAT IS OWED — TODAY" err={isErr(d.owed) ? d.owed.error : undefined}>
              {!isErr(d.owed) && <>
                <Card label="RECEIVABLES" value={cr(d.owed.receivable)} sub={<>{cr(d.owed.receivable_overdue)} past due · <span style={{ color: RED }}>{cr(d.owed.receivable_180)} over 180 days</span></>} href="/kuber#receivables" tone={RED} />
                <Card label="ADVANCES HELD" value={cr(d.owed.advances)} sub="received before the bill" href="/kuber#receivables" />
                <Card label="PAYABLES" value={cr(d.owed.payable)} sub={`${cr(d.owed.payable_180)} over 180 days`} href="/kuber#payables" />
              </>}
            </Section>
            <Section title="THE ORDER BOOK — CRM" err={isErr(d.orders) ? d.orders.error : undefined}>
              {!isErr(d.orders) && <>
                <Card label="ORDERS BOOKED" value={cr(d.orders.order_value)} sub={`${d.orders.orders} sales orders in the dates`} href="/crm" tone={GREEN} />
                <Card label="LIVE QUOTATIONS" value={cr(d.orders.quote_value)} sub={`${d.orders.quotes_live.toLocaleString("en-IN")} live, hot-listed or submitted`} href="/crm" />
              </>}
            </Section>
            <Section title="THE FLOOR — PLANNING" err={isErr(d.floor) ? d.floor.error : undefined}>
              {!isErr(d.floor) && <>
                <Card label="LIVE JOBS" value={String(d.floor.live)} sub={`${cr(d.floor.live_value)} · ${d.floor.late} past their delivery date`} href="/" tone={d.floor.late ? RED : NAVY} />
                <Card label="DELIVERED" value={cr(d.floor.delivered_value)} sub={`${d.floor.delivered} jobs in the dates`} href="/" tone={GREEN} />
              </>}
            </Section>
            <Section title="SERVICE — SEVA" err={isErr(d.service) ? d.service.error : undefined}>
              {!isErr(d.service) && <>
                <Card label="OPEN TICKETS" value={String(d.service.open_tickets)} href="/seva#issues" tone={d.service.open_tickets ? RED : GREEN} />
                <Card label="AMC VALID" value={cr(d.service.amc_value)} sub={`${d.service.amc_valid} contracts, per annum`} href="/seva#amc" />
              </>}
            </Section>
            <Section title="PEOPLE — HRMS" err={isErr(d.people) ? d.people.error : undefined}>
              {!isErr(d.people) && <>
                <Card label="ON THE ROLL" value={String(d.people.headcount)} sub={Object.entries(d.people.by_department).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(" · ")} href="/hrms" />
              </>}
            </Section>
            <div className="text-xs" style={{ color: MUTED }}>Open to three: Dr Raghu, J C Kumar and Tushar Giri. Every figure is read from the module that owns it; nothing here is typed.</div>
          </>
        )}
      </main>
    </div>
  );
}
