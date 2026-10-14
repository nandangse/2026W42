"use client";
/**
 * INTERNAL KUBER (Dr Raghu, 14 Oct 2026: "make another module, Internal
 * Kuber — all the places where we are going to generate from accruals as well
 * as from saving wastage; we will show places where it is getting wasted").
 *
 * The money already inside the company: on the left, what can be brought
 * home without a new order; on the right, where it leaks. Every figure opens
 * its lines; every line carries the one lever that moves it.
 */
import { useEffect, useState } from "react";
import { C } from "@/components/ceo/ui";
import { cr, Num } from "@/components/ceo/Drill";

type Lever = { key: string; label: string; amount: number; drill: string | null; lever: string; sub?: string; top?: { ledger: string; amount: number }[] };
type D = { today: string; from: string; pnl_to: string; months: number; rate: number; stock_days: number; sales: number; oe: number; pbt: number; generate: Lever[]; generate_total: number; wastage: Lever[]; wastage_total: number; wastage_per_month: number; carry: { stuck: number; per_month: number; per_year: number } };
const dmy = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const box: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(16,24,40,.06)" };

function Head({ label, value, sub, tone, ask }: { label: string; value: number; sub: React.ReactNode; tone: string; ask?: string }) {
  return (
    <div style={{ ...box, padding: 18, borderTop: `4px solid ${tone}` }}>
      <div className="text-xs font-semibold" style={{ color: C.muted, letterSpacing: 0.6 }}>{label}</div>
      <div className="font-bold tnum" style={{ fontSize: "clamp(20px, 2vw, 28px)", color: tone, whiteSpace: "nowrap" }}>{ask ? <Num ask={{ what: ask, label }}>{cr(value)}</Num> : cr(value)}</div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>{sub}</div>
    </div>
  );
}

function List({ title, hint, rows, total, tone, from, to }: { title: string; hint: string; rows: Lever[]; total: number; tone: string; from: string; to: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div style={{ ...box, padding: 18 }}>
      <div className="flex items-baseline gap-2"><div className="text-sm font-bold" style={{ color: C.navy, letterSpacing: 1 }}>{title}</div><div className="ml-auto font-bold tnum" style={{ color: tone }}>{cr(total)}</div></div>
      <div className="text-xs mb-3" style={{ color: C.muted }}>{hint}</div>
      <div className="grid gap-3">
        {[...rows].sort((a, b) => b.amount - a.amount).map((r) => (
          <div key={r.key} style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 10 }}>
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-semibold flex-1" style={{ color: C.ink }}>{r.label}</div>
              <div className="font-bold tnum" style={{ color: C.ink, whiteSpace: "nowrap" }}>{r.drill ? <Num ask={{ what: r.drill, from, to, label: r.label }}>{cr(r.amount)}</Num> : cr(r.amount)}</div>
              <div className="text-xs tnum" style={{ color: C.muted, width: 44, textAlign: "right" }}>{pc(r.amount, total)}</div>
            </div>
            <div style={{ height: 6, background: C.bg, borderRadius: 3, marginTop: 4 }}><div style={{ width: `${(r.amount / max) * 100}%`, height: 6, background: tone, borderRadius: 3, opacity: 0.8 }} /></div>
            {r.sub && <div className="text-xs mt-1" style={{ color: C.muted }}>{r.sub}</div>}
            {r.top && r.top.length > 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>{r.top.map((t) => `${t.ledger} ${cr(t.amount)}`).join(" · ")}</div>}
            <div className="text-xs mt-1" style={{ color: C.green }}>→ {r.lever}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InternalKuberRoom() {
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/ceo/internal", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e))); }, []);
  return (
    <div className="pt-5">
      <div className="text-xl font-bold" style={{ color: C.ink }}>Internal Kuber</div>
      <div className="text-sm mb-4" style={{ color: C.muted }}>the money already inside the company — what can be brought home without a new order, and where it leaks{d ? ` · books to ${dmy(d.pnl_to)}, the last month-end; cash today` : ""}</div>
      {err && <div className="text-sm" style={{ color: C.red }}>{err}</div>}
      {!d && !err && <div className="text-sm" style={{ color: C.muted }}>Reading the books, the ERP and Seva…</div>}
      {d && (
        <>
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <Head label="CASH TO BRING HOME" value={d.generate_total} tone={C.brand} sub="already earned or already paid out — waiting to come back" />
            <Head label="LEAKING FROM THE BOOKS" value={d.wastage_total} tone={C.red} sub={<>{cr(d.wastage_per_month)} a month · {pc(d.wastage_total, d.sales)} of sales · {d.pbt > 0 ? `${(d.wastage_total / d.pbt).toFixed(1)}× the PBT` : "PBT not positive"} ({dmy(d.from)} – {dmy(d.pnl_to)})</>} />
            <Head label="WHAT THE WAITING MONEY COSTS" value={d.carry.per_month} tone={C.amber} sub={<>a month, at {Math.round(d.rate * 100)}% a year on {cr(d.carry.stuck)} stuck (receivables 90+, delivered-unpaid over 30 days, advances, excess stock) — {cr(d.carry.per_year)} a year</>} />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
            <List title="GENERATE — FROM WHAT WE ALREADY HAVE" hint="cash today; stock against the TVC to the month-end" rows={d.generate} total={d.generate_total} tone={C.brand} from={d.from} to={d.today} />
            <List title="WASTAGE — WHERE IT LEAKS" hint={`from the books, ledger by ledger, ${dmy(d.from)} – ${dmy(d.pnl_to)}; service from Seva's tickets`} rows={d.wastage} total={d.wastage_total} tone={C.red} from={d.from} to={d.today} />
          </div>
          <div className="text-xs mt-3" style={{ color: C.muted }}>
            A ledger falls in a wastage bucket by its name and its Tally group; a bucket with nothing in it is not shown. Write-offs are a net gain this year (creditors written back), so they do not appear. A sensible stock is taken as {d.stock_days} days of TVC.
          </div>
        </>
      )}
    </div>
  );
}
