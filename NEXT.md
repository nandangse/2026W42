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

## Notes that cost time to learn

