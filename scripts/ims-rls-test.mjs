/**
 * ims-rls-test.mjs — does the IMS actually keep people out, and can two
 * people create a document at the same moment without colliding?
 *
 *   node scripts/ims-rls-test.mjs
 *
 * Three things are proven against GENIE'S LIVE PROJECT — the IMS lives in it
 * (Dr Raghu, 2 Sep 2026: "no need to create supabase. Put it in the genie."):
 *
 *   1. RLS. The anon key must see NOTHING. This matters MORE now than it did
 *      when the IMS had a project of its own: Genie hands every signed-in
 *      person an anon-key session, so an IMS table without RLS would be a
 *      table any Genie account could read straight out of PostgREST — draft
 *      procedures, the paths to the copyrighted standards, all of it. RLS is
 *      on and FORCED with no policies at all, which makes /api/ims/* the only
 *      door. This test is what proves that claim.
 *
 *   2. NUMBERING UNDER CONCURRENCY. Ten documents created at the same instant
 *      must come back with ten DISTINCT, sequential numbers. Counting rows to
 *      make a number is how two people save at once and both get 012.
 *
 *   3. THE SEED. Six standards, the clause trees, all 93 Annex A controls in
 *      the Statement of Applicability, five registers.
 *
 * The ROLE rules a member is held to — no draft documents, no standard copy,
 * no editing a system register — live in the route handlers, not in policies,
 * so they are tested by calling /api/ims/* as that person. They are listed at
 * the end as the manual checks they are, rather than silently skipped.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(repo, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

// Genie's own project — the IMS lives in it (Dr Raghu, 2 Sep 2026).
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL_ || !SERVICE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local.");
  process.exit(1);
}

const rest = (key) => async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};
const svc = rest(SERVICE);

let failures = 0;
const ok = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------- 1. RLS, with anon key
console.log("\n1. RLS — the anon key must see nothing\n");
if (!ANON) {
  console.log("  skip  NEXT_PUBLIC_SUPABASE_ANON_KEY not in .env.local — this is the test");
  console.log("        that proves a signed-in Genie account cannot read the IMS directly.");
} else {
  const anon = rest(ANON);
  for (const t of ["ims_document", "ims_document_revision", "ims_certificate", "ims_register_entry", "core_task", "ims_access"]) {
    // select=* rather than select=id: ims_access is keyed on EMAIL and has no
    // id column, and asking for one returns 400 "column does not exist" — which
    // is a broken probe, not a locked table. A test that scores its own typo as
    // a security pass is worse than no test.
    const { status, body } = await anon(`${t}?select=*&limit=1`);
    const empty = Array.isArray(body) && body.length === 0;
    const refused = status === 401 || status === 403;
    const broken = status === 400;
    ok(`anon sees nothing in ${t}`, (empty || refused) && !broken,
       broken ? `HTTP 400 — the PROBE is wrong, not the table: ${JSON.stringify(body).slice(0, 120)}`
              : `HTTP ${status}, ${Array.isArray(body) ? body.length : "?"} rows`);
  }
  const { status } = await anon("ims_document", {
    method: "POST", body: JSON.stringify({ sys: "QMS", doc_type: "PRO", title: "anon should not manage this" }),
  });
  ok("anon cannot insert", status >= 400, `HTTP ${status}`);
}

// -------------------------------------- 2. numbering under real concurrency
console.log("\n2. Numbering — ten simultaneous creates, ten distinct numbers\n");
const stamp = Date.now();
const made = await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    svc("ims_document?select=id,doc_no", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ sys: "QMS", doc_type: "CHK", title: `concurrency probe ${stamp}-${i}` }),
    }),
  ),
);
const nos = made.flatMap((m) => (Array.isArray(m.body) ? m.body.map((r) => r.doc_no) : []));
const ids = made.flatMap((m) => (Array.isArray(m.body) ? m.body.map((r) => r.id) : []));
ok("all ten were created", nos.length === 10, `${nos.length} came back`);
ok("all ten numbers are distinct", new Set(nos).size === nos.length, nos.join(" "));
const serials = nos.map((n) => Number(String(n).split("-").pop())).sort((a, b) => a - b);
const sequential = serials.every((n, i) => i === 0 || n === serials[i - 1] + 1);
ok("the numbers are sequential, with no gaps", sequential, serials.join(","));
ok("they are shaped NGSE-QMS-CHK-NNN", nos.every((n) => /^NGSE-QMS-CHK-\d{3}$/.test(String(n))), nos[0] ?? "—");

// Clean up after ourselves — a numbering probe must not leave ten checklists
// in the document register. The SERIAL is deliberately NOT rewound: a number
// that was issued is spent, which is exactly how a controlled series behaves.
for (const id of ids) await svc(`ims_document?id=eq.${id}`, { method: "DELETE" });
console.log(`  (${ids.length} probe documents deleted; the serial is not rewound — an issued number is spent)`);

// ------------------------------------------------------------- 3. the seed
console.log("\n3. The seed\n");
const count = async (path) => {
  const { body } = await svc(`${path}${path.includes("?") ? "&" : "?"}select=id`, { headers: { prefer: "count=exact" } });
  return Array.isArray(body) ? body.length : 0;
};
ok("6 standards", (await count("ims_standard")) === 6);
const clauses = await count("ims_standard_clause");
ok("clause trees seeded", clauses >= 300, `${clauses} clauses`);
const soaDef = await svc("ims_register_definition?slug=eq.soa&select=id");
const soaId = Array.isArray(soaDef.body) ? soaDef.body[0]?.id : null;
const soaRows = soaId ? await count(`ims_register_entry?register_id=eq.${soaId}`) : 0;
ok("93 Annex A controls in the Statement of Applicability", soaRows === 93, `${soaRows} rows`);
ok("5 system registers", (await count("ims_register_definition?is_system=eq.true")) === 5);

// -------------------------------------------- the checks that are not SQL
console.log(`
4. The role rules — checked through /api/ims/*, not through SQL

   These are enforced in the route handlers, not in policies — RLS here is a
   shut door, not a rule engine, so there is nothing in SQL to test. Sign in
   as each person and confirm:

   member     · Documents shows ONLY approved ones — no draft, no in-review
              · Standards shows "restricted" instead of an Open-copy button
              · Registers → Columns is absent, and POST define_update is 403
   dept_head  · may Review a document in their OWN department
              · may NOT approve — that is the MR's signature in both modes
   ims_admin  · may approve, make obsolete, and edit a system register's columns
              · may NOT delete a system register — the route refuses by name
`);

console.log(failures === 0 ? "All automated checks passed.\n" : `${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
