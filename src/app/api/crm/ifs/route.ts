import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { driveConfig, listFolder, downloadFile } from "@/lib/drive";
import { structureReport, normaliseName, CIN_RE } from "@/lib/ifs-pdf";

/**
 * THE DRIVE FOLDER OF REPORTS (Dr Raghu, 4 Sep 2026): "All Instafinancial
 * downloads". The first id is the folder he named; the second is its
 * parent, walked if the first is empty. Overridable from Integrations as
 * IFS_DRIVE_FOLDER without a deploy.
 */
const IFS_FOLDERS = ["1Bg2YFc-TKctEIHgGmr1unLH4yRQs2C0C", "1Ru-m05q-Kp6D-X_C2dPZp6yNi1np2_5j"];
const cinLooksRight = (c: string) => CIN_RE.test(c);
const needs0053 = (m: string) => /ifs_pdf_id|ifs_pdf_url|ifs_source|schema cache/i.test(m);

/** Read one company's Drive report into its summary. Owner-only, by the caller. */
async function importPdf(db: ReturnType<typeof crmDb>, cid: string, who: string) {
  const { data: co } = await db.from("company").select("id, name, cin, ifs_pdf, ifs_pdf_id").eq("id", cid).maybeSingle();
  if (!co) throw new HttpError(404, "No such company.");
  if (!co.ifs_pdf_id) throw new HttpError(400, "No Drive report is linked to this company yet — scan the folder first.");
  const dcfg = driveConfig();
  if (!dcfg) throw new HttpError(503, "Drive keys are not configured on the server.");
  const buf = await downloadFile(dcfg, String(co.ifs_pdf_id));
  if (buf.length > 20 * 1024 * 1024) throw new HttpError(413, "That report is over 20 MB — too big to read here.");
  const { json, cin } = await structureReport(buf, String(co.name));
  const patch: Record<string, unknown> = { ifs_summary: json, ifs_at: new Date().toISOString(), ifs_by: `drive:${who}`, ifs_source: "pdf" };
  if (cin && !co.cin) patch.cin = cin;
  const { error } = await db.from("company").update(patch).eq("id", cid);
  if (error) throw needs0053(error.message) ? new HttpError(503, "Run CRM migration 0053 first.") : new HttpError(500, error.message);
  await db.from("crm_audit").insert({ entity: "company", entity_id: cid, action: "ifs_import_pdf", after: { cin, file: co.ifs_pdf }, by_user: null }).then(() => null, () => null);
  return { cin: cin ?? co.cin ?? null, name: co.name };
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const body = await readBody(req, {});
    const cid = String(body.company_id ?? "");
    if (!cid) throw new HttpError(400, "Which company?");

    const { data: co } = await db.from("company").select("id, name, cin").eq("id", cid).maybeSingle();
    if (!co) throw new HttpError(404, "That company no longer exists.");

    // 🔍 FIND CIN (Dr Raghu, 30 Aug 2026: "how do I get the CIN?") — the
    // GetCIN API, 1 credit: search by name, offer every CIN-shaped answer.
    /**
     * SCAN THE DRIVE FOLDER (Dr Raghu, 4 Sep 2026). Every PDF in "All
     * Instafinancial downloads" is matched to a company by name -- the file
     * is called "InstaSummary Report of <company>_dd-mm-yyyy.pdf" -- and the
     * link is written on the company. A name that matches two companies, or
     * none, is REPORTED, not guessed: a report linked to the wrong company
     * is a wrong CIN on a quotation.
     */
    if (body.action === "scan_drive") {
      if (!me.isOwner) throw new HttpError(403, "Raghu's hand alone.");
      const dcfg = driveConfig();
      if (!dcfg) throw new HttpError(503, "Drive keys are not configured on the server.");
      const { data: setting } = await db.from("integration_setting").select("config").eq("key", "instafinancials").maybeSingle();
      const override = String(((setting?.config || {}) as Record<string, string>).drive_folder || "").trim();
      const folders = override ? [override, ...IFS_FOLDERS] : IFS_FOLDERS;
      let files: Awaited<ReturnType<typeof listFolder>> = [];
      let used = "";
      for (const f of folders) {
        try { files = await listFolder(dcfg, f, { pdfOnly: true }); used = f; if (files.length) break; }
        catch (e) { if (f === folders[folders.length - 1] && !files.length) throw new HttpError(502, e instanceof Error ? e.message : String(e)); }
      }
      const { data: companies } = await db.from("company").select("id, name, ifs_pdf_id").is("deleted_at", null).limit(5000);
      const byNorm = new Map<string, { id: string; name: string }[]>();
      for (const c of companies ?? []) { const k = normaliseName(String(c.name)); if (!k) continue; (byNorm.get(k) ?? byNorm.set(k, []).get(k)!).push({ id: String(c.id), name: String(c.name) }); }
      const linked: { file: string; company: string }[] = [], ambiguous: { file: string; companies: string[] }[] = [], unmatched: string[] = [];
      for (const f of files) {
        const k = normaliseName(f.name);
        let hits = byNorm.get(k) ?? [];
        if (!hits.length && k.length >= 6) for (const [n, cs] of byNorm) if (n.length >= 6 && (n.includes(k) || k.includes(n))) hits = hits.concat(cs);
        hits = [...new Map(hits.map((h) => [h.id, h])).values()];
        if (hits.length === 1) {
          const { error } = await db.from("company").update({ ifs_pdf: f.name, ifs_pdf_id: f.id, ifs_pdf_url: f.webViewLink }).eq("id", hits[0].id);
          if (error) throw needs0053(error.message) ? new HttpError(503, "Run CRM migration 0053 first — the Drive link has nowhere to live yet.") : new HttpError(500, error.message);
          linked.push({ file: f.name, company: hits[0].name });
        } else if (hits.length > 1) ambiguous.push({ file: f.name, companies: hits.map((h) => h.name) });
        else unmatched.push(f.name);
      }
      return NextResponse.json({ ok: true, folder: used, pdfs: files.length, linked, ambiguous, unmatched });
    }

    if (body.action === "import_pdf") {
      if (!me.isOwner) throw new HttpError(403, "Raghu's hand alone.");
      const out = await importPdf(db, cid, me.email);
      return NextResponse.json({ ok: true, ...out });
    }

    /** Every company with a linked report and no summary yet — in one pass. */
    if (body.action === "import_all") {
      if (!me.isOwner) throw new HttpError(403, "Raghu's hand alone.");
      const { data: todo } = await db.from("company").select("id, name").not("ifs_pdf_id", "is", null).is("ifs_summary", null).limit(Number(body.limit) || 25);
      const done: string[] = [], failed: { name: string; error: string }[] = [];
      for (const c of todo ?? []) {
        try { await importPdf(db, String(c.id), me.email); done.push(String(c.name)); }
        catch (e) { failed.push({ name: String(c.name), error: e instanceof Error ? e.message : String(e) }); }
      }
      const { count } = await db.from("company").select("id", { count: "exact", head: true }).not("ifs_pdf_id", "is", null).is("ifs_summary", null);
      return NextResponse.json({ ok: true, done, failed, remaining: count ?? 0 });
    }

    if (body.action === "find_cin") {
      const { data: cfgRow2 } = await db.from("integration_setting").select("config").eq("key", "instafinancials").maybeSingle();
      const cfg2 = (cfgRow2?.config || {}) as Record<string, string>;
      if (!cfg2.api_key) throw new HttpError(503, "The InstaFinancials key is not saved — Settings → Integrations.");
      const nameQ = String(body.name || co.name || "").trim();
      if (!nameQ) throw new HttpError(400, "A company name to search.");
      // real endpoint (their docs, 30 Aug 2026): api. host, Search/{term}/Mode/SW;
      // MCA spells "PRIVATE LIMITED", so the Pvt Ltd tail is dropped from the term
      const tmpl2 = (cfg2.cin_url_template || "https://api.instafinancials.com/InstaReports/v1/GetCIN/Search/{name}/Mode/SW").trim();
      const baseQ = nameQ.replace(/\b(pvt|private)\.?\s*(ltd|limited)\b\.?|\b(ltd|limited)\.?$/gi, "").trim() || nameQ;
      const url2 = tmpl2.replace("{name}", encodeURIComponent(baseQ));
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
      } catch (e) { swallow("crm/ifs", e); /* fall through to the raw scan */ }
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

    // "u dont need to ask!! just add them to the company contacts"
    // (Dr Raghu, 30 Aug 2026) — every director files as a contact the moment
    // the summary lands: new ones created, existing ones filled where empty.
    try {
      const summ = (j as { InstaSummary?: Record<string, unknown> }).InstaSummary ?? {};
      const dirs = ((((summ.DirectorSignatoryMasterSummary as Record<string, unknown> | undefined)
        ?.DirectorCurrentMasterSummary as { Director?: Record<string, unknown>[] } | undefined)?.Director) ?? []) as Record<string, unknown>[];
      const cleanN = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const iso = (v: unknown) => { const m = String(v ?? "").match(/(\d{2})[-/](\d{2})[-/](\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
      const val = (v: unknown) => { const t = String(v ?? "").trim(); return t && t !== "null" ? t : ""; };
      const { data: existing } = await db.from("person")
        .select("id, first_name, primary_email, primary_phone, birthday").eq("company_id", cid).limit(500);
      const byName = new Map((existing ?? []).map((p) => [cleanN(p.first_name), p]));
      for (const d of dirs) {
        const nm = val(d.DirectorName);
        if (nm.length < 3) continue;
        const email = val(d.DirectorEmail) || null, phone = val(d.DirectorContactNo) || null, dob = iso(d.DirectorDateOfBirth);
        const ex = byName.get(cleanN(nm));
        if (ex) {
          const fill: Record<string, unknown> = {};
          if (email && !ex.primary_email) fill.primary_email = email;
          if (phone && !ex.primary_phone) fill.primary_phone = phone;
          if (dob && !ex.birthday) fill.birthday = dob;
          if (Object.keys(fill).length) await db.from("person").update(fill).eq("id", ex.id).then(() => null, () => null);
        } else {
          await db.from("person").insert({
            first_name: nm.slice(0, 180), job_title: val(d.DirectorDesignation) || "Director",
            primary_email: email, primary_phone: phone, birthday: dob,
            company_id: cid, is_decision_maker: true,
          }).then(() => null, () => null);
        }
      }
    } catch (e) { swallow("crm/ifs", e); /* the summary is the purchase; contacts are the bonus */ }

    const now = new Date().toISOString();
    let { error } = await db.from("company").update({ cin, ifs_summary: j, ifs_at: now, ifs_by: me.email, ifs_source: "api" }).eq("id", cid);
    if (error && needs0053(error.message)) ({ error } = await db.from("company").update({ cin, ifs_summary: j, ifs_at: now, ifs_by: me.email }).eq("id", cid));
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
