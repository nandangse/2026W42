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

    // 🔍 FIND CIN (Dr Raghu, 30 Aug 2026: "how do I get the CIN?") — the
    // GetCIN API, 1 credit: search by name, offer every CIN-shaped answer.
    if (body.action === "find_cin") {
      const { data: cfgRow2 } = await db.from("integration_setting").select("config").eq("key", "instafinancials").maybeSingle();
      const cfg2 = (cfgRow2?.config || {}) as Record<string, string>;
      if (!cfg2.api_key) throw new HttpError(503, "The InstaFinancials key is not saved — Settings → Integrations.");
      const nameQ = String(body.name || co.name || "").trim();
      if (!nameQ) throw new HttpError(400, "A company name to search.");
      const tmpl2 = (cfg2.cin_url_template || "https://instafinancials.com/api/GetCIN/v1/json/CompanyName/{name}").trim();
      const url2 = tmpl2.replace("{name}", encodeURIComponent(nameQ));
      const r2 = await fetch(url2, { headers: { "user-key": cfg2.api_key, accept: "application/json" } });
      const text2 = await r2.text();
      if (!r2.ok) throw new HttpError(502, `GetCIN said ${r2.status}: ${text2.slice(0, 200)} — is the GetCIN API toggled Active on instafinancials.com?`);
      // harvest every CIN-shaped string with whatever name stands near it
      const candidates: { cin: string; name: string }[] = [];
      try {
        const walk = (o: unknown, near: string) => {
          if (candidates.length >= 8) return;
          if (Array.isArray(o)) { for (const x of o) walk(x, near); return; }
          if (o && typeof o === "object") {
            const rec = o as Record<string, unknown>;
            const nm = String(rec.CompanyName || rec.companyName || rec.Name || near || "");
            for (const v of Object.values(rec)) {
              if (typeof v === "string" && /^[LUF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(v.trim().toUpperCase())) {
                if (!candidates.some((c) => c.cin === v.trim().toUpperCase()))
                  candidates.push({ cin: v.trim().toUpperCase(), name: nm });
              } else walk(v, nm);
            }
          }
        };
        walk(JSON.parse(text2), "");
      } catch { /* fall through to the raw scan */ }
      if (!candidates.length) {
        for (const m of text2.toUpperCase().matchAll(/[LUF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/g)) {
          if (!candidates.some((c) => c.cin === m[0])) candidates.push({ cin: m[0], name: "" });
          if (candidates.length >= 8) break;
        }
      }
      if (!candidates.length) throw new HttpError(404, `GetCIN found no CIN for "${nameQ}" — try a shorter or exact registered name.`);
      await db.from("crm_audit").insert({
        entity: "company", entity_id: cid, action: "ifs_find_cin",
        after: { q: nameQ, found: candidates.length, credits: 1 }, by_user: me.profileId,
      }).then(() => null, () => null);
      return NextResponse.json({ candidates });
    }

    const cin = String(body.cin || co.cin || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{15,25}$/.test(cin))
      throw new HttpError(400, "A CIN first — the 21-character company identification number (find it on the MCA site or the customer's letterhead).");

    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "instafinancials").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.api_key) throw new HttpError(503, "The InstaFinancials key is not saved — Settings → Integrations, Raghu's card.");
    const IH = { "user-key": cfg.api_key, accept: "application/json" };
    const grab = async (url: string, step: string): Promise<Record<string, unknown>> => {
      const r = await fetch(url, { headers: IH });
      const text = await r.text();
      if (!r.ok) throw new HttpError(502, `InstaFinancials ${step} said ${r.status}: ${text.slice(0, 200)} — the ${step.toUpperCase()}_URL_TEMPLATE in Integrations may need the path from their 🌐 Doc.`);
      try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new HttpError(502, `InstaFinancials ${step} answered but not with JSON: ${text.slice(0, 160)}`); }
    };
    const errOf = (j: Record<string, unknown>) => {
      const resp = j.Response as { Status?: string; Type?: string; Message?: string } | undefined;
      return resp?.Status === "error" ? `${resp.Type || "error"}${resp.Message ? ` — ${resp.Message}` : ""}` : null;
    };
    const findDeep = (o: unknown, keyRe: RegExp): string | null => {
      if (Array.isArray(o)) { for (const x of o) { const f = findDeep(x, keyRe); if (f) return f; } return null; }
      if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          if (keyRe.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v);
          const f = findDeep(v, keyRe); if (f) return f;
        }
      }
      return null;
    };

    // InstaSummary is a DIRECT GET (their docs, read 30 Aug 2026):
    //   /api/InstaSummary/v1/json/CompanyCIN/{cin}/{UpdateOption}
    // BestEffort matters: without it a company younger than three years of
    // financials is REJECTED — half the prospects are young companies.
    // The Order→Status→Download pipeline was a wrong turn (it answered
    // "Invalid uri" for every path) — kept only if a template is configured.
    let j: Record<string, unknown> | null = null;
    {
      const directT = (cfg.url_template || "https://instafinancials.com/api/InstaSummary/v1/json/CompanyCIN/{cin}/BestEffort").trim();
      const direct = await grab(directT.replace("{cin}", encodeURIComponent(cin)), "direct");
      const derr = errOf(direct);
      if (derr && !cfg.order_url_template)
        throw new HttpError(502, `InstaFinancials refused: ${derr}. If it names the wrong path, copy the By-CompanyCIN URL from their InstaSummary doc into URL_TEMPLATE (with {cin}).`);
      if (!derr && (direct as { InstaSummary?: unknown }).InstaSummary) j = direct;
      if (!derr && !j && !cfg.order_url_template)
        throw new HttpError(502, `InstaFinancials answered without an InstaSummary: ${JSON.stringify(direct).slice(0, 200)}`);
    }
    if (!j) {
      const orderT = (cfg.order_url_template || "").trim();
      const statusT = (cfg.status_url_template || "https://instafinancials.com/api/InstaSummary/v1/json/OrderStatus/OrderId/{order_id}").trim();
      const dlT = (cfg.download_url_template || "https://instafinancials.com/api/InstaSummary/v1/json/Download/OrderId/{order_id}").trim();
      const ordered = await grab(orderT.replace("{cin}", encodeURIComponent(cin)), "order");
      const oerr = errOf(ordered);
      if (oerr) throw new HttpError(502, `InstaFinancials refused the ORDER: ${oerr}. If it names the wrong path, copy the Order URL from the InstaSummary 🌐 Doc into ORDER_URL_TEMPLATE (with {cin}).`);
      // the order sometimes answers with the summary itself
      if ((ordered as { InstaSummary?: unknown }).InstaSummary) j = ordered;
      else {
        const orderId = findDeep(ordered, /order.?id/i);
        if (!orderId) throw new HttpError(502, `The ORDER answered without an order id: ${JSON.stringify(ordered).slice(0, 200)}`);
        let done = false;
        for (let i = 0; i < 10 && !done; i++) {
          await new Promise((z) => setTimeout(z, 3000));
          const st = await grab(statusT.replace("{order_id}", encodeURIComponent(orderId)), "status");
          const stTxt = findDeep(st, /status/i) || "";
          if (/complete|success|ready|delivered/i.test(stTxt)) done = true;
          else if (/fail|error|reject/i.test(stTxt)) throw new HttpError(502, `The order failed at InstaFinancials: ${stTxt}`);
        }
        if (!done) throw new HttpError(504, "InstaFinancials is still preparing the summary — press Buy again in a minute; the order is placed and will not bill twice.");
        const dl = await grab(dlT.replace("{order_id}", encodeURIComponent(orderId)), "download");
        const derr = errOf(dl);
        if (derr) throw new HttpError(502, `The DOWNLOAD refused: ${derr}`);
        if (!(dl as { InstaSummary?: unknown }).InstaSummary)
          throw new HttpError(502, `The download carried no InstaSummary: ${JSON.stringify(dl).slice(0, 200)}`);
        j = dl;
      }
    }

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
