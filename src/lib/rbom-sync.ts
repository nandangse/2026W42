/**
 * RBOM STATUS FOLLOWS THE ERP (Dr Raghu, 6 Oct 2026: "This one, which is
 * shown as draft, Mukesh says that it is already released in the ERP.
 * Please check, and if so, just synchronise these statuses also in
 * parallel.")
 *
 * An RBOM line copied from an ERP DRAFT BOM was marked Draft and, by the
 * RBOM's rule that a rebuild never edits a line, stayed Draft after the ERP
 * submitted that BOM. Now: any Draft line whose item sits in a SUBMITTED
 * BOM of the same project, or whose source BOM has since been submitted,
 * becomes Released. Only ever Draft → Released; a line the team set to WIP
 * or Released by hand is never touched, and nothing is ever moved back.
 *
 * Runs on every RBOM read, on every build, and after every BOM pull.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

export async function syncRbomReleased(admin: SupabaseClient, rbomIds?: string[]): Promise<number> {
  let hq = admin.from("material_rbom").select("rbom_id, project_id").limit(5000);
  if (rbomIds?.length) hq = hq.in("rbom_id", rbomIds);
  const { data: heads, error } = await hq;
  if (error || !heads?.length) return 0;
  const projects = [...new Set(heads.map((h) => S(h.project_id)).filter(Boolean))];
  if (!projects.length) return 0;
  const { data: boms } = await admin.from("material_bom").select("bom_id, project_id, docstatus").in("project_id", projects).limit(5000);
  const submitted = (boms ?? []).filter((b) => Number(b.docstatus) === 1);
  const submittedIds = new Set(submitted.map((b) => S(b.bom_id)));
  const itemsByProject = new Map<string, Set<string>>();
  const ids = [...submittedIds];
  const projOf = new Map(submitted.map((b) => [S(b.bom_id), S(b.project_id)]));
  for (let i = 0; i < ids.length; i += 100) {
    for (let a = 0; ; a += 1000) {
      const { data } = await admin.from("material_bom_item").select("bom_id, item_code").in("bom_id", ids.slice(i, i + 100)).order("row_id").range(a, a + 999);
      for (const r of data ?? []) {
        const p = projOf.get(S(r.bom_id)) ?? "";
        (itemsByProject.get(p) ?? itemsByProject.set(p, new Set()).get(p)!).add(S(r.item_code));
      }
      if (!data || data.length < 1000) break;
    }
  }
  let moved = 0;
  const now = new Date().toISOString();
  for (const h of heads) {
    const { data: drafts } = await admin.from("material_rbom_item").select("id, item_code, source_bom").eq("rbom_id", h.rbom_id).eq("bom_status", "Draft").limit(10000);
    const inErp = itemsByProject.get(S(h.project_id)) ?? new Set<string>();
    const go = (drafts ?? []).filter((d) => submittedIds.has(S(d.source_bom)) || inErp.has(S(d.item_code))).map((d) => d.id);
    for (let i = 0; i < go.length; i += 300) {
      const { data } = await admin.from("material_rbom_item").update({ bom_status: "Released", updated_by: "erp-sync@genie", updated_at: now })
        .in("id", go.slice(i, i + 300)).eq("bom_status", "Draft").select("id");
      moved += (data ?? []).length;
    }
  }
  return moved;
}
