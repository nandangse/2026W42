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
 * NOT an open proxy (tightened 9 Oct 2026, audit S10): only the ERP host,
 * only its two file folders — /files/ and /private/files/ — never its REST
 * API, which the stored key could otherwise read on anybody's behalf. Only
 * signed-in CRM users, GET only. Images and PDFs show inline, by what their
 * first bytes say they are, not by what the ERP's header claims; everything
 * else downloads as a plain attachment so nothing can render as a page on
 * Genie's origin.
 */
const INLINE: [RegExp, string][] = [
  [/^%PDF-/, "application/pdf"],
  [/^\x89PNG/, "image/png"],
  [/^\xFF\xD8\xFF/, "image/jpeg"],
  [/^GIF8[79]a/, "image/gif"],
  [/^RIFF[\s\S]{4}WEBP/, "image/webp"],
  [/^BM/, "image/bmp"],
];

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
    if (!/^\/(private\/)?files\//.test(target.pathname) || target.pathname.includes("..")) throw new HttpError(403, "Only the ERP's file folders travel through this door.");

    const r = await fetch(target.toString(), { headers: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for that file.`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 25_000_000) throw new HttpError(413, "That file is beyond this door (25 MB).");
    const head = Buffer.from(buf.slice(0, 16)).toString("latin1");
    const kind = INLINE.find(([re]) => re.test(head))?.[1];
    const name = decodeURIComponent(target.pathname.split("/").pop() || "file").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
    return new Response(buf, {
      headers: {
        "content-type": kind || "application/octet-stream",
        "content-disposition": kind ? `inline; filename="${name}"` : `attachment; filename="${name}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
