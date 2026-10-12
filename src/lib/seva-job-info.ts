import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";

/**
 * EVERY JOB AS THE ERP'S JOBMASTER HAS IT (12 Oct 2026) — the customer, the
 * site (delivery location), the delivery and installation dates, and what the
 * installation cost: man-days at site, transport, site expenses, total. One
 * list call; the hour runs it. The warranty months are Genie's and a re-pull
 * never touches them.
 */
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const D = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const FIELDS = ["name", "customer", "customer_tag", "product_family", "status", "job_status", "actual_delivery_date", "installation_start_date_", "installation_completion_date_",
  "delivery_location", "custom_location_of_job", "installation_engineer", "mandays_at_site_", "installation_transports_cost", "site_expenceses", "total_site_expanse_"];

export async function pullJobInfo(admin: SupabaseClient): Promise<{ found: number; written: number }> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const r = await fetch(`${a.base}/api/resource/Jobmaster?fields=${encodeURIComponent(JSON.stringify(FIELDS))}&limit_page_length=0`, { headers: a.H, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for Jobmaster.`);
  const rows = (((await r.json()) as { data?: Record<string, unknown>[] }).data ?? []).filter((j) => S(j.name));
  const now = new Date().toISOString();
  const up = rows.map((j) => ({
    job_id: S(j.name), customer: S(j.customer) || null, tag: S(j.customer_tag) || null, fam: S(j.product_family) || null,
    status: S(j.status) || null, job_status: S(j.job_status) || null, delivered_on: D(j.actual_delivery_date),
    install_started_on: D(j.installation_start_date_), installed_on: D(j.installation_completion_date_),
    delivery_location: S(j.delivery_location) || null, location_of_job: S(j.custom_location_of_job) || null, installation_engineer: S(j.installation_engineer) || null,
    mandays_at_site: N(j.mandays_at_site_), transport_cost: N(j.installation_transports_cost), site_expense: N(j.site_expenceses), total_site_expense: N(j.total_site_expanse_),
    pulled_at: now,
  }));
  let written = 0;
  for (let i = 0; i < up.length; i += 500) {
    const { error } = await admin.from("seva_job_info").upsert(up.slice(i, i + 500), { onConflict: "job_id" });
    if (error) { if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0228 first."); throw new Error(error.message); }
    written += Math.min(500, up.length - i);
  }
  return { found: rows.length, written };
}

/** the installation's cost: the ERP's total, or its parts where the total is blank */
export const installCost = (j: { total_site_expense?: number | null; transport_cost?: number | null; site_expense?: number | null }) =>
  Number(j.total_site_expense) || (Number(j.transport_cost) || 0) + (Number(j.site_expense) || 0);
