"use client";
/**
 * THE CEO'S ROOMS (Dr Raghu, 14 Oct 2026: "show on the left side Menu —
 * Dashboard, People, Strategy, Execution, Cash, Reviews, Exceptions"). Each
 * reads what Genie already holds for it; every number opens its lightbox and
 * every line opens its own record in a new tab.
 */
import { useEffect, useState } from "react";
import { Card, Section } from "@/components/ceo/ui";
import { cr, Num } from "@/components/ceo/Drill";

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)", GREEN = "var(--green)";
const ERP = "https://nandanerp.in/app";
const dmy = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const mon = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
/* eslint-disable @typescript-eslint/no-explicit-any */
function useRoom(name: string): [any, string | null] {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(null); fetch(`/api/ceo/room?name=${name}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e))); }, [name]);
  return [d, err];
}
const Title = ({ t, s }: { t: string; s: string }) => <div className="mb-3"><h1 className="font-bold" style={{ fontSize: 22, color: NAVY }}>{t}</h1><div className="text-xs" style={{ color: MUTED }}>{s}</div></div>;
const Wait = ({ err }: { err: string | null }) => (err ? <div className="text-sm font-bold" style={{ color: RED }}>{err}</div> : <div className="text-sm" style={{ color: MUTED }}>Reading…</div>);
const Box = ({ children, min = 640 }: { children: React.ReactNode; min?: number }) => <div className="rounded-lg bg-white mb-4" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "60vh" }}><table className="genie-table" style={{ minWidth: min, width: "100%" }}>{children}</table></div>;
const Out = ({ href, children }: { href: string | null; children: React.ReactNode }) => (href ? <a href={href} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }}>{children} ↗</a> : <b>{children}</b>);

export function PeopleRoom() {
  const [d, err] = useRoom("people");
  if (!d) return <><Title t="People" s="the roll, the joiners, how long people stay" /><Wait err={err} /></>;
  return (
    <>
      <Title t="People" s="the HRMS roll — active people, by department and by tenure; the last 90 days' joiners" />
      <Section title="THE ROLL">
        <Card label="ON THE ROLL" value={String(d.headcount)} ask={{ what: "people" }} />
        <Card label="JOINED IN 90 DAYS" value={String(d.joiners.length)} ask={{ what: "people", label: "On the roll — the date is the date of joining" }} />
        <Card label="NO LONGER ON THE ROLL" value={String(d.left_on_roll)} sub="records kept, marked inactive" />
      </Section>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
        <Box min={300}><thead><tr><th>Department</th><th style={{ textAlign: "right" }}>People</th></tr></thead><tbody>{Object.entries(d.by_department as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td className="tnum text-right"><Num ask={{ what: "people", label: `On the roll — ${k} is among them` }}>{v}</Num></td></tr>)}</tbody></Box>
        <Box min={300}><thead><tr><th>Tenure</th><th style={{ textAlign: "right" }}>People</th></tr></thead><tbody>{Object.entries(d.tenure as Record<string, number>).map(([k, v]) => <tr key={k}><td>{k}</td><td className="tnum text-right">{v}</td></tr>)}</tbody></Box>
      </div>
      <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>JOINED IN THE LAST 90 DAYS</div>
      <Box><thead><tr><th>Name</th><th>Designation</th><th>Department</th><th>Joined</th></tr></thead><tbody>{d.joiners.map((j: any, i: number) => <tr key={i}><td><a href="/hrms" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }}>{j.name} ↗</a></td><td className="text-xs">{j.designation}</td><td className="text-xs">{j.department}</td><td className="tnum text-xs">{dmy(j.doj)}</td></tr>)}{d.joiners.length === 0 && <tr><td colSpan={4} style={{ color: MUTED }}>Nobody.</td></tr>}</tbody></Box>
    </>
  );
}

export function StrategyRoom() {
  const [d, err] = useRoom("strategy");
  if (!d) return <><Title t="Strategy" s="the philosophy and the KPIs" /><Wait err={err} /></>;
  return (
    <>
      <Title t="Strategy" s="from the Leaders Council — the philosophy pages (values, OPSP, the quarterly reports) and the company KPIs by month, the latest on the left" />
      <Section title="THE PHILOSOPHY">
        {d.philosophy.map((p: any) => <a key={p.id} href="/lc#philosophy" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><div className="bg-white rounded-lg p-3 h-full" style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${NAVY}` }}><div className="font-bold" style={{ color: NAVY }}>{p.title} ↗</div><div className="text-xs mt-0.5" style={{ color: p.approved_at ? GREEN : MUTED }}>{p.approved_at ? `approved ${dmy(p.approved_at)}` : "not yet approved"}</div></div></a>)}
        <a href="/lc#principles" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><div className="bg-white rounded-lg p-3 h-full" style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${NAVY}` }}><div className="font-bold" style={{ color: NAVY }}>{d.principles} principles ↗</div><div className="text-xs" style={{ color: MUTED }}>what we do and what we don&apos;t</div></div></a>
      </Section>
      <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>THE KPIs</div>
      <Box min={800}>
        <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3 }}>KPI</th><th>Group</th>{d.months.map((m: string) => <th key={m} style={{ textAlign: "right" }}>{mon(m)}</th>)}</tr></thead>
        <tbody>{d.kpis.map((k: any) => <tr key={k.id}><td style={{ position: "sticky", left: 0, background: "#fff" }}><a href="/lc#kpis" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }}>{k.name} ↗</a></td><td className="text-xs" style={{ color: MUTED }}>{k.group}</td>{d.months.map((m: string) => { const v = k.values[m]; return <td key={m} className="tnum text-right text-xs">{v === undefined ? <span style={{ color: "#CBD5E1" }}>·</span> : k.type === "currency" ? cr(v) : v.toLocaleString("en-IN")}</td>; })}</tr>)}</tbody>
      </Box>
    </>
  );
}

export function ExecutionRoom() {
  const [d, err] = useRoom("execution");
  if (!d) return <><Title t="Execution" s="the floor, the deliveries, service" /><Wait err={err} /></>;
  const late = d.live.filter((j: any) => j.late > 0);
  return (
    <>
      <Title t="Execution" s="the jobs on the floor by delivery date, what went out in the last 90 days, the open service orders and the service team's next seven days" />
      <Section title="THE FLOOR">
        <Card label="LIVE JOBS" value={String(d.live.length)} sub={cr(d.live.reduce((s: number, j: any) => s + j.val, 0))} ask={{ what: "live_jobs" }} />
        <Card label="PAST DELIVERY DATE" value={String(late.length)} sub={cr(late.reduce((s: number, j: any) => s + j.val, 0))} ask={{ what: "late_jobs" }} tone={late.length ? RED : GREEN} />
        {Object.entries(d.delivered90 as Record<string, { n: number; val: number }>).sort((a, b) => b[0].localeCompare(a[0])).map(([m, x]) => { const [y, mo] = m.split("-").map(Number); return <Card key={m} label={`DELIVERED ${mon(m).toUpperCase()}`} value={cr(x.val)} sub={`${x.n} jobs`} ask={{ what: "delivered", from: `${m}-01`, to: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }} tone={GREEN} />; })}
      </Section>
      <Box min={1000}>
        <thead><tr><th>Job</th><th>Customer</th><th>Machine</th><th>Stage</th><th>Owner</th><th>Delivery date</th><th style={{ textAlign: "right" }}>Late by</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
        <tbody>{d.live.map((j: any) => <tr key={j.id}><td className="tnum"><Out href={`${ERP}/jobmaster/${j.id}`}>{j.id}</Out></td><td className="text-xs" style={{ maxWidth: 200 }}>{j.cust}</td><td className="text-xs" style={{ maxWidth: 240 }}>{j.tag}</td><td className="text-xs">{j.stat}</td><td className="text-xs">{j.own}</td><td className="tnum text-xs">{dmy(j.tdd)}</td><td className="tnum text-right text-xs font-bold" style={{ color: j.late ? RED : MUTED }}>{j.late ? `${j.late} d` : "—"}</td><td className="tnum text-right text-xs">{cr(j.val)}</td></tr>)}</tbody>
      </Box>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))" }}>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>OPEN SERVICE ORDERS</div>
          <Box min={420}><thead><tr><th>Order</th><th>Customer</th><th style={{ textAlign: "right" }}>Spares + service</th><th>Status</th></tr></thead><tbody>{d.service_orders.map((o: any, i: number) => <tr key={i}><td className="tnum text-xs"><Out href="/seva#orders">{o.so_no}</Out></td><td className="text-xs">{o.customer}</td><td className="tnum text-right text-xs">{cr(Number(o.spares_amount) + Number(o.service_amount))}</td><td className="text-xs">{o.status}</td></tr>)}{d.service_orders.length === 0 && <tr><td colSpan={4} style={{ color: MUTED }}>None open.</td></tr>}</tbody></Box></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>THE SERVICE TEAM — NEXT 7 DAYS</div>
          <Box min={420}><thead><tr><th>Day</th><th>Who</th><th>What</th><th>Customer</th></tr></thead><tbody>{d.next7.map((p: any, i: number) => <tr key={i}><td className="tnum text-xs">{dmy(p.on_date)}</td><td className="text-xs"><Out href="/seva#plan">{p.person_name}</Out></td><td className="text-xs">{p.kind}</td><td className="text-xs">{p.customer}</td></tr>)}{d.next7.length === 0 && <tr><td colSpan={4} style={{ color: MUTED }}>Nothing planned.</td></tr>}</tbody></Box></div>
      </div>
    </>
  );
}

export function CashRoom() {
  const [d, err] = useRoom("cash");
  if (!d) return <><Title t="Cash" s="what is owed both ways, and what is planned to go out" /><Wait err={err} /></>;
  const table = (rows: any[], what: string) => (
    <Box min={460}><thead><tr><th>Party</th><th style={{ textAlign: "right" }}>Open</th><th style={{ textAlign: "right" }}>Over 180 days</th><th>Oldest bill</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.party}><td className="text-xs font-semibold"><a href={what === "receivable" ? "/kuber#receivables" : "/kuber#payables"} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "var(--blue)" }}>{r.party} ↗</a></td><td className="tnum text-right text-xs">{cr(r.open)}</td><td className="tnum text-right text-xs" style={{ color: r.over180 ? RED : MUTED }}>{r.over180 ? cr(r.over180) : "—"}</td><td className="tnum text-xs">{dmy(r.oldest)}</td></tr>)}</tbody></Box>
  );
  return (
    <>
      <Title t="Cash" s="from Tally's open bills and Kuber's payment plan — today" />
      <Section title="OWED">
        <Card label="RECEIVABLES" value={cr(d.receivable.open)} sub={`${d.receivable.parties} parties`} ask={{ what: "receivable" }} tone={RED} />
        <Card label="RECEIVABLES OVER 180 DAYS" value={cr(d.receivable.over180)} ask={{ what: "receivable_180" }} tone={RED} />
        <Card label="PAYABLES" value={cr(d.payable.open)} sub={`${d.payable.parties} parties`} ask={{ what: "payable" }} />
        <Card label="PAYABLES OVER 180 DAYS" value={cr(d.payable.over180)} ask={{ what: "payable_180" }} />
      </Section>
      <Section title="TO GO OUT — KUBER'S PAYMENT PLAN">
        <Card label="PLANNED, AWAITING APPROVAL" value={cr(d.plan.planned)} />
        <Card label="APPROVED, NOT YET PAID" value={cr(d.plan.approved)} tone="#7C3AED" />
      </Section>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))" }}>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>THE LARGEST 15 WHO OWE US</div>{table(d.top_receivable, "receivable")}</div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>THE LARGEST 15 WE OWE</div>{table(d.top_payable, "payable")}</div>
      </div>
      <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>THE PAYMENT PLAN — NEXT</div>
      <Box><thead><tr><th>Date</th><th>Party</th><th>For</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead><tbody>{d.plan.rows.map((p: any, i: number) => <tr key={i}><td className="tnum text-xs">{dmy(p.plan_date)}</td><td className="text-xs"><Out href="/kuber#payplan">{p.party}</Out></td><td className="text-xs">{p.purpose}</td><td className="text-xs">{p.status}</td><td className="tnum text-right text-xs">{cr(Number(p.amount))}</td></tr>)}</tbody></Box>
    </>
  );
}

export function ReviewsRoom() {
  const [d, err] = useRoom("reviews");
  if (!d) return <><Title t="Reviews" s="the council's meetings and the audits" /><Wait err={err} /></>;
  return (
    <>
      <Title t="Reviews" s="the Leaders Council's meetings — who came, whether the minutes are written, how many checked in — and the internal audits with their non-conformities" />
      <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>LEADERS COUNCIL MEETINGS</div>
      <Box><thead><tr><th>Date</th><th>Where</th><th style={{ textAlign: "right" }}>Attended</th><th style={{ textAlign: "right" }}>Checked in</th><th>Minutes</th></tr></thead><tbody>{d.meetings.map((m: any) => <tr key={m.id}><td className="tnum"><Out href={`/lc#meetings/${m.id}`}>{dmy(m.held_on)}</Out></td><td className="text-xs">{m.location}</td><td className="tnum text-right text-xs">{m.attendees}</td><td className="tnum text-right text-xs">{m.checkins}</td><td className="text-xs" style={{ color: m.minutes ? GREEN : RED }}>{m.minutes ? "written" : "not written"}</td></tr>)}{d.meetings.length === 0 && <tr><td colSpan={5} style={{ color: MUTED }}>No meeting yet.</td></tr>}</tbody></Box>
      <div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>INTERNAL AUDITS — IMS</div>
      <Box><thead><tr><th>Audit</th><th>Status</th><th>Started</th><th>Target</th><th style={{ textAlign: "right" }}>Non-conformities</th><th style={{ textAlign: "right" }}>Open</th></tr></thead><tbody>{d.audits.map((a: any) => <tr key={a.id}><td className="tnum"><Out href="/ims#audit">{a.audit_no}</Out></td><td className="text-xs">{a.status}</td><td className="tnum text-xs">{dmy(a.date_start)}</td><td className="tnum text-xs">{dmy(a.target_end)}</td><td className="tnum text-right text-xs">{a.ncs}</td><td className="tnum text-right text-xs font-bold" style={{ color: a.open_ncs ? RED : GREEN }}>{a.open_ncs}</td></tr>)}</tbody></Box>
    </>
  );
}

export function ExceptionsRoom() {
  const [d, err] = useRoom("exceptions");
  if (!d) return <><Title t="Exceptions" s="what is off track, everywhere" /><Wait err={err} /></>;
  return (
    <>
      <Title t="Exceptions" s="only what is off track — jobs past their date, money over 180 days, tickets older than 90 days, AMCs past their valid-till date, problems blocked or overdue, quotations waiting for approval" />
      <Section title="OFF TRACK">
        <Card label="JOBS PAST DELIVERY DATE" value={String(d.late_jobs.length)} ask={{ what: "late_jobs" }} tone={d.late_jobs.length ? RED : GREEN} />
        <Card label="RECEIVABLES OVER 180 DAYS" value={cr(d.debt_180.reduce((s: number, r: any) => s + r.over180, 0))} sub={`${d.debt_180.length} largest parties shown`} ask={{ what: "receivable_180" }} tone={RED} />
        <Card label="TICKETS OLDER THAN 90 DAYS" value={String(d.old_tickets.count)} ask={{ what: "tickets", label: "Open tickets — the old ones are at the bottom by date" }} tone={d.old_tickets.count ? RED : GREEN} />
        <Card label="AMC PAST VALID-TILL" value={String(d.amc_lapsed.length)} ask={{ what: "amc" }} tone={d.amc_lapsed.length ? RED : GREEN} />
        <Card label="PROBLEMS BLOCKED" value={String(d.problems.blocked.length)} sub={`${d.problems.overdue.length} past their tentative date`} tone={d.problems.blocked.length ? RED : GREEN} />
        <Card label="QUOTES AWAITING APPROVAL" value={String(d.quotes_waiting.length)} tone={d.quotes_waiting.length ? "#B45309" : GREEN} />
      </Section>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))" }}>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>JOBS PAST THEIR DATE</div>
          <Box min={440}><thead><tr><th>Job</th><th>Customer</th><th style={{ textAlign: "right" }}>Late by</th><th style={{ textAlign: "right" }}>Value</th></tr></thead><tbody>{d.late_jobs.map((j: any) => <tr key={j.id}><td className="tnum text-xs"><Out href={`${ERP}/jobmaster/${j.id}`}>{j.id}</Out></td><td className="text-xs">{j.cust}<div style={{ color: MUTED }}>{j.own}</div></td><td className="tnum text-right text-xs font-bold" style={{ color: RED }}>{j.late} d</td><td className="tnum text-right text-xs">{cr(j.val)}</td></tr>)}</tbody></Box></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>OWED TO US OVER 180 DAYS</div>
          <Box min={440}><thead><tr><th>Party</th><th style={{ textAlign: "right" }}>Over 180 days</th><th>Oldest</th></tr></thead><tbody>{d.debt_180.map((r: any) => <tr key={r.party}><td className="text-xs"><Out href="/kuber#receivables">{r.party}</Out></td><td className="tnum text-right text-xs font-bold" style={{ color: RED }}>{cr(r.over180)}</td><td className="tnum text-xs">{dmy(r.oldest)}</td></tr>)}</tbody></Box></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>TICKETS OLDER THAN 90 DAYS</div>
          <Box min={440}><thead><tr><th>Ticket</th><th>Customer</th><th style={{ textAlign: "right" }}>Age</th></tr></thead><tbody>{d.old_tickets.rows.map((t: any) => <tr key={t.erp_name}><td className="text-xs"><Out href={`${ERP}/issue/${encodeURIComponent(t.erp_name)}`}>{t.erp_name}</Out><div style={{ color: MUTED }}>{t.title}</div></td><td className="text-xs">{t.customer}</td><td className="tnum text-right text-xs font-bold" style={{ color: RED }}>{t.age} d</td></tr>)}</tbody></Box></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>PROBLEMS BLOCKED OR OVERDUE</div>
          <Box min={440}><thead><tr><th>Problem</th><th>Status</th><th>Tentative</th></tr></thead><tbody>{[...d.problems.blocked, ...d.problems.overdue].map((p: any) => <tr key={p.id}><td className="text-xs"><Out href={`/lc#solutions/${p.id}`}>{p.title}</Out></td><td className="text-xs">{p.status.replace(/_/g, " ")}</td><td className="tnum text-xs">{dmy(p.tentative_on)}</td></tr>)}</tbody></Box></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: NAVY, letterSpacing: 1 }}>AMC PAST VALID-TILL, STILL MARKED VALID</div>
          <Box min={440}><thead><tr><th>Contract</th><th>Customer</th><th>Till</th><th style={{ textAlign: "right" }}>Value</th></tr></thead><tbody>{d.amc_lapsed.map((a: any) => <tr key={a.erp_name}><td className="text-xs"><Out href={`${ERP}/annual-maintenance-contract/${encodeURIComponent(a.erp_name)}`}>{a.erp_name}</Out></td><td className="text-xs">{a.customer}</td><td className="tnum text-xs" style={{ color: RED }}>{dmy(a.end_date)}</td><td className="tnum text-right text-xs">{cr(Number(a.value))}</td></tr>)}</tbody></Box></div>
      </div>
    </>
  );
}
