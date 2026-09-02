import { NextResponse } from "next/server";
import { requireReader, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/erp-project?id=1716 — ONE project, whole.
 *
 * The book at Projects lists 1,687 of them and answers "which"; this answers
 * "what", for the one you clicked. It carries the ERP's own record, Genie's
 * row for the same project, and the jobs standing on it — because a project
 * without its jobs is a header, not a project.
 *
 * The id is forgiving on purpose: 1716, NGSE-PROJ-1716 and the lower-case
 * spelling all reach the same project. A URL a person types from memory
 * should not fail on punctuation.
 */
const full = (raw: string) => {
  const s = decodeURIComponent(String(raw || "")).trim();
  if (!s) return "";
  return /^NGSE-PROJ-/i.test(s) ? s.toUpperCase() : `NGSE-PROJ-${s.replace(/^0+/, "")}`;
};

export async function GET(req: Request) {
  try {
    await requireReader();
    const id = full(new URL(req.url).searchParams.get("id") || "");
    if (!id) throw new HttpError(400, "Which project?");
    if (!crmConfigured()) throw new HttpError(503, "CRM (and its ERP keys) not configured.");
    const { data: cfgRow } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      throw new HttpError(400, "The ERPNext keys are not saved — CRM → Settings → Integrations.");
    const base = cfg.url.replace(/\/+$/, "");
    const H = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    const r = await fetch(`${base}/api/resource/Project/${encodeURIComponent(id)}`, { headers: H, cache: "no-store" });
    if (r.status === 404) throw new HttpError(404, `The ERP has no project named ${id}.`);
    if (!r.ok) throw new HttpError(502, `The ERP refused: ${r.status}`);
    const erp = ((await r.json())?.data ?? {}) as Record<string, unknown>;

    const admin = adminClient();
    const [{ data: mine }, { data: jobs }] = await Promise.all([
      admin.from("projects").select("*").eq("id", id).maybeSingle(),
      admin.from("jobs")
        .select("id, tag, cust, fam, val, tp, tpv, tpp, tdd, otd, kit, pct, stat, own, delivered, delivered_on, active")
        .eq("proj", id).order("tdd"),
    ]);

    return NextResponse.json({ id, erp, genie: mine ?? null, jobs: jobs ?? [] });
  } catch (e) {
    return errJson(e);
  }
}
