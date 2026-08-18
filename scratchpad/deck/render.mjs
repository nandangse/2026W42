// Render the deck exactly as /api/deck would, without a server or a session.
//
// This is the whole point of buildDeck() and deckHtml() being pure: the rows
// come from the same tables, the arithmetic is the same function and so is the
// HTML. What is checked here is what ships -- not a second copy of it that can
// drift.
//
//   node node_modules/typescript/bin/tsc --outDir scratchpad/deck/build \
//     --module esnext --target es2021 --moduleResolution bundler --skipLibCheck \
//     src/lib/deck.ts src/lib/deck-build.ts
//   node scratchpad/deck/render.mjs
//
// Writes deck.html, then the seven-plus sections as s1.html.. for screenshots.
import { readFileSync, writeFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("No Supabase credentials in .env.local"); process.exit(1); }
const H = { apikey: K, authorization: `Bearer ${K}` };

/** PostgREST caps a response at 1000 rows whatever the limit says. */
async function all(table, select, filter = "") {
  const out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = await fetch(`${U}/rest/v1/${table}?select=${select}${filter}&order=id.asc&offset=${off}&limit=1000`, { headers: H });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error(`${table}: ${JSON.stringify(d)}`);
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

const { buildDeck } = await import("./build/deck-build.js");
const { deckHtml } = await import("./build/deck.js");

// The app dates the report from the server's today(); the override is only so
// a past day can be re-rendered when checking a change against a known page.
const on = process.argv[2] || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fyStartOf = (d) => `${+d.slice(0, 4) - (+d.slice(5, 7) >= 4 ? 0 : 1)}-04-01`;
const fyLabelOf = (d) => { const y = +fyStartOf(d).slice(0, 4); return `FY${y}-${String((y + 1) % 100).padStart(2, "0")}`; };

const [jobs, dels, erp, man, tgt] = await Promise.all([
  all("jobs", "id,tag,cust,fam,val,tp,tpv,kit,pct,tdd,active,escalation"),
  all("delivered_jobs", "delivered_on,val,tp,tpv,fam", `&delivered_on=gte.${fyStartOf(on)}&delivered_on=lte.${on}`),
  all("erp_tasks", "job_id,title,who,due,cat,esc,done", "&done=is.false"),
  all("manual_tasks", "job_id,title,who,due,cat,esc,done", "&done=is.false"),
  fetch(`${U}/rest/v1/fy_targets?select=sales_target,throughput_target&fy=eq.${fyLabelOf(on)}`, { headers: H }).then((r) => r.json()),
]);

const D = buildDeck({
  on,
  jobs,
  dels,
  tasks: [...erp, ...man],
  targets: {
    sales: Number(tgt?.[0]?.sales_target) || 0,
    throughput: Number(tgt?.[0]?.throughput_target) || 0,
  },
});

const html = deckHtml(D);
writeFileSync("scratchpad/deck/deck.html", html);
writeFileSync("scratchpad/deck/deck.json", JSON.stringify(D, null, 1));

// Split into one file per page so each can be screenshotted and looked at.
const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>") + 8);
const body = html.slice(html.indexOf('<div id="pages">') + 16, html.lastIndexOf("</div>"));
const parts = body.split(/(?=<section)/).filter((s) => s.trim().startsWith("<section"));
parts.forEach((s, i) =>
  writeFileSync(`scratchpad/deck/s${i + 1}.html`,
    `<!doctype html><html><head><meta charset="utf-8">${style}<style>body{margin:0;background:#fff}#pages{padding:0}section{margin:0}</style></head><body>${s}</body></html>`));

// A few figures worth reading back rather than trusting: they must tie to what
// the app's own cards say, or the deck is quietly wrong.
console.log(`as at ${D.asOfLong} (${D.fy}) -- ${parts.length} pages`);
console.log(`delivered  ${D.delivered.n} jobs, ${D.delivered.sales} Cr, ${D.delivered.tp} Cr throughput`);
console.log(`  months   ${D.done.map((m) => `${m.k}:${m.v}`).join(" ")}`);
console.log(`  sums to  ${D.done.reduce((s, m) => s + m.v, 0).toFixed(2)} Cr / ${D.done.reduce((s, m) => s + m.t, 0).toFixed(2)} Cr  <- must equal the line above`);
console.log(`book       ${D.book.n} jobs, ${D.book.sales} Cr, ${D.book.tp} Cr throughput`);
console.log(`  months   ${D.months.map((m) => `${m.k}:${m.n}`).join(" ")}`);
console.log(`piles      ready ${D.ready.n}/${D.ready.tp} Cr · stuck ${D.stuck.n}/${D.stuck.tp} Cr`);
console.log(`escalated  ${D.escJobs} jobs, ${D.escTasks} tasks, levels ${JSON.stringify(D.escLevels)}`);
console.log(`focus      ${D.focus.name}: ${D.focus.n} jobs, ${D.focus.tp} Cr, ${D.focus.escJobs} escalated, ${D.focus.built} built 50%+, no value on ${D.focus.novalue.join(",") || "none"}`);
