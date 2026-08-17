# Genie — outstanding work, with the decisions already made

State: `main` @ 3.1.0.0. Migrations 0021–0025 are run on the database.
**0026 and 0027 are NOT run yet** — until it is, the money columns are read from the file
but not stored (the upload says so and falls back to the old `apply_jobs`), and
the Genie hint keeps regenerating per person. 0027 creates the whole LMS —
without it the LMS section shows an install notice and nothing else.

Done: **1 (run rate)**, **5 (All Tasks)**, **2 apart from My IDP**, the Employee
Master upload, and the 3.0.1.11 batch below.
Left: **My IDP** (blocked on what an IDP holds), **3 My Week**, **4 Calendar**.

## ⚠ Genie Hint needs a key, not a code change

`ANTHROPIC_API_KEY` is **not set in the Vercel project**, and not in `.env.local`
either. Nothing in the route is broken. Add it under the Vercel project's
Environment Variables (and locally if you want it in dev), redeploy, and the
panel works. It is the same key Eva and deal scoring use.

## ⚠ The four money columns are matched by GUESS until confirmed

Nobody recorded what the Jobmaster calls them, so `EXTRA_JOB_FIELDS` in
`src/lib/parse-upload.ts` matches by meaning across ~16 spellings each. **The
upload summary names the header each one bound to** — read it after the next
Jobmaster upload. If a field says "no column matched", the summary prints the
sheet's full column list; paste the right header into the pattern.

Paste migrations ONE file at a time, ASCII-only, comments stripped — a long paste
truncates in transport and Postgres then fails on a half-statement. Use
`scratchpad/split-sql.mjs` (see git history) or keep each under ~2 KB.

---

## 1. Targets and Required Run Rate  ✅ DONE in 3.0.1.8

Built as specified: FY-wide targets, owner-only editing, the card on both the Job
Delivery Board and Delivered Jobs.

    supabase/migrations/0025_fy_targets.sql   ← NOT YET SENT to Dr Raghu
    src/lib/run-rate.ts                       the arithmetic, pure
    src/app/api/run-rate/route.ts             GET targets+actuals · POST owner-only
    src/components/RunRate.tsx                the shared card
    PlanningSuite.tsx                         Admin → Targets form

**Until 0025 is run the card hides itself** — `/api/run-rate` returns
`installed:false` rather than an error, so neither board breaks. Admin → Targets
is what tells you it hasn't been run; it names the file.

Notes for whoever touches it next:

- The target is what we *said* (`fy_targets`); the actual is what *went out of the
  door* (`delivered_jobs`). Jobs on the board are neither. Billing is dated on
  delivery, so a delivery banked without a date is missing from the totals — the
  card counts those and says so under the figures rather than folding them in.
- Ahead/behind is coloured against the **pace**, not the target. 40% of the year's
  target in month five is on track; colouring it red would make the card cry wolf
  from April. Amber at 95% of pace, red below.
- The FY rolls over on its own — `runRate()` derives it from today's date. With no
  row for the new year the card says "no target set" instead of carrying the old
  one forward. Someone has to add the FY2027-28 row on 1 April 2027.
- Targets are typed in **crore** in Admin and stored in **rupees**, like every
  other value in the suite.
- Straight-line pace only. If a month-by-month plan ever gets set, `expected` in
  `src/lib/run-rate.ts` is the one line that changes.

## 0. LMS ✅ NEW in 3.1.0.0 — needs content

Built and empty. An intern fills it: **Library** tab → write lessons → tick the
books each belongs in. The fifteen books are seeded by 0027; sections are added
per book from inside the book.

    supabase/migrations/0027_lms.sql   ← NOT SENT
    src/lib/lms.ts                     word floor, totals, video parsing
    src/app/api/lms/route.ts           library + everyone's record
    src/app/api/lms/plan/route.ts      Genie writes the learning plan
    src/components/LMS.tsx             the section
    src/components/LmsVideo.tsx        the stripped-down YouTube player
    src/components/LmsText.tsx         markdown -> elements, never raw HTML

The rules that must not be softened, and why:

- **Fifty words or it is not complete.** Enforced in the API, not just the UI.
  A tick is attendance; the words are the learning, and the words are what the
  IDP is made of.
- **Planned time is not time.** Only completed lessons add to a total.
- **A lesson is authored once** and shelved into many books. Never copy one.
- **Genie can only recommend lessons that exist** — every id it returns is
  checked against the library and anything invented is dropped and counted.

The learning plan needs `ANTHROPIC_API_KEY` (see above). Everything else in LMS
works without it.

## 2. Goals — Team Goals ✅, Team KPIs ✅, My IDP ⏳

Done in 3.0.1.9: **Team Goals** and **Team KPIs**. No migration needed.

    src/lib/team.ts            the recursive reports_to walk — SHARED, use it
    goals-v2.ts                TABS + TEAM_TABS + the team clause in bandVisible
    goals-v2-tree.ts           walks the team, widens KRAs, ships payload.team
    GoalsWorkspace.tsx         TeamGoalsTab, TeamKpisTab, wider KRA picker

`teamOf()` is breadth-first, cycle-safe, and excludes the root. Tested against a
three-level org, a reports-to cycle and a self-report. **Tasking's "people
reporting to me" filter still uses DIRECT reports only** (`board.ts`) — moving it
onto `teamOf()` is a one-line change, but it silently widens an existing filter,
so it wants Dr Raghu's word first.

⚠️ **A visibility rule changed.** Managing somebody now lets you SEE their goals,
KRAs and KPIs even when band-restricted (Management / Stratcom / LC) — not edit
them. Without it the Team tabs would show a manager less than their team holds
while looking complete. It is one clause in `bandVisible()` and one line in the
KRA filter if it has to come out.

### Still outstanding: My IDP — the tab exists, empty on purpose

`IdpTab` in `GoalsWorkspace.tsx`. The person picker is live and walks the whole
cascade; there is nothing to put in it yet, and the page says so.

**Half of it now exists.** LMS records the learning side — lessons completed,
time, and what each person wrote — and the IDP tab reads those totals live. What
is still undecided is the rest of a development plan. Before writing a table,
get from Dr Raghu:

- what a single IDP line IS — a skill? a course? a competency with a rating now
  and a rating wanted? a development action with a date?
- who writes it — the person, their manager, or both
- whether it is reviewed on a cycle (annual? quarterly?) and whether last cycle's
  plan is kept
- whether it rolls up to anything, or is purely a conversation record

The plumbing it needs already exists: `payload.team` carries the cascade, and
`src/lib/team.ts` has the dropdown helper (`meAndTeam`).

`profiles.department_id` and `designation` are populated from Admin → Users as of
3.0.1.2, and both are now on the Goals payload.

## 3. My Week — the first screen anyone sees

- **Quote of the Day** — component already exists (`QuoteOfDay.tsx`), just not on
  this page.
- **Genie Message** — per person, per day. Ideas discussed: their overdue count, a
  job of theirs delivering this week, their OTD trend, a goal metric untouched for
  a fortnight. "Surprise me" — worth designing properly, not templating.
- **Product of the Day** — one image from
  `https://drive.google.com/drive/folders/1IeVekRB62eVWZSx9Fqy3DIzAhhqbOplo`.
  **BLOCKED:** that folder needs auth I do not have. Either commit the images to
  the repo or make the folder public.
- **Happy Birthdays, next 30 days** — reads `public.employees.dob` (0024). The
  upload exists; the UI does not.
- **Owner column reads "—"** because `erp_owner` is unset on most accounts. Show
  the **Planning Owner's initials**; Admin → Users can now fill the field.
- **"Last Updated by"** in the header — who ran the upload, beside the timestamp.
- **Delay column** in the My Week job table.

## 4. Calendar — the big one

In the Planning Suite calendar view:
- **drag and drop a task to change its due date**
- **two lines of text** visible on each chip (currently truncated to one)
- **clicking a task shows every date change made to it so far** — needs a new
  table logging (task, old date, new date, who, when). Nothing records this today;
  `push_count` on goals is the nearest precedent.

## 5. Tasking  ✅ DONE in 3.0.1.9

**"All Tasks"** button beside the three Show tick-boxes. Clearing all three has
always meant "show everything"; the button is that state with a name on it, and
toggles back to the three.

---

## Notes that cost time to learn

- **Excel date serials are not all 40000-ish.** The reader's old window was
  40000–60000, which is every date a job can carry and none a person can be born
  on — a 1948 birthday is serial 17722. It fell through to `new Date("17722")`,
  which JavaScript reads as the YEAR 17722, and `toISOString()` prints that as
  `+017722-01-01`. Fixed in 3.0.1.10; `ser2iso` now refuses anything outside
  1900–2100 rather than writing it.
- **A CSV read by SheetJS gets dates AMERICAN.** `08/07/1948` comes back as
  7 August unless you pass `raw: true` and parse the strings yourself. Genie is
  dd-mm-yyyy everywhere, so `applyUpload` reads text tables with `raw: true`.

- `next dev` never finishes compiling on this Google Drive mount. Verify with
  `node node_modules/next/dist/bin/next build`. `.bin` shims are not executable —
  call node entry points directly.
- Supabase caps any request at 1000 rows and **ignores a larger `.limit()`**. Page
  explicitly. This silently truncated the delivered ledger and looked complete.
- `esc` and similar are stored as their **display label**, so renaming an option in
  code does not touch existing rows. Always ship a data migration with a rename.
- The two Jobmaster exports carry different column names for the same things
  (`Job Status` vs `Status`, `Project Owner` vs `Planning Owner`, throughput in
  `tpv` vs `tp`). Match by meaning and report what was matched.
- Departments: Dr Raghu said leave the current list as is — he will delete/add.
