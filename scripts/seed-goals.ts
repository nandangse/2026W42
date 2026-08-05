// scripts/seed-goals.ts — a starter goal tree for FY2026-27.
//   npm run seed:goals
//
// Seeds the five goals plus one worked branch under "on-time delivery", with
// two key results wired to LIVE planning data so the tree moves on its own.
// Idempotent: skips anything already present for the period.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";

const PERIOD = "FY2026-27";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { error: probe } = await db.from("goal_node").select("id").limit(1);
  if (probe) {
    console.error("The goal tables are not there yet. Run supabase/migrations/0010_goals_layer.sql first.");
    process.exit(1);
  }

  const { count } = await db.from("goal_node").select("id", { count: "exact", head: true }).eq("period", PERIOD);
  if (count) {
    console.log(`${count} nodes already exist for ${PERIOD} — nothing seeded.`);
    return;
  }

  const swim = new Map((await db.from("swimlanes").select("id,name")).data?.map((s) => [s.name, s.id]) ?? []);
  const unit = new Map((await db.from("units").select("id,label")).data?.map((u) => [u.label, u.id]) ?? []);

  // grant goal access to every admin so the tab is reachable straight away
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
  for (const a of admins || [])
    await db.from("goal_access").upsert({ person_id: a.id, can_edit: true }, { onConflict: "person_id" });
  console.log(`granted goal access to ${admins?.length ?? 0} admin(s)`);

  const add = async (n: Record<string, unknown>) => {
    const { data, error } = await db.from("goal_node").insert({ period: PERIOD, ...n }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  console.log("seeding the five goals…");
  const g1 = await add({ node_type: "goal", goal_num: 1, what: "Grow revenue to ₹220 Cr",
    how: "Two engines: the inflight galley line reaching scale, and Hi-Lift exports beyond the existing Asia base.",
    swimlane_id: swim.get("Growth"), unit_id: unit.get("₹ Cr"), start_no: 168, current_no: 191, target_no: 220,
    start_date: "2026-04-01", end_date: "2027-03-31", status: "on_track" });

  const g2 = await add({ node_type: "goal", goal_num: 2, what: "Lift on-time delivery to 92%",
    how: "Planning discipline first, then kit reliability, then load balance. In that order — the other two do not hold without the first.",
    swimlane_id: swim.get("Operations"), unit_id: unit.get("%"), start_no: 71, current_no: 79, target_no: 92,
    start_date: "2026-04-01", end_date: "2027-03-31", status: "on_track" });

  await add({ node_type: "goal", goal_num: 3, what: "Build a ₹90 Cr defence and aviation order book",
    how: "Qualify on the tender lists we are currently locked out of, and convert the two live evaluations.",
    swimlane_id: swim.get("Growth"), unit_id: unit.get("₹ Cr"), start_no: 34, current_no: 52, target_no: 90,
    start_date: "2026-04-01", end_date: "2027-03-31", status: "on_track" });

  await add({ node_type: "goal", goal_num: 4, what: "Raise Khalapur throughput to 70 jobs a month",
    how: "Bay 2 commissioned and loaded, with the test rig no longer a bottleneck on GSE builds.",
    swimlane_id: swim.get("Operations"), unit_id: unit.get("Jobs"), start_no: 42, current_no: 51, target_no: 70,
    start_date: "2026-04-01", end_date: "2027-03-31", status: "on_track" });

  await add({ node_type: "goal", goal_num: 5, what: "Put a named owner and a skill matrix on every function",
    how: "No function runs on an unnamed person. The people master becomes the spine everything else reads from.",
    swimlane_id: swim.get("People"), unit_id: unit.get("Roles"), start_no: 0, current_no: 22, target_no: 38,
    start_date: "2026-04-01", end_date: "2027-03-31", status: "on_track" });

  console.log("seeding the worked branch under goal 2…");
  const p1 = await add({ node_type: "project", parent_id: g2, goal_id: g2,
    what: "Works Planning Suite live on every job",
    how: "genie.nandan.co.in carries every live job, fed by the morning upload, with baselines locked.",
    swimlane_id: swim.get("Operations"), start_date: "2026-05-01", end_date: "2026-10-31", status: "on_track" });

  const o1 = await add({ node_type: "objective", parent_id: p1, goal_id: g2,
    what: "One source of truth for job status",
    how: "Nobody quotes a status from a personal spreadsheet. If it is not in the suite, it did not happen.",
    swimlane_id: swim.get("Operations"), start_date: "2026-05-01", end_date: "2026-09-15", status: "on_track" });

  // ── the two live-fed key results ───────────────────────────────────────────
  const k1 = await add({ node_type: "key_result", parent_id: o1, goal_id: g2,
    what: "Every live job carries a milestone plan",
    how: "Counted straight from the planning database — nobody reports this number.",
    swimlane_id: swim.get("Operations"), unit_id: unit.get("Jobs"),
    start_no: 0, target_no: 105, metric_source: "jobs_with_plan",
    start_date: "2026-06-01", end_date: "2026-10-15", status: "on_track" });

  await add({ node_type: "key_result", parent_id: o1, goal_id: g2,
    what: "Kitting above 85% at job start",
    how: "Σ value × (1 − T%) × Kit% ÷ Σ value × (1 − T%), read live off the board.",
    swimlane_id: swim.get("Operations"), unit_id: unit.get("%"),
    start_no: 61, target_no: 85, metric_source: "kitting_pct",
    start_date: "2026-06-15", end_date: "2026-12-31", status: "on_track" });

  // tactics — these are what land on My Week
  await add({ node_type: "tactic", parent_id: k1, goal_id: g2,
    what: "Baseline the jobs still on the old sheet",
    how: "Two planners, roughly three jobs each per day, oldest delivery date first.",
    swimlane_id: swim.get("Operations"), unit_id: unit.get("Jobs"),
    start_no: 0, current_no: 18, target_no: 42,
    start_date: "2026-07-15", end_date: "2026-08-22", status: "at_risk" });

  await add({ node_type: "tactic", parent_id: k1, goal_id: g2,
    what: "Lock the WHO dropdown to the people master",
    how: "Stops free-text names, which is what breaks the load-per-person view.",
    swimlane_id: swim.get("Operations"), completion_pct: 100,
    start_date: "2026-06-10", end_date: "2026-08-01", status: "done" });

  await add({ node_type: "tactic", parent_id: k1, goal_id: g2,
    what: "Flag any job that slips twice in a row",
    how: "Automatic flag in the planning suite, raised to the job owner.",
    swimlane_id: swim.get("Operations"), completion_pct: 0,
    start_date: "2026-08-01", end_date: "2026-09-12", status: "not_started" });

  console.log("seeding the OPSP…");
  const opsp: [string, string][] = [
    ["Purpose", "Move what others cannot lift."],
    ["BHAG — 2032", "₹1,000 Cr, and Indian-built ground support on six continents."],
    ["3-year targets", "₹420 Cr · 92% OTD · 3 defence platforms qualified · Bay 3 live"],
    ["This year", "₹220 Cr · 92% OTD · ₹90 Cr defence book · 70 jobs a month · 38 roles named"],
    ["Critical numbers", "On-time delivery %. Kitting % at job start. Jobs closed per month."],
    ["Accountability", "Every row above has one name against it. No row reads 'the team'."],
  ];
  for (let i = 0; i < opsp.length; i++)
    await db.from("opsp_section").insert({ period: PERIOD, label: opsp[i][0], body: opsp[i][1], sort_order: i });

  const { count: made } = await db.from("goal_node").select("id", { count: "exact", head: true }).eq("period", PERIOD);
  console.log(`\nDone. ${made} nodes seeded for ${PERIOD}.`);
  console.log("Two key results are live-fed (jobs_with_plan, kitting_pct) — their numbers come from the planning data.");
  console.log("Assign owners in the Goals tab to make tactics appear on someone's My Week.");
}

main().catch((e) => { console.error(e); process.exit(1); });
