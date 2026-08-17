/**
 * Genie version + release log.
 *
 * VERSIONING RULE (set by Dr Raghu, restated 17 Aug 2026) — MAJOR.MINOR.BATCH.PATCH
 *
 *   2 . 6 . 1 . 1
 *   │   │   │   └── LAST      — TODAY. Bump for every change shipped today.
 *   │   │   └────── 2nd LAST  — NEXT DAY. Bump on the first release of a
 *   │   │                       new day.
 *   │   └────────── 3rd LAST  — NEW WEEK, or A NEW MODULE IS ADDED.
 *   │                           A whole new workspace/section counts.
 *   └────────────── MAIN      — ONLY when Dr Raghu says so. Never inferred.
 *
 * When a digit bumps, everything to its right resets to 0.
 *
 * The trap: "a new module" is a MINOR bump, not a patch. Goals rebuilt →
 * 2.7.0.0; the Delivered Jobs workspace is a second new module → 2.8.0.0,
 * not 2.7.0.1. Changes *inside* an existing module the same day take the
 * last digit.
 *
 * ADD A NEW ENTRY AT THE TOP of UPDATES for every shipped change — the header
 * badge and Admin → Updates both read this list, so the log and the version
 * number can never drift apart.
 */

export interface UpdateEntry {
  /** Full version this release carries, e.g. "2.6.1.1". */
  v: string;
  /** ISO date the change shipped. */
  date: string;
  /** Which part of Genie changed — one module per entry keeps PATCH honest. */
  module: string;
  /** What actually changed, in the words of someone who has to use it. */
  items: string[];
}

/** Newest first. The top entry's version IS the app's version. */
export const UPDATES: UpdateEntry[] = [
  {
    v: "3.0.0.1",
    date: "2026-08-17",
    module: "Morning Update · Upload",
    items: [
      "The card you upload on now decides what the file is. Until now the app threw that away and guessed from the contents alone.",
      "That guess failed on the first real Delivered Jobs upload: 2,728 delivered jobs read as a jobs upload, and only the mass-archive guard stopped it retiring all 105 live jobs. The guard held, nothing was changed — but it was the last line of defence, not the first.",
      "Upload on the wrong card and it now refuses and says so, instead of doing the wrong merge quietly. Dropping the live jobs export on the Delivered card would have banked 105 live jobs as delivered and locked every one of their plans read-only.",
      "A mis-clicked card still cannot force the wrong shape through: the file must look like a Jobmaster export before it can be treated as one, so a ToDo or Projects file dropped on the Delivered card is still rejected.",
      "Content detection is unchanged and still guards the generic upload path — it is now the second opinion rather than the only one.",
    ],
  },
  {
    v: "3.0.0.0",
    date: "2026-08-17",
    module: "Genie 3 — everything on one line",
    items: [
      "Genie 3. Called by Dr Raghu, and the only reason the first digit ever moves.",
      "Everything built today is now on main, in one line, with no side branches left to reconcile: the rebuilt Goals section, the Delivered Jobs feed and its analysis workspace, and the migration fixes.",
      "🎯 Goals — six tabs: Company Goals, Quarterly Rocks, Departmental Goals, My Goals, My Key Result Areas and KPIs Relevant to me. Company goals are set by an admin alone; the person a goal lands on can move its current metric and status, and nothing else. Sub goals and initiatives cascade as a tree to any depth. % completion is computed from the start, current and goal metrics and cannot be typed over. Management / Stratcom / LC / All decides who sees what.",
      "✅ Delivered Jobs — Genie had never recorded a single delivery, because a delivered job simply stopped appearing in the morning export. It now has its own ledger, fed by a fourth report, and an analysis workspace over it: MTD / QTD / YTD / 12 Months / custom, Nos · Value · Throughput, monthly averages, and cuts by month, product family and customer.",
      "That workspace refuses to flatter itself. An average is withheld where the data does not span the window — four weeks of history will not be divided by twelve — and a delivery banked without a date is shown separately rather than folded into a period it may not belong to.",
      "Delivered Jobs now sits third on Morning Update, and stays marked “when it changes” rather than being chased daily.",
      "Fixed: re-running the migrations died on profiles_role_check, because migration 0008 re-applied a role list written before the sales role existed. Pasting the whole chain works again.",
      "Needs migrations 0019 and 0020, both already applied.",
    ],
  },
  {
    v: "2.8.0.1",
    date: "2026-08-17",
    module: "Morning Update",
    items: [
      "Delivered Jobs now sits third on Morning Update, above To Do Dashboard All — beside the jobs files it belongs with, rather than last.",
      "It stays marked “when it changes”, so the header still counts 3/3 for the three daily files and this card shows when it last landed instead of turning red for not being loaded today.",
    ],
  },
  {
    v: "2.8.0.0",
    date: "2026-08-17",
    module: "Delivered Jobs",
    items: [
      "The Delivered Jobs tab is no longer a placeholder. It reads the delivery ledger the fourth morning report feeds, and answers the question Genie could never answer: what actually went out of the door, and when.",
      "Pick a period with MTD, QTD, YTD, 12 Months or All, or set any From/To by hand. Quarters are the financial ones — Q1 is April to June, not January to March.",
      "Three headline numbers for the chosen period: Nos, Value and Throughput. Throughput reads Throughput Expected Value (Auto); the plain Throughput column is zero on every job in the database and is not used.",
      "Two monthly averages beside them — since 1 April, and over the last 12 months.",
      "An average is withheld rather than guessed. Delivery data has only existed since 23 July 2026, so a 12-month average would divide four weeks of work by twelve and read as a collapse in output. Where the data does not span the window, the card says “insufficient history”, names how many months it actually holds, and offers the average over those months instead.",
      "Deliveries banked without a date are counted and valued in their own amber panel, never folded into a period they might not belong to. That happens when the report’s date column is renamed, or the job was delivered before the column existed.",
      "Break the period down by month, product family or customer. Months with no deliveries are shown as empty rather than skipped — a gap in output is a fact worth seeing.",
      "On-time delivery is measured against the target date each job carried at the end, and always states how many jobs could actually be judged. Where none carry a target date it reads “—”, not 0%.",
      "The job table lists every delivery in the period with how many days early or late it ran against its target.",
      "Needs migration 0020_delivered_jobs.sql, and one upload of the Delivered Jobs report — that upload names the column the delivery date was read from.",
    ],
  },
  {
    v: "2.7.0.0",
    date: "2026-08-17",
    module: "Goals — rebuilt",
    items: [
      "The Goals section has been rebuilt from scratch. It now opens on six tabs: Company Goals, Quarterly Rocks, Departmental Goals, My Goals, My Key Result Areas and KPIs Relevant to me.",
      "Company Goals are set by an admin and by nobody else. Everyone else reads them — and works whatever sits under them with their name on.",
      "Quarterly Rocks are named projects for the quarter. A rock has no number of its own: it reads whatever the goals hung under it read.",
      "Every goal carries who it is assigned to — a person OR a department, picked on a radio button — a due date, and three numbers: start metric, current metric, goal metric.",
      "Sub goals and initiatives cascade below a goal as a tree, to any depth, with Expand all and Collapse all across the whole tab.",
      "% completion is decided by the metrics: (current − start) ÷ (goal − start). Nobody can type it. The same formula reads a reduction goal correctly — cutting rework from 100 to 50 and sitting at 75 is 50% done — so there is no direction to set wrongly.",
      "Where a goal has both its own numbers and items below it, the number wins and the items' average is marked on the bar beside it. A wide gap between the two is the thing worth talking about in a review.",
      "The editor's Completion panel shows the arithmetic as you type, with a what-if slider that scores a reading before you commit to it.",
      "Every goal, rock and KPI is marked Management, Stratcom, LC or All — any combination. Anything not marked All is hidden from everyone outside those bands, except the person it is assigned to, and admins. Hiding a goal hides everything under it.",
      "Key Result Areas are the standing areas a role is answerable for, assigned by an admin. Goals get filed under one, and the area then reads what they read.",
      "KPIs reach you for a stated reason — you own it, it is your department's, you were added as a watcher, or it measures a goal of yours. A KPI can also read its number straight from the live planning data, in which case nobody types it.",
      "Admin → ⚙ Setup inside Goals sets each person's department and bands, and names a head for each department who can then edit that department's goals.",
      "Needs migration 0019_goals_v2.sql. It is purely additive — the old goal tree is untouched and simply stops being read.",
    ],
  },
  {
    v: "2.6.2.2",
    date: "2026-08-17",
    module: "Morning Update · Upload",
    items: [
      "Fourth report on Morning Update: Delivered Jobs, straight from the Jobmaster “Delivered Jobs for Analysis” report. Until now Genie only ever saw jobs in progress — a delivered job simply vanished from the export, so the app never knew a single job had been delivered, or when.",
      "It is marked “when it changes”, not chased every morning: the header still counts 3/3 for the daily files, and this card shows the date it last landed instead of turning red.",
      "Delivered jobs are banked, never archived. Each upload adds to the history already held, so loading the file late or occasionally loses nothing.",
      "The upload tells you which column it read the delivery date from, and names every column in the file if it cannot find one — so a renamed column shows up immediately instead of quietly skewing the analysis.",
      "Safety: an upload that would archive more than 40% of the live board is now refused outright. The Delivered Jobs report carries the same columns as the in-progress file, and without this the wrong file in the wrong slot would have retired the entire board.",
    ],
  },
  {
    v: "2.6.2.1",
    date: "2026-08-17",
    module: "Tasking · By Projects",
    items: [
      "Every project row now has its own + Add task.",
      "The job is pre-picked as the last one in that project to deliver — a task raised on a project is nearly always about the work still ahead. Every other job in the project is one click away in the dropdown, each showing its target delivery date.",
      "With “include jobs without tasks” ticked, a project with no tasks yet still gets a row, so its first task can be added from here.",
    ],
  },
  {
    v: "2.6.2.0",
    date: "2026-08-17",
    module: "Tasking · Job Plan · Header · Admin",
    items: [
      "Nandan Tasking now has six views: By Jobs, By Projects, By Department, By Goals, By Escalations and Brain Dump.",
      "Three tick-boxes decide whose tasks you see — my tasks, tasks I assigned, and tasks of people reporting to me. All three are on when you open the page.",
      "Brain Dump is a private capture pad: type the task, add assignee, due date, category, escalation, project, job, goal and the details, and it drops below the line under its category. Each line is then ticked Done or pushed onto the board as a real task.",
      "“Reports to” is now set per person in Admin → User management — that is what feeds the reporting-line tick-box.",
      "Every Job Plan now carries a Genie Hint on the right of the header: a written read of how the job has been handled, what would actually move the delivery date, and everyone on it from the job owner down to each task assignee.",
      "Each milestone has a spanner beside its name — click it for the full detail (dates, crew, man-days, what it waits on, what it unblocks, and how it sits against Target Delivery). After the first click a hover is enough.",
      "Upload Excel moved out of the header and into the account menu, and is now limited to admins and Shweta.",
      "New Delivered Jobs tab next to Planning Suite — reserved, nothing in it yet.",
    ],
  },
  {
    v: "2.6.1.1",
    date: "2026-08-17",
    module: "Header · Account menu",
    items: [
      "The header now shows your initials only, in a round badge — name, email and role moved into the menu behind it.",
      "New account dropdown: Profile, Change Password, Logout.",
      "Profile shows your name, email, role, initials and ERP owner name, and says who can change them (an admin, in Admin → User management).",
      "Change Password is self-service: it asks for your current password first, so a session left open can't be used to lock you out.",
      "Version numbering now follows MAJOR.MINOR.BATCH.PATCH, and every release is logged in Admin → Updates.",
    ],
  },
];

/** The version shown in the header badge. */
export const APP_VERSION = UPDATES[0].v;
