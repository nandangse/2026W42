// Render the delivery report from live data, without a browser session.
//
// The pack that is checked here is the pack the app prints -- same function,
// same input shape. It exists because the first version shipped with a blank
// first page that nobody could see until it was in front of a customer.
//
//   sh scratchpad/report/compile.sh && node scratchpad/report/render.mjs
import { readFileSync, writeFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, authorization: `Bearer ${K}` };
const get = async (q) => await (await fetch(`${U}/rest/v1/${q}`, { headers: H })).json();

const { deliveryReportHtml } = await import("./build/delivery-report.js");

const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

const jobs = await get("jobs?select=id,tag,fam,tdd,val,tpv,tpp,kit,pct,escalation&active=is.true&limit=2000");
const shipped = (await get(`delivered_jobs?select=id,tag,delivered_on&delivered_on=gte.${addDays(TODAY, -30)}&delivered_on=lte.${TODAY}`))
  .map((d) => ({ id: String(d.id), tag: d.tag || "", on: d.delivered_on }));
const fy = `${+TODAY.slice(0, 4) - (+TODAY.slice(5, 7) >= 4 ? 0 : 1)}-04-01`;
const del = await get(`delivered_jobs?select=val,tp,tpv&delivered_on=gte.${fy}&delivered_on=lte.${TODAY}&limit=1000`);
const ytd = {
  n: del.length,
  sales: del.reduce((s, r) => s + Number(r.val || 0), 0),
  tp: del.reduce((s, r) => s + (Number(r.tpv) || Number(r.tp) || 0), 0),
};

const byDay = {};
for (const j of jobs) if (j.tdd) (byDay[j.tdd] = byDay[j.tdd] || []).push(j);

// The same rupee formatter the screen uses: crore over a crore, else lakh.
const V = (n) => {
  const v = Number(n) || 0;
  return v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`;
};

const html = deliveryReportHtml({ today: TODAY, byDay, jobs, shipped, ytd, V });
writeFileSync("scratchpad/report/report.html", html);

// one file per page, so each can be screenshotted and actually looked at
const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>") + 8);
const pages = html.split('<div class="page">').slice(1).map((p) => p.slice(0, p.lastIndexOf("</div>")));
pages.forEach((p, i) =>
  writeFileSync(`scratchpad/report/p${i + 1}.html`,
    `<!doctype html><html><head><meta charset="utf-8">${style}<style>body{margin:0;background:#fff}.page{margin:0}</style></head><body><div class="page">${p}</div></body></html>`));

console.log(`${pages.length} pages · ${jobs.length} jobs · ${shipped.length} delivered in 30d · YTD ${ytd.n} jobs`);
