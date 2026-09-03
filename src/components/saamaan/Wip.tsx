"use client";

/**
 * WIP — one warehouse per live job (Dr Raghu, 3 Sep 2026: "Make a side
 * app called WIP. In this each Live Job Number will be a wip. Create a
 * table WIP_jobnumber — this is the warehouse where the WIP will be kept.
 * This currently doesn't need to be confused with the ERP WIP. This is
 * separate. I'll explain what this does!")
 *
 * The fourteen columns he named, in his order. The starred ones — job no,
 * customer tag, project, throughput (ERP), kitting owner — and the BOM,
 * RBOM and value come from Genie's own board and mirrors on every read.
 * Kitted, pending, TVC and throughput (calc) are Genie's to fill when he
 * explains; until then they read a dot, which is not a zero.
 *
 * The job number opens the same lightbox every other Genie app opens.
 */

import { useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, Modal, INK, MUTED, BORDER, NAVY, GREEN, AMBER, S, useLoad } from "@/components/ims/ui";
import { JobLightbox, type WipJob } from "@/components/JobsInProgress";
import { BomLines } from "./Bom";
import type { Summary } from "./Dashboard";

interface Row {
  job_no: string; warehouse: string; customer_tag: string; project_id: string; customer: string; product_family: string;
  bom_no_erp: string; rbom_no: string; value: number | null;
  nos_kitted: number | null; value_kitted: number | null; nos_pending: number | null; value_pending: number | null;
  tvc_pct: number | null; throughput_calc: number | null; throughput_erp_pct: number | null; throughput_erp_value: number | null;
  kitting_pct: number | null; kitting_owner: string; kitting_owner_name: string; live: boolean; refreshed_at: string; note: string;
  job: WipJob;
}
interface Answer { ok: boolean; installed: boolean; rows: Row[]; refreshedAt: string }

const CR = 1e7;
/** Money the board's way — ₹ crore to two places, a dot for nothing. */
const cr = (n: unknown) => (n === null || n === undefined ? "·" : `${(Number(n) / CR).toFixed(2)} Cr`);
const pct = (n: unknown) => (n === null || n === undefined ? "·" : `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const num = (n: unknown) => (n === null || n === undefined ? "·" : Number(n).toLocaleString("en-IN"));
const erpForm = (base: string, doctype: string, name: string) =>
  `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;

export default function Wip({ erpBase, role, summary }: { erpBase: string; role: string; summary: Summary }) {
  const [data, busy, reload, err] = useLoad<Answer>("/api/saamaan/wip");
  const [picked, setPicked] = useState<Row | null>(null);
  /** "Make the RBOM come in the lightbox" — the same one the BOM front opens. */
  const [rbomOpen, setRbomOpen] = useState<Row | null>(null);
  const canEdit = ["admin", "planner", "project_owner"].includes(role);
  const rows = data?.rows ?? [];
  const totals = useMemo(() => ({
    value: rows.reduce((a, r) => a + (Number(r.value) || 0), 0),
    tp: rows.reduce((a, r) => a + (Number(r.throughput_erp_value) || 0), 0),
    withBom: rows.filter((r) => r.bom_no_erp).length,
    withRbom: rows.filter((r) => r.rbom_no).length,
  }), [rows]);

  return (
    <Screen
      title="WIP — one warehouse per live job"
      blurb="Every live job on the board is a WIP: the warehouse WIP_<job number> where that job's work in progress is kept. Genie's own, separate from the ERP's WIP warehouses. The starred columns refresh from the board on every read."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.installed && <Note kind="warn">Run migration 0125 first — the WIP table doesn&apos;t exist yet. The rows below are read straight off the board meanwhile.</Note>}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            ["Live jobs", num(rows.length), "each a WIP warehouse"],
            ["Value", `₹${cr(totals.value)}`, "of the live jobs, as the board has it"],
            ["Throughput (ERP)", `₹${cr(totals.tp)}`, "the ERP's throughput value, summed"],
            ["With a BOM · RBOM", `${totals.withBom} · ${totals.withRbom}`, "jobs whose project has a submitted BOM, and an RBOM built"],
          ].map(([t, v, h]) => (
            <div key={String(t)} className="bg-white rounded-lg border p-2.5" style={{ borderColor: BORDER }}>
              <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>{t}</div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: INK }}>{v}</div>
              <div className="text-xs" style={{ color: MUTED }}>{h}</div>
            </div>
          ))}
        </div>
      )}

      <GenieTable<Row>
        rows={data ? rows : null}
        minWidth={1700}
        search={(r, q) => [r.job_no, r.customer_tag, r.project_id, r.customer, r.bom_no_erp, r.rbom_no, r.kitting_owner, r.kitting_owner_name].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 job, tag, project, BOM, owner"
        empty="No live job on the board."
        columns={[
          { key: "job", label: "Job No *", align: "left", sort: (r) => r.job_no,
            render: (r) => <button onClick={() => setPicked(r)} className="font-bold hover:underline" style={{ color: NAVY }} title={`${r.warehouse} — open the job`}>{r.job_no}</button> },
          { key: "wh", label: "WIP warehouse", align: "left", sort: (r) => r.warehouse, render: (r) => <span className="text-xs font-bold" style={{ color: "#0F766E" }}>{r.warehouse}</span> },
          { key: "tag", label: "Customer tag *", align: "left", sort: (r) => r.customer_tag,
            render: (r) => <span className="font-semibold" style={{ color: INK, whiteSpace: "normal", display: "inline-block", maxWidth: 260 }}>{r.customer_tag || "·"}</span> },
          { key: "proj", label: "Project No *", align: "left", sort: (r) => r.project_id,
            render: (r) => r.project_id ? <a href={erpForm(erpBase, "Project", r.project_id)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: NAVY, textDecoration: "none" }}>{r.project_id.replace(/^NGSE-PROJ-/, "")}</a> : <span style={{ color: MUTED }}>·</span> },
          { key: "bom", label: "BOM No (ERP)", align: "left", sort: (r) => r.bom_no_erp,
            render: (r) => r.bom_no_erp ? <a href={erpForm(erpBase, "BOM", r.bom_no_erp)} target="_blank" rel="noreferrer" className="text-xs font-bold hover:underline" style={{ color: NAVY, textDecoration: "none" }}>{r.bom_no_erp}</a> : <span style={{ color: MUTED }}>·</span> },
          { key: "rbom", label: "RBOM No", align: "left", sort: (r) => r.rbom_no,
            render: (r) => r.rbom_no
              ? <button onClick={() => setRbomOpen(r)} className="rounded px-1.5 py-0.5 text-xs font-bold hover:underline" style={{ background: "#0F766E", color: "#fff" }} title="Open the Real BOM">{r.rbom_no}</button>
              : <span style={{ color: MUTED }} title="no RBOM built for the project yet — BOM section">·</span> },
          { key: "val", label: "Value", align: "right", sort: (r) => Number(r.value ?? -1), render: (r) => <span className="tnum font-bold">{cr(r.value)}</span> },
          { key: "nk", label: "Nos kitted", align: "right", sort: (r) => Number(r.nos_kitted ?? -1), render: (r) => <span className="tnum" style={{ color: r.nos_kitted === null ? MUTED : INK }}>{num(r.nos_kitted)}</span> },
          { key: "vk", label: "Value kitted", align: "right", sort: (r) => Number(r.value_kitted ?? -1), render: (r) => <span className="tnum" style={{ color: r.value_kitted === null ? MUTED : INK }}>{cr(r.value_kitted)}</span> },
          { key: "np", label: "Nos pending", align: "right", sort: (r) => Number(r.nos_pending ?? -1), render: (r) => <span className="tnum" style={{ color: r.nos_pending === null ? MUTED : INK }}>{num(r.nos_pending)}</span> },
          { key: "vp", label: "Value pending", align: "right", sort: (r) => Number(r.value_pending ?? -1), render: (r) => <span className="tnum" style={{ color: r.value_pending === null ? MUTED : INK }}>{cr(r.value_pending)}</span> },
          { key: "tvc", label: "TVC %", align: "right", sort: (r) => Number(r.tvc_pct ?? -1), render: (r) => <span className="tnum" style={{ color: r.tvc_pct === null ? MUTED : INK }}>{pct(r.tvc_pct)}</span> },
          { key: "tpc", label: "Throughput (calc)", align: "right", sort: (r) => Number(r.throughput_calc ?? -1), render: (r) => <span className="tnum" style={{ color: r.throughput_calc === null ? MUTED : INK }}>{r.throughput_calc === null ? "·" : cr(r.throughput_calc)}</span> },
          { key: "tpe", label: "Throughput (ERP) *", align: "right", sort: (r) => Number(r.throughput_erp_pct ?? -1),
            render: (r) => <span className="tnum" title={r.throughput_erp_value !== null ? `₹${cr(r.throughput_erp_value)}` : ""}>{pct(r.throughput_erp_pct)}{r.throughput_erp_value !== null ? <span className="text-xs" style={{ color: MUTED }}> · {cr(r.throughput_erp_value)}</span> : null}</span> },
          { key: "ko", label: "Kitting Owner *", align: "left", sort: (r) => r.kitting_owner_name || r.kitting_owner,
            render: (r) => r.kitting_owner ? <Chip text={r.kitting_owner_name || r.kitting_owner} colour={GREEN} /> : <span style={{ color: AMBER }} title="no kitting owner on the board">·</span> },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        * from Genie&apos;s board, refreshed on every read; BOM No is the latest submitted BOM on the project; RBOM No is Genie&apos;s Real BOM where built.
        Kitted, pending, TVC and Throughput (calc) are Genie&apos;s to fill and read a dot until then. Money is in ₹ crore, the board&apos;s way.
        {data?.refreshedAt ? ` Refreshed ${new Date(data.refreshedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}.` : ""}
      </div>

      {rbomOpen && (
        <Modal onClose={() => setRbomOpen(null)} title={`${rbomOpen.rbom_no} · Real BOM — ${rbomOpen.project_id} · job ${rbomOpen.job_no} · ${rbomOpen.customer_tag}`} width={1500}>
          <BomLines kind="rbom" bom={rbomOpen.rbom_no} base={erpBase} summary={summary} />
        </Modal>
      )}
      {picked && (
        <JobLightbox
          job={picked.job}
          V={(n: number) => `${(n / CR).toFixed(2)} Cr`}
          colour={NAVY}
          canEdit={canEdit}
          onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.job_no; setPicked(null); window.open(`/?job=${encodeURIComponent(id)}`, "_blank"); }}
          onSaved={async () => { reload(); }}
        />
      )}
    </Screen>
  );
}
