# Genie — outstanding work, with the decisions already made

State: `main` @ 3.4.0.7. **Migrations 0021–0033 are all run.** The Anthropic key
is set. The Jobmaster reads Planning Owner, all five money columns and the
escalation. 364 employees, 168 image quotes, 15 LMS books, 5 lessons.

Verify any of that in five seconds:

    node scratchpad/audit-migrations.mjs    # every migration, probed
    node scratchpad/check-install.mjs       # + the Anthropic key
    node scratchpad/split-sql.mjs <file>    # a migration, cut for pasting
    node scratchpad/write-parts.mjs <file>  # ...as files, safer to copy

---

## What is actually left

**1. My IDP** — the tab exists and is empty on purpose. LMS already supplies the
learning half and the IDP tab reads it live. What an IDP LINE is has never been
decided, and each answer is a different table. Ask Dr Raghu:

- is a line a skill, a competency rated now-and-wanted, a course, or a dated
  action?
- who writes it — the person, their manager, or both?
- is it reviewed on a cycle, and is last cycle's kept?
- does it roll up to anything, or is it purely a record of a conversation?

**2. Genie Message on My Week** — a per-person, per-day line. Never started.
"Surprise me" was the brief: their overdue count, a job of theirs delivering
this week, their OTD trend, a goal metric untouched for a fortnight. Worth
designing rather than templating.

**3. "Last Updated by" in the header** — who ran the upload, beside the
timestamp. `import_batches.uploaded_by` already holds it; it is simply not on
screen.

**4. Delay column in the My Week job table** — asked for in the first handover,
never built.

**5. The Planning Suite's own calendar** (Job Delivery Board → 📅 Calendar) has
NOT had the drag-and-drop, two-line chips and category colours. Tasking's
calendar has. `taskLate()` and `catColour()` are shared and ready to reuse.

**6. Tasking's "people reporting to me" filter still uses DIRECT reports.**
Moving it onto `teamOf()` is one line, but it silently widens an existing
filter, so it wants Dr Raghu's word first.

---

## The next body of work (given 18 Aug 2026)

Seven items. They are not the same size, and three of them overlap things that
already exist — which changes what each costs.

### 7. Push to ERP  ← the cheapest real win, and the one with a dependency

**The ERP is Frappe/ERPNext.** Its URLs give it away: `/app/jobmaster/<id>`,
`/app/todo/`, `/desk/`, `view/report/...`. `todo` and `project` are stock
doctypes; `jobmaster` is custom.

That means it has a REST API — `PUT /api/resource/Jobmaster/<name>` with an
`Authorization: token <key>:<secret>` header. So the `erp_update` queue built
in 0031 can stop being a CSV somebody retypes and start being a button.

**Blocked on two things, both Dr Raghu's:**

- an API key and secret from the ERP for a user with write access to Jobmaster
  (Frappe: User → API Access → Generate Keys). It goes in Vercel as
  `ERP_API_KEY` / `ERP_API_SECRET`, never in the repo.
- which fields Genie may write WITHOUT asking. Writing a date is not the same
  risk as writing a status, and a one-way sync that silently loses an argument
  between two systems is worse than the CSV.

Everything else is done: the queue knows the job id, the field, the ERP's own
label for it, the old value and the new one.

### 1 + 3. SOPs / Way of Working, and the Integrated Quality Manual

**These are probably LMS, not a new module.** An SOP is a document that people
must read, be trained on, and acknowledge — which is books → sections →
lessons, per-person progress, and the fifty-word completion rule, all of which
exist. What LMS does NOT have yet, and an SOP needs:

- a **version** on a lesson, and "you acknowledged v2, the current one is v3"
- **who must read it** — by department or designation, not by choosing
- an **acknowledgement** that is a signature rather than a lesson completion
- **review dates** — an SOP unreviewed for two years is a finding in an audit

Decide before building: is an SOP a kind of lesson (extend LMS), or its own
thing that happens to be taught (new tables, and the training link is a join)?
The first is a fortnight less work and one place to look.

### 2. Quality Process built in

The vaguest of the seven and needs scoping before anything is written. What
exists to hang it on: milestones per job, Material Kitting with a QC Defective
state, and tasks with categories and escalation. Questions:

- is this **inspection gates on milestones** — a milestone that cannot be
  ticked until QC signs it?
- is it **NCRs** — raise, assign, close, with a cause?
- is it **incoming** (the kitting QC we already have), **in-process**, or
  **final**, or all three?

### 4. IDP — unchanged, still blocked on a definition

See the four questions above. LMS already supplies the learning half.

### 5. Sales Quotation

Sales Genie exists but is a separate HTML app under `src/sales-plan/`, not part
of the React suite. Decide first: does a quotation live inside Sales Genie, or
is it a new section of Genie proper? Then: what is on a quotation, who approves
it, does it become a job when won, and does the ERP already hold quotations
(Frappe has a stock `Quotation` doctype — worth checking before building one).

### 6. Design Verification System

Undefined. Likely drawing/design checks before release — who verifies, against
what, and what cannot proceed until they have. The Design Training book exists
in LMS; `2610 · BOM and MFG drawings release` is already a task category people
use, so the work is being tracked informally today. Worth watching how, before
designing around it.

## Notes that cost time to learn

