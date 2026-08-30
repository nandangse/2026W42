import { NextResponse } from "next/server";
import { requireReader, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/erp-projects — the ERP's Project doctype, replicated whole
 * (Dr Raghu, 30 Aug 2026: "all the fields that are in the ERP should be
 * here — I will then clean up the fields which are not needed").
 *
 * Live from the ERP, every scalar field, paged past its 1000-row habit.
 * The page decides what to show; this route hides nothing.
 */
export async function GET() {
  try {
    await requireReader();
    if (!crmConfigured()) throw new HttpError(503, "CRM (and its ERP keys) not configured.");
    const { data: cfgRow } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (cfgRow?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      throw new HttpError(503, "ERPNext keys not saved — Integrations in the CRM.");
    const base = cfg.url.replace(/\/+$/, "");
    const H = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    const rows: Record<string, unknown>[] = [];
    for (let start = 0; start < 10000; start += 200) {
      const u = `${base}/api/resource/Project?fields=${encodeURIComponent(JSON.stringify(["*"]))}` +
        `&order_by=${encodeURIComponent("modified desc")}&limit_start=${start}&limit_page_length=200`;
      const r = await fetch(u, { headers: H });
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} on Project page ${start}.`);
      const page = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
      // scalars only — child tables stay in the ERP
      for (const p of page) {
        const flat: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p)) if (v === null || typeof v !== "object") flat[k] = v;
        rows.push(flat);
      }
      if (page.length < 200) break;
    }

    // the column union, so the page can build its table without guessing
    const cols = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
    return NextResponse.json({ ok: true, count: rows.length, columns: [...cols], rows });
  } catch (e) {
    return errJson(e);
  }
}
