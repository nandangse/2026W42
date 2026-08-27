"use client";
/**
 * Finalized Salary Sheets → Salary Slips.
 *
 * One row per person per FROZEN month: what they earned, what they were
 * paid, their slip, and the date they first opened it in self-service —
 * the acknowledgement HR points to later. Draft months are absent on
 * purpose: a slip that can still change is not one anybody should sign for.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/salary-sheet";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row {
  sheet_id: string; month: number; year: number;
  employee_id: string | null; name: string | null; hold: boolean;
  earned: number; paid: number;
  first_at: string | null; last_at: string | null; opens: number;
}

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

export default function SalarySlipsTable({ who }: { who: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("");

  useEffect(() => {
    api.get("/api/hrms/slips").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  const periods = useMemo(
    () => [...new Set((rows || []).map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`))].sort().reverse(),
    [rows],
  );
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (period && `${r.year}-${String(r.month).padStart(2, "0")}` !== period) return false;
      if (n && !`${r.employee_id} ${r.name}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [rows, q, period]);

  const acked = shown.filter((r) => r.first_at).length;

  const columns: Column<Row>[] = useMemo(() => [
    { key: "period", label: "Month, Year", width: 110, value: (r) => `${r.year}-${String(r.month).padStart(2, "0")}`, render: (r) => <b>{MONTHS[r.month - 1]} {r.year}</b> },
    { key: "name", label: "Name", width: 200, value: (r) => r.name, render: (r) => <span className={r.hold ? "font-bold" : ""} style={{ color: r.hold ? "#B3392E" : undefined }}>{r.name}{r.hold ? " · HOLD" : ""}</span> },
    { key: "id", label: "Employee ID", width: 100, value: (r) => r.employee_id },
    { key: "earned", label: "Earned Amount", width: 120, align: "right", numeric: true, value: (r) => r.earned, render: (r) => <span className="tnum">₹{inr(r.earned)}</span> },
    { key: "paid", label: "Paid Amount", width: 120, align: "right", numeric: true, value: (r) => r.paid, render: (r) => <b className="tnum">₹{inr(r.paid)}</b> },
    {
      key: "slip", label: "Salary Slip", width: 100, value: () => "",
      render: (r) => r.employee_id ? (
        <a href={`/hrms/salary-slips/${r.sheet_id}/print?emp=${encodeURIComponent(r.employee_id)}`} target="_blank" rel="noopener noreferrer"
          className="font-bold" style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2, fontSize: 11.5 }}>
          🧾 Open
        </a>
      ) : null,
    },
    {
      key: "ack", label: "Ack Date", width: 160, value: (r) => r.first_at,
      render: (r) => r.first_at
        ? <span style={{ fontSize: 11.5 }}><b style={{ color: C.green }}>{fmtFull(String(r.first_at).slice(0, 10))}</b><span style={{ color: C.faint }}> · last {fmtFull(String(r.last_at).slice(0, 10))} · {r.opens}×</span></span>
        : <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>not yet seen</span>,
    },
  ], []);

  return (
    <Pane title="Salary Slips" who={who} print
      blurb="Every slip of every frozen month, with the date each person first opened their own — the acknowledgement. Draft months are not here; a slip that can still change is not one to sign for.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap items-center mb-2">
        <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line }}>
          <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15 }}>{shown.length}</div>
          <div style={{ fontSize: 11, color: C.faint }}>slips shown</div>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line }}>
          <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15, color: acked ? C.green : C.ink }}>{acked}</div>
          <div style={{ fontSize: 11, color: C.faint }}>acknowledged</div>
        </div>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or name…"
          className="text-xs rounded px-2.5 py-1.5 no-print" style={{ border: `1px solid ${C.line}`, width: 200 }} />
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white no-print" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All frozen months</option>
          {periods.map((p) => { const [y, m] = p.split("-"); return <option key={p} value={p}>{MONTHS[Number(m) - 1]} {y}</option>; })}
        </select>
      </div>

      <DataTable columns={columns} rows={shown} rowKey={(r) => `${r.sheet_id}:${r.employee_id}`} initialFrozen={2}
        empty={rows === null ? "loading…" : "No frozen month yet — freeze a month in Salary Sheets and its slips appear here."} />
    </Pane>
  );
}
