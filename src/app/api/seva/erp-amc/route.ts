import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSeva } from "@/lib/seva";
import { crmDb, crmConfigured } from "@/crm/db";

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

    // Which statuses to bring. Empty means all of them.
    const wanted: string[] = Array.isArray(body.statuses) ? body.statuses.map(S).filter(Boolean) : [];

    // 1 — the list of names, filtered the Frappe way where a filter is asked.
    const names: string[] = [];
    const filters = wanted.length ? encodeURIComponent(JSON.stringify([["amc_status", "in", wanted]])) : "";
    for (let start = 0; ; start += 500) {
      const u = `${base}/api/resource/${encodeURIComponent(DT)}?${filters ? `filters=${filters}&` : ""}limit_start=${start}&limit_page_length=500`;
      const r = await fetch(u, { headers: H });
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} listing contracts.`);
      const page = ((await r.json()) as { data?: { name?: string }[] })?.data || [];
      for (const d of page) if (d.name) names.push(String(d.name));
      if (page.length < 500) break;
      if (start > 20000) break;
    }
    if (!names.length) return NextResponse.json({ ok: true, found: 0, added: 0, updated: 0, note: "The ERP returned no contracts for that filter." });

    // 2 — each document in full, because the dates hide in the child table.
    const rows: Record<string, unknown>[] = [];
    let failed = 0, fromItem = 0, derived = 0, noDate = 0;
    for (const name of names) {
      try {
        const r = await fetch(`${base}/api/resource/${encodeURIComponent(DT)}/${encodeURIComponent(name)}`, { headers: H });
        if (!r.ok) { failed++; continue; }
        const d = ((await r.json()) as { data?: Doc })?.data;
        if (!d) { failed++; continue; }
        const item = (Array.isArray(d.items) ? (d.items as Doc[]) : [])[0] || null;

        // The item is believed where it exists; otherwise the contract date
        // starts it and the year finishes it.
        let start_date = S(item?.start_date).slice(0, 10) || S(d.transaction_date).slice(0, 10) || "";
        let end_date = S(item?.end_date).slice(0, 10);
        let dates_derived = false;
        if (!end_date) {
          end_date = start_date ? yearLater(start_date) : "";
          dates_derived = !!end_date;
        }
        if (item?.end_date) fromItem++;
        else if (dates_derived) derived++;
        else noDate++;
        if (!start_date) start_date = "";

        rows.push({
          erp_name: name,
          customer: S(d.customer) || "(unnamed on the ERP)",
          machine: S(item?.item_code),
          contract_no: name,
          territory: S(d.territory),
          start_date: start_date || null,
          end_date: end_date || null,
          dates_derived,
          visits_planned: N(item?.no_of_visits) ?? N(d.visits_per_annum),
          value: N(d.amc_contract_value) || N(d.amc_value_per_annum),
          billed: N(d.amount_billed),
          engineer: S(item?.sales_person),
          status: S(d.amc_status) || "AMC valid paid",
          pulled_at: new Date().toISOString(),
        });
      } catch { failed++; }
    }

    // 3 — write. The ERP owns the contract; Seva owns the service work, so a
    // re-pull refreshes the ERP's own columns and leaves visits_done, notes,
    // the serial and the location exactly as the team left them.
    const admin = adminClient();
    const { data: existing, error: readErr } = await admin
      .from("seva_amc").select("id, erp_name").not("erp_name", "is", null).limit(5000);
    if (readErr) {
      if (/does not exist|schema cache/i.test(readErr.message))
        throw new HttpError(503, "Run migration 0107 first — Seva's tables don't exist yet.");
      throw new Error(readErr.message);
    }
    const known = new Map((existing || []).map((e) => [String(e.erp_name), String(e.id)]));

    let added = 0, updated = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const slice = rows.slice(i, i + 200);
      const fresh = slice.filter((r) => !known.has(String(r.erp_name)));
      const again = slice.filter((r) => known.has(String(r.erp_name)));
      if (fresh.length) {
        const { error } = await admin.from("seva_amc").insert(fresh.map((r) => ({ ...r, by: me.email })));
        if (error) throw new Error(error.message);
        added += fresh.length;
      }
      for (const r of again) {
        const { erp_name, ...patch } = r;
        const { error } = await admin.from("seva_amc").update(patch).eq("id", known.get(String(erp_name))!);
        if (!error) updated++;
      }
    }

    return NextResponse.json({
      ok: true, found: names.length, added, updated, failed,
      datesFromItem: fromItem, datesDerived: derived, datesMissing: noDate,
    });
  } catch (e) {
    return errJson(e);
  }
}
