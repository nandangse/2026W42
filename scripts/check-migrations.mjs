/**
 * check-migrations.mjs — is every migration actually IN the databases?
 * (Dr Raghu, 28 Aug 2026: "check the migrations are all in. we are making a
 * behemoth software! Managing will be difficult.")
 *
 *   node scripts/check-migrations.mjs
 *
 * Probes the Genie project and the CRM project for the table or column each
 * migration creates, and prints one honest line per migration. Add a probe
 * here whenever a migration ships — this list IS the checklist.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(repo, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const DBS = {
  genie: { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY },
  crm: { url: env.CRM_SUPABASE_URL, key: env.CRM_SUPABASE_SERVICE_KEY },
};

// probe = a select that only succeeds when the migration ran.
// "table?select=col" proves both the table and the column.
const PROBES = [
  ["genie", "0072 slip acknowledgements", "hrms_slip_ack?select=sheet_id"],
  ["genie", "0073 Kuber door (accounts_access)", "accounts_access?select=email"],
  ["genie", "0074 task files + created_at", "task_file?select=id"],
  ["genie", "0074 manual_tasks.created_at", "manual_tasks?select=created_at"],
  ["genie", "0074 job_photo.drive_synced_at", "job_photo?select=drive_synced_at"],
  ["genie", "0075 kuber_upload", "kuber_upload?select=id"],
  ["genie", "0076 Vishwakarma door", "vishwakarma_access?select=email"],
  ["genie", "0076 kuber_ledger", "kuber_ledger?select=id"],
  ["genie", "0076 kuber_voucher", "kuber_voucher?select=id"],
  ["genie", "0076 kuber_bill", "kuber_bill?select=id"],
  ["genie", "0076 kuber_bg / fd / insurance", "kuber_bg?select=id"],
  ["genie", "0076 kuber_payment_plan", "kuber_payment_plan?select=id"],
  ["genie", "0076 kuber_cash_item", "kuber_cash_item?select=id"],
  ["genie", "0077 Management Review link", "app_settings?select=kuber_review_link"],
  ["genie", "0078 upload taken_in", "kuber_upload?select=taken_in"],
  ["genie", "0079 kuber_group (the tree)", "kuber_group?select=name"],
  ["genie", "0080 review link provenance", "app_settings?select=kuber_review_link_by"],
  ["genie", "0081 supplier reco + voucher items", "kuber_supplier_reco?select=id"],
  ["genie", "0081 kuber_voucher_item", "kuber_voucher_item?select=id"],
  ["genie", "0082 task related_to", "manual_tasks?select=related_to&limit=1"],
  ["genie", "0083 voucher amount", "kuber_voucher?select=amount&limit=1"],
  ["genie", "0084 Vishwakarma workroom", "vishwa_problem?select=id"],
  ["genie", "0084 review bench", "vishwa_review?select=id"],
  ["genie", "0085 design project grid", "vishwa_project?select=project_id"],
  ["genie", "0086 playbooks", "playbook?select=kind"],
  ["genie", "0086 playbook intelligence", "playbook_doc?select=id"],
  ["genie", "0087 TVC/OE classification", "kuber_expense_class?select=ledger"],
  ["genie", "0088 design plan ladder", "vishwa_design_plan?select=id"],
  ["genie", "0089 design grid v2", "vishwa_week_work?select=id"],
  ["genie", "0090 stage spans", "vishwa_design_plan?select=days"],
  ["genie", "0090 week work project tie", "vishwa_week_work?select=project_id"],
  ["genie", "0091 loan register", "kuber_loan?select=id"],
  ["genie", "0092 MIS inputs + ratio targets", "kuber_mis_input?select=key"],
  ["genie", "0093 compliance calendar", "kuber_compliance?select=id"],
  ["genie", "0094 bounce + release", "kuber_bounce?select=id"],
  ["genie", "0095 erp push fate", "erp_update?select=push_status&limit=1"],
  ["genie", "0096 appraisal discussion", "hrms_appraisal?select=discussion&limit=1"],
  ["genie", "0097 salary history", "hrms_salary_history?select=id"],
  ["genie", "0098 raghu brief", "hrms_appraisal?select=brief&limit=1"],
  ["genie", "0099 new designation", "hrms_appraisal?select=new_designation&limit=1"],
  ["genie", "0100 learning queue order", "lms_progress?select=sort_order&limit=1"],
  ["genie", "0101 lms urls", "lms_lesson?select=code&limit=1"],
  ["genie", "0102 delivered targets", "app_settings?select=delivered_targets&limit=1"],
  // 0030 widens a CHECK — no new column to probe; verified by queueing a company

  ["crm", "0029 opportunity contact", "opportunity?select=contact_id&limit=1"],
  ["crm", "0025 tags", "crm_tag?select=id"],
  ["crm", "0026 tags widen + 0027 year in number", "crm_tag_link?select=id"],
  ["crm", "0024 numbering + deal contacts", "opportunity_contact?select=id"],
  ["crm", "0017 prospect_queue", "prospect_queue?select=id"],
  ["crm", "0018 visiting_card", "visiting_card?select=id"],
  ["crm", "0019 integrations + card back", "integration_setting?select=key"],
  ["crm", "0020 salesperson_plan", "salesperson_plan?select=profile_id"],
  ["crm", "0022 outbound_queue", "outbound_queue?select=id"],
  ["crm", "0023 open tracking", "message?select=track_token&limit=1"],
  ["genie", "0111 IMS door (ims_access)", "ims_access?select=email"],
  ["genie", "0111 IMS role on the door", "ims_access?select=role"],
  ["genie", "0112 IMS settings (approval mode)", "ims_settings?select=approval_mode"],
  ["genie", "0112 IMS doc numbering series", "ims_doc_series?select=next_serial"],
  ["genie", "0112 IMS core_task (+ dedupe key)", "core_task?select=source_key"],
  ["genie", "0112 IMS core_event", "core_event?select=starts_at"],
  ["genie", "0112 IMS checklist engine", "core_checklist_template?select=status"],
  ["genie", "0112 IMS certificates & statutory", "ims_certificate?select=kind"],
  ["genie", "0112 IMS controlled documents", "ims_document?select=doc_no"],
  ["genie", "0112 IMS document revisions", "ims_document_revision?select=rev_no"],
  ["genie", "0112 IMS register engine", "ims_register_definition?select=columns"],
  ["genie", "0112 IMS certification journey", "ims_certification?select=status"],
  ["genie", "0112 IMS NC / RCA / CAPA", "ims_nonconformity?select=nc_no"],
  ["genie", "0112 IMS welding (EXC3)", "ims_welder_qual?select=revalidation_due"],
  ["genie", "0113 IMS standards seeded", "ims_standard?select=code"],
  ["genie", "0113 IMS clause trees seeded", "ims_standard_clause?select=clause_no"],
  ["genie", "0118 Saamaan door (material_access)", "material_access?select=email"],
  ["genie", "0118 Saamaan item mirror", "material_item?select=item_code"],
  ["genie", "0118 Saamaan item files", "material_item_file?select=file_id"],
  ["genie", "0118 Saamaan pull ledger", "material_pull?select=phase"],
  ["genie", "0119 Saamaan projects", "material_project?select=approved_bom"],
  ["genie", "0119 Saamaan BOM headers", "material_bom?select=bom_id"],
  ["genie", "0120 Saamaan modified_by", "material_project?select=erp_modified_by"],
  ["genie", "0121 Saamaan BOM lines", "material_bom_item?select=bom_status"],
  ["genie", "0122 Saamaan BOM value", "material_bom?select=total_cost"],
  ["genie", "0123 Saamaan RBOM", "material_rbom?select=base_bom"],
  ["genie", "0123 Saamaan RBOM lines", "material_rbom_item?select=source_bom"],
  ["genie", "0124 Saamaan warehouses", "material_warehouse?select=kind"],
  ["genie", "0125 Saamaan WIP", "material_wip?select=warehouse"],
  ["genie", "0126 Saamaan MRP runs", "material_mrp?select=mrp_no"],
  ["genie", "0126 Saamaan MRP jobs", "material_mrp_job?select=job_no"],
  ["genie", "0126 Saamaan issues (WIP entries)", "material_issue?select=warehouse"],
];

let missing = 0;
for (const [db, label, probe] of PROBES) {
  const { url, key } = DBS[db];
  let ok = false, why = "";
  try {
    const r = await fetch(`${url}/rest/v1/${probe}${probe.includes("limit=") ? "" : "&limit=1"}`.replace("?&", "?"), {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    ok = r.ok;
    if (!ok) why = (await r.json().catch(() => ({})))?.message || `HTTP ${r.status}`;
  } catch (e) { why = String(e.message || e); }
  console.log(`${ok ? "  ✓" : "  ✗ MISSING"}  [${db.toUpperCase().padEnd(5)}] ${label}${ok ? "" : "  — " + why.slice(0, 80)}`);
  if (!ok) missing++;
}
console.log(missing ? `\n${missing} probe(s) failed — run the matching migration file(s) from supabase/migrations or supabase-crm/migrations.` : "\nAll migrations are in. The books stand on solid ground.");
