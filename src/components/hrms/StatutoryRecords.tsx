"use client";
/**
 * Finalized Salary Sheets → Statutory Records.
 *
 * The five returns, month by month — and only for FROZEN months, because a
 * return filed off numbers that can still move is a correction waiting to
 * be filed. Each link opens the register for that head, read from the
 * month's sheet alone.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/salary-sheet";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Sheet { id: string; month: number; year: number; status: string; frozen_at: string | null; frozen_by: string | null; total_count: number | null }

const RETURNS: [string, string][] = [
  ["pf", "PF Return"], ["pt", "PT Return"], ["mlwf", "MLWF Return"], ["esic", "ESIC Return"], ["tds", "TDS Return"],
];

export default function StatutoryRecords({ who }: { who: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/api/hrms/salary-sheets").then((j) => setSheets(j.sheets || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setSheets([]); });
  }, []);

  const frozen = (sheets || []).filter((s) => s.status === "Frozen");
  const drafts = (sheets || []).filter((s) => s.status !== "Frozen");

  return (
    <Pane title="Statutory Records" who={who}
      blurb="PF, PT, MLWF, ESIC and TDS returns, month by month — available the moment a month is frozen, and not a day before.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      {sheets === null && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}

      {sheets !== null && !frozen.length && (
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: C.line, maxWidth: 640 }}>
          <div className="font-bold" style={{ fontSize: 14 }}>No month is frozen yet.</div>
          <div className="text-sm mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>
            Freeze a month in Salary Sheets and its five returns appear here. A return filed off numbers
            that can still move is a correction waiting to be filed.
            {drafts.length > 0 && <> Currently in draft: {drafts.map((d) => `${MONTHS[d.month - 1]} ${d.year}`).join(", ")}.</>}
          </div>
        </div>
      )}

      {frozen.map((s) => (
        <div key={s.id} className="bg-white rounded-lg border mb-2 px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ borderColor: C.line }}>
          <div style={{ minWidth: 170 }}>
            <b style={{ fontSize: 14 }}>{MONTHS[s.month - 1]} {s.year}</b>
            <div style={{ fontSize: 10.5, color: C.faint }}>
              ❄ frozen {s.frozen_at ? fmtFull(String(s.frozen_at)) : ""} · {s.total_count ?? "—"} employees
            </div>
          </div>
          {RETURNS.map(([k, label]) => (
            <a key={k} href={`/hrms/statutory/${s.id}/print?kind=${k}`} target="_blank" rel="noopener noreferrer"
              className="rounded px-2.5 py-1.5 font-bold" style={{ background: "#F4F2EC", color: "var(--blue)", fontSize: 12 }}>
              {label}
            </a>
          ))}
        </div>
      ))}
    </Pane>
  );
}
