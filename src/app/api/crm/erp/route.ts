import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The ERP's door, used (Dr Raghu, 28 Aug 2026, pointing at the Frappe REST
 * docs): reads through /api/resource with the stored token pair — acting as
 * Raghu's own ERP user, so the button is HIS alone.
 *
 * POST { action: "pull_quotation_values" } — every imported quotation that
 * stands at zero takes its real value from the ERP, matched by quote number.
 * Reads only; nothing in the ERP is touched.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!me.isOwner) throw new HttpError(403, "The ERP door is Raghu's to use, for now.");
    const db = crmDb();
    const body = await req.json();
    if (String(body.action) !== "pull_quotation_values") throw new HttpError(400, "Unknown action.");

    const { data: row } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (row?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      throw new HttpError(400, "Save the ERPNext URL, key and secret in Integrations first.");
    const base = cfg.url.replace(/\/+$/, "");
    const H = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    // the ERP's quotations, paged the Frappe way
    const erp = new Map<string, { total: number; net: number }>();
    for (let start = 0; ; start += 500) {
      const u = `${base}/api/resource/Quotation?fields=${encodeURIComponent(JSON.stringify(["name", "base_grand_total", "grand_total", "base_net_total", "net_total"]))}&limit_start=${start}&limit_page_length=500`;
      const r = await fetch(u, { headers: H });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status}${j && (j as { exc_type?: string }).exc_type ? ` — ${(j as { exc_type?: string }).exc_type}` : ""}`);
      const page = ((j as { data?: Record<string, unknown>[] } | null)?.data || []);
      for (const q of page) {
        const total = Number(q.base_grand_total ?? q.grand_total) || 0;
        const net = Number(q.base_net_total ?? q.net_total) || 0;
        if (q.name) erp.set(String(q.name), { total, net });
      }
      if (page.length < 500) break;
      if (start > 100000) break;
    }
    if (!erp.size) return NextResponse.json({ ok: true, note: "The ERP returned no quotations.", matched: 0, filled: 0 });

    // our zero-value quotations, matched by number
    let filled = 0, matched = 0, scanned = 0;
    for (let a = 0; ; a += 1000) {
      const { data: quotes, error } = await db.from("quotation")
        .select("id, quote_no, grand_total, quoted_value").order("id").range(a, a + 999);
      if (error) throw new Error(error.message);
      for (const q of quotes || []) {
        scanned++;
        const hit = erp.get(String(q.quote_no));
        if (!hit || !hit.total) continue;
        matched++;
        if (Number(q.grand_total) || Number(q.quoted_value)) continue; // never overwrite a typed value
        const { error: ue } = await db.from("quotation")
          .update({ grand_total: hit.total, quoted_value: hit.total, subtotal: hit.net || hit.total })
          .eq("id", q.id);
        if (!ue) filled++;
      }
      if (!quotes || quotes.length < 1000) break;
    }
    return NextResponse.json({ ok: true, erpCount: erp.size, scanned, matched, filled });
  } catch (e) {
    return errJson(e);
  }
}
