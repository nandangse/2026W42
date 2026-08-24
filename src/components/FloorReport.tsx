"use client";
/**
 * The On Floor walk sheet — see src/app/floor-report/page.tsx.
 *
 * Laid out to Dr Raghu's spec of 24 Aug 2026: the money cards stay on the
 * screen and OFF the paper (the sheet is for the walk, not the review), the
 * job's identity and its TDD share one cell, owners are initials, and the
 * work column carries BOTH the open tasks and the material still to arrive —
 * because on the shop floor "what is left" is one question, not two lists.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { jobNo, initials, today } from "@/lib/schedule";
import { LOGO } from "@/lib/logo";

interface Task { id: string; j: string; t: string; d: string; who: string; due: string | null; done: boolean }
interface Job {
  id: string; tag: string; fam: string; cust: string; val: number; tdd: string | null;
  own: string; productionOwner: string | null; kit: number; pct: number;
  onFloor: boolean; ownerName: string | null; ownerInitials: string | null;
}
interface Mat { id: string; item: string; qty: string; status: string; due?: string | null; who?: string | null }
interface Board {
  jobs: Job[]; tasks: Task[];
  plans: Record<string, { milestones?: { done?: boolean }[] } | undefined>;
  materials: Record<string, Mat[] | undefined>;
}

const TODAY = today();
/** 2026-08-22 → 22/08 — the date as the floor says it. */
const ddmm = (iso: string | null | undefined) => {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
};

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

  const late = jobs.filter((j) => j.tdd && j.tdd < TODAY);

  // "8 Hi Lift, 3 WDL" — what the floor is actually building, by family
  const famLine = useMemo(() => {
    const c = new Map<string, number>();
    for (const j of jobs) c.set(j.fam || "Unassigned", (c.get(j.fam || "Unassigned") || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`).join(" · ");
  }, [jobs]);

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

        {/* the counts that matter on a walk; the money stays on the screen */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 4 }}>
          {[
            ["ON FLOOR", String(jobs.length), "jobs being worked on now", "#0D7A3F"],
            ["ALREADY LATE", String(late.length), late.length ? "past target delivery" : "none past target", late.length ? "#B3261E" : "#0D7A3F"],
          ].map(([l, v, sub, c]) => (
            <div key={l} style={{ border: `1px solid #DCD8CC`, borderTop: `3px solid ${c}`, borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, letterSpacing: ".06em", color: "#8B8F87", fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              {sub && <div style={{ fontSize: 10.5, color: "#8B8F87" }}>{sub}</div>}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#46545F", marginBottom: 12 }}>{famLine}</div>

        <table style={{ fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: "#F4F2EC" }}>
              {[
                ["Job · TDD", "left"], ["Owners", "left"], ["Pending\nM / T", "right"], ["K% · P%", "right"],
                ["Open tasks and pending material — tick as checked", "left"],
              ].map(([h, align]) => (
                <th key={h} style={{
                  border: "1px solid #DCD8CC", padding: "5px 7px", textAlign: align as "left" | "right",
                  fontSize: 10, letterSpacing: ".03em", whiteSpace: "pre-line",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const tasks = tasksBy.get(j.id) || [];
              const mats = (board.materials?.[j.id] || []).filter((m) => m.status !== "Received");
              const allMs = board.plans?.[j.id]?.milestones || [];
              const msPending = allMs.filter((m) => !m.done).length;
              const lateJob = j.tdd && j.tdd < TODAY;
              return (
                <tr key={j.id}>
                  {/* who the job is, whole, in one cell — with the TDD large */}
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px", minWidth: 150, maxWidth: 190 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{jobNo(j.id)}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.3, marginTop: 1 }}>{j.tag || "—"}</div>
                    {j.cust && <div style={{ fontSize: 10, color: "#8B8F87" }}>{j.cust}</div>}
                    {j.tdd && (
                      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, color: lateJob ? "#B3261E" : "#16232F", fontVariantNumeric: "tabular-nums" }}>
                        {ddmm(j.tdd)}{lateJob ? " ⚠" : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    <div title={j.ownerName || j.own}>Prj <b>{j.ownerInitials || initials(j.ownerName || j.own || "") || "—"}</b></div>
                    <div title={j.productionOwner || "not set"} style={{ marginTop: 2, color: j.productionOwner ? "#16232F" : "#B3261E", fontWeight: j.productionOwner ? 400 : 700 }}>
                      Prd {j.productionOwner ? <b>{initials(j.productionOwner)}</b> : "—"}
                    </div>
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {msPending || "—"} / {tasks.length}
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 7px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", width: 58 }}>
                    <div>K: {Math.round(j.kit || 0)}%</div>
                    <div>P: {Math.round(j.pct || 0)}%</div>
                  </td>
                  <td style={{ border: "1px solid #DCD8CC", padding: "6px 8px" }}>
                    {!tasks.length && !mats.length && <span style={{ color: "#8B8F87" }}>nothing open</span>}
                    {tasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0", borderBottom: "1px solid #F2F0EA" }}>
                        <span aria-hidden style={{ width: 11, height: 11, border: "1.5px solid #16232F", borderRadius: 2, marginTop: 2, flex: "none" }} />
                        <span style={{ lineHeight: 1.35 }}>
                          <b>{t.t}</b>{t.who ? ` — ${t.who}` : ""}{t.due ? ` · ${ddmm(t.due)}` : ""}
                          {t.d && <><br /><span style={{ color: "#5A6572", fontSize: 10.5 }}>{t.d.slice(0, 160)}</span></>}
                        </span>
                      </div>
                    ))}
                    {mats.map((m) => (
                      <div key={m.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0", borderBottom: "1px solid #F2F0EA" }}>
                        <span aria-hidden style={{ width: 11, height: 11, border: "1.5px solid #8A5B00", borderRadius: 2, marginTop: 2, flex: "none" }} />
                        <span style={{ lineHeight: 1.35 }}>
                          <span style={{ color: "#8A5B00", fontWeight: 700, fontSize: 10 }}>MATERIAL</span>{" "}
                          <b>{m.item}</b>{m.qty ? ` × ${m.qty}` : ""}{m.due ? ` · ${ddmm(m.due)}` : ""}
                          {m.status === "QC Defective" && <b style={{ color: "#B3261E" }}> · QC DEFECTIVE</b>}
                          {m.who && <span style={{ color: "#5A6572", fontSize: 10.5 }}> — {m.who}</span>}
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
