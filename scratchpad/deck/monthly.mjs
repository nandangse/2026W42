// Delivered, month by month, for slide 2. Read-only.
import { readFileSync, writeFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0,i).trim()] = line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, authorization: `Bearer ${K}` };

const rows = [];
for (let off = 0; off < 20000; off += 1000) {
  const r = await fetch(`${U}/rest/v1/delivered_jobs?select=delivered_on,val,tp,tpv&delivered_on=gte.2026-04-01&delivered_on=lte.2026-08-18&order=id.asc&offset=${off}&limit=1000`, { headers: H });
  const d = await r.json();
  if (!Array.isArray(d)) { console.error(d); process.exit(1); }
  rows.push(...d);
  if (d.length < 1000) break;
}
// whichever throughput column the row actually carries
const tpOf = (r) => Number(r.tpv) || Number(r.tp) || 0;   // same rule as throughputOf() in src/lib/delivered.ts

const by = new Map();
for (const r of rows) {
  const k = String(r.delivered_on).slice(0, 7);
  const m = by.get(k) || { k, n: 0, v: 0, t: 0 };
  m.n += 1; m.v += Number(r.val) || 0; m.t += tpOf(r);
  by.set(k, m);
}
const out = [...by.values()].sort((a,b) => a.k.localeCompare(b.k))
  .map(m => ({ ...m, v: +(m.v/1e7).toFixed(2), t: +(m.t/1e7).toFixed(2) }));
console.log(out, "rows:", rows.length, "total Cr:", out.reduce((s,m)=>s+m.v,0).toFixed(2), "tp:", out.reduce((s,m)=>s+m.t,0).toFixed(2));

const D = JSON.parse(readFileSync("scratchpad/deck/deck.json","utf8"));
D.done = out;
writeFileSync("scratchpad/deck/deck.json", JSON.stringify(D, null, 1));
