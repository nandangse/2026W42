/**
 * Run the Seva AMC pull once, from the command line, with exactly the logic
 * the ⇩ Pull from ERP button uses. Reads nandanerp, writes seva_amc in Genie.
 * The ERP is never written to.
 *
 * node scratchpad/seva-pull.mjs           — every status
 * node scratchpad/seva-pull.mjs "AMC valid paid"
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const crm = createClient(process.env.CRM_SUPABASE_URL, process.env.CRM_SUPABASE_SERVICE_KEY);
const genie = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: iset } = await crm.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
const cfg = iset.config;
const base = String(cfg.url).replace(/\/+$/, "");
const H = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };
const DT = "Annual Maintenance Contract";

const S = (v) => String(v ?? "").trim();
const N = (v) => (v === null || v === undefined || v === "" ? null : Number(v) || 0);
function yearLater(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const wanted = process.argv.slice(2);
const filters = wanted.length ? encodeURIComponent(JSON.stringify([["amc_status", "in", wanted]])) : "";
const names = [];
for (let start = 0; ; start += 500) {
  const r = await fetch(`${base}/api/resource/${encodeURIComponent(DT)}?${filters ? `filters=${filters}&` : ""}limit_start=${start}&limit_page_length=500`, { headers: H });
  const page = (await r.json())?.data || [];
  names.push(...page.map((x) => x.name));
  if (page.length < 500) break;
}
console.log(`Reading ${names.length} contracts${wanted.length ? ` (${wanted.join(", ")})` : " (all statuses)"}…`);

const rows = [];
let failed = 0, fromItem = 0, derived = 0, noDate = 0;
for (const name of names) {
  try {
    const r = await fetch(`${base}/api/resource/${encodeURIComponent(DT)}/${encodeURIComponent(name)}`, { headers: H });
    if (!r.ok) { failed++; continue; }
    const d = (await r.json())?.data;
    if (!d) { failed++; continue; }
    const item = (Array.isArray(d.items) ? d.items : [])[0] || null;
    let start_date = S(item?.start_date).slice(0, 10) || S(d.transaction_date).slice(0, 10) || "";
    let end_date = S(item?.end_date).slice(0, 10);
    let dates_derived = false;
    if (!end_date) { end_date = start_date ? yearLater(start_date) : ""; dates_derived = !!end_date; }
    if (item?.end_date) fromItem++; else if (dates_derived) derived++; else noDate++;
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

const { data: existing, error: readErr } = await genie.from("seva_amc").select("id, erp_name").not("erp_name", "is", null).limit(5000);
if (readErr) { console.error("Genie read failed:", readErr.message); process.exit(1); }
const known = new Map((existing || []).map((e) => [String(e.erp_name), String(e.id)]));

let added = 0, updated = 0;
for (let i = 0; i < rows.length; i += 200) {
  const slice = rows.slice(i, i + 200);
  const fresh = slice.filter((r) => !known.has(String(r.erp_name)));
  const again = slice.filter((r) => known.has(String(r.erp_name)));
  if (fresh.length) {
    const { error } = await genie.from("seva_amc").insert(fresh.map((r) => ({ ...r, by: process.env.RAGHU_EMAIL || "raghu@nandan.co.in" })));
    if (error) { console.error("insert failed:", error.message); process.exit(1); }
    added += fresh.length;
  }
  for (const r of again) {
    const { erp_name, ...patch } = r;
    const { error } = await genie.from("seva_amc").update(patch).eq("id", known.get(String(erp_name)));
    if (!error) updated++;
  }
}
console.log(`\nfound ${names.length} · added ${added} · refreshed ${updated} · failed ${failed}`);
console.log(`dates: ${fromItem} from the ERP's item row, ${derived} derived to a year (≈), ${noDate} with none`);
