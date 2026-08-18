// The full kitted-not-moving list for slide 5. Read-only.
import { readFileSync, writeFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0,i).trim()] = line.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, authorization: `Bearer ${K}` };
const r = await fetch(`${U}/rest/v1/jobs?select=id,tag,kit,pct,val,tp,tpv&active=is.true&limit=2000`, { headers: H });
const jobs = await r.json();
if (!Array.isArray(jobs)) { console.error(jobs); process.exit(1); }
// job number = the last four of the id -- jobNo() in src/lib/schedule.ts
const tpOf = (j) => (Number(j.tpv) || Number(j.tp) || 0) / 1e7;   // same rule as throughputOf()
const stuck = jobs
  .filter(j => Number(j.kit) >= 60 && Number(j.pct) < 40)
  .map(j => ({ id: String(j.id).slice(-4), tag: String(j.tag||""), kit: Number(j.kit), pct: Number(j.pct), tp: +tpOf(j).toFixed(2) }))
  .sort((a,b) => b.tp - a.tp);
console.log("jobs:", stuck.length, "throughput Cr:", stuck.reduce((s,j)=>s+j.tp,0).toFixed(2));
const D = JSON.parse(readFileSync("scratchpad/deck/deck.json","utf8"));
console.log("deck says:", D.stuck.n, D.stuck.tp);
D.stuck.jobs = stuck.map(j => ({ ...j, tag: j.tag.length > 52 ? j.tag.slice(0,51) + "…" : j.tag }));
writeFileSync("scratchpad/deck/deck.json", JSON.stringify(D, null, 1));
