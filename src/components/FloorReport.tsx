"use client";
/**
 * The On Floor walk sheet — see src/app/floor-report/page.tsx.
 *
 * Two halves, split by a page break so each can be handed to a different
 * person: the WALK (one row per job on the floor, everything pending on it
 * ordered by date, tickboxes for a pen) and the PENDING BOARD (every
 * undelivered job in the company, by product family, three columns to a
 * page, the families that carry the most throughput first).
 *
 * Every date on the sheet reads DD/MM/YY, because that is how the floor
 * says dates; ISO stays in the data and never on the paper.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { jobNo, initials, today, computeSchedule, diffDays, type PlanMilestone } from "@/lib/schedule";
import { LOGO } from "@/lib/logo";

interface Task { id: string; j: string; t: string; d: string; who: string; due: string | null; done: boolean }
interface Job {
  id: string; tag: string; fam: string; cust: string; val: number;
  tdd: string | null; otd: string | null; start: string | null;
  own: string; productionOwner: string | null; kit: number; pct: number; tpv: number;
  onFloor: boolean; active: boolean; delivered?: boolean;
  ownerName: string | null; ownerInitials: string | null;
}
interface Mat { id: string; item: string; qty: string; status: string; due?: string | null; who?: string | null }
interface Board {
  jobs: Job[]; tasks: Task[];
  plans: Record<string, { start?: string; milestones?: PlanMilestone[] } | undefined>;
  materials: Record<string, Mat[] | undefined>;
}

/** One pendency on a job — task, material or milestone — ordered by date. */
interface Pendency { kind: "task" | "material" | "milestone"; text: string; sub: string | null; date: string | null; defect?: boolean }

const TODAY = today();
/** 2026-08-24 → 24/08/26. */
const dmy = (iso: string | null | undefined) => {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "";
};
/** This Saturday — the end of the delivery week the floor is walking. */
const saturday = (() => {
  const d = new Date(TODAY + "T00:00:00");
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
})();

export default function FloorReport() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/board").then(setBoard).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const floor = useMemo(
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

  /** Everything pending on one job, as one list ordered by date — undated first. */
  const pendenciesOf = (j: Job): { list: Pendency[]; nMat: number; nMs: number; nTask: number } => {
    const list: Pendency[] = [];
    const tasks = tasksBy.get(j.id) || [];
    for (const t of tasks)
      list.push({ kind: "task", text: `${t.t}${t.who ? ` — ${t.who}` : ""}`, sub: t.d ? t.d.slice(0, 150) : null, date: t.due });
    const mats = (board?.materials?.[j.id] || []).filter((m) => m.status !== "Received");
    for (const m of mats)
      list.push({ kind: "material", text: `${m.item}${m.qty ? ` × ${m.qty}` : ""}${m.who ? ` — ${m.who}` : ""}`, sub: null, date: m.due || null, defect: m.status === "QC Defective" });
    const plan = board?.plans?.[j.id];
    let nMs = 0;
    if (plan?.milestones?.length) {
      const sched = computeSchedule({ start: plan.start || j.start || TODAY, milestones: plan.milestones });
      for (const m of sched) {
        if (m.done) continue;
        nMs++;
        list.push({ kind: "milestone", text: m.name, sub: null, date: m.end || null });
      }
    }
    // undated on top — a pendency nobody has dated is the one to ask about
    list.sort((a, b) => String(a.date || "0000").localeCompare(String(b.date || "0000")));
    return { list, nMat: mats.length, nMs, nTask: tasks.length };
  };

  const late = floor.filter((j) => j.tdd && j.tdd < TODAY);
  const week = floor.filter((j) => j.tdd && j.tdd <= saturday);
  const weekFams = useMemo(() => {
    const c = new Map<string, number>();
    for (const j of week) c.set(j.fam || "Unassigned", (c.get(j.fam || "Unassigned") || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`).join(" · ");
  }, [week]);

  /** Page two: every undelivered job, by family, richest throughput first. */
  const pendingFams = useMemo(() => {
    const pend = (board?.jobs || []).filter((j) => j.active && !j.delivered);
    const by = new Map<string, Job[]>();
    for (const j of pend) by.set(j.fam || "Unassigned", [...(by.get(j.fam || "Unassigned") || []), j]);
    return [...by.entries()]
      .map(([fam, js]) => ({ fam, jobs: js.sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))), tp: js.reduce((s, j) => s + (j.tpv || 0), 0) }))
      .sort((a, b) => b.tp - a.tp);
  }, [board]);

  if (err) return <div style={{ padding: 40, fontFamily: "system-ui" }}>{/sign|401/i.test(err) ? "Log in to Genie first, then open this page again." : err}</div>;
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
        td { vertical-align: top; }
        .cols3 { column-count: 3; column-gap: 18px; }
        .cols3 > div { break-inside: avoid; }
        @media screen { .paper { margin: 16px auto; box-shadow: 0 2px 14px rgba(20,30,40,.12); } }
        @media print {
          html, body { background: #fff; }
          .no-print { display: none !important; }
          .paper { max-width: none; margin: 0; padding: 0; box-shadow: none; }
          .pagebreak { break-after: page; page-break-after: always; }
        }
      `}</style>

      <div className="no-print" style={{ background: "#16232F", color: "#fff", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 13, position: "sticky", top: 0, zIndex: 10 }}>
        <b>On Floor report</b>
        <span style={{ opacity: .7 }}>{floor.length} jobs · {dmy(TODAY)}</span>
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
            <b style={{ color: "#16232F", fontSize: 13 }}>ON FLOOR — {dmy(TODAY)}</b><br />
            walk sheet · tick each item as it is checked
          </div>
        </div>

        {/* three narrow boxes; the money stays on the screen */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {([
            ["ON FLOOR", String(floor.length), "being worked on now", "#0D7A3F"],
            ["ALREADY LATE", String(late.length), late.length ? "past target delivery" : "none past target", late.length ? "#B3261E" : "#0D7A3F"],
            [`DELIVERY THIS WEEK · UPTO ${dmy(saturday)}`, String(week.length), week.length ? weekFams : "nothing due by Saturday", "#E8600A"],
          ] as const).map(([l, v, sub, c]) => (
            <div key={l} style={{ border: `1px solid #DCD8CC`, borderTop: `3px solid ${c}`, borderRadius: 6, padding: "6px 12px", minWidth: 130, maxWidth: 420 }}>
              <div style={{ fontSize: 9.5, letterSpacing: ".05em", color: "#8B8F87", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              {sub && <div style={{ fontSize: 12, color: "#46545F" }}>{sub}</div>}
            </div>
          ))}
        </div>

        <table style={{ fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: "#F4F2EC" }}>
              {([
                ["Job · TDD", "left"], ["Owners", "left"], ["Pending\nMat/Mile/Task", "right"], ["K%\nP%", "right"],
                ["Project pendencies — by date, undated on top — tick as checked", "left"],
              ] as const).map(([h, align]) => (
                <th key={h} style={{ border: "1px solid #DCD8CC", padding: "5px 7px", textAlign: align, fontSize: 10, letterSpacing: ".03em", whiteSpace: "pre-line" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floor.map((j) => {
              const { list, nMat, nMs, nTask } = pendenciesOf(j);
              const lateJob = j.tdd && j.tdd < TODAY;
              return (
                <tr key={j.id}>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px", minWidth: 140, maxWidth: 180 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{jobNo(j.id)}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.3, marginTop: 1 }}>{j.tag || "—"}</div>
                    {j.cust && <div style={{ fontSize: 10, color: "#8B8F87" }}>{j.cust}</div>}
                    {j.tdd && (
                      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: lateJob ? "#B3261E" : "#16232F", fontVariantNumeric: "tabular-nums" }}>
                        {dmy(j.tdd)}{lateJob ? " ⚠" : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px", whiteSpace: "nowrap" }}>
                    <div title={j.ownerName || j.own}>Prj <b>{j.ownerInitials || initials(j.ownerName || j.own || "") || "—"}</b></div>
                    <div title={j.productionOwner || "not set"} style={{ marginTop: 2, color: j.productionOwner ? "#16232F" : "#B3261E", fontWeight: j.productionOwner ? 400 : 700 }}>
                      Prd {j.productionOwner ? <b>{initials(j.productionOwner)}</b> : "—"}
                    </div>
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: 64 }}>
                    {nMat} / {nMs} / {nTask}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: 52 }}>
                    <div>K {Math.round(j.kit || 0)}%</div>
                    <div>P {Math.round(j.pct || 0)}%</div>
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px" }}>
                    {!list.length && <span style={{ color: "#8B8F87" }}>nothing pending</span>}
                    {list.map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0", borderBottom: "1px solid #F2F0EA" }}>
                        <span aria-hidden style={{
                          width: 11, height: 11, borderRadius: 2, marginTop: 2, flex: "none",
                          border: `1.5px solid ${x.kind === "material" ? "#8A5B00" : x.kind === "milestone" ? "#1B3A5C" : "#16232F"}`,
                        }} />
                        <span style={{ lineHeight: 1.35 }}>
                          <span style={{
                            fontWeight: 700, fontSize: 9,
                            color: x.kind === "material" ? "#8A5B00" : x.kind === "milestone" ? "#1B3A5C" : "#5A6572",
                          }}>{x.kind === "material" ? "MAT" : x.kind === "milestone" ? "MILE" : "TASK"}</span>{" "}
                          <b>{x.text}</b>
                          {x.date ? ` · ${dmy(x.date)}` : <b style={{ color: "#B3261E" }}> · NO DATE</b>}
                          {x.defect && <b style={{ color: "#B3261E" }}> · QC DEFECTIVE</b>}
                          {x.sub && <><br /><span style={{ color: "#5A6572", fontSize: 10.5 }}>{x.sub}</span></>}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pagebreak" />

        {/* ── page two: every job still to deliver, by family ── */}
        <div style={{ borderBottom: "2px solid #16232F", paddingBottom: 6, marginBottom: 10, marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <b style={{ fontSize: 15, letterSpacing: ".03em" }}>PENDING JOBS</b>
          <span style={{ fontSize: 10.5, color: "#8B8F87" }}>every undelivered job · families carrying the most throughput first · {dmy(TODAY)}</span>
        </div>

        {pendingFams.map(({ fam, jobs: js }) => (
          <div key={fam} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 13, borderBottom: "1px solid #DCD8CC", paddingBottom: 2, marginBottom: 6 }}>
              {fam} <span style={{ fontWeight: 400, color: "#8B8F87", fontSize: 11 }}>· {js.length} pending</span>
            </div>
            <div className="cols3" style={{ fontSize: 12 }}>
              {js.map((j) => {
                const slip = j.otd && j.tdd && j.tdd > j.otd ? diffDays(j.otd, j.tdd) : 0;
                const overdue = j.tdd && j.tdd < TODAY;
                return (
                  <div key={j.id} style={{ padding: "2px 0", lineHeight: 1.45 }}>
                    <b>{jobNo(j.id)}</b> · {j.tag || "—"} ·{" "}
                    {slip > 0 || overdue ? (
                      <span style={{ border: "1.5px solid #B3261E", borderRadius: 3, padding: "0 4px", color: "#B3261E", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {dmy(j.tdd)}{slip > 0 ? ` · Delay: ${slip}d` : ""}{overdue && !slip ? " · overdue" : ""}
                      </span>
                    ) : (
                      <b style={{ whiteSpace: "nowrap" }}>{j.tdd ? dmy(j.tdd) : "no TDD"}</b>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 10, fontSize: 9.5, color: "#8B8F87", display: "flex", justifyContent: "space-between" }}>
          <span>Genie · On Floor · printed {dmy(TODAY)}</span>
          <span>Nandan GSE Private Limited</span>
        </div>
      </div>
    </>
  );
}
