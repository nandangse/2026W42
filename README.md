# Nandan Works Planning Suite — Standalone (v2.0)

Standalone, Excel-fed planning app. **No ERPNext connection** — the only data
source is the three morning Excel exports (Jobs / Projects / ToDo) or the full
PRE workbook. Mirrors the intern-portal stack: **Next.js 14 (App Router) on
Vercel + Supabase (Postgres + Auth)**, domain `planning.nandan.co.in`.

Implements the standalone spec (`Nandan_Works_Planning_Standalone_Spec.md`,
v2.0), which supersedes the Frappe-integrated v1.0 in full.

---

## What's here

```
supabase/migrations/   0001…0007  — schema, RLS, mgmt-guard trigger, upload RPCs
src/lib/               parse-upload.ts (ported verbatim), templates.ts,
                       schedule.ts, upload-merge.ts, board.ts, auth.ts,
                       supabase/{server,admin,browser}.ts
src/app/api/…          board · upload · plan · milestone/toggle · baseline ·
                       tasks · comments · materials · priority · templates ·
                       job-field · admin/users · upload-status · me
src/app/               login page, role-routed home, layout, globals
src/components/        PlanningSuite (5 tabs) + MorningUpload (uploader view)
scripts/               seed.ts, acceptance-test.ts (spec §10)
```

The Excel parser (`parse-upload.ts`) is a **verbatim TypeScript port** of the
V1.9 `parseUpload` / `linkTasks` / `ser2iso` — battle-tested against the real
105/106-job exports, header quirks, and image-markdown in notes.

---

## Deploy

### 1. Supabase project (company email)

Run the migrations **strictly in order**; stop on any error and repair before
continuing. Using the Supabase SQL editor or CLI:

```bash
# with the Supabase CLI, linked to your project:
supabase db push        # applies supabase/migrations/0001…0007 in order
```

or paste each `supabase/migrations/000N_*.sql` file into the SQL editor in order.

### 2. Environment

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, RAGHU_EMAIL
```

`.env.local` and any service-role key are git-ignored (spec §0.6) — never commit them.

### 3. Seed

```bash
npm install
npm run seed
```

Creates the users (raghu + medhansh = admin, priya = planner, shweta = uploader;
default password `nandan100`, override with `SEED_PASSWORD`), the four family
milestone templates, and the settings row. Idempotent — safe to re-run.

### 4. Vercel

Private GitHub repo → Vercel → set the same env vars (service key **server-only**,
never `NEXT_PUBLIC_`) → deploy → attach `planning.nandan.co.in` DNS.

### 5. Smoke test

Log in as each role. **Shweta's account must land on the Morning Update page
only** — she reads no tables directly; her status view is served by the
service-role `/api/upload-status` endpoint.

---

## Acceptance test (spec §10)

```bash
npm run test:acceptance      # ⚠ run against a SCRATCH/TEST Supabase project
```

Proves the zero-data-loss contract end-to-end: seed plan + baseline + manual
task + comment + priority → apply a jobs upload where one job is new and one is
missing → asserts the new job is present, the missing job is `active=false` with
its plan reachable, every planning artifact is byte-identical, and re-uploading
the same file changes nothing. Plus: the kitting aggregate equals an independent
recompute of `Σ v(1−T)K ÷ Σ v(1−T)`, and a non-raghu Management-Target-Date
write is blocked.

> It runs a full jobs upload, which archives every active job not in the test
> file — hence a scratch project, not production.

---

## Key invariants (from the spec)

- **Standalone.** Data enters ONLY via `POST /api/upload`. ERP hyperlinks open
  in the browser; the app never calls the ERP.
- **Zero data loss (§6).** Uploads refresh ERP-derived tables only
  (`jobs`, `projects`, `erp_tasks`, `import_batches`). The planning layer
  (`plans`, `milestones`, `baseline_milestones`, `manual_tasks`,
  `task_comments`, `materials`, `family_templates`, `settings`) is app-owned and
  survives every upload untouched. Jobs are **archived, never deleted**.
- **Kitting formula is fixed (§0.4):** per job `material_value = val×(1−tpp/100)`,
  `kitted_value = material_value×kit/100`; board `kitting % = Σ kitted ÷ Σ
  material`, from the ERP `Kitting percentage` column. Never from checklists.
- **Management Target Date (§0.5)** is editable only by `raghu@nandan.co.in` —
  enforced server-side in `/api/job-field` **and** by the `jobs_mgmt_guard`
  Postgres trigger (RLS half), since that route uses the user-scoped client.
- **RLS.** Board reads + planning writes go through the user-scoped Supabase
  client, so policies are the real access contract. The service role is used
  only where it must be: the upload merge, admin user management, and the
  scripts.

### Column-name note

A few spec column names collide with SQL / PostgREST reserved words. They are
stored under safe names and mapped back in TypeScript:

| spec           | column        |
| -------------- | ------------- |
| `plans.start`  | `start_date`  |
| `milestones.offset` | `offset_days` |
| `baseline.start/end` | `start_date` / `end_date` |
| `jobs.start`   | `start_date`  |

---

## Notes

- Upload auto-detection & merge semantics live in `src/lib/upload-merge.ts` +
  the `apply_jobs` / `apply_projects` / `apply_owners` / `apply_tasks` RPC
  functions (migration 0007). Each RPC is one transaction; upserts are
  idempotent and file order does not matter.
- **Security:** pin Next.js to the latest patched 14.2.x (or 15.x) release —
  npm flags the framework version, not this app's code.
- Custom SMTP for Supabase invite emails (Resend, `smtp.resend.com:465`, user
  `resend`) is only needed if you want invite emails; password-set-by-admin is
  fine for the test (spec §2).
