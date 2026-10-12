import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";

/**
 * THE AMC REGISTER OFF THE ERP — THE CONTRACT'S OWN DATES (12 Oct 2026).
 *
 * Dr Raghu: "the one which is showing 332 in the ERP is actually valid,
 * whereas here it is showing from 2020 to 2021 … the dates have to match. It
 * cannot be a theoretical date of its own." Yashavantha's export: 68 valid.
 *
 * The pull used to believe the first `items` row's start and end, and where
 * there was none it made one up — the contract date plus a year. The items
 * row is a leftover: AMS000332 (Ajay Arora) reads 01-07-2020 → 31-05-2021 on
 * its item while the contract itself says 01-06-2026 → 31-05-2027. The
 * contract HEADER carries the truth — transaction_date (from),
 * amc_valid_till_date (to), amc_value_per_annum, visits_per_annum — and on
 * 12 Oct it matched his export on all 68, date for date and rupee for rupee.
 * So the header is read, and only where it has no till-date is anything else
 * used; a derived date stays marked ≈.
 *
 * One list call for every contract — no per-document fetch — so the hour can
 * run it. READS ONLY; nothing on the ERP is written.
 */
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
const D = (v: unknown) => { const s = S(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const yearLater = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const DT = "Annual Maintenance Contract";
export const REMOVED = "Removed on the ERP";
const FIELDS = ["name", "customer", "amc_status", "transaction_date", "amc_valid_till_date", "amc_value_per_annum", "amc_contract_value", "visits_per_annum", "amount_billed", "territory", "type_of_product", "primary_handler", "job_1", "payment_status", "modified"];

export interface AmcPull { removed: number; found: number; added: number; updated: number; fromHeader: number; derived: number; noDate: number; valid: number; validValue: number }

export async function pullAmcs(admin: SupabaseClient, by: string): Promise<AmcPull> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const r = await fetch(`${a.base}/api/resource/${encodeURIComponent(DT)}?fields=${encodeURIComponent(JSON.stringify(FIELDS))}&limit_page_length=0`, { headers: a.H, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} listing contracts.`);
  const docs = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
  let fromHeader = 0, derived = 0, noDate = 0;
  const now = new Date().toISOString();
  const rows = docs.filter((d) => S(d.name)).map((d) => {
    const start_date = D(d.transaction_date);
    let end_date = D(d.amc_valid_till_date); let dates_derived = false;
    if (end_date) fromHeader++;
    else if (start_date) { end_date = yearLater(start_date); dates_derived = true; derived++; }
    else noDate++;
    return {
      erp_name: S(d.name), contract_no: S(d.name), customer: S(d.customer) || "(unnamed on the ERP)",
      territory: S(d.territory), start_date, end_date, dates_derived,
      visits_planned: N(d.visits_per_annum), value: N(d.amc_value_per_annum) ?? N(d.amc_contract_value),
      billed: N(d.amount_billed), engineer: S(d.primary_handler), status: S(d.amc_status) || "AMC valid paid",
      machine: S(d.type_of_product), job_details: S(d.job_1) || null, pulled_at: now,
    };
  });
  const { data: existing, error } = await admin.from("seva_amc").select("id, erp_name, machine").not("erp_name", "is", null).limit(10000);
  if (error) throw new Error(error.message);
  const known = new Map((existing || []).map((e) => [String(e.erp_name), e]));
  let added = 0, updated = 0;
  const fresh = rows.filter((x) => !known.has(x.erp_name));
  for (let i = 0; i < fresh.length; i += 200) {
    const { error: e } = await admin.from("seva_amc").insert(fresh.slice(i, i + 200).map((x) => ({ ...x, by })));
    if (e) throw new Error(e.message);
    added += Math.min(200, fresh.length - i);
  }
  for (const x of rows.filter((y) => known.has(y.erp_name))) {
    const was = known.get(x.erp_name)!;
    /* the ERP owns the contract; the team's own columns (visits made, notes, serial, location) are never touched — and a machine the team typed stays */
    const { erp_name, ...patch } = x;
    if (S(was.machine) && !x.machine) delete (patch as Record<string, unknown>).machine;
    const { error: e } = await admin.from("seva_amc").update(patch).eq("id", String(was.id));
    if (!e) updated++;
  }
  /* GONE FROM THE ERP: a contract deleted there (AMS000337, U R Rao, re-made as AMS000348) is marked, not left counting as valid */
  const onErp = new Set(rows.map((x) => x.erp_name));
  const gone = (existing || []).filter((e) => !onErp.has(String(e.erp_name))).map((e) => String(e.id));
  if (gone.length) await admin.from("seva_amc").update({ status: REMOVED, pulled_at: now }).in("id", gone).neq("status", REMOVED);
  const valid = rows.filter((x) => x.status === "AMC valid paid");
  return { removed: gone.length, found: rows.length, added, updated, fromHeader, derived, noDate, valid: valid.length, validValue: valid.reduce((s, x) => s + (Number(x.value) || 0), 0) };
}
