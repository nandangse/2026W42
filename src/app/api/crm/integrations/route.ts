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
  // EVA quotas (Dr Raghu, 29 Aug 2026): each brief is real research money
  // (~₹60-100), so the week has a budget — 10 per salesperson, 100 for Raghu.
  { key: "eva_quota", label: "EVA Brief quota", fields: ["per_week", "raghu_per_week"], ownerOnly: false, help: "How many ✨ EVA Briefs each salesperson may run per week (Monday to Sunday, IST) — and Raghu's own number. Each brief costs roughly ₹60–100 of live web research. Blank falls back to 10 and 100." },
  { key: "apollo", label: "Apollo.io", fields: ["api_key", "per_week", "raghu_per_week"], ownerOnly: false, help: "Enriches contacts and companies from apollo.io (Settings → API keys there). PER_WEEK is each salesperson's weekly allotment of Apollo asks — contact lookups and company enrichments both count, applying ticked fields is free — and RAGHU_PER_WEEK is Raghu's own. Blank falls back to 25 and 200. Monday to Sunday, IST." },
  // ERPNext (Dr Raghu, 28 Aug 2026): the Frappe token pair from his user's
  // API Access — auth is `token api_key:api_secret`; the SECRET shows only
  // once at Generate Keys. Editable by Raghu alone, for now.
  { key: "erpnext", label: "ERPNext", fields: ["url", "api_key", "api_secret", "push_doctype", "push_tdd_field", "push_kit_field", "push_pct_field", "opp_info_field"], ownerOnly: true, help: "The ERP's door — site URL, API Key and API Secret from your ERPNext user's API Access (the secret shows once at Generate Keys). Below them, THE MAPPING: the job doctype and its field names for TDD / kitting % / production %, and the Opportunity field holding the enquiry text — use 🔍 Inspect to read the ERP's own field names before setting them. Only Raghu edits this one. SALES-SIDE IS PULL-ONLY for now — Opportunity, Quotation and Sales Order changes made in Genie are tracked in the audit and NOT written to the ERP until Raghu says sync. ONE sanctioned exception (30 Aug 2026): the ⬆ Push to ERP button on a Genie-born enquiry CREATES it there, with its customer and contact when the ERP lacks them." },
  // InstaFinancials (Dr Raghu, 30 Aug 2026): company financials by CIN.
  // InstaSummary costs 75 credits a pull — Raghu's hand alone triggers it;
  // everyone reads the result on the company's IFS tab.
  // Periskope (Dr Raghu, 31 Aug 2026: "Add an integration API. Call it
  // periskope. Keep it in the CRM settings itself. I'll feed in the API in
  // that."). The key has somewhere to live before anything is built on it —
  // stored the way every other key here is, in the CRM's own database behind
  // the service role, never in an env var that would need a redeploy to
  // rotate, and never echoed back whole.
  // Periskope (Dr Raghu, 31 Aug 2026) — the WhatsApp Business automation.
  // The field names follow Periskope's own API: the key rides as
  // `Authorization: Bearer …` and the number as the `x-phone` header, which
  // is why PHONE is not optional decoration but half the credential.
  //
  // THE THREE CEILINGS ARE HIS ("messages / hr max - 100. Min time between
  // two message - 10 sec. max per day 500") and they live here rather than in
  // code so they can be lowered the day the number feels heat — see the
  // warning the queue screen carries about Periskope's own advice.
  { key: "periskope", label: "Periskope — WhatsApp Business", fields: ["api_key", "phone", "base_url", "per_hour", "per_day", "gap_seconds"], ownerOnly: true, help: "API_KEY from Periskope → Settings → API, sent as a Bearer token. PHONE is the sending WhatsApp number with country code and no symbols (919876543210) — Periskope reads it as the x-phone header, so it is half the credential, not a note. BASE_URL: LEAVE IT BLANK — blank uses https://api.periskope.app/v1, and you would only fill it if Periskope ever moved their API. THE CEILINGS: PER_HOUR (blank = 100), PER_DAY (blank = 500) and GAP_SECONDS, the least time between any two messages (blank = 10). They are enforced by the queue at the moment of sending, not by the screen. NOTE: Periskope's own guidance calls 100+ a day HIGH RISK of a ban and suggests 20–50 for an established number — 500 is your call, made knowingly." },
  // Zoom (Dr Raghu, 4 Sep 2026: "we can start integrating the zoom api").
  // A Server-to-Server OAuth app -- three credentials, no per-user login --
  // plus the webhook's Secret Token, which is how Genie knows a call at
  // /api/zoom/webhook really came from Zoom. Kept here like every other
  // key: behind the service role, never echoed back whole.
  { key: "zoom", label: "Zoom — meetings, recordings, AI summaries", fields: ["account_id", "client_id", "client_secret", "secret_token"], ownerOnly: true, help: "From marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth: ACCOUNT_ID, CLIENT_ID and CLIENT_SECRET from the App Credentials page. Give the app these scopes: meeting:read:admin, recording:read:admin, user:read:admin, report:read:admin, and the meeting summary read scope. SECRET_TOKEN is on the app's Feature → Event Subscriptions page -- add a subscription to https://genie.nandan.co.in/api/zoom/webhook with the events meeting.ended, recording.completed and meeting.summary_completed, and Zoom will validate the URL the moment you save it. Cloud recording and AI Companion must be ON in the Zoom account, or there is nothing to fetch." },
  { key: "instafinancials", label: "InstaFinancials", fields: ["api_key", "order_url_template", "status_url_template", "download_url_template", "cin_url_template", "url_template"], ownerOnly: true, help: "The InstaFinancials API key (instafinancials.com → API Key Configuration). URL_TEMPLATE is the InstaSummary endpoint with {cin} where the CIN goes — blank falls back to the standard https://instafinancials.com/api/InstaSummary/v1/json/CompanyCIN/{cin} — adjust it here if their docs show a different path or when switching sandbox to production. Only Raghu edits or triggers; the bought summary is visible to all." },
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
          ownerOnly: k.ownerOnly, mayEdit: !k.ownerOnly || me.isOwner,
          configured: k.key === "erpnext" ? !!(cfg.api_key && cfg.api_secret)
            : k.key === "eva_quota" ? !!(cfg.per_week || cfg.raghu_per_week)
            : !!cfg.api_key,
          tail: cfg.api_key ? String(cfg.api_key).slice(-4) : null,
          url: k.key === "erpnext" ? cfg.url ?? null : null,
          mapping: k.key === "erpnext" ? {
            push_doctype: cfg.push_doctype ?? "", push_tdd_field: cfg.push_tdd_field ?? "",
            push_kit_field: cfg.push_kit_field ?? "", push_pct_field: cfg.push_pct_field ?? "",
            opp_info_field: cfg.opp_info_field ?? "",
          } : null,
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
    const known = KNOWN.find((k) => k.key === key);
    if (!known) throw new HttpError(400, "Unknown integration.");
    if (known.ownerOnly && !me.isOwner) throw new HttpError(403, "This one is Raghu's to edit, for now.");

    // ?action=test — ring the ERP's own door with the stored pair
    if (String(body.action || "") === "test" && key === "erpnext") {
      const { data: row } = await db.from("integration_setting").select("config").eq("key", key).maybeSingle();
      const cfg = (row?.config || {}) as Record<string, string>;
      if (!cfg.url || !cfg.api_key || !cfg.api_secret) throw new HttpError(400, "Save the URL, key and secret first.");
      try {
        const r = await fetch(`${cfg.url.replace(/\/+$/, "")}/api/method/frappe.auth.get_logged_user`, {
          headers: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` },
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j as { message?: string } | null)?.message || `ERPNext answered ${r.status}`);
        return NextResponse.json({ ok: true, user: (j as { message?: string } | null)?.message || "connected" });
      } catch (e) {
        throw new HttpError(502, `The ERP did not answer: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // MERGE, never replace — saving only a new URL must not drop the secret
    const { data: existing } = await db.from("integration_setting").select("config").eq("key", key).maybeSingle();
    const config: Record<string, string> = { ...((existing?.config || {}) as Record<string, string>) };
    let touched = false;
    for (const f of known.fields) {
      const v = String((body.config || {})[f] ?? "").trim();
      if (v) { config[f] = v; touched = true; }
    }
    if (!touched) throw new HttpError(400, "Nothing to save — paste the key.");
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
