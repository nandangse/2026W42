"use client";
import React, { useState } from "react";
import { addDays, parseISO, fmtFull, jobNo, today, isoWeek } from "@/lib/schedule";

/**
 * THE NEXT THIRTY DAYS (Dr Raghu, 2 Sep 2026: "Show a calendar view on one
 * line ... Show number of jobs TDD for each day ... Firt column show -
 * previous, last colum show later ... On mobile this can be skipped. Only on
 * compurer"), and then (2 Sep 2026, of the plan desk): "I had asked you to
 * put the jobs line, this one!"
 *
 * It was written inline on the Priority List, which meant the plan desk could
 * not have it without a copy -- and a copy is two strips that drift apart the
 * first time one is fixed. So it lives here now, one implementation, mounted
 * in both places. The plan answers WHAT the month is worth; this answers WHEN
 * it lands, and the two ends carry the warnings: everything already overdue
 * gathered into PREVIOUS, everything past the horizon into LATER.
 */
export type StripJob = { id: string; tag?: string | null; tdd?: string | null };

const TODAY = today();

export default function NextThirtyDays({ jobs }: { jobs: StripJob[] }) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);
        const DAYS = 30;
        const days = Array.from({ length: DAYS }, (_, i) => addDays(TODAY, i));
        const from = days[0], to = days[DAYS - 1];
        const on = (iso: string) => jobs.filter((j) => (j.tdd || "").slice(0, 10) === iso);
        const before = jobs.filter((j) => j.tdd && j.tdd < from);
        const after = jobs.filter((j) => j.tdd && j.tdd > to);
        const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dm = (iso: string) => { const d = parseISO(iso); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
        /** What the mouse reveals: the jobs themselves, in delivery order. */
        const cell = (n: number) => n ? (n > 3 ? "#B3261E" : n > 1 ? "#E8600A" : "#16232F") : "#C9C6BE";
        const panel = (list: StripJob[], label: string) => (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 40, minWidth: 320, maxWidth: 460,
            background: "#16232F", color: "#fff", borderRadius: 6, padding: "8px 10px",
            boxShadow: "0 10px 30px rgba(22,35,47,.35)", textAlign: "left", whiteSpace: "normal",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#F5B32B", letterSpacing: .6, marginBottom: 4 }}>
              {label} · {list.length} job{list.length === 1 ? "" : "s"}
            </div>
            {list.slice(0, 14).map((j) => (
              <div key={j.id} style={{ fontSize: 11, lineHeight: 1.5 }}>
                <b>{jobNo(j.id)}</b> <span style={{ color: "#C9D3DE" }}>{j.tag}</span>{" "}
                <span style={{ color: "#8FA1B3" }}>· {fmtFull(j.tdd ?? null)}</span>
              </div>
            ))}
            {list.length > 14 && <div style={{ fontSize: 10, color: "#8FA1B3", marginTop: 3 }}>…and {list.length - 14} more</div>}
          </div>
        );

  return (
          <div className="hidden md:block bg-white rounded-lg border mb-3 overflow-x-auto" style={{ borderColor: "#E2E0DA" }}>
            <div className="px-3 pt-2 text-xs font-bold" style={{ color: "#8A94A0" }}>
              THE NEXT 30 DAYS — jobs by target delivery date · hover a day to see them
            </div>
            <table className="text-xs" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
              <tbody>
                <tr>
                  <td onMouseEnter={() => setHoverDay("prev")} onMouseLeave={() => setHoverDay(null)}
                    className="px-1 py-1.5 text-center"
                    style={{ borderRight: "2px solid #E2E0DA", background: "#F7F5EF", cursor: before.length ? "help" : "default", width: 74, position: "relative" }}>
                    {hoverDay === "prev" && before.length > 0 && panel(before, "OVERDUE — before today")}
                    <div style={{ fontSize: 9.5, color: "#8A94A0", fontWeight: 700 }}>PREVIOUS</div>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: before.length ? "#B3261E" : "#C9C6BE" }}>{before.length || "·"}</div>
                    <div style={{ fontSize: 9, color: "#8A94A0" }}>overdue</div>
                  </td>
                  {days.map((iso) => {
                    const d = parseISO(iso);
                    const sun = d.getUTCDay() === 0;
                    const list = on(iso);
                    const isToday = iso === TODAY;
                    return (
                      <td key={iso}
                        onMouseEnter={() => setHoverDay(iso)} onMouseLeave={() => setHoverDay(null)}
                        className="px-0.5 py-1.5 text-center"
                        style={{
                          background: sun ? "#FDF6D8" : isToday ? "#EAF4EE" : "#fff",
                          borderRight: "1px solid #F1EFE9",
                          borderTop: isToday ? "2px solid #0D7A3F" : "none",
                          cursor: list.length ? "help" : "default",
                          position: "relative",
                        }}>
                        {hoverDay === iso && list.length > 0 && panel(list, `${dm(iso)} ${dow[d.getUTCDay()]}`)}
                        {sun && <div style={{ fontSize: 8.5, fontWeight: 800, color: "#8A6D1A" }}>W{isoWeek(iso)}</div>}
                        <div className="tnum" style={{ fontSize: 9.5, color: sun ? "#8A6D1A" : "#8A94A0", fontWeight: sun ? 700 : 400 }}>{dm(iso)}</div>
                        <div style={{ fontSize: 9, color: sun ? "#8A6D1A" : "#B8B5AC" }}>{dow[d.getUTCDay()]}</div>
                        <div className="tnum" style={{ fontSize: 14, fontWeight: 800, color: cell(list.length) }}>{list.length || "·"}</div>
                      </td>
                    );
                  })}
                  <td onMouseEnter={() => setHoverDay("later")} onMouseLeave={() => setHoverDay(null)}
                    className="px-1 py-1.5 text-center"
                    style={{ borderLeft: "2px solid #E2E0DA", background: "#F7F5EF", cursor: after.length ? "help" : "default", width: 74, position: "relative" }}>
                    {hoverDay === "later" && after.length > 0 && (
                      <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 40 }}>{panel(after, "BEYOND 30 DAYS")}</div>
                    )}
                    <div style={{ fontSize: 9.5, color: "#8A94A0", fontWeight: 700 }}>LATER</div>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: after.length ? "#1B3A5C" : "#C9C6BE" }}>{after.length || "·"}</div>
                    <div style={{ fontSize: 9, color: "#8A94A0" }}>beyond</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
}
