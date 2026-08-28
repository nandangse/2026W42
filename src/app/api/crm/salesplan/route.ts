import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/** April-to-March, the company's year. */
function currentFy(d = new Date()): string {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

const TARGET_KEYS = [
  "booking", "billing", "collections", "quotation_value", "quotation_nos",
  "calls_wk", "visits_wk", "video_calls_wk", "opps_wk",
] as const;

const mayManage = (role: string) => ["admin", "ceo", "sales_head"].includes(role);

/**
 * GET ?fy= — every active salesperson's plan (managers) or your own row.
 * POST { profile_id, fy, targets } — managers only. Targets are promises
 * made in a review, not numbers a person quietly edits mid-year.
 */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const fy = new URL(req.url).searchParams.get("fy") || currentFy();
    const manage = mayManage(String(me.crmRole));

    const { data: profiles } = await db.from("profile")
      .select("id, full_name, initials, email, role, is_active").eq("is_active", true).order("full_name");
    const { data: plans, error } = await db.from("salesperson_plan").select("profile_id, targets, updated_by, updated_at").eq("fy", fy);
    if (error && !/salesperson_plan|schema cache|does not exist/i.test(error.message)) throw new HttpError(500, error.message);
    const planBy = new Map((plans || []).map((p) => [String(p.profile_id), p]));

    const rows = (profiles || [])
      .filter((p) => manage || String(p.id) === me.profileId)
      .filter((p) => ["sales", "sales_head", "inside_sales", "ceo"].includes(String(p.role)))
      .map((p) => ({
        profile_id: String(p.id), name: String(p.full_name || p.email), initials: p.initials,
        role: p.role,
        targets: (planBy.get(String(p.id))?.targets || {}) as Record<string, number>,
        updated_by: planBy.get(String(p.id))?.updated_by ?? null,
      }));
    return NextResponse.json({ fy, manage, rows, needsMigration: !!error });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (!mayManage(String(me.crmRole)))
      throw new HttpError(403, "Targets are set by the CEO, the Sales Head and admin — they are promises made in a review.");
    const db = crmDb();
    const body = await req.json();
    const profileId = String(body.profile_id || "");
    const fy = String(body.fy || currentFy());
    if (!profileId) throw new HttpError(400, "Whose plan?");

    const targets: Record<string, number> = {};
    for (const k of TARGET_KEYS) {
      const v = Number(String((body.targets || {})[k] ?? "").replace(/[^0-9.]/g, ""));
      if (Number.isFinite(v) && v > 0) targets[k] = v;
    }
    const { error } = await db.from("salesperson_plan").upsert({
      profile_id: profileId, fy, targets,
      updated_by: me.email.toLowerCase(), updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,fy" });
    if (error) {
      if (/salesperson_plan|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run CRM migration 0020 first — the plan has nowhere to live yet.");
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
