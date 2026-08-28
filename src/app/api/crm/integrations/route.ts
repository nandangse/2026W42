import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Settings → Integrations. Keys for outside services, kept in the CRM's own
 * database behind the service role — never in an env var that needs a
 * redeploy to rotate, and NEVER echoed back whole: the UI gets the last
 * four characters, enough to recognise a key, not enough to steal one.
 *
 * Managed by admin, CEO and Sales Head.
 */
const KNOWN = [
  { key: "apollo", label: "Apollo.io", fields: ["api_key"], help: "Enriches contacts — designation, phones, LinkedIn — from apollo.io. Settings → API keys there." },
] as const;

const mayManage = (role: string) => ["admin", "ceo", "sales_head"].includes(role);

export async function GET() {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (!mayManage(String(me.crmRole))) throw new HttpError(403, "Integrations are managed by the CEO, the Sales Head and admin.");
    const db = crmDb();
    const { data, error } = await db.from("integration_setting").select("key, config, updated_by, updated_at");
    if (error) {
      if (/integration_setting|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ integrations: KNOWN.map((k) => ({ ...k, configured: false })), needsMigration: true });
      throw new HttpError(500, error.message);
    }
    const byKey = new Map((data || []).map((r) => [String(r.key), r]));
    return NextResponse.json({
      integrations: KNOWN.map((k) => {
        const row = byKey.get(k.key);
        const cfg = (row?.config || {}) as Record<string, string>;
        return {
          key: k.key, label: k.label, fields: k.fields, help: k.help,
          configured: !!cfg.api_key,
          tail: cfg.api_key ? String(cfg.api_key).slice(-4) : null,
          updated_by: row?.updated_by ?? null, updated_at: row?.updated_at ?? null,
        };
      }),
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (!mayManage(String(me.crmRole))) throw new HttpError(403, "Integrations are managed by the CEO, the Sales Head and admin.");
    const db = crmDb();
    const body = await req.json();
    const key = String(body.key || "");
    if (!KNOWN.some((k) => k.key === key)) throw new HttpError(400, "Unknown integration.");
    const config: Record<string, string> = {};
    for (const f of KNOWN.find((k) => k.key === key)!.fields) {
      const v = String((body.config || {})[f] ?? "").trim();
      if (v) config[f] = v;
    }
    if (!Object.keys(config).length) throw new HttpError(400, "Nothing to save — paste the key.");
    const { error } = await db.from("integration_setting").upsert({
      key, config, updated_by: me.email.toLowerCase(), updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) {
      if (/integration_setting|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run CRM migration 0019 first — the integrations have nowhere to live yet.");
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
