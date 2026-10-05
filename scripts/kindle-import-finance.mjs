/**
 * kindle-import-finance.mjs — the treasurer's four statements into Kindle.
 *
 *   node scripts/kindle-import-finance.mjs            # dry run: totals and the reconciliation
 *   node scripts/kindle-import-finance.mjs --write    # write (re-runnable: replaces its own rows)
 *
 * Source: "Kindle Statement Jan26 - Dec 2026.xlsx" (cumulative), sheets
 * CASH FLOW 23, cashflow 2024, Cashflow 2025, cashflow 2026. Every number
 * below is the sheet's own; nothing is invented. Rows carry
 * created_by = 'import:statement' so a re-run deletes and relays them.
 *
 * What goes where:
 *   kindle_ledger  opening (1 Jan 2023), every expense line, every receipt per member per month
 *   kindle_fine    every charge raised per member — annual dues and levies (rule 'due'),
 *                  late fees and other charges (the sheet's own wording) — with paid/unpaid
 *                  as the statement's balances say
 *   kindle_budget  2026 heads proposed from 2024-25 actuals (the treasurer edits)
 */
import { readFileSync } from "fs"; import { join, dirname } from "path"; import { fileURLToPath } from "url"; import { createClient } from "@supabase/supabase-js";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(readFileSync(join(repo, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");
const BY = "import:statement";

const E = { jigar: "tojigarshah@gmail.com", niraj: "nirajt7011@gmail.com", bharat: "bharat@mahavirhomestore.com", shailesh: "shailesh.jain@mirraw.com", kanan: "kannan@novacaregroup.in", valay: "valay.lakdavala@neoniche.com", raghu: "raghu@nandan.co.in", kevin: "kevin@kevinent.com", ravi: "rlodha@gmail.com", anil: "anil@artis.in", jaydev: "jaydev@aarviencon.com", amit: "amitgupta@cccpl.net" };

/* ---------------------------------------------------------------- 2023 */
const OPENING_2023 = 584417 - 478500; // "Received/Opening Balance 584,417" less receipts 478,500 = carried from 2022
const EXP = [
  ["2023-01-01", "Venue", 16734, "Parinee"], ["2023-02-01", "Gift", 2000, "Gift, paid to Anil (Aarvi meeting)"], ["2023-03-03", "Venue", 12000, "MCA Club"],
  ["2023-03-01", "Training", 40000, "Ashutosh Rathi — training"], ["2023-04-01", "Outbound", 163000, "Lonavala outbound"], ["2023-05-01", "Venue", 14000, "MCA + gift"],
  ["2023-06-01", "Venue", 15550, "MCA + dinner"], ["2023-07-01", "Dinner", 27520, "Plural — dinner"], ["2023-08-01", "Venue", 16040, "MCA + dinner"],
  ["2023-09-01", "Venue", 19200, "MCA + dinner"], ["2023-10-01", "Venue", 15000, "MCA + dinner"], ["2023-11-01", "Venue", 18000, "MCA + dinner"],
  /* 2024 */
  ["2024-01-05", "Venue", 14188, "Awfis, January (netted before the start fund; handed to Jaydev)"], ["2024-02-01", "Venue", 16520, "Coworking — paid to Jaydev"],
  ["2024-03-01", "Venue", 10000, "MCA — paid to Niraj"], ["2024-03-01", "Gift", 1400, "Gift for Kanan — paid to Bharat"], ["2024-03-22", "Dinner", 34000, "Dinner, 22 March — paid to Niraj"],
  ["2024-04-19", "Outbound", 160515, "Offsite April 2024: SaffronStay 120,900 + food 39,615 — paid to Jaydev"], ["2024-05-03", "Venue", 11900, "MCA"], ["2024-05-03", "Dinner", 3500, "Dinner — paid to Niraj"],
  ["2024-07-05", "Venue", 11500, "MCA"], ["2024-07-05", "Dinner", 2200, "Dinner"], ["2024-08-02", "Dinner", 4000, "Dinner — paid to Valay"], ["2024-11-15", "Dinner", 17550, "Dinner — paid to Jaydev"],
  ["2024-12-06", "Gift", 1000, "Gift for Ramas — bought by Anil"], ["2024-12-06", "Gift", 2000, "Gift for Harsh Mariwala — bought by Bharat"],
  /* 2025 */
  ["2025-01-10", "Dinner", 8000, "Dinner, Aarvi meeting (balance paid by Jigar)"], ["2025-04-04", "Venue", 12200, "MCA — hall and snacks"], ["2025-05-02", "Venue", 11200, "MCA — hall and snacks"],
  ["2025-05-02", "Dinner", 9000, "Dinner"], ["2025-06-06", "Venue", 15500, "MCA — hall and snacks"], ["2025-06-06", "Dinner", 4000, "Dinner"],
  ["2025-06-11", "Outbound", 147000, "Alibaug outbound — Stay Vista advance (Ravi)"], ["2025-07-04", "Outbound", 100000, "Alibaug outbound — Stay Vista balance (Ravi)"],
  ["2025-07-04", "Dinner", 6800, "Dinner, July — paid by Ravi"], ["2025-07-04", "Outbound", 80150, "Alibaug outbound — M2M 21,230, massage 6,000, tip 5,000, snacks 2,960, food 43,500, misc 1,460"],
  ["2025-09-05", "Venue", 1500, "Artis / Anil's office"], ["2025-09-05", "Speaker", 8000, "Dr Baindor"], ["2025-09-05", "Dinner", 6000, "Dinner — Matunga Gym"], ["2025-11-07", "Dinner", 57800, "Diwali dinner — Ravi"],
  /* 2026 */
  ["2026-01-08", "Venue", 14500, "MCA"],
];
/* receipts: [date, who, amount, note] */
const R = [
  // 2023
  ["2023-03-03", "bharat", 20000], ["2023-03-03", "shailesh", 20000], ["2023-03-03", "kanan", 20000], ["2023-03-03", "valay", 25000], ["2023-03-03", "raghu", 20000], ["2023-03-03", "ravi", 20000], ["2023-03-03", "anil", 20000], ["2023-03-03", "jaydev", 20000],
  ["2023-05-05", "jigar", 20000], ["2023-06-02", "bharat", 3050], ["2023-07-07", "niraj", 30000], ["2023-07-07", "kevin", 30000],
  ["2023-09-01", "jigar", 1500], ["2023-09-01", "bharat", 1950], ["2023-09-01", "kanan", 1500], ["2023-09-01", "raghu", 5000], ["2023-09-01", "jaydev", 1500],
  ["2023-10-06", "niraj", 10000], ["2023-10-06", "bharat", 20000], ["2023-10-06", "raghu", 15000], ["2023-10-06", "ravi", 20000],
  ["2023-11-03", "shailesh", 1500], ["2023-11-03", "valay", 25000], ["2023-11-03", "raghu", 5000], ["2023-11-03", "anil", 20000],
  ["2023-12-08", "jigar", 20000], ["2023-12-08", "niraj", 10000], ["2023-12-08", "shailesh", 20000], ["2023-12-08", "kanan", 10000], ["2023-12-08", "raghu", 22500], ["2023-12-08", "jaydev", 20000],
  // 2024
  ["2024-01-05", "amit", 20000, "joining contribution (added to the start fund)"],
  ["2024-05-03", "niraj", 20000], ["2024-05-03", "bharat", 20000], ["2024-05-03", "amit", 25000], ["2024-05-03", "ravi", 20000], ["2024-05-03", "anil", 20000], ["2024-05-03", "jaydev", 20000],
  ["2024-06-07", "jigar", 20000], ["2024-06-07", "shailesh", 20000], ["2024-07-05", "valay", 25000], ["2024-08-02", "raghu", 33000], ["2024-09-06", "ravi", 1000], ["2024-12-06", "amit", 5000], ["2024-12-06", "valay", 5000],
  // 2025
  ["2025-01-10", "jigar", 4000, "against the 2024 late fees of 10,000 (the statement shows 4,000 received)"],
  ["2025-02-07", "shailesh", 2000], ["2025-02-07", "ravi", 10000], ["2025-05-02", "amit", 5000], ["2025-05-02", "valay", 2000], ["2025-05-02", "ravi", 1000], ["2025-06-06", "jigar", 5000], ["2025-06-06", "amit", 10000],
  ...["jigar", "niraj", "bharat", "shailesh", "amit", "valay", "ravi", "anil", "jaydev"].map((w) => ["2025-07-04", w, 20000, "annual dues 2025"]),
  ...["jigar", "niraj", "bharat", "shailesh", "amit", "ravi", "anil", "jaydev"].map((w) => ["2025-10-03", w, 10000, "collection 2025"]),
  ["2025-10-03", "amit", 2000], ["2025-10-03", "anil", 2000], ["2025-11-07", "niraj", 5000], ["2025-12-10", "jigar", 6000], ["2025-12-10", "ravi", 11000],
  // 2026
  ["2026-01-08", "valay", 17000, "2025 balance: 5,000 early leaving Sep, 10,000 annual fee, 2,000 late Nov"],
];
/* charges raised: [year, who, kind, amount, reason]  kind: due | fee */
const C = [];
const dues = (y, whos, amt, reason) => whos.forEach((w) => C.push([y, w, "due", amt, reason]));
const fee = (y, w, amt, reason) => C.push([y, w, "fee", amt, reason]);
// 2023: offsite dues 20,000 each (11 incl. Kanan, Kevin) + annual dues 20,000 (Kanan 5,000; Kevin none)
dues(2023, Object.keys(E).filter((k) => k !== "amit"), 20000, "Offsite dues 2023");
dues(2023, ["jigar", "niraj", "bharat", "shailesh", "valay", "raghu", "ravi", "anil", "jaydev"], 20000, "Annual dues 2023"); C.push([2023, "kanan", "due", 5000, "Annual dues 2023 (part year)"]);
fee(2023, "raghu", 17500, "Share of 2022 expenses (joined Nov 2022)"); fee(2023, "valay", 5000, "Late fee Feb 2023"); fee(2023, "raghu", 5000, "Late fee Feb 2023");
fee(2023, "niraj", 10000, "Late fee Mar 2023"); fee(2023, "kevin", 10000, "Late fee Mar 2023"); fee(2023, "bharat", 5000, "Late fee Jul 2023");
fee(2023, "jigar", 1500, "Late fee Aug 2023"); fee(2023, "kanan", 1500, "Late fee Aug 2023"); fee(2023, "shailesh", 1500, "Late fee Sep 2023"); fee(2023, "jaydev", 1500, "Late fee Sep 2023");
fee(2023, "valay", 5000, "Late fee Oct 2023"); fee(2023, "kanan", 5000, "Late fee Nov 2023"); fee(2023, "raghu", 5000, "Late fee Nov 2023");
// 2024
dues(2024, ["jigar", "niraj", "bharat", "shailesh", "amit", "valay", "raghu", "ravi", "anil", "jaydev"], 20000, "Annual dues 2024");
fee(2024, "amit", 5000, "Late fee Mar 2024"); fee(2024, "valay", 5000, "Late fee May 2024"); fee(2024, "raghu", 1500, "Late fee May 2024"); fee(2024, "raghu", 10000, "Late fee Jun 2024");
fee(2024, "raghu", 1500, "Late fee Jul 2024"); fee(2024, "ravi", 1000, "Late fee Jul 2024"); fee(2024, "amit", 5000, "Late fee Sep 2024"); fee(2024, "jigar", 5000, "Late fee Nov 2024"); fee(2024, "valay", 5000, "Late fee Nov 2024"); fee(2024, "jigar", 5000, "Late fee Dec 2024");
// 2025
dues(2025, ["jigar", "niraj", "bharat", "shailesh", "amit", "valay", "raghu", "ravi", "anil", "jaydev"], 20000, "Annual dues 2025");
dues(2025, ["jigar", "niraj", "bharat", "shailesh", "amit", "valay", "raghu", "ravi", "anil", "jaydev"], 10000, "Collection 2025 (second levy)");
C.push([2025, "raghu", "due", -30000, "Sabbatical Jul–Nov 2025: annual dues and collection waived"]);
fee(2025, "shailesh", 2000, "Carried from 2024 (per statement)"); fee(2025, "ravi", 10000, "Carried from 2024 (per statement)");
fee(2025, "amit", 5000, "Late fee Feb 2025"); fee(2025, "valay", 1000, "Late fee Feb 2025"); fee(2025, "raghu", 10000, "Charge Feb 2025 (per statement)");
fee(2025, "amit", 10000, "Late fee Apr 2025"); fee(2025, "valay", 1000, "Late fee Apr 2025"); fee(2025, "ravi", 1000, "Late fee Apr 2025"); fee(2025, "jigar", 5000, "Late fee May 2025");
fee(2025, "niraj", 1000, "Use of laptop (Jul 2025)"); fee(2025, "ravi", 10000, "Charge Jul 2025 (per statement)"); fee(2025, "valay", 5000, "Leaving early, Sep 2025");
fee(2025, "jigar", 5000, "Late fee Oct 2025"); fee(2025, "niraj", 5000, "Late fee Oct 2025"); fee(2025, "amit", 2000, "Late fee Oct 2025"); fee(2025, "anil", 2000, "Late fee Oct 2025");
fee(2025, "jigar", 1000, "Late fee Nov 2025"); fee(2025, "valay", 2000, "Late fee Nov 2025"); fee(2025, "ravi", 1000, "Late fee Nov 2025");
/* what the statements say is still unpaid (everything else is settled) */
const UNPAID = [["niraj", "Use of laptop (Jul 2025)"], ["raghu", "Collection 2025 (second levy)"]];
/* Jigar's 2024 late fees: 10,000 raised, 4,000 received 10 Jan 2025 — the Dec 5,000 is recorded as not pursued, the Nov one as part-paid */
const SHORT = { "jigar|Late fee Nov 2024": { paid_amount: 4000, paid_on: "2025-01-10" }, "jigar|Late fee Dec 2024": { waived: true, note: "Statement shows 4,000 received against 10,000; the balance was not pursued" } };

const BUDGET_2026 = [["Venue and snacks", 150000, "MCA ~12–15k a meeting, from 2025"], ["Dinners after meetings", 50000, "2024–25 average"], ["Outbound", 330000, "Alibaug 2025 cost 327,150"], ["Diwali dinner", 60000, "57,800 in 2025"], ["Gifts, speakers and training", 30000, "gifts, Knowledge Guru fee"]];

async function main() {
  const { data: members } = await db.from("kindle_member").select("id,email,short_name");
  const idOf = (w) => { const m = members.find((x) => x.email === E[w]); if (!m) throw new Error("no member " + w); return m.id; };
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const expTotal = (y) => sum(EXP.filter((e) => e[0].startsWith(String(y))).map((e) => e[2]));
  const recTotal = (y) => sum(R.filter((r) => r[0].startsWith(String(y))).map((r) => r[2]));
  console.log("expenses by year:", [2023, 2024, 2025, 2026].map((y) => `${y}=${expTotal(y)}`).join("  "), "(sheet: 359,044 / 276,085+14,188 / 467,150 / 14,500)");
  console.log("receipts by year:", [2023, 2024, 2025, 2026].map((y) => `${y}=${recTotal(y)}`).join("  "), "(sheet: 478,500 / 234,000+20,000 Amit / 321,000+4,000 Jigar / 17,000)");
  let bal = OPENING_2023; for (const y of [2023, 2024, 2025, 2026]) { bal += recTotal(y) - expTotal(y) + (y === 2025 ? 2000 : y === 2026 ? 50 : 0); console.log(`balance end ${y}: ${bal}  (sheet: ${{ 2023: 225373, 2024: 189100, 2025: 48950, 2026: "51,500 as at Jan" }[y]})`); }
  const chargeTotal = (y) => sum(C.filter((c) => c[0] === y).map((c) => c[3]));
  console.log("charges raised by year:", [2023, 2024, 2025].map((y) => `${y}=${chargeTotal(y)}`).join("  "), "(sheet A: 478,500 / 244,000 / 349,000)");
  if (!WRITE) { console.log("dry run — add --write"); return; }

  await db.from("kindle_ledger").delete().eq("created_by", BY);
  await db.from("kindle_fine").delete().eq("created_by", BY);
  await db.from("kindle_fine_rule").upsert({ code: "due", label: "Dues or levy (annual dues, collection)", amount: 0, sort_order: 5 }, { onConflict: "code" });
  const rows = [{ entry_on: "2023-01-01", kind: "opening", amount: OPENING_2023, head: "Opening balance", note: "Carried from 2022, per the 2023 statement (584,417 received/opening less 478,500 received in 2023)", created_by: BY }];
  for (const [d, head, amt, note] of EXP) rows.push({ entry_on: d, kind: "expense", amount: -amt, head, note, created_by: BY });
  /* the statement's own two gaps, booked in the open so they can be answered, not buried */
  rows.push({ entry_on: "2025-01-01", kind: "adjustment", amount: 2000, head: "Statement difference", note: "The 2025 sheet opens at 191,100; the 2024 sheet closes at 189,100. No entry explains the 2,000. For Niraj to confirm.", created_by: BY });
  rows.push({ entry_on: "2026-01-01", kind: "adjustment", amount: 50, head: "Statement rounding", note: "2025 closes at 48,950; the 2026 sheet opens at 49,000.", created_by: BY });
  for (const [d, w, amt, note] of R) rows.push({ entry_on: d, kind: "collection", amount: amt, head: "Dues", member_id: idOf(w), note: note || null, created_by: BY });
  for (let i = 0; i < rows.length; i += 100) { const { error } = await db.from("kindle_ledger").insert(rows.slice(i, i + 100)); if (error) throw error; }
  const fines = C.map(([y, w, kind, amt, reason]) => {
    const key = `${w}|${reason}`; const unpaid = UNPAID.some(([uw, ur]) => uw === w && ur === reason); const short = SHORT[key];
    const lastR = R.filter((r) => r[1] === w && r[0].startsWith(String(y))).map((r) => r[0]).sort().pop() || `${y}-12-31`;
    return { member_id: idOf(w), rule_code: kind === "due" ? "due" : null, amount: amt, reason, levied_on: `${y}-${reason.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/) ? String(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(reason.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)[0]) + 1).padStart(2, "0") : "01"}-01`,
      paid_on: unpaid || short?.waived ? null : (short?.paid_on || lastR), paid_amount: unpaid || short?.waived ? null : (short?.paid_amount ?? amt), waived: !!short?.waived, note: short?.note || (amt < 0 ? "Credit" : null), created_by: BY };
  });
  for (let i = 0; i < fines.length; i += 100) { const { error } = await db.from("kindle_fine").insert(fines.slice(i, i + 100)); if (error) throw error; }
  for (const [head, amount, note] of BUDGET_2026) await db.from("kindle_budget").upsert({ year: 2026, head, amount, note: `Proposed from the statements — ${note}` }, { onConflict: "year,head" });
  console.log(`WROTE ledger ${rows.length}, charges ${fines.length}, budget ${BUDGET_2026.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
