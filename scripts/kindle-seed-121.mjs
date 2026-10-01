/** The 2026 pairing plan from the sheet's "121 FOR YR2627" tab → kindle_one_to_one (planned). Idempotent. */
import { readFileSync } from "fs"; import { join, dirname } from "path"; import { fileURLToPath } from "url"; import { createClient } from "@supabase/supabase-js";
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(readFileSync(join(repo, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ORDER = ["amitgupta@cccpl.net", "anil@artis.in", "bharat@mahavirhomestore.com", "jaydev@aarviencon.com", "tojigarshah@gmail.com", "nirajt7011@gmail.com", "raghu@nandan.co.in", "rlodha@gmail.com", "shailesh.jain@mirraw.com", "valay.lakdavala@neoniche.com"];
const M = [
  ["-", "OCT", "SEPT", "AUG", "JULY", "JUN", "MAY", "APRIL", "MARCH", "FEB"],
  ["OCT", "-", "FEB", "MARCH", "APRIL", "MAY", "JUN", "JULY", "AUG", "SEPT"],
  ["SEP", "FEB", "-", "APRIL", "MARCH", "JUN", "JULY", "AUG", "MAY", "OCT"],
  ["AUG", "MARCH", "APRIL", "-", "FEB", "OCT", "SEPT", "MAY", "JUNE", "JULY"],
  ["JULY", "APRIL", "MARCH", "FEB", "-", "SEPT", "OCT", "JUN", "MAY", "AUG"],
  ["JUN", "MAY", "JUN", "OCT", "SEPT", "-", "FEB", "MARCH", "APRIL", "JULY"],
  ["MAY", "JUN", "JULY", "SEP", "OCT", "FEB", "-", "APRIL", "AUG", "MARCH"],
  ["APRIL", "JUL", "AUG", "MAY", "JUN", "MARCH", "APRIL", "-", "FEB", "SEP"],
  ["MARCH", "AUGUST", "MAY", "JUNE", "MAY", "APRIL", "AUG", "FEB", "-", "APRIL"],
  ["FEB", "SEPT", "OCT", "JULY", "AUG", "JULY", "MARCH", "SEP", "APRIL", "-"],
];
const MON = { JAN: 1, FEB: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
const { data: members } = await db.from("kindle_member").select("id,email");
const id = (e) => members.find((m) => m.email === e)?.id;
let n = 0;
for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
  const mo = MON[M[i][j]]; if (!mo) continue;
  const [a, b] = [id(ORDER[i]), id(ORDER[j])].sort();
  const period = `2026-${String(mo).padStart(2, "0")}-01`;
  const { error } = await db.from("kindle_one_to_one").upsert({ period, member_a: a, member_b: b, planned: true }, { onConflict: "period,member_a,member_b", ignoreDuplicates: true });
  if (error) console.log(error.message); else n++;
}
console.log(`planned pairs upserted: ${n}`);
