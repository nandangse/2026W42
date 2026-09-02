# Genie IMS — the Integrated Management System

**Route:** `genie.nandan.co.in/ims`
**Shipped:** Genie 4.3.0.0 · 2 Sep 2026
**Standards:** ISO 9001, ISO 14001, ISO 45001, ISO/IEC 27001, AWS D1.1, EN 1090-2 **EXC3** — plus non-ISO schemes (ZED, customer audits).

---

## 1. What it is, and where it lives

A **separate fork**, exactly as the CRM is (Dr Raghu, 2 Sep 2026: *"IMS separate fork. Build."*).

| | Genie | CRM | **IMS** |
|---|---|---|---|
| Supabase project | Genie's | CRM's own | **its own** |
| Migrations | `supabase/migrations/` | `supabase-crm/migrations/` | **`supabase-ims/migrations/`** |
| Server code | `src/lib/`, `src/app/` | `src/crm/` | **`src/ims/`** |
| Screens | `src/components/` | `src/components/crm/` | **`src/components/ims/`** |

Nothing in the IMS database can see a Genie table and nothing in Genie can see an IMS one. That separation is enforced by them being **different databases**, not by a naming convention.

The **door** is the one thing that lives in Genie's database (`ims_access`, migration `0111`), because that is where the Admin screen that makes the grant lives.

---

## 2. Setting it up

1. Create a new Supabase project (Mumbai), then put its URL and **service role** key in the environment:

   ```
   IMS_SUPABASE_URL=https://YOUR-IMS-PROJECT.supabase.co
   IMS_SUPABASE_SERVICE_KEY=...
   IMS_MAIL_FROM=ims@nandan.co.in
   ```

2. Run, in order, in that project's SQL editor:
   - `supabase-ims/migrations/0001_core.sql`
   - `supabase-ims/migrations/0002_seed.sql`

3. Run in **Genie's** project:
   - `supabase/migrations/0111_ims_door.sql`

4. Tick **IMS** for each person on Admin → module access. The owner is implicit.

Until step 1 and 2 are done, `/ims` opens and says exactly which step is missing. It never shows a blank screen or a 500.

---

## 3. Security model — read this before changing a route

The IMS database **cannot validate a Genie session**; it never signed the token. So:

- **RLS is on and FORCED on every table, with no policies at all.** The anon and authenticated keys see nothing whatsoever.
- The only way in is the **service key**, held by `src/ims/db.ts`.
- It is used **only after** `src/ims/auth.ts` has established who is asking.

**Two gates, and they are different questions:**

| Gate | Where | Question |
|---|---|---|
| The door | `ims_access` in **Genie's** DB | May this account open `/ims` at all? |
| The role | `ims_profile` in the **IMS** DB | What may they do once inside? |

Somebody admitted through the door with no profile row is created as a **`member`** — the least they could be. A door grant is not a role.

### Roles

| Role | Rights |
|---|---|
| `ims_admin` (MR) | Everything: define registers, approve revisions, delete, make obsolete |
| `dept_head` | Creates and edits documents, reviews their **own** department's, writes registers and the vault |
| `auditor` | Reads everything including drafts (they must); plans audits (Phase 2) |
| `member` | Reads **approved** documents only; records register entries; works their own tasks |

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

1. **No `tenant_id`.** Nandan GSE is one company and every other Genie database is single-tenant. A column that is the same value on every row is a column that gets forgotten in a `WHERE` and trusted anyway.
2. **No `references auth.users(id)`.** Auth lives in *Genie's* project. Those FKs would not resolve. The bridge is the **email**; every column naming a person takes `ims_profile.id`, which is this database's own uuid.
3. **`public` schema with `ims_` / `core_` prefixes**, not `ims` and `core` Postgres schemas. PostgREST only serves schemas exposed in the project's API settings, and a migration cannot set that. Prefixes give the same separation with nothing to configure by hand.
4. **RLS with no policies + a code gate**, not `ims.has_role()` policies — for the reason in §3 above. This is the CRM's model, and `docs/DATABASE-SPLIT.md` is the standing argument for it.
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

`ims-rls-test.mjs` proves, against the live IMS project:

- the **anon key sees nothing** — RLS forced, no policies;
- **two concurrent document creates yield distinct sequential numbers**;
- the seed is complete (6 standards, 306 clauses, 93 SoA rows, 5 registers).

The role rules a *member* is held to — no draft documents, no standard copy, no editing a system register definition — are enforced in the route handlers, so they are tested by calling `/api/ims/*` as that person, not by querying the database.
