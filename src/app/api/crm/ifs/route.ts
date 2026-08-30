import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/ifs { company_id, cin? } — BUY the InstaFinancials
 * InstaSummary for a company (Dr Raghu, 30 Aug 2026). 75 credits a pull, so
 * RAGHU'S HAND ALONE triggers it; the result lands on the company where
 * everyone reads it. The CIN is remembered on the company once given.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (me.email.toLowerCase() !== "raghu@nandan.co.in")
      throw new HttpError(403, "InstaFinancials credits are Raghu's to spend — ask him to buy this summary.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const cid = String(body.company_id ?? "");
    if (!cid) throw new HttpError(400, "Which company?");

    const { data: co } = await db.from("company").select("id, name, cin").eq("id", cid).maybeSingle();
    if (!co) throw new HttpError(404, "That company no longer exists.");
    const cin = String(body.cin || co.cin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{15,25}$/.test(cin))
      throw new HttpError(400, "A CIN first — the 21-character company identification number (find it on the MCA site or the customer's letterhead).");

    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "instafinancials").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.api_key) throw new HttpError(503, "The InstaFinancials key is not saved — Settings → Integrations, Raghu's card.");
    const tmpl = (cfg.url_template || "https://instafinancials.com/api/InstaSummary/v1/json/CompanyCIN/{cin}").trim();
    const url = tmpl.replace("{cin}", encodeURIComponent(cin));

    const r = await fetch(url, { headers: { "user-key": cfg.api_key, accept: "application/json" } });
    const text = await r.text();
    if (!r.ok)
      throw new HttpError(502, `InstaFinancials said ${r.status}: ${text.slice(0, 220)} — check the key and URL_TEMPLATE in Integrations.`);
    let j: unknown;
    try { j = JSON.parse(text); } catch { throw new HttpError(502, `InstaFinancials answered but not with JSON: ${text.slice(0, 180)}`); }

    const now = new Date().toISOString();
    const { error } = await db.from("company").update({ cin, ifs_summary: j, ifs_at: now, ifs_by: me.email }).eq("id", cid);
    if (error) {
      if (/ifs_summary|cin|schema cache/i.test(error.message))
        throw new HttpError(503, "Run CRM migration 0042 first — the summary has nowhere to live yet.");
      throw new HttpError(500, error.message);
    }
    await db.from("crm_audit").insert({
      entity: "company", entity_id: cid, action: "ifs_buy",
      after: { cin, credits: 75 }, by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, at: now });
  } catch (e) {
    return errJson(e);
  }
}
