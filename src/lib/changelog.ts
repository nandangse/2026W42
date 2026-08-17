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
    v: "3.3.0.0",
    date: "2026-08-18",
    module: "Material Kitting",
    items: [
      "Materials is now MATERIAL KITTING, and a line is a real record rather than a tick-box. Columns: Material / kit item · Qty · Receivable date · Update · Status.",
      "Three statuses, not two: Yet to receive, Received, and QC Defective. QC Defective is NOT a kind of received — the item is on site and cannot be used, which for the job is the same position as not having it, so it counts as outstanding everywhere.",
      "A pencil on every line opens it: item, quantity, receivable date, who is chasing it, a running Update line, and comments — where a delay gets explained next to the thing it is delaying.",
      "ANSWERING DR RAGHU’S QUESTION — can a kitting line be a task, since it already has a date? Yes, and the answer is a link rather than a copy. The material row stays the record; “Raise a task for this” puts it on somebody’s list in Tasking with the receivable date as its due date, under the Material category, tied back to the line.",
      "Once linked the two are held in step BOTH WAYS: receiving the material closes the task, and closing the task receives the material. Two records that look alike are not the problem — two that drift are, and this is what stops it. Editing the date or the owner moves the task too.",
      "QC Defective deliberately re-opens the task. The item is here and useless, so the chasing is not finished; and marking a task done never overwrites a QC call.",
      "Not every line becomes a task. Eight lines on a hundred and five jobs would be eight hundred and forty tasks and Tasking would become a bill of materials nobody reads — so a line is promoted only when somebody actually has to chase it.",
      "Migration 0030. Existing “Pending” lines become “Yet to receive” — the same state, said the way the shop floor says it.",
    ],
  },
  {
    v: "3.2.0.4",
    date: "2026-08-18",
    module: "Genie Hint",
    items: [
      "The sign-off under a job brief now reads “Written by Genie based on coaching by Raghu · Work on the plan, and escalate as needed — to the right person, at the right time.”",
      "It replaces “Written by Claude … check the plan below before acting on it”, which told somebody to distrust the panel and stop. The line is an instruction, not a disclaimer: the brief exists to move a plan and get the right person told, and the last thing on it should say so.",
    ],
  },
  {
    v: "3.2.0.3",
    date: "2026-08-18",
    module: "My Week",
    items: [
      "The top of My Week is one five-column band. Open Tasks, Deliveries, Learning and Participation across the top, with birthdays holding the fifth column down both rows — a list of names is the one card up there that grows, so it gets the height.",
      "The Quote of the Day now runs the full width of the first three columns. A line of prose set in a narrow card is a line nobody reads.",
      "How’s My Day sits directly under My Participation, which is the number it belongs with, and its five faces now fit on one line instead of wrapping onto two.",
      "The image quote moves down into the right-hand column, where it has the width to be looked at rather than glanced past.",
    ],
  },
  {
    v: "3.2.0.2",
    date: "2026-08-18",
    module: "Morning Update · Job Plan · Genie Hint",
    items: [
      "FIXED, and this was the real one: the Planning Owner was blank on all 105 jobs. The jobs parser only ever looked for a column literally called “Project Owner”, and the export calls it PLANNING OWNER. The delivered-jobs parser has understood both names since it was written; the jobs branch never used that list. That single missing header is why the Owner column read “—”, why the owner filter had nobody in it, why the kanban had one Unassigned column, and why My Week showed no jobs of yours.",
      "Job Status and Target Delivery Date are now matched the same way, so the two exports’ different spellings both work.",
      "The five new fields — Current Project Escalation, Client Update Latest, Cash Flow Details, Amount Needed next month, Pending Payment on Delivery — are empty because NO JOBMASTER FILE HAS BEEN UPLOADED since Genie learned to read them. The last jobs upload was 17 August. The job page now says exactly that instead of showing five dashes, and names the file to load.",
      "Genie Hint writes dates as 31-Aug-2026, never 2026-08-31. Both halves were needed: the model was told the rule AND the facts it is handed are now written that way, because it copies back whatever shape it is given.",
      "The upload summary now names the column it read Planning Owner, Job Status and Target Delivery Date from — and prints the sheet’s whole header list whenever one of those three fails to match. The money fields have named their columns since the day they were added, which is how the ERP’s “Currrent Project Escalation” typo was confirmed at a glance; Planning Owner failed silently for months because nothing ever said which header it had bound to, or that it had bound to none.",
    ],
  },
  {
    v: "3.2.0.1",
    date: "2026-08-18",
    module: "Jobs in Progress",
    items: [
      "Planned deliveries is now half chart, half table, side by side, and shows at most six months — trimmed to where the book actually ends. It was drawing twelve, eight of them empty: a line lying flat along zero for two thirds of its width reads as a collapse in orders rather than as the end of the data. It now says “nothing planned past November” in words instead.",
      "The table leads with a TOTAL row, and that total is the whole book — every month shown plus overdue, later and undated — so the rows beneath can never add up to more than the line above them.",
      "Every total is now clickable. A month, the total, or a product family opens the jobs behind it: job number, customer, tag, target date, value and throughput. A chart that says a month is worth ₹8.38 Cr but cannot tell you which eight jobs is a chart you have to leave in order to act on, and leaving means losing the chart.",
      "Clicking a job in that list opens the job itself, still without leaving the page.",
      "On the Type of Jobs list, clicking a family now opens its jobs; the small ◧ button filters the plot instead. Those were the same click before, and only one of them can be the obvious one.",
      "The kitting-versus-production plot is smaller and squarer, capped so it fits on one screen. A plot you have to scroll to see the top of is two half-plots, and its whole value is seeing all four corners at once.",
    ],
  },
  {
    v: "3.2.0.0",
    date: "2026-08-18",
    module: "My Week rebuilt · Jobs in Progress",
    items: [
      "My Week is rebuilt. The top is two columns: your numbers on the left — My Open Tasks, Deliveries This Week, My Learning over 90 days, My Participation, and How’s My Day — and on the right the two things that are not about work, the Quote of the Day and an image quote.",
      "How’s My Day is five faces and one click. No scale, no required note: the honest answer is the one given in the second before somebody thinks about it. Answering again the same day changes the answer rather than adding one, and the last fortnight shows as a row of dots underneath — one bad Tuesday is noise, five in a row is something a manager should already know.",
      "My Participation counts DAYS ENGAGED out of the last 30 — days you logged how it was going, finished a lesson, or wrote a comment. Not a count of clicks: a number that goes up when somebody is busy rather than when somebody takes part would measure the wrong thing.",
      "The image quote reads your Drive folder directly — all 168 of them — now that it is shared. One a day, the same one for everybody, cycling the whole folder before repeating. Genie caches what it finds, so a bad day at Google leaves yesterday’s pictures working rather than an empty panel. Admin → Settings → Image quotes has the folder and a Sync button.",
      "Below that, three columns: My Tasks on the left; deliveries in the next 7 days and My Goals in the centre; birthdays, My Learning, milestones and my jobs on the right.",
      "Birthdays for the next seven days, from the employee master. A 29 February birthday lands on 1 March in the years without one — the alternative is never wishing that person a happy birthday again except in leap years.",
      "My Learning shows one lesson with its thumbnail — whatever is under way, else whatever is planned, never one already finished — and opens it in a lightbox.",
      "Jobs in Progress is now built. A table AND a line chart of planned deliveries over the next 12 months: jobs, value and throughput. Value and throughput share the rupee axis because the gap between them IS the material cost; the job count gets its own axis, since forcing a count of 9 onto a rupee scale draws it flat along the bottom.",
      "Overdue leads that table and is deliberately kept OFF the line: a job whose date has gone is not a future month, and drawing it as one would flatter every month after it.",
      "The book split by product family, click any family to filter.",
      "And every job plotted: production % across, kitting % up, dot AREA proportional to throughput, colour by product family. Radius-proportional bubbles overstate the big ones by the square — the eye reads area. Hover for the job, click for a lightbox with its dates, money and escalation; click outside and the plot is exactly where you left it, because exploring a scatter means opening six jobs in a row.",
      "Migration 0029.",
    ],
  },
  {
    v: "3.1.0.2",
    date: "2026-08-18",
    module: "Job Plan · Admin · Goals · Planning Suite",
    items: [
      "Planning Owner now resolves. The Jobmaster writes it as an email — pankajs@nandan.co.in — while accounts are matched on initials, name or ERP user. Both sides are now reduced to the same thing before comparing: lower-cased, with anything after the @ dropped. That is why the Owner column read “—” on nearly every job and the owner filter had almost nobody in it.",
      "New on the job page: Current Project Escalation, shown FIRST and in red. What is holding a job up outranks what it is worth. Client Update Latest, Cash Flow Details and Pending Payment on Delivery now carry their full names, and Amount Needed reads “next month”, which is what the ERP column actually means.",
      "New tab: Jobs in Progress, first in the Planning Suite and deliberately blank until you say what belongs on it — rather than a second copy of the Job Delivery Board that would have to be un-learned.",
      "LMS has moved to the end of the header, after Sales Genie.",
      "Every goal, sub-goal and initiative can now carry a Goal Category — the same swimlanes list Admin already manages, so what a board groups by later and what a goal carries now are one list rather than two that drift. A free-text category would have been fifteen spellings of “Operations” inside a month.",
      "Admin is now actually separated. The tabs did nothing: every section rendered on all of them, which is why App identity and Targets appeared under Milestones. Users, Org Chart, Milestones, Settings and Updates each show only their own.",
      "Targets now lead with the financial year, in its own block. A target with no year on it is the one that gets carried forward by accident.",
      "Goals access is folded away behind a toggle on the Users tab. Hidden, not removed — it is the only place a grant can be revoked, and a page nobody can reach is a permission nobody can take back.",
      "New: an Org Chart tab beside Users, drawn from “Reports to” and departments. Nobody maintains it — it IS the reporting column, so it cannot disagree with the boards, Tasking or Team Goals. It counts direct and total reports, highlights a department, names anyone with nobody above and nobody below, and draws each person once so a reporting cycle stops rather than spins.",
      "Migration 0028.",
    ],
  },
  {
    v: "3.1.0.1",
    date: "2026-08-18",
    module: "LMS",
    items: [
      "Added: a sixteenth book. The Library tab now has a THE BOOKS panel — add a book, rename one, change its badge, colour, order or one-line description. The API could always do it; there was no button, which made the fifteen seeded books look like the only fifteen there could ever be.",
      "A book is never deleted, only made inactive: lessons are shelved against its id, and removing the shelf a lesson stands on loses where it belonged.",
      "Renaming a book keeps its id, so nothing shelved under it is orphaned. A new book gets its id slugged from its name — nobody has to invent one.",
      "The panel is collapsed by default. Books are set up once; lessons are the daily work.",
    ],
  },
  {
    v: "3.1.0.0",
    date: "2026-08-18",
    module: "LMS — a new section",
    items: [
      "New section: 📚 LMS, first in the header, ahead of the work. That placement is the point.",
      "Learning Goals is the first tab: your learning plan, then the fifteen books — Employee Handbook, WCM and Kaizen, Production, Design, Digital Tools, Safety, Quality, ISO, Accounting, ToC, Leadership, Worker Skill, Meditation, Mind Practice and Emergency. Each shows how far through it you are.",
      "A lesson carries a title, a body, a description, a video, a PDF and a length. It is authored ONCE and shelved into as many books as it belongs in — the same CAD lesson can sit in Design and in Digital Tools without becoming two lessons that drift apart. Books have sections, and a lesson can be moved between them per book.",
      "YouTube lessons play with YouTube's own controls switched off and play, pause, forward-10s and the clock drawn by Genie instead. No suggested videos, no channel, no “watch on YouTube” — every one of those is a door out of the lesson. Drive files keep Google's player, and the panel says so rather than pretending otherwise.",
      "A LESSON CANNOT BE TICKED. It is complete only when the person has written at least fifty words in their own words about what they took from it — enforced on the server, not just in the browser, with a live word count and a message saying how far short you are. A tick records attendance; fifty words record learning.",
      "Planned time is not time. Only completed lessons add to a total, because letting intentions accumulate is how a training record ends up flattering everybody in it.",
      "Training taken elsewhere counts too — a course, a seminar, a site visit, added by hand with its own note, into the same total.",
      "Genie writes your Learning Plan: it reads your designation, department, key result areas and what you have already finished, writes what you should be building towards, and puts the lessons it picks onto your plan as Planned. It can only choose lessons that actually exist — every id it returns is checked against the library, and anything invented is dropped and reported.",
      "My Team shows what everyone below you has been learning, walked down the whole line — their totals, their plan, and what they actually wrote.",
      "The Library tab is where an author writes lessons, ticks the books each belongs in, and sees at a glance which lessons are in no book at all and therefore findable by nobody. Retiring a lesson never deletes anybody's completion or their words.",
      "Lesson bodies are Markdown rendered to elements, never raw HTML, and only http/https/mailto links survive. Lessons are written by interns and read by the whole company; that is untrusted text on its way to every screen in the works.",
      "My IDP in Goals now shows the built half of a development record — lessons completed, time learned, words written, and the learning plan — read from LMS. That was always the reason for building this.",
      "Migration 0027 creates it all and seeds the fifteen books.",
    ],
  },
  {
    v: "3.0.1.11",
    date: "2026-08-18",
    module: "Job Delivery Board · Job Plan · Genie Hint",
    items: [
      "New: the PENDING JOBS card opens. Click it for the Delivery Outlook — every pending job stacked on the month its target date falls in, switchable between jobs, sales billing and throughput, with an OVERDUE bar of its own at the front. A job whose date has already gone is the most useful bar on the chart and must never be folded into “this month”.",
      "The required run rate is drawn across it as a dotted line, from the same figures as the run-rate card, so the two can never disagree. A bar chart of what is coming says nothing until you can see the level it has to clear.",
      "New: a Kitting % × Production % grid, shaded by throughput expected value rather than by job count — four small jobs and one large one in the same square are not the same decision. Click any square for the jobs in it. Two corners are called out: READY TO FINISH (60%+ kitted, 60%+ built — money nearly earned) and KITTED, NOT MOVING (bought and sitting still).",
      "The outlook reads the same filtered list as the board, so the Planning Owner filter and the search box carry into it.",
      "New on the job page: Where It Stands — Current Status, Client update and Cash flow, beside Invested, Amount needed and Pay on delivery.",
      "New job columns from the Jobmaster export: Client update, Cash flow details, Amount needed and Pending payment on delivery. They are matched by MEANING, not by an exact header, and the upload summary names the column each one was read from and how many rows carry a value — so a match is confirmed rather than assumed, and a column renamed in the ERP shows up the morning it happens instead of silently reading zero.",
      "Pending payment on delivery is now a sortable column on the job list, so the board can be ordered by what finishing a job collects. Not recorded shows as a dash and sorts below zero — a gap in the export is not a job with nothing behind it.",
      "New Invested column: (1 − T%) × Kitting % × Value — the material already drawn against a job, which is what finishing it releases.",
      "Job Status has come off the job list. It was a 32-value dropdown taking 190px on every row to say what Prod % says in three characters; it is still editable on the Job Plan page and still on the kanban card. Prod % and Kit % now sit side by side.",
      "Owner is now Planning Owner everywhere — the boards, the filters, the role list and the kanban. The Jobmaster calls the same person the Project Owner.",
      "Fixed: the Genie Hint had to be generated again for every single person. It was cached in memory inside one server instance, so the second person to open a job landed somewhere else and paid for a whole fresh read, and any restart threw the lot away. It is now one shared row per job (migration 0026): whoever reads a job first, everybody after them gets it free and instantly.",
      "The hint now fills itself in when a job is opened — no button — and goes stale when the JOB changes rather than when a timer runs out. For the owner and those reporting directly to him it is also BUILT automatically when there isn’t one.",
      "Why it was failing: the server has no ANTHROPIC_API_KEY. Nothing in the code was broken — the key was never added to the Vercel project’s Environment Variables. The message now says exactly that, and that nothing else about the job is affected.",
      "My Week has come off the Planning Suite tab bar — the 🏠 button beside it is that same page. Planning Suite now opens on the Job Delivery Board, and the “Restricted — authorised planning users” line is gone: it was true, told nobody anything they could act on, and cost a line of a header that is on screen all day.",
    ],
  },
  {
    v: "3.0.1.10",
    date: "2026-08-18",
    module: "Morning Update · Goals",
    items: [
      "Fixed: the Employee Master upload failed outright with “time zone displacement out of range: +017722–01”. A date of birth in 1948 is held by Excel as the number 17722, and the date reader only recognised numbers between 40000 and 60000 — which is every date a JOB can carry and not one a person can be born on. 17722 fell through and was read as the YEAR 17722.",
      "The date reader now covers the whole human span, and no reading of any cell can reach the database as a five-digit year again — a date outside 1900–2100 is refused rather than written.",
      "Two-digit years now work, pivoted at 30: “15/05/80” is 1980 and “15/05/05” is 2005.",
      "A cell holding only a year is refused rather than turned into the 1st of January. A year is not a birthday anybody can be wished, and inventing one would have filled the birthday list with people who were not having one. The upload summary’s date-of-birth count is what shows the gap.",
      "CSV files are now accepted anywhere a spreadsheet is — including a file renamed to .xlsx that is really a CSV. The byte-order mark Excel writes on “CSV UTF-8” export is stripped, so the first column no longer silently stops matching.",
      "Dates in a CSV are read DAY FIRST, as everywhere else in Genie. Left alone the CSV reader converts them itself in American month-first order, which turned 08/07/1948 into 7 August and 01/04/1990 into 4 January.",
      "New: a My IDP tab in Goals, with the person picker working — your own plan plus everyone cascaded below you. It is deliberately empty: what a single IDP line actually is has not been decided yet, and the page says what it is waiting for rather than guessing at a table it would have to be migrated off.",
    ],
  },
  {
    v: "3.0.1.9",
    date: "2026-08-18",
    module: "Goals · Tasking",
    items: [
      "New: Team Goals and Team KPIs, for anyone with people under them. Both tabs are hidden entirely for anyone who has nobody reporting to them — an empty tab reads as a fault rather than as an answer.",
      "Team means EVERYONE below you, walked down the whole line, not just your direct reports. A head of production now sees their supervisors' teams too, with a Direct / +2 / All switch and a chip showing who somebody sits under when they are not yours directly.",
      "Team Goals prints a block per person — INCLUDING the people holding nothing. That is the point of the tab: a team average of 64% looks healthy right up until you notice three of the eleven carry no goal at all, and an average is exactly where that hides.",
      "Team KPIs shows every key result area beneath you with what the goals filed under each one read, and every KPI somebody under you owns. It also counts how many of your people have no KRAs set at all.",
      "The My Key Result Areas dropdown now works for managers, not only admins: your own, plus everyone cascaded below you.",
      "A deliberate change to who can see what: managing somebody now lets you see what they are accountable for, even where a goal is marked Management or Stratcom. It does NOT let you edit it — their goals stay theirs to move. Without this the Team tabs would have shown a manager less than their team actually holds while looking complete, and quietly showing less is the one thing this section cannot do.",
      "Tasking: an All tasks button beside the three Show tick-boxes. Clearing all three has always meant \"show me everything\" — nobody could be expected to guess that, and \"nothing ticked\" looks like \"nothing shown\". Same state, with a name on it, and pressing it again puts the three back.",
    ],
  },
  {
    v: "3.0.1.8",
    date: "2026-08-18",
    module: "Job Delivery Board · Delivered Jobs · Admin",
    items: [
      "New: Required Run Rate, on both the Job Delivery Board and Delivered Jobs. It says what is left to bill, in how many days, and at what rate per month — for Sales Billing and for Throughput.",
      "It answers the question a running total cannot. ₹62 Cr billed against ₹100 Cr is extraordinary in April and a miss in March, so every figure is shown beside the pace the calendar says we should have kept by today: what should have been billed, and how far ahead or behind that leaves us.",
      "The bar carries both — the fill is where we are, the tick is where the pace says we should be. A fill short of the tick is the whole message.",
      "Ahead/behind is coloured against the PACE, not against the target. 40% of a year's target in month five is on track; colouring it red would make the card cry wolf from April.",
      "Targets are whole-year, set in Admin → Targets, and only raghu@nandan.co.in can change them. Every other admin sees them, sees who set them, and cannot edit. FY2026-27 starts at ₹100 Cr sales and ₹40 Cr throughput (migration 0025).",
      "Billed means delivered — a job counts on the day it went out of the door, not the day it was promised, so jobs still on the board are not in these numbers.",
      "Deliveries banked without a delivery date cannot be placed in a financial year. They are counted and named under the card rather than folded into the totals, so a percentage that is short says why it is short.",
      "On 1 April the year rolls over on its own. With no target set for the new year the card says exactly that, rather than carrying the old number forward.",
    ],
  },
  {
    v: "3.0.1.7",
    date: "2026-08-18",
    module: "Tasking · Morning Update",
    items: [
      "Fixed: renaming L2 to Leaders did not touch tasks already raised. The level is stored as the label itself, so every older task still read “L2 — Production Head” and By Escalations showed it as a separate lane. Migration 0024 rewrites them.",
      "New RJ Uploads section on Morning Update, visible only to the owner account. First card: Employee Master, from the HR sheet.",
      "The employee master is read by meaning rather than by exact column names — name, date of birth, joining date, department, designation, location — and everything else the sheet carries is kept as-is, so HR adding a column never needs a code change. The upload says how many carry a date of birth, and lists every column if it cannot find one.",
      "This is what the birthday list will read.",
    ],
  },
  {
    v: "3.0.1.5",
    date: "2026-08-18",
    module: "Sales Genie · Salespeople",
    items: [
      "A salesperson is now a Genie account, not a spelling. Every duplicate is merged: Santosh + Santosh Patra → Santosh, Nitu + Nitu Sharan → Nitu, Raghu + Raghunandan Jagdish → Raghu, Acharya → Acharya, each tied to their nandan.co.in login.",
      "The merge rewrites every deal, company, ToDo, support item, monthly stat and plan line that carried the old spelling — so nobody’s numbers are stranded under a name that no longer appears.",
      "The cause: the app added your display name to the team list whenever it did not match an existing entry. So “Raghu” was seeded, and “Raghunandan Jagdish” appeared the first time he signed in. It now recognises you by email instead, so it cannot happen again.",
      "Adding a salesperson asks which Genie account it is, and refuses a name with no account behind it — or an account already in the list under another name.",
      "A salesperson you added who is not on this list is left exactly as they are.",
    ],
  },
  {
    v: "3.0.1.4",
    date: "2026-08-18",
    module: "Delivered Jobs · OTD",
    items: [
      "OTD % on the card was the wrong definition — it counted how many jobs arrived on time. It now uses Dr Raghu’s formula, averaged over the period: (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100.",
      "The difference matters. A count says two jobs a day late and two a year late are the same result. This says how far off we ran, which is the part that can be improved.",
      "The median is shown next to the mean, because one job 592 days late moves the average several points on its own. Also shown: how many were on time or early, and the worst score in the period.",
      "Hover the ⓘ for the whole formula.",
    ],
  },
  {
    v: "3.0.1.3",
    date: "2026-08-18",
    module: "Tasking · Escalation",
    items: [
      "Escalate a task and it now asks Why escalated? — and will not let the task be raised without it. An escalation without a reason costs the person it lands on a phone call before they can do anything about it.",
      "Who is now typeable as well as pickable. Type a name or initials and the list narrows; the full list of accounts is still one click away. Scrolling a dropdown for a name you already know was the slowest part of raising a task.",
      "Needs migration 0023.",
    ],
  },
  {
    v: "3.0.1.2",
    date: "2026-08-18",
    module: "Admin · Users",
    items: [
      "Admin is now four tabs: Users, Milestones, Settings and Updates.",
      "Initials may be two OR three letters, still unique across everyone. Two had run out, and initials are not decoration — they are the key tasks are assigned by, so a collision is two people sharing a to-do list. Needs migration 0022.",
      "Department and Designation are set per person in Admin → Users. Goals reads both.",
      "“ERP owner name” is now “ERP User” — it is the Planning Owner in Jobmaster, which is the same person as the Project Owner.",
      "Goals access has moved into the Users table as a column. One row per person instead of the same people listed twice in two places.",
      "Last seen shows when each account last signed in, so a login nobody uses is visible.",
      "The Name column stays put while the rest of the table scrolls sideways.",
      "Send a password-reset email to anyone from Admin. The link goes to their own inbox, so nobody has to hand a password to anybody.",
    ],
  },
  {
    v: "3.0.1.1",
    date: "2026-08-18",
    module: "Header · Admin · Goals · Morning Update",
    items: [
      "Dates read dd-mm-yyyy everywhere. One format across the app, the ERP and anything printed, so 03-04-2026 is 3 April wherever you see it.",
      "An impossible date in an upload is corrected rather than dropped or crashed on. 31/11/2024 becomes 30/11/2024 — the last real day of that month — and the upload summary lists every one it moved. Before this, such a date reached the database as “2024-11-31” and would have failed the whole upload on one bad cell.",
      "Departments corrected: Supply Chain is Purchase, Finance is Accounts. Needs migration 0021.",
      "A goal or sub-goal assigned to a department now appears under Departmental Goals whatever tab it was created on — a company goal handed to Production was invisible to Production.",
      "Escalation L2 is now Leaders (was Production Head).",
      "The header shows Last Updated — when the Jobmaster export last landed — instead of a morning-file counter.",
      "Admin, Morning Update and Update to ERP have moved out of the tab bar and into the menu behind your initials, top right. Each is shown only to those entitled to it, so the tab bar is now the same four boards for everyone.",
      "Morning Update counts the files that are actually there, and its daily counter says so explicitly.",
      "Delivered Jobs: the job number is now a column of its own, beside the tag.",
    ],
  },
  {
    v: "3.0.1.0",
    date: "2026-08-18",
    module: "Delivered Jobs",
    items: [
      "Fixed: “12 Months” was showing 13. Counting twelve months back from today lands mid-month, so the window touched thirteen. It now means the last twelve calendar months, ending with this one.",
      "The chosen period says how many days of data it covers, next to the dates.",
      "Months run newest first.",
      "Nos, Value and Throughput each have their own bar in the breakdown table, and each bar carries a median mark — so a month reads as above or below a normal one, not just bigger or smaller than the biggest. Empty months are left out of the median: a month with no deliveries is not a low month.",
      "Two new columns on the jobs table. Delay Days = Actual Delivery Date − OTD Date, negative for early. OTD % = (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100, so a slip is charged against the lead time that was undertaken — 30 days late on a 60-day job scores far worse than 30 days late on a 600-day job. Hover either heading for the formula.",
      "OTD % is left negative rather than floored at zero: a job that overran its whole promised lead time should read −100%, not 0%, or every disaster looks the same.",
      "All table figures are now 12px. They were 10px in places, which does not survive being shown on a screen across a room.",
    ],
  },
  {
    v: "3.0.0.3",
    date: "2026-08-17",
    module: "Delivered Jobs",
    items: [
      "Fixed: the page was reading only 1,000 of the 2,728 delivered jobs. Supabase caps any single request at 1,000 rows and ignores a larger limit, so the ledger was silently cut short — and it looked complete, which is worse. It now pages through the lot.",
      "Throughput reads whichever column the file carries. This export has no “Throughput Expected Value (Auto)”; it has a plain Throughput column worth about 160 Cr across 705 jobs, and that was showing as zero.",
      "New OTD % for the chosen period: jobs delivered on or before the OTD Date promised to the customer, over the jobs delivered in that period that carry a promised date. Hover the ⓘ for the formula in full.",
      "A job with no promised date is not counted as late. It is excluded and reported separately, because a missing date is a record-keeping gap rather than a delivery failure — and only 305 of 2,728 rows carry an OTD Date.",
      "OTD % also says how badly, not just how often: the average days over for the ones that ran late.",
      "The monthly table now runs newest first.",
    ],
  },
  {
    v: "3.0.0.2",
    date: "2026-08-17",
    module: "Morning Update · Delivered Jobs",
    items: [
      "Read the real Delivered Jobs export and fixed what it showed. It is recognised on its own now, without needing the right card — though the card still decides.",
      "It was never detected because it has no “Job Status” column at all: its status lives in a plain “Status” column reading Delivered / Installation Stage. 2,711 of 2,728 rows say Delivered, which would have identified the file instantly. The second test missed it by under five points — “Actual Delivery Date” is filled on 45.3% of rows against a 50% bar, because the history reaches back to 2014 and much of it predates the column.",
      "Four fields were being read from columns this file does not have, and were silently empty: status, owner, target date, and throughput. Status now reads Delivered on 2,711 rows, Planning Owner on 817, and a target date on 1,090.",
      "Throughput would have read zero for every delivery ever made. This export has no “Throughput Expected Value (Auto)” column — it carries a plain “Throughput” column instead, worth about 160 Cr across 705 jobs. Both are now read, whichever the file has.",
      "Planning Owner is the Project Owner under another name, and is now read as the owner.",
      "Delivery history spans 2014 to 2026, so the 12-month averages have real data behind them rather than reading “insufficient history”.",
      "New safety net in the other direction: a delivered upload is refused when most of its rows are jobs currently live on the board. That is the wrong-card mistake that would have made no noise — it would have marked live jobs delivered and turned their plans read-only.",
    ],
  },
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
