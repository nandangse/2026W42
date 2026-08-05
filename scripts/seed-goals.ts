// scripts/seed-goals.ts — the full FY2026-27 goal tree.
//   npm run seed:goals            seed if empty
//   npm run seed:goals -- --reset wipe the period and reseed
//
// Ports the whole cascade from the Goal Book draft: all five goals, every
// project/objective/key-result/tactic branch beneath them, owners mapped onto
// real accounts, and the comment trail. Three key results are wired to LIVE
// planning data, so their numbers read themselves.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PERIOD = "FY2026-27";

/** Draft initials → the real accounts in this database. */
const WHO: Record<string, string> = {
  RS: "RJ", // Dr Raghu
  AP: "AF", // Alpesh — Head, Works
  SD: "SB", // Shweta — Planning
  MK: "MG", // Medhansh — Systems
};

interface Seed {
  type: "goal" | "project" | "objective" | "key_result" | "tactic";
  what: string;
  how?: string;
  num?: number;
  own?: string[];
  swim?: string;
  start?: string;
  end?: string;
  origEnd?: string;
  s?: number; c?: number; t?: number; unit?: string;
  pct?: number;
  status?: string;
  metric?: string;
  comments?: { by: string; on: string; body: string }[];
  kids?: Seed[];
}

const TREE: Seed[] = [
  // ── GOAL 1 ────────────────────────────────────────────────────────────────
  {
    type: "goal", num: 1, what: "Grow revenue to ₹220 Cr", swim: "Growth", own: ["RS"],
    how: "Two engines: the inflight galley line reaching scale, and Hi-Lift exports beyond the existing Asia base.",
    s: 168, c: 191, t: 220, unit: "₹ Cr", start: "2026-04-01", end: "2027-03-31", status: "on_track",
    kids: [
      {
        type: "project", what: "Inflight galley line to ₹18 Cr", swim: "Growth", own: ["RS"],
        how: "Three airline accounts signed on the ATLAS container and cart range.",
        start: "2026-04-01", end: "2027-03-31",
        kids: [{
          type: "objective", what: "Sign three airline accounts", swim: "Growth", own: ["RS"],
          how: "One Gulf carrier, one domestic full-service, one regional.",
          start: "2026-04-01", end: "2027-01-31",
          kids: [{
            type: "key_result", what: "Three signed supply agreements", swim: "Growth", own: ["RS"],
            how: "Signed, not verbal. Counted at contract execution.",
            s: 0, c: 1, t: 3, unit: "Nos", status: "at_risk", start: "2026-04-01", end: "2027-01-31",
            kids: [{
              type: "tactic", what: "Close the Gulf carrier trial order", swim: "Growth", own: ["RS"],
              how: "Trial of 200 ATLAS drawers, anodised, with their embossed logo.",
              status: "at_risk", pct: 60, start: "2026-06-01", end: "2026-08-30", origEnd: "2026-07-15",
              comments: [{ by: "RS", on: "2026-07-29", body: "Sample approved. Waiting on their procurement, third week now." }],
            }],
          }],
        }],
      },
      {
        type: "project", what: "Hi-Lift exports beyond Asia", swim: "Growth", own: ["RS"],
        how: "Certification and a first reference installation outside the existing region.",
        start: "2026-06-01", end: "2027-03-31",
      },
    ],
  },

  // ── GOAL 2 ────────────────────────────────────────────────────────────────
  {
    type: "goal", num: 2, what: "Lift on-time delivery to 92%", swim: "Operations", own: ["RS", "AP"],
    how: "Planning discipline first, then kit reliability, then load balance. In that order — the other two do not hold without the first.",
    s: 71, c: 79, t: 92, unit: "%", start: "2026-04-01", end: "2027-03-31", status: "on_track",
    kids: [
      {
        type: "project", what: "Works Planning Suite live on every job", swim: "Operations", own: ["MK"],
        how: "genie.nandan.co.in carries all live jobs, fed by the morning upload, with baselines locked.",
        start: "2026-05-01", end: "2026-10-31", origEnd: "2026-09-30",
        comments: [{ by: "RS", on: "2026-07-12", body: "Baselines are the whole point. Do not let this ship without Save-as-Baseline working." }],
        kids: [
          {
            type: "objective", what: "One source of truth for job status", swim: "Operations", own: ["MK"],
            how: "Nobody quotes a status from a personal spreadsheet. If it is not in the suite, it did not happen.",
            start: "2026-05-01", end: "2026-09-15",
            kids: [{
              type: "key_result", what: "Morning refresh lands before 09:30 every working day", swim: "Operations", own: ["SD"],
              how: "Measured as consecutive working days hitting the window. Resets to zero on a miss.",
              s: 0, t: 22, unit: "Days", metric: "morning_upload_streak", status: "on_track",
              start: "2026-06-01", end: "2026-09-15",
              comments: [{ by: "SD", on: "2026-07-30", body: "Missed twice this month, both on ERP export delays, not on my side." }],
              kids: [{
                type: "tactic", what: "Move the ERP export to a scheduled 08:15 pull", swim: "Operations", own: ["MK"],
                how: "Removes the manual download step that causes the late-start days.",
                status: "on_track", pct: 40, start: "2026-07-20", end: "2026-08-08",
              }],
            }],
          },
          {
            type: "objective", what: "Milestone discipline on every live job", swim: "Operations", own: ["AP"],
            how: "Every job carries a baselined milestone plan, and variance against it is reviewed weekly.",
            start: "2026-05-15", end: "2026-10-31",
            kids: [
              {
                type: "key_result", what: "Every live job carries a baselined milestone plan", swim: "Operations", own: ["AP"],
                how: "Counted straight from the planning database — nobody reports this number.",
                s: 0, t: 105, unit: "Jobs", metric: "jobs_baselined", status: "on_track",
                start: "2026-06-01", end: "2026-10-15",
                comments: [
                  { by: "AP", on: "2026-07-22", body: "63 done. The remaining 42 are the older jobs still sitting on the shared sheet." },
                  { by: "RS", on: "2026-07-23", body: "Split those 42 between the two planners and put a date on it." },
                ],
                kids: [
                  {
                    type: "tactic", what: "Baseline the 42 jobs still on the old sheet", swim: "Operations", own: ["SD"],
                    how: "Two planners, roughly three jobs each per day, working oldest delivery date first.",
                    s: 0, c: 18, t: 42, unit: "Jobs", status: "at_risk",
                    start: "2026-07-15", end: "2026-08-22", origEnd: "2026-08-08",
                    comments: [{ by: "SD", on: "2026-08-01", body: "18 of 42. Slower than planned — half of them have no milestone history at all." }],
                  },
                  {
                    type: "tactic", what: "Train the planning team on the Load Board", swim: "Operations", own: ["MK"],
                    how: "One 90-minute session on the conference screen, then two weeks of daily use with support.",
                    status: "done", pct: 100, start: "2026-07-01", end: "2026-07-25",
                  },
                  {
                    type: "tactic", what: "Lock the WHO dropdown to the people master", swim: "Operations", own: ["MK"],
                    how: "Stops free-text names, which is what breaks the load-per-person view.",
                    status: "blocked", pct: 55, start: "2026-06-10", end: "2026-08-01", origEnd: "2026-07-18",
                    comments: [{ by: "MK", on: "2026-07-28", body: "Blocked until the people master in genie exists. Chicken and egg." }],
                  },
                ],
              },
              {
                type: "key_result", what: "Baseline-to-actual variance under 5 days", swim: "Operations", own: ["AP"],
                how: "Median variance across all live jobs, measured at milestone close.",
                s: 21, c: 12, t: 5, unit: "Days", status: "on_track", start: "2026-07-01", end: "2027-01-31",
                kids: [
                  {
                    type: "tactic", what: "Weekly variance review, Monday 09:00", swim: "Operations", own: ["AP"],
                    how: "Thirty minutes on the conference screen. Only jobs off baseline are opened.",
                    status: "on_track", pct: 35, start: "2026-07-06", end: "2026-12-28",
                  },
                  {
                    type: "tactic", what: "Flag any job that slips twice in a row", swim: "Operations", own: ["MK"],
                    how: "Automatic flag in the planning suite, raised to the job owner and to Alpesh.",
                    status: "not_started", pct: 0, start: "2026-08-01", end: "2026-09-12",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "project", what: "Kitting reliability at the vendor gate", swim: "Operations", own: ["AP"],
        how: "No job opens on the floor without its kit confirmed. Kitting % uses the fixed summation formula.",
        start: "2026-06-01", end: "2026-12-31",
        kids: [{
          type: "objective", what: "No job starts without its kit confirmed", swim: "Operations", own: ["AP"],
          how: "Kit confirmation becomes a gate in the planning suite, not a phone call.",
          start: "2026-06-01", end: "2026-12-31",
          kids: [{
            type: "key_result", what: "Kitting above 85% at job start", swim: "Operations", own: ["AP"],
            how: "Σ value × (1 − T%) × Kit% ÷ Σ value × (1 − T%), read live off the board.",
            s: 61, t: 85, unit: "%", metric: "kitting_pct", status: "on_track",
            start: "2026-06-15", end: "2026-12-31",
            kids: [
              {
                type: "tactic", what: "Publish the kitting formula inside the planning suite", swim: "Operations", own: ["MK"],
                how: "So the number is computed once, the same way, and nobody recalculates it in a side sheet.",
                status: "on_track", pct: 70, start: "2026-07-10", end: "2026-08-15",
              },
              {
                type: "tactic", what: "Chase the nine vendors behind on delivery", swim: "Operations", own: ["SD"],
                how: "Named vendor, named part, committed date. Reviewed in the Monday variance meeting.",
                s: 9, c: 4, t: 0, unit: "Vendors", status: "at_risk",
                start: "2026-07-01", end: "2026-08-29", origEnd: "2026-07-31",
              },
            ],
          }],
        }],
      },
      {
        type: "project", what: "Levelled load across the two bays", swim: "Operations", own: ["AP"],
        how: "Load board drives the week, rather than the week driving the load board.",
        start: "2026-08-01", end: "2027-01-31",
        kids: [{
          type: "objective", what: "No bay above 85% loaded in any ISO week", swim: "Operations", own: ["AP"],
          how: "Measured off the Load Board, reviewed on Friday for the week ahead.",
          start: "2026-08-01", end: "2027-01-31",
          kids: [{
            type: "key_result", what: "Twelve consecutive weeks inside the load ceiling", swim: "Operations", own: ["AP"],
            how: "Consecutive count. A breach resets it.",
            s: 0, c: 1, t: 12, unit: "Weeks", status: "not_started", start: "2026-08-04", end: "2027-01-31",
            kids: [{
              type: "tactic", what: "Put the weekly load board on the conference screen", swim: "Operations", own: ["MK"],
              how: "Touch-enabled, refreshed each Friday, visible without anyone logging in.",
              status: "not_started", pct: 0, start: "2026-08-04", end: "2026-09-05",
            }],
          }],
        }],
      },
    ],
  },

  // ── GOAL 3 ────────────────────────────────────────────────────────────────
  {
    type: "goal", num: 3, what: "Build a ₹90 Cr defence and aviation order book", swim: "Growth", own: ["RS"],
    how: "Qualify on the tender lists we are currently locked out of, and convert the two live evaluations.",
    s: 34, c: 52, t: 90, unit: "₹ Cr", start: "2026-04-01", end: "2027-03-31", status: "on_track",
    kids: [{
      type: "project", what: "Defence tender pipeline", swim: "Growth", own: ["RS"],
      how: "Qualify on the lists we cannot currently bid into.",
      start: "2026-04-15", end: "2027-02-28",
      kids: [{
        type: "objective", what: "Qualify on three new tender lists", swim: "Growth", own: ["RS"],
        how: "Navy, Air Force stores, and one state police procurement list.",
        start: "2026-04-15", end: "2027-02-28",
        kids: [{
          type: "key_result", what: "Three vendor registrations cleared", swim: "Growth", own: ["RS"],
          how: "Cleared means a registration number issued, not an application filed.",
          s: 0, c: 2, t: 3, unit: "Nos", status: "on_track", start: "2026-04-15", end: "2027-02-28",
          kids: [{
            type: "tactic", what: "Submit the Navy vendor registration papers", swim: "Growth", own: ["SD"],
            how: "Audited accounts, plant certification, and the two reference installations.",
            status: "on_track", pct: 80, start: "2026-07-01", end: "2026-08-20",
          }],
        }],
      }],
    }],
  },

  // ── GOAL 4 ────────────────────────────────────────────────────────────────
  {
    type: "goal", num: 4, what: "Raise Khalapur throughput to 70 jobs a month", swim: "Operations", own: ["AP"],
    how: "Bay 2 commissioned and loaded, with the test rig no longer a bottleneck on GSE builds.",
    s: 42, c: 51, t: 70, unit: "Jobs", start: "2026-04-01", end: "2027-03-31", status: "on_track",
    kids: [{
      type: "project", what: "Second assembly bay commissioned", swim: "Operations", own: ["AP"],
      how: "Bay 2 at Khalapur taking GSE builds end to end, not just sub-assembly.",
      start: "2026-05-01", end: "2026-12-15",
      kids: [{
        type: "objective", what: "Bay 2 handling full GSE builds by Q3", swim: "Operations", own: ["AP"],
        how: "Including the 40T scissor test rig, which is the current constraint.",
        start: "2026-05-01", end: "2026-12-15",
        kids: [{
          type: "key_result", what: "Bay 2 clears twelve jobs a month", swim: "Operations", own: ["AP"],
          how: "Monthly closed-job count attributed to Bay 2.",
          s: 0, c: 4, t: 12, unit: "Jobs", status: "on_track", start: "2026-06-01", end: "2026-12-15",
          kids: [{
            type: "tactic", what: "Commission the 40T scissor test rig", swim: "Operations", own: ["AP"],
            how: "Install, load-test to 40T with factor of safety 3, and sign off.",
            status: "on_track", pct: 45, start: "2026-06-15", end: "2026-09-30",
          }],
        }],
      }],
    }],
  },

  // ── GOAL 5 ────────────────────────────────────────────────────────────────
  {
    type: "goal", num: 5, what: "Put a named owner and a skill matrix on every function", swim: "People", own: ["SD"],
    how: "No function runs on an unnamed person. The org chart in masters becomes the spine everything else reads from.",
    s: 0, c: 22, t: 38, unit: "Roles", start: "2026-04-01", end: "2027-03-31", status: "on_track",
    kids: [{
      type: "project", what: "Org chart and people master in genie", swim: "People", own: ["SD"],
      how: "One login, one person record, one reporting line. Everything else reads from it.",
      start: "2026-07-01", end: "2026-11-30",
      kids: [{
        type: "objective", what: "Every function has a named owner", swim: "People", own: ["SD"],
        how: "No function is left reading 'the team'.",
        start: "2026-07-01", end: "2026-11-30",
        kids: [{
          type: "key_result", what: "Thirty-eight roles mapped to a named person", swim: "People", own: ["SD"],
          how: "Against the function list agreed in the July review.",
          s: 0, c: 22, t: 38, unit: "Roles", status: "on_track", start: "2026-07-01", end: "2026-11-30",
          kids: [{
            type: "tactic", what: "Complete the Khalapur shop-floor role map", swim: "People", own: ["SD"],
            how: "Sixteen roles remaining, all on the shop floor.",
            status: "on_track", pct: 50, start: "2026-07-05", end: "2026-08-29", origEnd: "2026-08-14",
          }],
        }],
      }],
    }],
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { error: probe } = await db.from("goal_node").select("id").limit(1);
  if (probe) {
    console.error("The goal tables are not there yet. Run supabase/migrations/0010_goals_layer.sql first.");
    process.exit(1);
  }

  const reset = process.argv.includes("--reset");
  const { count: existing } = await db.from("goal_node").select("id", { count: "exact", head: true }).eq("period", PERIOD);
  if (existing && !reset) {
    console.log(`${existing} nodes already exist for ${PERIOD}. Re-run with --reset to wipe and reseed.`);
    return;
  }
  if (existing && reset) {
    await db.from("goal_node").delete().eq("period", PERIOD);   // children cascade
    await db.from("opsp_section").delete().eq("period", PERIOD);
    console.log(`cleared ${existing} existing nodes`);
  }

  const swim = new Map((await db.from("swimlanes").select("id,name")).data?.map((s) => [s.name, s.id]) ?? []);
  const unit = new Map((await db.from("units").select("id,label")).data?.map((u) => [u.label, u.id]) ?? []);
  const people = new Map(
    (await db.from("profiles").select("id,initials")).data
      ?.filter((p) => p.initials)
      .map((p) => [p.initials as string, p.id as string]) ?? [],
  );

  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
  for (const a of admins || [])
    await db.from("goal_access").upsert({ person_id: a.id, can_edit: true }, { onConflict: "person_id" });
  console.log(`granted goal access to ${admins?.length ?? 0} admin(s)`);

  let made = 0;
  let unmatched = new Set<string>();

  const insert = async (n: Seed, parentId: string | null, goalId: string | null, order: number): Promise<string> => {
    const { data, error } = await db
      .from("goal_node")
      .insert({
        period: PERIOD,
        node_type: n.type,
        parent_id: parentId,
        goal_id: n.type === "goal" ? null : goalId,
        goal_num: n.type === "goal" ? n.num : null,
        what: n.what,
        how: n.how || "",
        swimlane_id: n.swim ? swim.get(n.swim) ?? null : null,
        start_date: n.start ?? null,
        end_date: n.end ?? null,
        // the trigger stamps original_end on insert; force the drafted value
        // where the draft shows an item that has already been pushed
        unit_id: n.unit ? unit.get(n.unit) ?? null : null,
        start_no: n.s ?? null,
        current_no: n.c ?? null,
        target_no: n.t ?? null,
        completion_pct: n.pct ?? 0,
        metric_source: n.metric ?? null,
        status: n.status ?? "on_track",
        sort_order: order,
        created_by: "seed",
      })
      .select("id")
      .single();
    if (error) throw new Error(`${n.what}: ${error.message}`);
    made++;
    const id = data.id as string;

    if (n.origEnd && n.origEnd !== n.end) {
      await db.from("goal_node").update({ original_end: n.origEnd, push_count: 1 }).eq("id", id);
    }

    for (const w of n.own || []) {
      const initials = WHO[w] || w;
      const pid = people.get(initials);
      if (pid) await db.from("goal_node_owner").insert({ node_id: id, person_id: pid });
      else unmatched.add(`${w}→${initials}`);
    }

    for (const c of n.comments || []) {
      await db.from("goal_node_comment").insert({
        node_id: id,
        by: WHO[c.by] || c.by,
        at: c.on + "T09:00:00Z",
        body: c.body,
      });
    }

    const rootGoal = n.type === "goal" ? id : goalId;
    let i = 0;
    for (const k of n.kids || []) await insert(k, id, rootGoal, i++);
    return id;
  };

  console.log("seeding the cascade…");
  let g = 0;
  for (const goal of TREE) await insert(goal, null, null, g++);

  console.log("seeding the OPSP…");
  const opsp: [string, string][] = [
    ["Purpose", "Move what others cannot lift."],
    ["BHAG — 2032", "₹1,000 Cr, and Indian-built ground support on six continents."],
    ["3-year targets", "₹420 Cr · 92% OTD · 3 defence platforms qualified · Bay 3 live"],
    ["This year", "₹220 Cr · 92% OTD · ₹90 Cr defence book · 70 jobs a month · 38 roles named"],
    ["This quarter", "Planning suite on every job · Bay 2 at 12 jobs · Navy registration filed"],
    ["Critical numbers", "On-time delivery %. Kitting % at job start. Jobs closed per month."],
    ["Accountability", "Every row above has one name against it. No row reads 'the team'."],
  ];
  for (let i = 0; i < opsp.length; i++)
    await db.from("opsp_section").insert({ period: PERIOD, label: opsp[i][0], body: opsp[i][1], sort_order: i });

  console.log(`\nDone. ${made} nodes seeded for ${PERIOD}.`);
  if (unmatched.size) console.log(`  ! no account for: ${[...unmatched].join(", ")} — assign those owners by hand`);
  console.log("Live-fed key results: morning_upload_streak, jobs_baselined, kitting_pct.");
}

main().catch((e) => { console.error(e); process.exit(1); });
