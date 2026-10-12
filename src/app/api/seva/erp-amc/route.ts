import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSeva } from "@/lib/seva";
import { crmDb, crmConfigured } from "@/crm/db";
import { pullAmcs } from "@/lib/seva-amc";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/seva/erp-amc — the annual maintenance register, pulled straight
 * off nandanerp (Dr Raghu, 30 Aug 2026, pointing at the AMC report).
 *
 * WHAT THE ERP HOLDS, checked against all 362 contracts before this was
 * written: the parent Annual Maintenance Contract carries the customer, the
 * amc_status, transaction_date (the contract's start), visits_per_annum, the
 * value, amount_billed and territory. The `items` child — where the machine,
 * the start and end dates and the visit count would live — is EMPTY on 349
 * of 362; only 13 item rows exist at all. So where an item exists it is
 * believed, and where none does the end date is DERIVED as one year less a
 * day from the contract date and the row is stamped `dates_derived`, which
 * the screen shows as ≈. An inference is never dressed up as a reading.
 *
 * READS ONLY. Nothing on the ERP is written, ever.
 *
 * The ERP token lives in the CRM database's integration_setting — the one
 * place it is kept — so Seva borrows it rather than a second copy being made.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);

/** One year from the start, less a day — what "annual" means on a contract. */
function yearLater(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function erpConfig() {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP token lives in the CRM's Integrations, and that database is not connected here.");
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret)
    throw new HttpError(400, "Save the ERPNext URL, key and secret in CRM → Integrations first.");
  return {
    base: cfg.url.replace(/\/+$/, ""),
    H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } as Record<string, string>,
  };
}

const DT = "Annual Maintenance Contract";

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!me.isOwner) throw new HttpError(403, "The ERP door is Raghu's to use, for now.");
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const action = String(body.action || "pull");
    const { base, H } = await erpConfig();

    // 🔍 What the ERP says, before anything is written — the statuses and
    // their counts, so the filter is chosen from the truth.
    if (action === "survey") {
      const counts = new Map<string, number>();
      for (let start = 0; ; start += 500) {
        const u = `${base}/api/resource/${encodeURIComponent(DT)}?fields=${encodeURIComponent(JSON.stringify(["name", "amc_status"]))}&limit_start=${start}&limit_page_length=500`;
        const r = await fetch(u, { headers: H });
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status}.`);
        const page = ((await r.json()) as { data?: Doc[] })?.data || [];
        for (const d of page) counts.set(S(d.amc_status) || "—", (counts.get(S(d.amc_status) || "—") || 0) + 1);
        if (page.length < 500) break;
        if (start > 20000) break;
      }
      return NextResponse.json({
        ok: true,
        total: [...counts.values()].reduce((a, b) => a + b, 0),
        statuses: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
      });
    }

    if (action !== "pull") throw new HttpError(400, "Unknown action.");

    /* THE CONTRACT'S OWN DATES (12 Oct 2026) — see lib/seva-amc: the header, not the stale item row */
    const out = await pullAmcs(adminClient(), me.email);
    return NextResponse.json({ ok: true, ...out, datesFromItem: 0, datesDerived: out.derived, datesMissing: out.noDate });
  } catch (e) {
    return errJson(e);
  }
}
