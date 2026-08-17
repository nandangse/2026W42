/**
 * Genie version + release log.
 *
 * VERSIONING RULE (set by Dr Raghu, 17 Aug 2026) — MAJOR.MINOR.BATCH.PATCH
 *
 *   2 . 6 . 1 . 1
 *   │   │   │   └── PATCH — bump for every change inside ONE module
 *   │   │   └────── BATCH — bump when several modules change together,
 *   │   │                   or on the first release of a new day
 *   │   └────────── MINOR — bump for major changes, or at the start of a
 *   │                       new week (2.6 → 2.7)
 *   └────────────── MAJOR — a new generation of the app
 *
 * When BATCH bumps, PATCH resets to 0. When MINOR bumps, both reset.
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
