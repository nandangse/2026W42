"use client";
/**
 * THE CEO MODULE (Dr Raghu, 14 Oct 2026). A menu on the left — Dashboard,
 * People, Strategy, Execution, Cash, Reviews, Exceptions — the header, the
 * title and the period frozen at the top, and on the dashboard: Sales, TVC,
 * Throughput, OE, PBT with their share of sales; the rolling year; the money
 * owed and owing; the order book; the floor; service; people. Every number
 * opens a lightbox; every box carries its change on a week ago.
 */
import { useEffect, useRef, useState } from "react";
import GenieShell from "@/components/GenieShell";
import RollingYear, { type Trend } from "@/components/ceo/RollingYear";
import { DrillProvider, cr } from "@/components/ceo/Drill";
import { Card, Section, C, type Delta } from "@/components/ceo/ui";
import { PeopleRoom, ExecutionRoom, CashRoom, ReviewsRoom, ExceptionsRoom } from "@/components/ceo/CeoRooms";
import { StrategyRoom } from "@/components/ceo/CeoStrategy";
import { InternalKuberRoom } from "@/components/ceo/InternalKuber";
import { ApprovalsRoom } from "@/components/ceo/CeoApprovals";
import { MODULES } from "@/components/GenieShell";
import { swallow } from "@/lib/swallow";

type Err = { error: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
type D = { fresh?: { tally: { at: string; by: string; name: string; kind: string } | null; erp: string | null }; from: string; to: string; today: string; books: any; owed: any; erp: any; orders: any; floor: any; service: any; people: any; trend: any; snap: Record<string, number>; prev: { day: string | null; values: Record<string, number> }; direction: Record<string, { good: 1 | -1 | 0; pct?: boolean }>; isYtd: boolean };
const isErr = (x: unknown): x is Err => !!x && typeof x === "object" && "error" in (x as object);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fyStart = (t: string) => (t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`);
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(Math.abs((a / b) * 100) < 10 ? 1 : 0)}%` : "—");
const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? C.brand : C.line}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, background: on ? C.brand : "#fff", color: on ? "#fff" : C.ink });
const ctl: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 8px", fontSize: 12, background: "#fff" };

const ROOMS = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "people", label: "People", icon: "👥" },
  { key: "strategy", label: "Strategy", icon: "🧭" },
  { key: "execution", label: "Execution", icon: "⚙" },
  { key: "cash", label: "Cash", icon: "₹" },
  { key: "reviews", label: "Reviews", icon: "📋" },
  { key: "exceptions", label: "Exceptions", icon: "⚠" },
  { key: "internal", label: "Internal Kuber", icon: "🪙" },
  { key: "approvals", label: "Approvals", icon: "✅" },
  { key: "modules", label: "Modules", icon: "▦" },
] as const;

function Dashboard({ top }: { top: number }) {
  const t0 = today();
  const [from, setFrom] = useState(fyStart(t0)); const [to, setTo] = useState(t0);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(null); setErr(null); fetch(`/api/ceo?from=${from}&to=${to}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e))); }, [from, to]);
  const which = from === fyStart(t0) && to === t0 ? "ytd" : "";
  const win = (k: "12m" | "ytd" | "qtd" | "mtd") => {
    const y = Number(t0.slice(0, 4)), m = Number(t0.slice(5, 7));
    if (k === "ytd") setFrom(fyStart(t0));
    if (k === "mtd") setFrom(t0.slice(0, 8) + "01");
    if (k === "qtd") { const q = Math.floor((m - 1) / 3) * 3 + 1; setFrom(`${y}-${String(q).padStart(2, "0")}-01`); }
    if (k === "12m") { const x = new Date(t0 + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() - 1); x.setUTCDate(x.getUTCDate() + 1); setFrom(x.toISOString().slice(0, 10)); }
    setTo(t0);
  };
  /** the week's change for a snapshot key */
  const dl = (k: string, cur?: number): Delta | undefined => {
    if (!d || !d.isYtd) return undefined;
    const dir = d.direction[k]; const prev = d.prev.values[k]; const now = cur ?? d.snap[k];
    if (!dir || prev === undefined || now === undefined) return undefined;
    return { cur: now, prev, good: dir.good, pct: dir.pct };
  };
  const R = { from, to };
  const b = d && !isErr(d.books) && !d.books.empty ? d.books : null;
  const o = d && !isErr(d.owed) ? d.owed : null;
  const e = d && !isErr(d.erp) ? d.erp : null;
  const f = d && !isErr(d.floor) ? d.floor : null;
  const p = d && !isErr(d.people) ? d.people : null;
  return (
    <>
      {/* THE TITLE AND THE PERIOD, FROZEN UNDER THE HEADER */}
      <div className="flex items-center gap-2 flex-wrap py-3 mb-3" style={{ position: "sticky", top, zIndex: 30, background: C.bg, borderBottom: `1px solid ${C.line}`, margin: "0 -20px", padding: "12px 20px" }}>
        <div>
          <h1 className="font-bold" style={{ fontSize: 20, color: C.ink, lineHeight: 1.2 }}>The company, {dmy(from)} – {dmy(to)}</h1>
          <div className="text-xs" style={{ color: C.muted }}>{d?.isYtd ? (d.prev.day ? `▲▼ against ${dmy(d.prev.day)}` : "the week-on-week triangles begin once a week of figures is kept") : "the triangles show on the financial year to date (YTD)"}{b ? ` · books to ${dmy(b.books_to)}` : ""}</div>
        </div>
        <span className="ml-auto" />
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {(["12m", "ytd", "qtd", "mtd"] as const).map((k) => <button key={k} onClick={() => win(k)} style={chip(k === which)}>{k === "12m" ? "12 M" : k.toUpperCase()}</button>)}
            <span className="text-xs font-semibold" style={{ color: C.muted }}>From</span><input type="date" value={from} max={to} onChange={(ev) => setFrom(ev.target.value)} style={ctl} />
            <span className="text-xs font-semibold" style={{ color: C.muted }}>To</span><input type="date" value={to} min={from} onChange={(ev) => setTo(ev.target.value)} style={ctl} />
          </div>
          {/* HOW FRESH — Tally's last upload, and Genie live */}
          {d?.fresh && (
            <div className="text-xs text-right" style={{ color: C.muted, lineHeight: 1.45 }}>
              {d.fresh.tally ? <>Tally last updated on <b style={{ color: C.ink }}>{new Date(d.fresh.tally.at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</b> at <b style={{ color: C.ink }}>{new Date(d.fresh.tally.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}</b> by <b style={{ color: C.ink }}>{d.fresh.tally.by}</b></> : "Tally not uploaded yet"}
              <span style={{ margin: "0 6px" }}>·</span>
              <span style={{ color: C.green, fontWeight: 600 }}>● Genie live</span>{d.fresh.erp ? ` — ERP pulled ${new Date(d.fresh.erp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}${new Date(d.fresh.erp).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === t0 ? " today" : ` on ${new Date(d.fresh.erp).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`}` : ""}
            </div>
          )}
        </div>
      </div>
      {err && <div className="text-sm font-bold" style={{ color: C.red }}>{err}</div>}
      {!d && !err && <div className="text-sm" style={{ color: C.muted }}>Reading the books, the ERP, the order book, the floor…</div>}
      {d && (
        <>
          {/* SALES · TVC · THROUGHPUT · OE · PBT — the total and the share of sales */}
          <Section title="The P&L" hint={b ? `Sales up to now; TVC, Throughput, OE and PBT to ${dmy(b.pnl_to)} — the last month-end, where the stock is counted, their % of sales to that date` : "Kuber's own arithmetic — total and % of sales"} err={isErr(d.books) ? d.books.error : undefined} min={190}>
            {d.books && !isErr(d.books) && d.books.no_month && <div className="text-sm" style={{ color: C.muted }}>No month has closed between {dmy(from)} and {dmy(to)} — the P&amp;L is struck to a month-end ({dmy(d.books.pnl_to)}). Pick a wider window.</div>}
            {b && <>
              <Card icon="₹" tone={C.green} label="Sales" value={cr(b.sales_to_date)} sub={<>up to now — books to {dmy(b.books_to)}<br />{cr(b.sales)} to {dmy(b.pnl_to)}, the base for the % beside</>} ask={{ what: "sales", from, to }} delta={dl("sales")} />
              <Card icon="📦" tone={C.amber} label="TVC" value={cr(b.tvc)} sub={`${pct(b.tvc, b.sales)} of sales · purchases ± stock`} ask={{ what: "tvc", from, to: b.pnl_to }} delta={dl("tvc_pct")} />
              <Card icon="⚡" tone={C.brand} label="Throughput" value={cr(b.throughput)} sub={`${pct(b.throughput, b.sales)} of sales`} ask={{ what: "throughput", from, to: b.pnl_to }} delta={dl("throughput_pct")} />
              <Card icon="⚙" tone={C.amber} label="OE" value={cr(b.oe)} sub={`${pct(b.oe, b.sales)} of sales · indirect + finance`} ask={{ what: "oe", from, to: b.pnl_to }} delta={dl("oe_pct")} />
              <Card icon="🏁" tone={b.pbt >= 0 ? C.green : C.red} label="PBT" value={cr(b.pbt)} sub={`${pct(b.pbt, b.sales)} of sales`} ask={{ what: "pbt", from, to: b.pnl_to }} delta={dl("pbt_pct")} />
            </>}
          </Section>
          {b && <div className="text-xs -mt-3 mb-5" style={{ color: C.muted }}>TVC uses the stock register: opening {cr(b.openingStock)}{b.openingAt ? ` (${dmy(b.openingAt)})` : ""}, closing {cr(b.closingStock)}{b.closingAt ? ` (${dmy(b.closingAt)})` : ""}. PBT also takes off manufacturing {cr(b.manuf)}{b.depreciation ? ` and depreciation ${cr(b.depreciation)}` : ""} and adds other income {cr(b.otherIncome)}. The % triangles compare the share of sales with a week ago.</div>}

          {/* MONEY OWED AND OWING */}
          <Section title="Money" hint="today — Tally's open bills, and the ERP" min={250}>
            {o && <>
              <Card icon="↘" tone={C.red} label="Receivables" value={cr(o.receivable)} ask={{ what: "receivable" }} delta={dl("receivable")}
                rows={[{ label: "0–90 days", value: cr(o.rec_0_90), ask: { what: "receivable_0_90" }, delta: dl("rec_0_90") }, { label: "90+ days", value: cr(o.rec_90), ask: { what: "receivable_90" }, delta: dl("rec_90"), tone: C.red }]} />
              <Card icon="↗" tone={C.amber} label="Payables" value={cr(o.payable)} ask={{ what: "payable" }} delta={dl("payable")}
                rows={[{ label: "0–180 days", value: cr(o.pay_0_180), ask: { what: "payable_0_180" }, delta: dl("pay_0_180") }, { label: "180+ days", value: cr(o.pay_180), ask: { what: "payable_180" }, delta: dl("pay_180"), tone: C.red }]} />
            </>}
            {e && <Card icon="🧾" tone={C.violet} label="Supplier bills not received" value={cr(e.grn_unbilled)} sub={`${e.grn_count} goods receipts on the ERP not fully billed`} ask={{ what: "grn" }} delta={dl("grn_unbilled")} />}
            {o && <Card icon="⇄" tone={C.sky} label="Advances" value={`${cr(o.adv_received)} | ${cr(o.adv_paid)}`} sub="received from customers | paid to suppliers"
              rows={[{ label: "Advance received", value: cr(o.adv_received), ask: { what: "advances" }, delta: dl("adv_received") }, { label: "Advance paid", value: cr(o.adv_paid), ask: { what: "advances_paid" }, delta: dl("adv_paid") }]} />}
            {e && <Card icon="🚚" tone={C.red} label="Payment on order execution" value={cr(e.poe_0_30 + e.poe_31_60 + e.poe_61_90 + e.poe_90)} sub="due on delivery, still pending — days since delivery" ask={{ what: "poe:0_30", label: "Payment on order execution" }}
              rows={[
                { label: "0–30 days", value: cr(e.poe_0_30), ask: { what: "poe:0_30" }, delta: dl("poe_0_30") },
                { label: "31–60 days", value: cr(e.poe_31_60), ask: { what: "poe:31_60" }, delta: dl("poe_31_60") },
                { label: "61–90 days", value: cr(e.poe_61_90), ask: { what: "poe:61_90" }, delta: dl("poe_61_90") },
                { label: "90+ days", value: cr(e.poe_90), ask: { what: "poe:90" }, delta: dl("poe_90"), tone: C.red },
                { label: "not yet delivered", value: cr(e.poe_undelivered), ask: { what: "poe:undelivered" }, delta: dl("poe_undelivered"), tone: C.muted },
              ]} />}
            {isErr(d.erp) && <div className="text-xs" style={{ color: C.red }}>The ERP could not be read: {d.erp.error}</div>}
          </Section>

          {isErr(d.trend) ? <div className="text-xs mb-3" style={{ color: C.red }}>The rolling year could not be read: {d.trend.error}</div> : !d.trend.empty && <RollingYear t={d.trend as Trend} />}

          {b && (
            (() => {
              /* OE BY HEAD, PER MONTH (Dr Raghu, 14 Oct 2026: "show total OE on top and per month, mention up to 30th September (last date of previous month);
                 in each box also show total and per month; show % of OE also"). Months = the whole months from the first day to the month-end. */
              const months = Math.max(1, (Number(b.pnl_to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(b.pnl_to.slice(5, 7)) - Number(from.slice(5, 7)) + 1);
              const pm = (v: number) => cr(v / months);
              return (
                <>
                  <div className="rounded-2xl p-4 mb-3 flex items-center gap-6 flex-wrap" style={{ background: "#FFFAEB", border: "1px solid #FEDF89" }}>
                    <div><div className="text-xs font-medium" style={{ color: C.muted }}>Total OE</div><button onClick={() => undefined} className="font-bold tnum" style={{ fontSize: 24, color: C.ink, cursor: "default" }}>{cr(b.oe)}</button></div>
                    <div><div className="text-xs font-medium" style={{ color: C.muted }}>Per month</div><div className="font-bold tnum" style={{ fontSize: 24, color: C.ink }}>{pm(b.oe)}</div></div>
                    <div><div className="text-xs font-medium" style={{ color: C.muted }}>% of sales</div><div className="font-bold tnum" style={{ fontSize: 24, color: C.ink }}>{pct(b.oe, b.sales)}</div></div>
                    <div className="text-sm" style={{ color: "#93370D" }}>{dmy(from)} to <b>{dmy(b.pnl_to)}</b> — the last day of the previous month · {months} month{months === 1 ? "" : "s"}</div>
                  </div>
                  <Section title="OE by head" hint={`the twelve heads — total, per month, share of OE and of sales, to ${dmy(b.pnl_to)}`}>
                    {Object.entries(b.byHead as Record<string, number>).filter(([, v]) => v).sort((x, y) => y[1] - x[1]).map(([h, v]) => (
                      <Card key={h} label={h} value={cr(v)} ask={{ what: `head:${h}`, from, to: b.pnl_to, label: h }} tone={C.amber}
                        rows={[{ label: "Per month", value: pm(v) }, { label: "% of OE", value: pct(v, b.oe) }, { label: "% of sales", value: pct(v, b.sales) }]} />
                    ))}
                  </Section>
                </>
              );
            })()
          )}

          <Section title="The order book" hint="CRM" err={isErr(d.orders) ? d.orders.error : undefined}>
            {!isErr(d.orders) && <>
              <Card icon="✍" tone={C.green} label="Orders booked" value={cr(d.orders.order_value)} sub={`${d.orders.orders} sales orders in the dates`} ask={{ what: "orders", ...R }} delta={dl("order_value")} />
              <Card icon="📄" tone={C.brand} label="Live quotations" value={cr(d.orders.quote_value)} sub={`${d.orders.quotes_live.toLocaleString("en-IN")} live, hot-listed or submitted, quoted in the last 12 months`} ask={{ what: "quotes" }} delta={dl("quote_value")} />
            </>}
          </Section>

          {/* THE FLOOR — "show more data here, use your senses" */}
          <Section title="The floor" hint="Planning — the jobs not yet delivered, and what went out" err={isErr(d.floor) ? d.floor.error : undefined}>
            {f && <>
              <Card icon="🏭" tone={C.brand} label="Live jobs" value={String(f.live)} sub={`${cr(f.live_value)} · ${f.avg_pct}% complete on average`} ask={{ what: "live_jobs" }} delta={dl("live")} />
              <Card icon="📅" tone={C.sky} label="Due in 30 days" value={String(f.due30)} sub={cr(f.due30_value)} ask={{ what: "due_30" }} delta={dl("due30")} />
              <Card icon="⏰" tone={f.late ? C.red : C.green} label="Past delivery date" value={String(f.late)} sub={f.late ? `${cr(f.late_value)} · ${f.late_avg_days} days late on average` : "none late"} ask={{ what: "late_jobs" }} delta={dl("late")} />
              <Card icon="🔧" tone={C.violet} label="On the floor now" value={String(f.on_floor)} sub="jobs being built today" ask={{ what: "on_floor" }} delta={dl("on_floor")} />
              <Card icon="🚩" tone={f.escalated ? C.red : C.green} label="Escalated" value={String(f.escalated)} sub="jobs carrying an escalation note" ask={{ what: "escalated" }} delta={dl("escalated")} />
              <Card icon="✅" tone={C.green} label="Delivered" value={cr(f.delivered_value)} sub={`${f.delivered} jobs in the dates · ${f.delivered_month} this month, ${cr(f.delivered_month_value)}`} ask={{ what: "delivered", ...R }} delta={dl("delivered_value")} />
              <div className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${C.line}`, boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}>
                <div className="text-xs font-medium mb-2" style={{ color: C.muted }}>Where the live jobs stand</div>
                {Object.entries(f.stages as Record<string, number>).sort((x, y) => y[1] - x[1]).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs mb-1"><span style={{ width: 120, color: C.ink }}>{k}</span><div style={{ flex: 1, height: 8, background: C.bg, borderRadius: 4 }}><div style={{ width: `${(v / Math.max(1, f.live)) * 100}%`, height: 8, background: C.brand, borderRadius: 4 }} /></div><b className="tnum" style={{ width: 24, textAlign: "right" }}>{v}</b></div>
                ))}
              </div>
            </>}
          </Section>

          <Section title="Service" hint="Seva" err={isErr(d.service) ? d.service.error : undefined}>
            {!isErr(d.service) && <>
              <Card icon="🛎" tone={d.service.open_tickets ? C.red : C.green} label="Open tickets" value={String(d.service.open_tickets)} ask={{ what: "tickets" }} delta={dl("open_tickets")} />
              <Card icon="🛡" tone={C.brand} label="AMC valid" value={cr(d.service.amc_value)} sub={`${d.service.amc_valid} contracts, per annum`} ask={{ what: "amc" }} delta={dl("amc_value")} />
            </>}
          </Section>

          <Section title="People" hint="HRMS" err={isErr(d.people) ? d.people.error : undefined}>
            {p && <>
              <Card icon="👥" tone={C.brand} label="On the roll" value={String(p.headcount)} ask={{ what: "people" }} delta={dl("headcount")} sub={Object.entries(p.by_department as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(" · ")} />
              <Card icon="➕" tone={C.green} label="Added in 90 days" value={String(p.added90)} ask={{ what: "added90" }} delta={dl("added90")} />
              <Card icon="➖" tone={C.red} label="Left in 90 days" value={String(p.left90)} ask={{ what: "left90" }} delta={dl("left90")} />
              <Card icon="⌛" tone={C.amber} label="In notice period" value={String(p.notice)} ask={{ what: "notice" }} delta={dl("notice")} />
              <Card icon="📑" tone={p.fnf_pending ? C.red : C.green} label="F&F pending" value={String(p.fnf_pending)} sub="exited, settlement not closed" ask={{ what: "fnf_pending" }} delta={dl("fnf_pending")} />
            </>}
          </Section>
        </>
      )}
    </>
  );
}

export default function CeoCockpit({ email, displayName, initials, role }: { email: string; displayName: string | null; initials: string | null; role: string }) {
  const [room, setRoom] = useState<string>("dashboard");
  const [narrow, setNarrow] = useState(false);
  const hdr = useRef<HTMLDivElement>(null); const [top, setTop] = useState(56);
  useEffect(() => {
    try { setNarrow(localStorage.getItem("ceo.nav") === "0"); } catch (e) { swallow("ceo", e); }
    const apply = () => { const h = window.location.hash.replace(/^#/, ""); if (ROOMS.some((r) => r.key === h)) setRoom(h); };
    apply(); window.addEventListener("hashchange", apply);
    /* the header's own height, so the title bar freezes just under it */
    const ro = new ResizeObserver(() => { if (hdr.current) setTop(hdr.current.getBoundingClientRect().height); });
    if (hdr.current) ro.observe(hdr.current);
    return () => { window.removeEventListener("hashchange", apply); ro.disconnect(); };
  }, []);
  const go = (k: string) => { setRoom(k); try { window.history.replaceState(null, "", `#${k}`); } catch { /* fine */ } };
  const fold = () => setNarrow((v) => { try { localStorage.setItem("ceo.nav", v ? "1" : "0"); } catch { /* fine */ } return !v; });
  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink }}>
      {/* THE HEADER, FROZEN (Dr Raghu, 14 Oct 2026) */}
      <div ref={hdr} style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <GenieShell module="ceo" title="Nandan CEO" tagline="The company on one page" user={{ email, displayName, initials, role }} />
      </div>
      <DrillProvider>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <nav style={{ width: narrow ? 58 : 220, flexShrink: 0, background: "#fff", borderRight: `1px solid ${C.line}`, padding: "14px 10px", transition: "width .15s ease", position: "sticky", top, height: `calc(100vh - ${top}px)`, overflowY: "auto" }}>
            <button onClick={fold} className="w-full rounded-lg px-2 py-1.5 text-xs font-bold mb-2 text-left" style={{ color: C.muted }}>{narrow ? "»" : "« fold"}</button>
            {!narrow && <div className="text-xs font-semibold px-2 mb-1" style={{ color: C.muted, letterSpacing: 0.6 }}>MENU</div>}
            {ROOMS.map((r) => (
              <button key={r.key} onClick={() => go(r.key)} title={narrow ? r.label : undefined} className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-3 mb-1" style={room === r.key ? { background: "#ECF3FF", color: C.brand } : { color: "#344054" }}>
                <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>{!narrow && r.label}
              </button>
            ))}
          </nav>
          <main className="flex-1" style={{ minWidth: 0, maxWidth: 1480, padding: "0 20px 20px" }}>
            {room === "dashboard" || room === "internal" || room === "approvals" ? null : <div className="pt-5" />}
            {room === "dashboard" && <Dashboard top={top} />}
            {room === "people" && <PeopleRoom />}
            {room === "strategy" && <StrategyRoom />}
            {room === "execution" && <ExecutionRoom />}
            {room === "cash" && <CashRoom />}
            {room === "reviews" && <ReviewsRoom />}
            {room === "exceptions" && <ExceptionsRoom />}
            {room === "internal" && <InternalKuberRoom top={top} />}
            {room === "approvals" && <ApprovalsRoom top={top} />}
            {room === "modules" && <ModulesRoom />}
            <div className="text-xs mt-6" style={{ color: C.muted }}>Open to three: Dr Raghu, J C Kumar and Tushar Giri. Every figure is read from the module that owns it; click any number for what makes it.</div>
          </main>
        </div>
      </DrillProvider>
    </div>
  );
}

/** MODULES (Dr Raghu, 16 Oct 2026: "make a left menu called Modules, then show all the apps there as buttons inside on the right") — every door in Genie, one button each, opening in a new tab. */
function ModulesRoom() {
  return (
    <div>
      <div className="text-xl font-bold" style={{ color: C.ink }}>Modules</div>
      <div className="text-sm mb-4" style={{ color: C.muted }}>every app in Genie — each opens in its own tab</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {MODULES.map((m) => (
          <a key={m.key} href={m.href} target="_blank" rel="noreferrer" className="rounded-2xl bg-white p-4 flex items-center gap-3 hover:shadow-md" style={{ border: `1px solid ${C.line}`, boxShadow: "0 1px 3px rgba(16,24,40,.06)", color: C.ink, textDecoration: "none" }}>
            <span style={{ fontSize: 26, width: 44, height: 44, display: "grid", placeItems: "center", background: `${C.brand}14`, borderRadius: 12 }}>{m.icon}</span>
            <span><div className="font-bold">{m.label}</div><div className="text-xs" style={{ color: C.muted }}>{m.blurb}</div></span>
          </a>
        ))}
      </div>
    </div>
  );
}
