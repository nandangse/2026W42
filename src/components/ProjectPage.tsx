"use client";
/**
 * ONE PROJECT, ON ITS OWN PAGE (Dr Raghu, 2 Sep 2026).
 *
 * The book at Projects answers "which project"; this answers "what is it".
 * Three things, in the order a person asks them: what the project IS, the
 * jobs standing on it (a project without its jobs is a header), and then the
 * ERP's whole record for anyone who needs a field the summary does not show.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull, jobNo } from "@/lib/schedule";
import { ModuleLinks } from "@/components/ModuleMenu";
import ProjectTabs from "@/components/ProjectTabs";

const C = { navy: "#1B3A5C", ink: "#16232F", sub: "#8A94A0", line: "#E2E0DA", green: "#0D7A3F", accent: "#E8600A" };

type Row = Record<string, unknown>;
type Job = {
  id: string; tag: string | null; cust: string | null; fam: string | null;
  val: number | null; tdd: string | null; kit: number | null; pct: number | null;
  stat: string | null; own: string | null; delivered: boolean | null; delivered_on: string | null;
};
type Data = { id: string; erp: Row; genie: Row | null; jobs: Job[]; mayMoney?: boolean };

const cr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

const text = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function ProjectPage({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    api.get(`/api/erp-project?id=${encodeURIComponent(id)}`)
      .then((r) => setD(r as Data))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (err) return <Shell><div className="p-6" style={{ color: "#B3261E" }}>{err}</div></Shell>;
  if (!d) return <Shell><div className="p-6" style={{ color: C.sub }}>Reading the project…</div></Shell>;

  const e = d.erp || {};
  const g = (d.genie || {}) as Row;
  // The ERP is the record; Genie fills a gap only where the ERP is silent.
  const pick = (ek: string, gk?: string) => text(e[ek]) || (gk ? text(g[gk]) : "");
  const live = d.jobs.filter((j) => !j.delivered);
  const done = d.jobs.filter((j) => j.delivered);
  const val = d.jobs.reduce((a, j) => a + Number(j.val || 0), 0);
  const desc = pick("short_summary_description", "description");

  const KEY: [string, string][] = [
    ["Customer", pick("customer", "cust")],
    ["Status", pick("status")],
    ["Stage", pick("project_stage", "stage")],
    ["Project director", pick("custom_project_director", "mgr")],
    ["Sales order", pick("sales_order", "so")],
    ["Customer committed", fmtFull(pick("customer_committed_delivery_", "committed") || null)],
    ["Expected start", fmtFull(text(e.expected_start_date) || null)],
    ["Expected end", fmtFull(pick("expected_end_date", "exp_end") || null)],
    ["Percent complete", pick("percent_complete")],
  ].filter(([, v]) => v && v !== "—") as [string, string][];

  const fields = Object.entries(e)
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
    .sort(([a], [b]) => a.localeCompare(b));

  /** The jobs standing on this project — a project without them is a header. */
  const jobsPane = (
        <div className="rounded-lg border bg-white overflow-x-auto" style={{ borderColor: C.line }}>
          <div className="px-3 pt-2 pb-1 text-xs font-bold" style={{ color: C.sub }}>
            THE JOBS ON THIS PROJECT — {d.jobs.length} · {cr(val)}
            {done.length > 0 && <> · <span style={{ color: C.green }}>{done.length} delivered</span></>}
            {live.length > 0 && <> · {live.length} still to go</>}
          </div>
          <table className="w-full text-xs" style={{ minWidth: 820 }}>
            <thead>
              <tr style={{ background: "#22303C", color: "#fff" }}>
                {["Job", "Customer tag", "Family", "Value", "TDD", "Kit %", "Prod %", "Status"].map((h) => (
                  <th key={h} className="px-2 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.jobs.map((j, i) => (
                <tr key={j.id} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 font-bold tnum" style={{ color: C.navy }}>
                    <a href={`/?job=${encodeURIComponent(j.id)}`} className="underline decoration-dotted">{jobNo(j.id)}</a>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: C.ink }}>{j.tag}</td>
                  <td className="px-2 py-1.5" style={{ color: C.sub }}>{j.fam}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap tnum">{cr(Number(j.val || 0))}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap tnum" style={{ color: j.delivered ? C.green : C.ink }}>
                    {j.delivered ? `✓ ${fmtFull(j.delivered_on)}` : fmtFull(j.tdd)}
                  </td>
                  <td className="px-2 py-1.5 text-center tnum">{j.kit ?? "·"}</td>
                  <td className="px-2 py-1.5 text-center tnum">{j.pct ?? "·"}</td>
                  <td className="px-2 py-1.5" style={{ color: C.sub }}>{j.stat}</td>
                </tr>
              ))}
              {d.jobs.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-4 text-center" style={{ color: C.sub }}>No job in Genie points at this project.</td></tr>
              )}
            </tbody>
          </table>
        </div>
  );

  /**
   * COMMERCIALS. The money fields the ERP keeps on a project, shown only to
   * eyes cleared for them -- and STRIPPED SERVER-SIDE for everyone else, so
   * this pane simply has nothing to draw rather than choosing not to.
   */
  const money = Object.entries(e)
    .filter(([k, v]) => /cost|amount|billed|margin|price|total_purchase|total_sales|total_billable|total_consumed|gross/i.test(k)
      && v !== null && v !== "" && Number(v) !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const commercialsPane = (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
      <div className="text-xs font-bold" style={{ color: C.sub, letterSpacing: .6 }}>
        COMMERCIALS · {cr(val)} across {d.jobs.length} job{d.jobs.length === 1 ? "" : "s"}
      </div>
      {money.length === 0
        ? <div className="mt-2" style={{ color: C.sub }}>The ERP carries no costing on this project yet.</div>
        : (
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            {money.map(([k, v]) => (
              <div key={k} className="rounded border p-2" style={{ borderColor: C.line }}>
                <div className="text-xs" style={{ color: C.sub }}>{k.replace(/_/g, " ")}</div>
                <div className="tnum" style={{ color: C.ink, fontWeight: 700 }}>
                  {Number.isFinite(Number(v)) ? cr(Number(v)) : text(v)}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );

  return (
    <Shell>
      <div className="mx-auto px-4 py-4" style={{ maxWidth: 1180 }}>
        <a href="/?tab=projects" className="text-xs font-bold" style={{ color: C.navy }}>← the project book</a>
        <div className="text-xs font-bold mt-2" style={{ color: C.sub, letterSpacing: 1.1 }}>{d.id}</div>
        <h1 className="font-bold" style={{ color: C.ink, fontSize: 24, lineHeight: 1.2 }}>
          {pick("project_name", "name") || d.id}
        </h1>

        {/* what it is */}
        <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
          {KEY.map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-white p-2.5" style={{ borderColor: C.line }}>
              <div className="text-xs font-bold" style={{ color: C.sub, letterSpacing: .6 }}>{k.toUpperCase()}</div>
              <div className="mt-0.5" style={{ color: C.ink, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        {/*
          THIRTEEN TABS (Dr Raghu, 2 Sep 2026). Jobs and Commercials come from
          records that already exist; the other eleven are the project's own
          room. See ProjectTabs — two shapes, ten names.
        */}
        <ProjectTabs
          projectId={d.id}
          canEdit={d.mayMoney !== false}
          mayMoney={d.mayMoney !== false}
          erp={e}
          jobsPane={jobsPane}
          commercialsPane={commercialsPane}
        />

        {/* everything the ERP holds, for the field the summary does not show */}
        <div className="mt-4">
          <button onClick={() => setAll((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5 border"
            style={{ color: C.navy, borderColor: C.line, background: "#fff" }}>
            {all ? "▾ Hide" : "▸ Show"} the ERP&apos;s whole record · {fields.length} fields
          </button>
          {all && (
            <div className="rounded-lg border bg-white mt-2 overflow-x-auto" style={{ borderColor: C.line }}>
              <table className="w-full text-xs">
                <tbody>
                  {fields.map(([k, v], i) => (
                    <tr key={k} style={{ borderTop: "1px solid #EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-3 py-1 font-semibold whitespace-nowrap" style={{ color: C.navy, width: 260 }}>{k}</td>
                      <td className="px-3 py-1" style={{ color: C.ink, whiteSpace: "pre-wrap" }}>{text(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EC" }}>
      <ModuleLinks current="main" />
      {children}
    </div>
  );
}
