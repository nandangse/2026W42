import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/saamaan/rbom — build the RBOM, the REAL BOM, Genie's own, from the mirror
 * (Dr Raghu, 3 Sep 2026: "Replicate [the last submitted BOM] into a BOM in
 * our Genie called BOM-N050184-100. Put in all the contents … and change
 * the bom_status for each item to 'Released'. Then look if there is
 * BOM-N050184-006 and see what all items in that are added that were not
 * in previous version. Take those items into BOM-N050184-100 also and mark
 * them 'Draft'.")
 *
 *   { action: "build", project_id }  — one project.
 *   { action: "build_all" }          — every live project (a job on the
 *                                       board) that has a submitted BOM.
 *
 * THE RULE, PER PROJECT:
 *   base   = the highest-numbered SUBMITTED BOM on the project (docstatus 1).
 *   drafts = every DRAFT BOM (docstatus 0) of the same item whose revision
 *            number is higher than the base's, in order.
 *   rbom   = BOM-<item>-100. Every line of the base → Released. Every line
 *            of a draft whose item is not already in the RBOM → Draft, and
 *            source_bom names the draft it came from.
 *
 * THE RBOM IS GENIE'S ONCE BUILT. A second build on the same project only
 * ADDS lines whose item is not yet there (the ERP moved on: a new
 * submitted revision, a new draft). It never edits or removes a line that
 * exists — those are the ones the team maintains here, and a rebuild that
 * overwrote them would undo the point of having the RBOM at all.
 *
 * Lines are copied from material_bom_item, which holds the lines of every
 * live BOM on a live project — so a project has to be live and pulled.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
/** BOM-N050184-005 → 5. Anything without a trailing number → 0. */
const rev = (id: string) => Number((id.match(/-(\d+)$/) ?? [])[1] ?? 0);

async function liveProjectIds(admin: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const { data, error } = await admin.from("jobs").select("proj").eq("active", true).eq("delivered", false).is("archived_at", null).limit(5000);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((j) => String(j.proj || "")).filter(Boolean));
}

const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

interface Outcome {
  project_id: string; rbom_id: string; base_bom: string; drafts: string[];
  released: number; draft: number; added: number; existed: number; skipped?: string;
}

async function buildOne(admin: ReturnType<typeof adminClient>, projectId: string, who: string): Promise<Outcome> {
  const out: Outcome = { project_id: projectId, rbom_id: "", base_bom: "", drafts: [], released: 0, draft: 0, added: 0, existed: 0 };

  const { data: boms, error: bErr } = await admin.from("material_bom")
    .select("bom_id, item_code, item_name, docstatus").eq("project_id", projectId).limit(500);
  if (bErr) throw new Error(bErr.message);
  const submitted = (boms ?? []).filter((b) => Number(b.docstatus) === 1).sort((a, b) => rev(String(b.bom_id)) - rev(String(a.bom_id)));
  const base = submitted[0];
  if (!base) { out.skipped = "no submitted BOM on the project"; return out; }
  const baseRev = rev(String(base.bom_id));
  const drafts = (boms ?? [])
    .filter((b) => Number(b.docstatus) === 0 && String(b.item_code) === String(base.item_code) && rev(String(b.bom_id)) > baseRev)
    .sort((a, b) => rev(String(a.bom_id)) - rev(String(b.bom_id)));
  out.base_bom = String(base.bom_id);
  out.drafts = drafts.map((d) => String(d.bom_id));
  out.rbom_id = `BOM-${S(base.item_code)}-100`;

  // What the RBOM already holds, if it exists.
  const { data: head, error: hErr } = await admin.from("material_rbom").select("rbom_id, project_id").eq("rbom_id", out.rbom_id).maybeSingle();
  if (hErr) {
    if (notInstalled(hErr.message)) throw new HttpError(503, "Run migration 0123 first — the RBOM tables don't exist yet.");
    throw new Error(hErr.message);
  }
  if (head && String(head.project_id) !== projectId)
    throw new HttpError(409, `${out.rbom_id} already belongs to ${head.project_id} — the same item cannot carry two RBOMs.`);
  const have = new Set<string>();
  let nextIdx = 1;
  if (head) {
    const { data: ex } = await admin.from("material_rbom_item").select("item_code, idx").eq("rbom_id", out.rbom_id).limit(10000);
    for (const r of ex ?? []) { have.add(String(r.item_code)); nextIdx = Math.max(nextIdx, Number(r.idx) + 1); }
    out.existed = have.size;
  }

  // The lines, from the mirror: the base first, then each draft in order.
  const sources = [String(base.bom_id), ...out.drafts];
  const { data: lines, error: lErr } = await admin.from("material_bom_item").select("*").in("bom_id", sources).order("bom_id").order("idx").limit(20000);
  if (lErr) throw new Error(lErr.message);
  const byBom = new Map<string, Doc[]>();
  for (const l of lines ?? []) (byBom.get(String(l.bom_id)) ?? byBom.set(String(l.bom_id), []).get(String(l.bom_id))!).push(l as Doc);
  if (!byBom.get(String(base.bom_id))?.length) { out.skipped = `${base.bom_id} has no lines in the mirror — pull first`; return out; }

  const copy = (l: Doc, status: "Released" | "Draft", src: string): Doc => ({
    rbom_id: out.rbom_id,
    idx: nextIdx++,
    item_code: S(l.item_code),
    item_name: S(l.item_name),
    item_group: S(l.item_group),
    qty: l.qty ?? null,
    uom: S(l.uom),
    stock_qty: l.stock_qty ?? null,
    stock_uom: S(l.stock_uom),
    rate: l.rate ?? null,
    amount: l.amount ?? null,
    description: S(l.description),
    bom_status: status,
    bom_remark: S(l.bom_remark),
    bom_no: S(l.bom_no),
    is_sub_assembly: !!l.is_sub_assembly,
    source_bom: src,
    source_row_id: S(l.row_id),
    added_by: who,
  });
  const fresh: Doc[] = [];
  for (const src of sources) {
    const status = src === String(base.bom_id) ? "Released" : "Draft";
    for (const l of byBom.get(src) ?? []) {
      const code = S(l.item_code);
      if (!code || have.has(code)) continue;
      have.add(code);
      fresh.push(copy(l, status, src));
      if (status === "Released") out.released++; else out.draft++;
    }
  }

  const now = new Date().toISOString();
  const headerRow: Doc = head
    ? { rbom_id: out.rbom_id, project_id: projectId, item_code: S(base.item_code), item_name: S(base.item_name), base_bom: out.base_bom, draft_boms: out.drafts, refreshed_by: who, refreshed_at: now }
    : { rbom_id: out.rbom_id, project_id: projectId, item_code: S(base.item_code), item_name: S(base.item_name), base_bom: out.base_bom, draft_boms: out.drafts, built_by: who, built_at: now };
  const { error: uErr } = await admin.from("material_rbom").upsert(headerRow, { onConflict: "rbom_id" });
  if (uErr) throw new Error(uErr.message);
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await admin.from("material_rbom_item").insert(fresh.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  out.added = fresh.length;
  return out;
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const body = await req.json().catch(() => ({}));
    const admin = adminClient();
    const action = String(body.action || "build");

    if (action === "build") {
      const projectId = S(body.project_id);
      if (!projectId) throw new HttpError(400, "project_id required");
      const o = await buildOne(admin, projectId, me.email);
      return NextResponse.json({ ok: true, outcomes: [o] });
    }
    if (action === "build_all") {
      const live = await liveProjectIds(admin);
      const outcomes: Outcome[] = [];
      for (const pid of [...live].sort()) {
        try { outcomes.push(await buildOne(admin, pid, me.email)); }
        catch (e) { outcomes.push({ project_id: pid, rbom_id: "", base_bom: "", drafts: [], released: 0, draft: 0, added: 0, existed: 0, skipped: e instanceof Error ? e.message : String(e) }); }
      }
      return NextResponse.json({ ok: true, outcomes });
    }
    throw new HttpError(400, "Unknown action — build or build_all.");
  } catch (e) {
    return errJson(e);
  }
}
