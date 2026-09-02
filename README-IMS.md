# Genie IMS — the Integrated Management System

**Route:** `genie.nandan.co.in/ims`
**Shipped:** Genie 4.3.0.0 · 2 Sep 2026
**Lives in:** Genie's own Supabase project — migrations `0111`, `0112`, `0113`
**Standards:** ISO 9001, ISO 14001, ISO 45001, ISO/IEC 27001, AWS D1.1, EN 1090-2 **EXC3** — plus non-ISO schemes (ZED, customer audits).

---

## 1. What it is, and where it lives

**In Genie's own database**, like Seva, HRMS, Kuber and Vishwakarma.

It was first built as a separate fork with its own Supabase project — *"IMS separate fork. Build."* — and then moved on Dr Raghu's second instruction the same day: *"no need to create supabase. Put it in the genie."* That was the right call. The CRM's separate project is the **exception**, not the pattern, and a seventh module with its own keys, its own migration folder and its own backup would be a seventh thing to keep in step for no gain.

| | Genie core | CRM | **IMS** |
|---|---|---|---|
| Supabase project | Genie's | CRM's own | **Genie's** |
| Migrations | `supabase/migrations/` | `supabase-crm/migrations/` | **`supabase/migrations/` (0111–0113)** |
| Server code | `src/lib/`, `src/app/` | `src/crm/` | **`src/ims/`** |
| Screens | `src/components/` | `src/components/crm/` | **`src/components/ims/`** |

Because it is one database, **a person is a person**: every owner column is `public.profiles(id)`, Genie's own account id. There is no mirror table, no second user list and no second uuid for the same human — which is exactly the problem `docs/DATABASE-SPLIT.md` exists to warn about for the CRM, and which simply does not arise here.

---

## 2. Setting it up

No new project. Three migrations and one optional line.

1. Run, in order, in **Genie's** SQL editor:
   - `supabase/migrations/0111_ims_door.sql` — the door and the roles
   - `supabase/migrations/0112_ims_core.sql` — the 39 tables, numbering, buckets, RLS
   - `supabase/migrations/0113_ims_seed.sql` — standards, clauses, registers, journey

2. Optional, for the expiry alerts:
   ```
   IMS_MAIL_FROM=ims@nandan.co.in
   ```

3. Tick **IMS** for each person on Admin → module access. The owner is implicit.

4. Set their roles in **IMS → Settings**. The tick lets somebody in as a `member`; the MR promotes.

Until step 1 is done, `/ims` opens and names the migration that is missing. It never shows a blank screen or a 500.

---

## 3. Security model — read this before changing a route

**Every IMS table has RLS on and FORCED, with no policies at all.**

This matters *more* now that the IMS shares Genie's database than it did in a fork. Genie hands every signed-in person an anon-key session, and PostgREST will serve any table that has no policy stopping it. An IMS table left open would therefore be readable **straight out of the browser by any Genie account** — draft procedures, the storage paths of the copyrighted standards, all of it.

So:

- anon and authenticated keys see **nothing**;
- the only way in is the **service key**, held by `src/ims/db.ts`;
- it is used **only after** `src/ims/auth.ts` has established who is asking and what their role is.

`node scripts/ims-rls-test.mjs` is what proves that claim rather than asserting it.

**One row answers both questions.** `ims_access` is the door *and* the role:

| Column | Question |
|---|---|
| the row existing | May this account open `/ims` at all? |
| `role`, `department` | What may they do once inside? |

Two tables for one question is how they end up disagreeing. The Admin tick creates the row as a **`member`** — the least somebody could be — and the MR promotes in IMS → Settings. A door grant is not a role. The owner is implicitly `ims_admin` and has **no row**: a row that could be edited is a row that could lock the module's only administrator out of it.

### Roles

| Role | Rights |
|---|---|
| `ims_admin` (MR) | Everything: define registers, approve revisions, delete, make obsolete, set roles |
| `dept_head` | Creates and edits documents, reviews their **own** department's, writes registers and the vault |
| `auditor` | Reads everything including drafts (they must); plans audits (Phase 2) |
| `member` | Reads **approved** documents only; records register entries; works their own tasks |

A `dept_head` with **no department set** can approve nothing — the route matches their department against the document's, and an empty one matches nothing rather than everything.

Every check is server-side, on **every route**. A hidden button is not a gate — someone with the URL reaches the route regardless.

---

## 4. Numbering

Two mechanisms, both issued by the database:

**Controlled documents** — `NGSE-{SYS}-{TYPE}-{NNN}`, e.g. `NGSE-QMS-PRO-012`.
A `before insert` trigger on `ims_document` calls `ims_next_doc_no(sys, doc_type)`, which takes a `FOR UPDATE` lock on the `(sys, doc_type)` row in `ims_doc_series`. Two concurrent creates **queue**; they cannot both get 012. A `doc_no` supplied by the caller is ignored.

**Everything else** (NCs, audits, CAPAs, kaizen) — `ims_next_number(code)` against `ims_number_series`, financial-year aware in IST, carried across unchanged from the CRM so the two databases number things the same way.

- `SYS`: `QMS` | `EMS` | `OHS` | `ISMS` | `IMS` | `WLD`
- `TYPE`: `MAN` | `PRO` | `WI` | `FRM` | `CHK` | `PLN`

---

## 5. Adding a register — no code required

This is the point of the register engine. Risk, HIRA, Aspect–Impact, Legal and the SoA ship seeded; PPE issue, work permits, mock drills, hazardous waste and the statutory equipment tests are the *same form*.

1. **Registers → + New register.** Name it, pick its system, describe it. It starts with one column.
2. **Columns.** Add each field: a `key` (stored), a `label` (shown), and a type —
   `text` · `number` · `date` · `select` (with options) · `bool` · `user` · `file`.
   Tick *Required* where an empty value would make the row useless.
3. Save. The table, the form and the validation all follow the definition.

Two rules the engine enforces:

- A value whose key is **not** in `columns` is **dropped**, never stored. A JSONB blob that accepts anything is a blob nobody can report on a year later.
- A **system** register (`is_system = true`) can have its columns edited but **cannot be deleted**. An auditor asking for the HIRA must never be told somebody removed it.

Renaming a column's `key` orphans what is already stored under the old key. Change the *label* freely; change the *key* only on an empty register.

---

## 6. The document lifecycle

```
Draft ──submit──▶ In review ──review (dept head)──▶ ──approve (MR)──▶ Approved (current)
                                                                          │
                                              new_revision ◀──────────────┤
                                                                          ▼
                                                                     Obsolete
```

- **Approval mode** is a row in `ims_settings` (`two_step` | `single`), so it flips without a deploy.
  In `two_step` the MR cannot approve until a department head has reviewed — the server refuses, it is not a hidden button.
- The **MR always approves**, in either mode. A head who reviewed *and* approved their own department's procedure is one signature wearing two hats, which is the first thing an auditor tests.
- An **approved revision is never edited.** The route refuses. It is superseded by a new revision — otherwise the approval signature ends up standing over text nobody approved.
- Nothing is deleted. A document that was never issued may be removed; an issued one is made **obsolete** and kept.
- **Print** puts `doc_no · Rev NN · Effective date` in the footer of every page, and stamps anything not currently approved **NOT A CONTROLLED COPY**.

---

## 7. The daily expiry scan

`GET /api/cron/ims-expiry` — 01:30 UTC (07:00 IST), from `vercel.json`.

Certificates and statutory licences are **one table**, because they are one problem. At **90, 60, 30 and 7** days out — and again every day once past — the scan raises a task on the renewal owner and mails them.

**Dedupe** is what makes it usable. Each task carries `source_type` + `source_id` + `source_key` (the threshold), and a **partial unique index on those three, for open tasks only**, means:

- a second run the same day cannot raise a second 90-day task;
- 90 and 60 are *different* keys, so the 60-day warning still arrives while the 90-day task sits open — and that open task is the evidence that nobody acted.

Mail never blocks the task. A cert alert that failed to post is a bad day; a scan that aborted half-way through, leaving the rest unraised, is worse. `mailProblems` in the response names every one that did not go.

With no renewal owner named, the alert goes to the MR — because *nobody owns this* is itself the finding.

---

## 8. Storage

Four buckets, **all private**, all served by short-lived signed URLs issued after the role check:

All four are in Genie's storage, alongside `job-photos` and `task-files`.

| Bucket | Holds | Who may read |
|---|---|---|
| `ims-standards` | **purchased copies of the standards** | MR + dept heads only |
| `ims-certificates` | certificates, licences | anybody admitted |
| `ims-documents` | legacy Rev 00 PDFs | anybody admitted |
| `ims-evidence` | checklist run evidence (Phase 2) | anybody admitted |

`ims-standards` matters most: those are copyrighted documents, and a public link is a licence breach, not an inconvenience.

---

## 9. What is built, and what is schema-only

**Built (Phase 1):** Dashboard · Certification Journey (with implementation paths and task spawning) · Certificates & Statutory · Controlled Documents · Registers (engine + 5 seeded) · Standards & clause browser · My Tasks · Calendar · roles · the expiry cron.

**Schema exists, no UI yet:** NC → RCA → CAPA · feedback · objectives & readings · kaizen · audit plan / audit / findings · management review · clause evidence notes · training requirement & record · the checklist engine (`core_checklist_*`) · the whole welding set (`ims_wpqr`, `ims_wps`, `ims_welder_qual`, `ims_weld_log`).

Nothing built later has to migrate data out of a spreadsheet.

---

## 10. Divergences from the build instruction

All taken under its own §7 — *"if the existing repo's tenant/auth pattern differs, follow the repo."*

1. **No `tenant_id`.** Nandan GSE is one company and every Genie table is single-tenant. A column that is the same value on every row is a column that gets forgotten in a `WHERE` and trusted anyway.
2. **`profiles(id)`, not a mirror table.** The spec's `auth.users(id)` FKs are honoured one step removed: `public.profiles.id` *is* the `auth.users` id, and it is what every other Genie module names a person by. One person, one id.
3. **`public` schema with `ims_` / `core_` prefixes**, not `ims` and `core` Postgres schemas. PostgREST only serves schemas exposed in the project's API settings, and a migration cannot set that. Prefixes give the same separation with nothing to configure by hand — and they match how every other Genie module already names its tables.
4. **RLS with no policies + a code gate**, not `ims.has_role()` policies. Policies that had to express "a member sees only approved revisions" would duplicate, in SQL, a rule the route already enforces — and the two would drift. Forcing RLS shut and putting the rule in one readable place is the stronger arrangement, and §3 explains why it is also the safer one here.
5. **`ims_audit_log`, not `ims_audit`.** The build instruction used `ims.audit` for the internal-audit instance; the write log needed a different name or `create table if not exists` would silently skip the second one.
6. **Vercel cron, not `pg_cron`.** Every other Genie scheduled job is a Vercel cron with `CRON_SECRET`, and one scheduler is better than two.
7. **No TipTap.** The schema keeps `body jsonb` for it; this pass stores HTML in `body_html` and edits it as text, with PDF upload for the legacy Rev 00 ports. Adding an editor dependency to a first pass is how a first pass stops being shippable.
8. **Certification schemes seeded as `target`, not `achieved`.** Marking something achieved that no uploaded certificate backs is precisely what an auditor looks for. Dr Raghu marks each one as its certificate goes into the Vault.
9. **Palette is Genie's own** (`src/components/crm/palette.ts`) rather than the instruction's Navy `#1B2A5E` / Orange `#E8622A`. Those are within three hex digits of what every other module uses, and two navies that are almost the same is worse than one navy that is exactly the same.

---

## 11. Verifying it

```bash
node scripts/check-migrations.mjs        # every migration probed, one honest line each
node scripts/ims-rls-test.mjs            # the three-role RLS + numbering check
```

`ims-rls-test.mjs` proves, against Genie's live project:

- the **anon key sees nothing** — RLS forced, no policies. This is the important one: a signed-in Genie account holds that key;
- **two concurrent document creates yield distinct sequential numbers**;
- the seed is complete (6 standards, 306 clauses, 93 SoA rows, 5 registers).

The role rules a *member* is held to — no draft documents, no standard copy, no editing a system register definition — are enforced in the route handlers, so they are tested by calling `/api/ims/*` as that person, not by querying the database.
