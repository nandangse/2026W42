// Read-only install check. Reads .env.local, probes the database and the
// Anthropic API, prints status only -- never a key, never a write.
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const ok = (b) => (b ? "  OK  " : " MISS ");

async function table(name, sel = "*") {
  const r = await fetch(`${URL_}/rest/v1/${name}?select=${sel}&limit=1`, { headers: { ...H, prefer: "count=exact" } });
  const range = r.headers.get("content-range") || "";
  return { ok: r.ok, count: range.split("/")[1] ?? "?", status: r.status };
}
async function column(tbl, col) {
  const r = await fetch(`${URL_}/rest/v1/${tbl}?select=${col}&limit=1`, { headers: H });
  return r.ok;
}

console.log("=== 0026 ===");
for (const c of ["client_update", "cashflow", "amt_needed", "pay_on_delivery"]) {
  console.log(`${ok(await column("jobs", c))} jobs.${c}`);
}
const jh = await table("job_hint", "job_id");
console.log(`${ok(jh.ok)} job_hint table${jh.ok ? ` (${jh.count} cached briefs)` : ` -- ${jh.status}`}`);
// no-op probe: apply_jobs returns immediately on an empty array, so this
// checks the THREE-argument signature exists without touching a single row
const rpc = await fetch(`${URL_}/rest/v1/rpc/apply_jobs`, {
  method: "POST", headers: H,
  body: JSON.stringify({ p_jobs: [], p_batch: "00000000-0000-0000-0000-000000000000", p_money_fields: [] }),
});
console.log(`${ok(rpc.ok)} apply_jobs takes p_money_fields${rpc.ok ? "" : ` -- ${(await rpc.json().catch(() => ({}))).message || rpc.status}`}`);

console.log("\n=== 0027 ===");
for (const t of ["lms_book", "lms_section", "lms_lesson", "lms_lesson_book", "lms_progress", "lms_extra", "lms_plan"]) {
  const r = await table(t, "*");
  console.log(`${ok(r.ok)} ${t}${r.ok ? ` (${r.count} rows)` : ` -- ${r.status}`}`);
}

console.log("\n=== Anthropic ===");
if (!env.ANTHROPIC_API_KEY) console.log(" MISS  no ANTHROPIC_API_KEY in .env.local");
else {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  });
  const b = await r.json().catch(() => ({}));
  console.log(`${ok(r.ok)} key authenticates (${env.ANTHROPIC_API_KEY.length} chars) -- HTTP ${r.status}${r.ok ? "" : ": " + (b?.error?.message || "")}`);
}
