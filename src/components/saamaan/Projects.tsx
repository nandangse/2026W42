"use client";

/**
 * Projects — and the BOM each one mentions (Dr Raghu, 2 Sep 2026: "Now we
 * have the projects. With each project there is a BOM mentioned. For now
 * please show me a table in Saamaan of the Projects - Name - BOM").
 *
 * Two readings of "the BOM", both shown: the Approved BOM the project
 * itself points at, and every BOM the ERP holds against the project —
 * which is often more than one, and not always the approved one. Where
 * the two disagree the table says so rather than picking.
 */

import { useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, RED, S, fmtD, statusColour, useLoad } from "@/components/ims/ui";
import type { Summary } from "./Dashboard";

interface Bom { bom_id: string; item_code: string; item_name: string; project_id: string; is_active: boolean; is_default: boolean; docstatus: number; quantity: number | null; erp_modified: string | null }
interface Project {
  project_id: string; project_name: string; status: string; customer: string; product_family: string; approved_bom: string;
  design_stage: string; bom_release_target_date: string | null; bom_released_date: string | null;
  structural_bom: boolean; main_bom: boolean; hydraulic_bom: boolean; electric_bom: boolean; long_lead_items: boolean;
  erp_modified: string | null; boms: Bom[];
}
interface Answer { installed: boolean; erpBase: string; projects: Project[]; lastPulledAt: string | null }

const erpForm = (base: string, doctype: string, name: string) =>
  `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;

/** 0 draft, 1 submitted, 2 cancelled — the ERP's docstatus in words. */
const docWord = (b: Bom) => (b.docstatus === 2 ? "cancelled" : b.docstatus === 1 ? "submitted" : "draft");
const docColour = (b: Bom) => (b.docstatus === 2 ? "#5A6672" : b.docstatus === 1 ? GREEN : AMBER);

const BomPill = ({ b, base, approved }: { b: Bom; base: string; approved: boolean }) => (
  <a href={erpForm(base, "BOM", b.bom_id)} target="_blank" rel="noreferrer"
    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold mr-1 mb-0.5"
    style={{ background: approved ? NAVY : NAVY_SOFT, color: approved ? "#fff" : NAVY, textDecoration: "none", border: `1px solid ${approved ? NAVY : BORDER}` }}
    title={`${b.item_code} — ${b.item_name}\n${docWord(b)}${b.is_active ? ", active" : ""}${b.is_default ? ", default" : ""}${approved ? "\nthe project's Approved BOM" : ""}`}>
    {b.bom_id}
    <span style={{ width: 6, height: 6, borderRadius: 3, background: docColour(b), display: "inline-block" }} />
  </a>
);

export default function Projects({ summary }: { summary: Summary }) {
  const [data, busy, reload, err] = useLoad<Answer>("/api/saamaan/items?mode=projects");
  const [inProcess, setInProcess] = useState(false);
  const [withBom, setWithBom] = useState(false);
  const base = data?.erpBase || summary.erpBase;

  const rows = useMemo(() => {
    let out = data?.projects ?? [];
    if (inProcess) out = out.filter((p) => /in process/i.test(p.status));
    if (withBom) out = out.filter((p) => p.approved_bom || p.boms.length);
    return out;
  }, [data, inProcess, withBom]);

  const counts = useMemo(() => {
    const all = data?.projects ?? [];
    return {
      projects: all.length,
      approved: all.filter((p) => p.approved_bom).length,
      anyBom: all.filter((p) => p.approved_bom || p.boms.length).length,
      disagree: all.filter((p) => p.approved_bom && p.boms.length && !p.boms.some((b) => b.bom_id === p.approved_bom)).length,
    };
  }, [data]);

  return (
    <Screen
      title="Projects — and their BOMs"
      blurb="Every project on the ERP, the Approved BOM it points at, and every BOM the ERP holds against it. Filled by the ERP pull; nothing here is typed."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.lastPulledAt && (
        <Note kind="warn">Projects and BOMs have not been pulled yet — open ERP pull and run it once; phases 4 and 5 bring them.</Note>
      )}

      {data?.projects.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            ["Projects", counts.projects, "on the ERP, every status"],
            ["With an Approved BOM", counts.approved, "the project itself points at one"],
            ["With any BOM", counts.anyBom, "approved, or held against the project"],
            ["Approved ≠ held", counts.disagree, "approved BOM is not among the project's own"],
          ].map(([t, n, h]) => (
            <div key={String(t)} className="bg-white rounded-lg border p-2.5" style={{ borderColor: BORDER }}>
              <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>{t}</div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color: t === "Approved ≠ held" && Number(n) ? RED : INK }}>{Number(n).toLocaleString("en-IN")}</div>
              <div className="text-xs" style={{ color: MUTED }}>{h}</div>
            </div>
          ))}
        </div>
      ) : null}

      <GenieTable<Project>
        rows={data ? rows : null}
        minWidth={1100}
        search={(p, q) => [p.project_id, p.project_name, p.customer, p.approved_bom, p.status, ...p.boms.map((b) => `${b.bom_id} ${b.item_code} ${b.item_name}`)].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 project, name, customer, BOM, item"
        empty={data?.lastPulledAt ? "No project matches." : "Nothing here yet — run the ERP pull."}
        header={<>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
            <input type="checkbox" checked={inProcess} onChange={(e) => setInProcess(e.target.checked)} /> jobs in process only
          </label>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
            <input type="checkbox" checked={withBom} onChange={(e) => setWithBom(e.target.checked)} /> with a BOM only
          </label>
          <span className="text-xs tnum" style={{ color: MUTED }}>{rows.length.toLocaleString("en-IN")} shown</span>
        </>}
        columns={[
          { key: "id", label: "Project", align: "left", sort: (p) => p.project_id,
            render: (p) => <a href={erpForm(base, "Project", p.project_id)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: NAVY, textDecoration: "none" }}>{p.project_id.replace(/^NGSE-PROJ-/, "")}</a> },
          { key: "name", label: "Name", align: "left", sort: (p) => p.project_name,
            render: (p) => <span className="font-semibold" style={{ color: INK, whiteSpace: "normal", display: "inline-block", maxWidth: 320 }}>{p.project_name || "·"}</span> },
          { key: "cust", label: "Customer", align: "left", sort: (p) => p.customer, render: (p) => <span style={{ color: MUTED }}>{p.customer || "·"}</span> },
          { key: "status", label: "Status", align: "left", sort: (p) => p.status, render: (p) => p.status ? <Chip text={p.status} colour={statusColour(p.status)} /> : "·" },
          { key: "approved", label: "Approved BOM", align: "left", sort: (p) => p.approved_bom,
            render: (p) => {
              if (!p.approved_bom) return <span style={{ color: MUTED }}>·</span>;
              const held = p.boms.find((b) => b.bom_id === p.approved_bom);
              return held ? <BomPill b={held} base={base} approved /> : (
                <a href={erpForm(base, "BOM", p.approved_bom)} target="_blank" rel="noreferrer" className="text-xs font-bold hover:underline" style={{ color: NAVY }}
                  title="The project points at this BOM, but the BOM itself does not name the project">{p.approved_bom} <span style={{ color: AMBER }}>?</span></a>
              );
            } },
          { key: "boms", label: "BOMs on the project", align: "left", sort: (p) => p.boms.length,
            render: (p) => p.boms.length ? (
              <span style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 380 }}>
                {p.boms.filter((b) => b.bom_id !== p.approved_bom).map((b) => <BomPill key={b.bom_id} b={b} base={base} approved={false} />)}
                {p.boms.every((b) => b.bom_id === p.approved_bom) && <span className="text-xs" style={{ color: MUTED }}>only the approved one</span>}
              </span>
            ) : <span style={{ color: MUTED }}>·</span> },
          { key: "rel", label: "BOM released", align: "right", sort: (p) => S(p.bom_released_date),
            render: (p) => <span className="tnum" style={{ color: p.bom_released_date ? INK : MUTED }} title={p.bom_release_target_date ? `target ${fmtD(p.bom_release_target_date)}` : ""}>{p.bom_released_date ? fmtD(p.bom_released_date) : p.bom_release_target_date ? `target ${fmtD(p.bom_release_target_date)}` : "·"}</span> },
          { key: "parts", label: "BOM parts ticked", align: "left",
            render: (p) => {
              const on = [p.structural_bom && "Structural", p.main_bom && "Main", p.hydraulic_bom && "Hydraulic", p.electric_bom && "Electric", p.long_lead_items && "Long lead"].filter(Boolean);
              return on.length ? <span className="text-xs">{on.join(" · ")}</span> : <span style={{ color: MUTED }}>·</span>;
            } },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        A dot on a BOM pill is its state on the ERP: <span style={{ color: GREEN }}>●</span> submitted, <span style={{ color: AMBER }}>●</span> draft, <span style={{ color: "#5A6672" }}>●</span> cancelled.
        The dark pill is the project&apos;s Approved BOM. Every pill opens the BOM on the ERP.
      </div>
    </Screen>
  );
}
