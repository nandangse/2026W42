"use client";

/**
 * Projects (Dr Raghu, 2 Sep 2026: "make a sub unit called Projects. In
 * that put this data for now: Project - Item - Project Name - BOM - Last
 * Modified By - Last Modified On").
 *
 * One row per project, those six columns, nothing else. "Approved BOM is
 * the field name" — so BOM is the ERP's custom_approved_bom and only that;
 * a project that names none shows a dot, whatever else the ERP may hold
 * against it. The ERP's Project has no item of its own; the Item is what
 * the Approved BOM manufactures. Last Modified is the PROJECT's, as the
 * ERP records it; the BOM's own is on the pill's hover.
 */

import { useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, INK, MUTED, NAVY, GREEN, AMBER, S, useLoad } from "@/components/ims/ui";
import type { Summary } from "./Dashboard";

interface Bom { bom_id: string; item_code: string; item_name: string; project_id: string; is_active: boolean; is_default: boolean; docstatus: number; erp_modified: string | null; erp_modified_by: string }
interface Project {
  project_id: string; project_name: string; status: string; customer: string; approved_bom: string;
  erp_modified: string | null; erp_modified_by: string; boms: Bom[];
}
interface Answer { installed: boolean; erpBase: string; projects: Project[]; lastPulledAt: string | null }

const erpForm = (base: string, doctype: string, name: string) =>
  `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;

/** dd-mm-yyyy hh:mm in Kolkata, or a dot. */
const fmtAt = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "") : "·";
/** The person, not the address — shailaja rather than shailaja@nandan.co.in. */
const who = (s: string) => (S(s).includes("@") ? S(s).split("@")[0] : S(s)) || "·";

const docWord = (b: Bom) => (b.docstatus === 2 ? "cancelled" : b.docstatus === 1 ? "submitted" : "draft");
const docColour = (b: Bom) => (b.docstatus === 2 ? "#5A6672" : b.docstatus === 1 ? GREEN : AMBER);

/**
 * The project's Approved BOM, and nothing else. Its header comes from the
 * BOM mirror where the ERP holds it; a name the mirror lacks still shows,
 * as a bare pill that opens the ERP.
 */
function leadBom(p: Project): Bom | null {
  if (!p.approved_bom) return null;
  const held = p.boms.find((b) => b.bom_id === p.approved_bom);
  return held ?? { bom_id: p.approved_bom, item_code: "", item_name: "", project_id: p.project_id, is_active: false, is_default: false, docstatus: 1, erp_modified: null, erp_modified_by: "" };
}

const BomPill = ({ b, base }: { b: Bom; base: string; approved?: boolean }) => (
  <a href={erpForm(base, "BOM", b.bom_id)} target="_blank" rel="noreferrer"
    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold mr-1 mb-0.5"
    style={{ background: NAVY, color: "#fff", textDecoration: "none", border: `1px solid ${NAVY}` }}
    title={`${b.bom_id}${b.item_code ? ` — ${b.item_code} ${b.item_name}` : ""}\n${docWord(b)}${b.is_active ? ", active" : ""}${b.is_default ? ", default" : ""}\nthe project's Approved BOM${b.erp_modified ? `\nBOM last modified ${fmtAt(b.erp_modified)} by ${who(b.erp_modified_by)}` : ""}`}>
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
    if (withBom) out = out.filter((p) => p.approved_bom);
    return out;
  }, [data, inProcess, withBom]);

  return (
    <Screen
      title="Projects"
      blurb="Every project on the ERP and the BOM it mentions. Filled by the ERP pull; nothing here is typed."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.lastPulledAt && (
        <Note kind="warn">Projects and BOMs have not been pulled yet — open ERP pull and run it once; phases 4 and 5 bring them.</Note>
      )}

      <GenieTable<Project>
        rows={data ? rows : null}
        minWidth={1000}
        search={(p, q) => [p.project_id, p.project_name, p.customer, p.approved_bom, p.erp_modified_by, ...p.boms.map((b) => `${b.bom_id} ${b.item_code} ${b.item_name}`)].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 project, name, item, BOM, who"
        empty={data?.lastPulledAt ? "No project matches." : "Nothing here yet — run the ERP pull."}
        header={<>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
            <input type="checkbox" checked={inProcess} onChange={(e) => setInProcess(e.target.checked)} /> jobs in process only
          </label>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
            <input type="checkbox" checked={withBom} onChange={(e) => setWithBom(e.target.checked)} /> with an Approved BOM only
          </label>
          <span className="text-xs tnum" style={{ color: MUTED }}>{rows.length.toLocaleString("en-IN")} shown</span>
        </>}
        columns={[
          { key: "project", label: "Project", align: "left", sort: (p) => p.project_id,
            render: (p) => <a href={erpForm(base, "Project", p.project_id)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: NAVY, textDecoration: "none" }}>{p.project_id}</a> },
          { key: "item", label: "Item", align: "left", sort: (p) => leadBom(p)?.item_code ?? "",
            render: (p) => {
              const b = leadBom(p);
              if (!b?.item_code) return <span style={{ color: MUTED }}>·</span>;
              return (
                <span style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 300 }}>
                  <a href={erpForm(base, "Item", b.item_code)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: INK, textDecoration: "none" }}>{b.item_code}</a>
                  {b.item_name && <span style={{ color: MUTED }}> — {b.item_name}</span>}
                </span>
              );
            } },
          { key: "name", label: "Project Name", align: "left", sort: (p) => p.project_name,
            render: (p) => <span className="font-semibold" style={{ color: INK, whiteSpace: "normal", display: "inline-block", maxWidth: 340 }}>{p.project_name || "·"}</span> },
          { key: "bom", label: "BOM", title: "The ERP's Approved BOM field", align: "left", sort: (p) => p.approved_bom,
            render: (p) => {
              const lead = leadBom(p);
              return lead ? <BomPill b={lead} base={base} approved /> : <span style={{ color: MUTED }}>·</span>;
            } },
          { key: "by", label: "Last Modified By", align: "left", sort: (p) => who(p.erp_modified_by), render: (p) => <span>{who(p.erp_modified_by)}</span> },
          { key: "on", label: "Last Modified On", align: "right", sort: (p) => S(p.erp_modified), render: (p) => <span className="tnum">{fmtAt(p.erp_modified)}</span> },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        BOM is the ERP&apos;s Approved BOM field. The pill&apos;s dot is that BOM&apos;s state on the ERP:
        <span style={{ color: GREEN }}> ●</span> submitted, <span style={{ color: AMBER }}>●</span> draft, <span style={{ color: "#5A6672" }}>●</span> cancelled.
        Item is what that BOM manufactures. Last Modified is the project&apos;s; hover the pill for the BOM&apos;s own.
      </div>
    </Screen>
  );
}
