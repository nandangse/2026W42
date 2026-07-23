// scripts/acceptance-test.ts — the required automated acceptance test (spec §10).
//   npm run test:acceptance
//
// ⚠ Runs a full jobs upload, which archives every active job not in the test
//   file. Run it against a SCRATCH / TEST Supabase project, never production.
//
// Proves the zero-data-loss contract (§6) and the fixed formulas (§0.4, §0.5):
//   1. seed plan + baseline + manual task + comment + priority
//   2. apply a jobs upload where one job is NEW and one is MISSING
//   3. assert: new job present; missing job active=false with plan reachable;
//      all planning artifacts byte-identical; re-upload same file → zero changes
//   4. kitting aggregate == independent recompute of Σ v(1−T)K ÷ Σ v(1−T)
//   5. mgmt-date write as non-raghu → blocked (403 / trigger 42501)
import { config } from "dotenv";
config({ path: ".env.local" }); // Next.js reads .env.local automatically; tsx scripts don't
config(); // also pick up .env if present (no override)
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { applyUpload } from "../src/lib/upload-merge";
import { buildBoard } from "../src/lib/board";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!url || !serviceKey || !anonKey) {
  console.error("Missing env (URL / SERVICE_ROLE / ANON). Fill .env.local.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PW = process.env.SEED_PASSWORD || "nandan100";
const A1 = "2099000001";
const A2 = "2099000002"; // will go missing
const A3 = "2099000003"; // new on second upload

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, extra ?? "");
  }
}

const JOB_HEADERS = [
  "ID",
  "Customer Tag",
  "Product Family",
  "Customer",
  "Value",
  "Target Delivery Date Current",
  "OTD Date",
  "Job Start Date",
  "Project",
  "Job Status",
  "Production Completion %",
  "Current Status",
  "Project Owner",
  "Management Target Date Request",
  "Throughput",
  "Throughput Expected Value (Auto)",
  "Throughput Expected pc",
  "Kitting percentage",
];

interface TJob {
  id: string;
  fam: string;
  val: number;
  tpp: number;
  kit: number;
}

function jobsWorkbook(jobs: TJob[]): ArrayBuffer {
  const aoa = [
    JOB_HEADERS,
    ...jobs.map((j) => [
      j.id,
      "TAG-" + j.id.slice(-4),
      j.fam,
      "Test Customer",
      j.val,
      "2026-08-15",
      "2026-08-01",
      "2026-07-01",
      "NGSE-PROJ-TEST",
      "P: Production Started",
      10,
      "seeded test row",
      "priya.k",
      "2026-08-20",
      0, // Throughput
      0, // Throughput Expected Value
      j.tpp, // Throughput Expected pc (used as tpp)
      j.kit, // Kitting percentage
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jobmaster");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

// snapshot the planning layer for a job (projection compared for byte-identity)
async function planningSnapshot(jobId: string) {
  const [plan, miles, base, mats] = await Promise.all([
    admin.from("plans").select("*").eq("job_id", jobId).maybeSingle(),
    admin.from("milestones").select("*").eq("job_id", jobId).order("idx"),
    admin.from("baseline_milestones").select("*").eq("job_id", jobId).order("idx"),
    admin.from("materials").select("*").eq("job_id", jobId).order("item"),
  ]);
  return JSON.stringify({
    plan: plan.data,
    miles: miles.data,
    base: base.data,
    mats: mats.data,
  });
}

async function tasksSnapshot() {
  const [manual, comments] = await Promise.all([
    admin.from("manual_tasks").select("*").order("id"),
    admin.from("task_comments").select("task_id, task_kind, by, body").order("body"),
  ]);
  return JSON.stringify({ manual: manual.data, comments: comments.data });
}

// substantive job columns (exclude updated_batch — a bookkeeping id that
// legitimately changes on every upload)
async function jobsSnapshot() {
  const { data } = await admin
    .from("jobs")
    .select("id,val,tpp,kit,fam,active,archived_at,tdd,otd,mgmt,stat,own")
    .order("id");
  return JSON.stringify(data);
}

async function main() {
  console.log("Acceptance test (spec §10)\n");

  // ---- clean any prior test rows ----
  for (const id of [A1, A2, A3]) {
    await admin.from("jobs").delete().eq("id", id);
  }

  // ---- 1. Upload A: A1 + A2 exist ----
  console.log("1. Seed board with A1 + A2, then seed the planning layer");
  await applyUpload(
    admin,
    jobsWorkbook([
      { id: A1, fam: "Hi Lift", val: 1_000_000, tpp: 40, kit: 50 },
      { id: A2, fam: "Runway", val: 2_000_000, tpp: 25, kit: 80 },
    ]),
    "uploadA.xlsx",
    "shweta@nandan.co.in",
  );

  // seed plan + baseline on A2 (the job that will go missing)
  await admin.from("plans").upsert({
    job_id: A2,
    start_date: "2026-07-01",
    baseline_on: "2026-07-02",
    baseline_end: "2026-08-30",
  });
  await admin.from("milestones").delete().eq("job_id", A2);
  await admin.from("milestones").insert([
    { job_id: A2, idx: 0, title: "Order review", days: 3, preds: [], crew: { fitter: 1 }, shift: "D", offset_days: 0, done: true, done_on: "2026-07-04" },
    { job_id: A2, idx: 1, title: "Material kitting", days: 7, preds: [1], crew: { helper: 2 }, shift: "D", offset_days: 0, done: false },
  ]);
  await admin.from("baseline_milestones").delete().eq("job_id", A2);
  await admin.from("baseline_milestones").insert([
    { job_id: A2, idx: 0, title: "Order review", start_date: "2026-07-01", end_date: "2026-07-03" },
    { job_id: A2, idx: 1, title: "Material kitting", start_date: "2026-07-04", end_date: "2026-07-10" },
  ]);
  // manual task + comment on A1
  await admin.from("manual_tasks").delete().eq("job_id", A1);
  const { data: mt } = await admin
    .from("manual_tasks")
    .insert({ job_id: A1, title: "Chase vendor", who: "priya", cat: "Material", esc: "None", done: false, created_by: "priya@nandan.co.in" })
    .select("id")
    .single();
  await admin.from("task_comments").insert({ task_id: mt!.id, task_kind: "manual", by: "priya@nandan.co.in", body: "called, ETA next week" });
  // materials on A2
  await admin.from("materials").delete().eq("job_id", A2);
  await admin.from("materials").insert({ job_id: A2, item: "Hydraulic powerpack", qty: "1", status: "Pending", custom: false });
  // priority order
  await admin.from("settings").upsert({ id: 1, priority_order: [A1, A2] });

  const planSnapA2 = await planningSnapshot(A2);
  const taskSnap = await tasksSnapshot();

  // ---- 2. Upload B: A2 missing, A3 new ----
  console.log("2. Upload B — A2 missing, A3 new");
  await applyUpload(
    admin,
    jobsWorkbook([
      { id: A1, fam: "Hi Lift", val: 1_000_000, tpp: 40, kit: 50 },
      { id: A3, fam: "Scissor Lift", val: 4_000_000, tpp: 20, kit: 25 },
    ]),
    "uploadB.xlsx",
    "shweta@nandan.co.in",
  );

  // ---- 3. Assertions ----
  console.log("3. Assertions");
  const { data: a3 } = await admin.from("jobs").select("*").eq("id", A3).maybeSingle();
  check("new job A3 present & active", !!a3 && a3.active === true, a3);

  const { data: a2 } = await admin.from("jobs").select("*").eq("id", A2).maybeSingle();
  check("missing job A2 archived (active=false, archived_at set)", !!a2 && a2.active === false && !!a2.archived_at, a2);

  const { data: a2plan } = await admin.from("plans").select("*").eq("job_id", A2).maybeSingle();
  check("archived job A2 plan still reachable", !!a2plan, a2plan);

  check("A2 planning artifacts byte-identical after upload", (await planningSnapshot(A2)) === planSnapA2);
  check("manual tasks + comments byte-identical after upload", (await tasksSnapshot()) === taskSnap);

  const { data: prio } = await admin.from("settings").select("priority_order").eq("id", 1).single();
  const prioOrder: string[] = prio?.priority_order ?? [];
  check("priority_order pruned to survivors, order kept", JSON.stringify(prioOrder) === JSON.stringify([A1]), prioOrder);

  // ---- 3b. re-upload same file → zero substantive changes ----
  const jobsBefore = await jobsSnapshot();
  const planBefore = await planningSnapshot(A2);
  const taskBefore = await tasksSnapshot();
  await applyUpload(
    admin,
    jobsWorkbook([
      { id: A1, fam: "Hi Lift", val: 1_000_000, tpp: 40, kit: 50 },
      { id: A3, fam: "Scissor Lift", val: 4_000_000, tpp: 20, kit: 25 },
    ]),
    "uploadB.xlsx",
    "shweta@nandan.co.in",
  );
  check("re-upload: jobs unchanged (substantive columns)", (await jobsSnapshot()) === jobsBefore);
  check("re-upload: A2 planning layer unchanged", (await planningSnapshot(A2)) === planBefore);
  check("re-upload: tasks/comments unchanged", (await tasksSnapshot()) === taskBefore);

  // ---- 4. kitting aggregate == independent recompute ----
  console.log("4. Kitting aggregate");
  const board = await buildBoard(admin);
  const active = board.jobs; // A1 + A3 (+ any other active in the test DB)
  let mv = 0;
  let kv = 0;
  for (const j of active) {
    const material = j.val * (1 - j.tpp / 100);
    mv += material;
    kv += material * (j.kit / 100);
  }
  const independent = mv > 0 ? (kv / mv) * 100 : 0;
  check(
    "board kitting % equals Σ v(1−T)K ÷ Σ v(1−T)",
    Math.abs(board.aggregates.kittingPct - independent) < 1e-9,
    { board: board.aggregates.kittingPct, independent },
  );

  // ---- 5. mgmt-date write as non-raghu is blocked ----
  console.log("5. Management Target Date guard");
  const priya = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await priya.auth.signInWithPassword({
    email: "priya@nandan.co.in",
    password: PW,
  });
  if (signInErr) {
    check("sign in as priya (planner) — did you run `npm run seed`?", false, signInErr.message);
  } else {
    const { error: mgmtErr } = await priya
      .from("jobs")
      .update({ mgmt: "2027-01-01" })
      .eq("id", A1);
    check("non-raghu mgmt edit blocked by trigger (RLS half of §0.5)", !!mgmtErr, mgmtErr);

    // sanity: a non-mgmt field (stat) is allowed for a planner
    const { error: statErr } = await priya
      .from("jobs")
      .update({ stat: "P: Painting Stage" })
      .eq("id", A1);
    check("planner may edit a non-mgmt field (stat)", !statErr, statErr);
    await priya.auth.signOut();
  }

  console.log(
    `\n${failures === 0 ? "ALL PASSED ✓" : failures + " CHECK(S) FAILED ✗"}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
