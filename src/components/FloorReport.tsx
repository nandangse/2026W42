"use client";
/**
 * The On Floor board, laid out for paper — see src/app/floor-report/page.tsx.
 *
 * The repeating table header uses THEAD, which browsers repeat per printed
 * page; nothing here uses fixed positioning, which Chrome prints as blank
 * (learned the hard way on the offer letter).
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { jobNo, lakh, today } from "@/lib/schedule";
import { LOGO } from "@/lib/logo";

interface Task { id: string; j: string; t: string; d: string; who: string; due: string | null; done: boolean; esc: string }
interface Job {
  id: string; tag: string; cust: string; val: number; tdd: string | null;
  own: string; productionOwner: string | null; kit: number; pct: number; tpv: number;
  onFloor: boolean; ownerName: string | null; ownerInitials: string | null;
}
interface Board { jobs: Job[]; tasks: Task[]; plans: Record<string, { milestones?: unknown[] } | undefined> }

const TODAY = today();

export default function FloorReport() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/board").then(setBoard).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const jobs = useMemo(
    () => (board?.jobs || []).filter((j) => j.onFloor).sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
    [board],
  );
  const tasksBy = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of board?.tasks || []) {
      if (t.done || !t.j) continue;
      m.set(t.j, [...(m.get(t.j) || []), t]);
    }
    return m;
  }, [board]);

  const totVal = jobs.reduce((s, j) => s + (j.val || 0), 0);
  // the same throughput the On Floor tab shows: tpv, the throughput value
  const totTp = jobs.reduce((s, j) => s + (j.tpv || 0), 0);
  const late = jobs.filter((j) => j.tdd && j.tdd < TODAY);

  if (err) return <div style={{ padding: 40, fontFamily: "system-ui" }}>{err.includes("401") || /sign/i.test(err) ? "Log in to Genie first, then open this page again." : err}</div>;
  if (!board) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#8A94A0" }}>reading the board…</div>;

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        html, body { margin: 0; background: #EFEDE7; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F; }
        .paper { max-width: 1150px; margin: 0 auto; background: #fff; padding: 24px 28px; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr, td, th { page-break-inside: avoid; }
        @media screen { .paper { margin: 16px auto; box-shadow: 0 2px 14px rgba(20,30,40,.12); } }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          .paper { max-width: none; margin: 0; padding: 0; box-shadow: none; }
        }
      `}</style>

      <div className="no-print" style={{ background: "#16232F", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 13, position: "sticky", top: 0, zIndex: 10 }}>
        <b>On Floor report</b>
        <span style={{ opacity: .7 }}>{jobs.length} jobs · as of {TODAY}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ background: "#E8600A", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>
          Save as PDF / Print
        </button>
      </div>

      <div className="paper">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #16232F", paddingBottom: 8, marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
          <div style={{ textAlign: "right", fontSize: 11, color: "#8B8F87" }}>
            <b style={{ color: "#16232F", fontSize: 13 }}>ON FLOOR — {TODAY}</b><br />
            walk sheet · tick each task as it is checked
          </div>
        </div>

        {/* the cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
          {[
            ["ON FLOOR", String(jobs.length), "jobs being worked on now", "#0D7A3F"],
            ["VALUE", lakh(totVal), "", "#1B3A5C"],
            ["THROUGHPUT", lakh(totTp), totVal ? `${Math.round((totTp / totVal) * 100)}% of value` : "", "#E8600A"],
            ["ALREADY LATE", String(late.length), late.length ? "past target delivery" : "none past target", late.length ? "#B3261E" : "#0D7A3F"],
          ].map(([l, v, sub, c]) => (
            <div key={l} style={{ border: `1px solid #DCD8CC`, borderTop: `3px solid ${c}`, borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, letterSpacing: ".06em", color: "#8B8F87", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              {sub && <div style={{ fontSize: 10.5, color: "#8B8F87" }}>{sub}</div>}
            </div>
          ))}
        </div>

        <table style={{ fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: "#F4F2EC" }}>
              {["Job No", "Customer Tag", "Project Owner", "Production Owner", "Milestones", "Tasks", "Kitting %", "Production %", "Open tasks — tick as checked"].map((h, i) => (
                <th key={h} style={{
                  border: "1px solid #DCD8CC", padding: "5px 7px", textAlign: i >= 4 && i <= 7 ? "right" : "left",
                  fontSize: 10, letterSpacing: ".03em", whiteSpace: i < 8 ? "nowrap" : undefined,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const tasks = tasksBy.get(j.id) || [];
              const ms = board.plans?.[j.id]?.milestones?.length || 0;
              const lateJob = j.tdd && j.tdd < TODAY;
              return (
                <tr key={j.id}>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", fontWeight: 800, whiteSpace: "nowrap" }}>
                    {jobNo(j.id)}
                    {lateJob && <div style={{ fontSize: 9, color: "#B3261E", fontWeight: 700 }}>late · TDD {j.tdd}</div>}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", minWidth: 150 }}>
                    <b>{j.tag || "—"}</b>
                    {j.cust && <div style={{ fontSize: 10, color: "#8B8F87" }}>{j.cust}</div>}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", whiteSpace: "nowrap" }}>{j.ownerName || j.own || "—"}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", whiteSpace: "nowrap", color: j.productionOwner ? "#16232F" : "#B3261E", fontWeight: j.productionOwner ? 400 : 700 }}>
                    {j.productionOwner || "not set"}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ms || "—"}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tasks.length}</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(j.kit || 0)}%</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(j.pct || 0)}%</td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", minWidth: 320 }}>
                    {!tasks.length && <span style={{ color: "#8B8F87" }}>nothing open</span>}
                    {tasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0", borderBottom: "1px solid #F2F0EA" }}>
                        {/* a box to tick with a pen — that is the whole point of the sheet */}
                        <span aria-hidden style={{ width: 11, height: 11, border: "1.5px solid #16232F", borderRadius: 2, marginTop: 2, flex: "none" }} />
                        <span style={{ lineHeight: 1.35 }}>
                          <b>{t.t}</b>{t.who ? ` — ${t.who}` : ""}{t.due ? ` · due ${t.due}` : ""}
                          {t.d && <><br /><span style={{ color: "#5A6572", fontSize: 10.5 }}>{t.d.slice(0, 160)}</span></>}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 10, fontSize: 9.5, color: "#8B8F87", display: "flex", justifyContent: "space-between" }}>
          <span>Genie · On Floor · printed {new Date().toLocaleString("en-IN")}</span>
          <span>Nandan GSE Private Limited</span>
        </div>
      </div>
    </>
  );
}
