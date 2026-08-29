import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The ERP's files, shown to Genie's people (Dr Raghu, 29 Aug 2026: "can we
 * have these images embedded — it's not possible to click and see"). The ERP
 * demands its own login for /file/ URLs; this door fetches the file
 * SERVER-SIDE with the stored token and hands it over, so an enquiry's
 * images embed and its attachments open for anyone signed into Genie.
 *
 * NOT an open proxy: only URLs under the configured ERP host travel, only
 * for signed-in CRM users, GET only.
 */
export async function GET(req: Request) {
  try {
    await requireCrm();
    const u = new URL(req.url).searchParams.get("u") || "";
    if (!u) throw new HttpError(400, "u required");

    const { data: row } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (row?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret) throw new HttpError(503, "The ERP door is not configured.");
    const base = cfg.url.replace(/\/+$/, "");

    let target: URL;
    try { target = new URL(u); } catch { throw new HttpError(400, "a full URL, please"); }
    const baseHost = new URL(base).host;
    if (target.host !== baseHost) throw new HttpError(403, "Only the ERP's own files travel through this door.");

    const r = await fetch(target.toString(), { headers: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for that file.`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 25_000_000) throw new HttpError(413, "That file is beyond this door (25 MB).");
    return new Response(buf, {
      headers: {
        "content-type": r.headers.get("content-type") || "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-disposition": "inline",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
