# Genie — outstanding work, with the decisions already made

State at handover: `main` @ 3.0.1.7. Migrations 0021–0024 written; **0021/0022/0023
sent to Dr Raghu, 0024 not yet sent**. Nothing below is started unless it says so.

Paste migrations ONE file at a time, ASCII-only, comments stripped — a long paste
truncates in transport and Postgres then fails on a half-statement. Use
`scratchpad/split-sql.mjs` (see git history) or keep each under ~2 KB.

---

## 1. Targets and Required Run Rate  ← do this first

**Decided by Dr Raghu:** targets are **FY-wide, this financial year**. **Editable by
raghu@nandan.co.in only**; everyone else sees them as fixed.

    Sales target       ₹100 Cr
    Throughput target  ₹40 Cr

Needs a migration (`fy_target` table or two rows on `app_settings`: period, sales
target, throughput target, updated_by).

Show on **both** the Job Delivery Board and Delivered Jobs:

    Required Run Rate
    Sales Billing: ₹x in y days (₹M Cr per month)
    Throughput:    ₹a in b days (₹N Cr per month)

And YTD as a % **against days elapsed in the FY**, plus what *should* have been
billed by today — i.e. `target × (days elapsed ÷ 365)` — so ahead/behind is
visible rather than just a total. `src/lib/delivered.ts` already has `fyStart`,
`dayCount` and the totals; this is mostly a new card plus one admin form.

## 2. Goals — My IDP, Team Goals, Team KPIs

Three new tabs in `GoalsWorkspace.tsx` (`TABS` in `src/lib/goals-v2.ts`).

- **Team** = everyone below you in `profiles.reports_to`, walked **recursively**,
  not just direct reports. Write that walk once and share it.
- **Team Goals** — the cascade of goals assigned to anyone in your team.
- **Team KPIs** — same for `kpi`, so a manager sees every KRA and KPI beneath them.
- **My IDP** — a new concept. Individual Development Plan per person; the dropdown
  lists your own plus everyone cascaded below you, "a great way to check up on the
  IDP". Needs its own table.

`profiles.department_id` and `designation` are populated from Admin → Users as of
3.0.1.2, so the grouping data exists.

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

## 5. Tasking

- **"All Tasks"** button beside the three Show tick-boxes.

---

## Notes that cost time to learn

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
