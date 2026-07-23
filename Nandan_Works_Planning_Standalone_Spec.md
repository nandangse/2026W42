# Nandan Works Planning Suite — Standalone App Spec (Test Deployment)

**Version:** 2.0 — SUPERSEDES the Frappe/ERP-integrated spec v1.0 in full. **Do not connect to ERPNext. Do not pull from ERPNext. Do not install anything on the ERP VPS.**
**For:** Claude Code (implementation agent)
**Frontend source of truth:** `nandan-works-planning-V1.9.jsx` (ships alongside this spec)
**Model:** identical in spirit to the existing intern portal at `interns.nandan.co.in` — its stack, its deployment shape, its account patterns.

---

## 0. Non-negotiable rules

1. **Standalone.** Own backend, own database, own domain (`planning.nandan.co.in`). The ONLY data source is the Excel sheets uploaded each morning (the three exports: Jobs, Projects, ToDo — plus the full PRE workbook as an accepted alternative). No API calls to nandanerp.in, no scraping, no scheduled fetches, nothing.
2. **Hyperlinks to the ERP are allowed** (e.g. `https://nandanerp.in/app/jobmaster/2025262537` per job, and the ERP report links on the Morning Update panel). They open in the user's browser; the app itself never talks to the ERP.
3. **Uploads refresh ERP-derived data only.** The planning layer — milestone plans, done checkmarks, baselines, manual tasks, comments, materials checklists, priority order, family templates, users — is app-owned and must survive every upload untouched. §6 is the contract; §10 makes it a test.
4. **Kitting formula is fixed:** per job `material_value = value × (1 − tpp/100)`, `kitted_value = material_value × kit/100`; board aggregate `kitting % = Σ kitted_value ÷ Σ material_value`, using the ERP `Kitting percentage` column from the uploaded sheet. Never derived from checklists.
5. **Management Target Date is editable only by `raghu@nandan.co.in`** — enforced server-side (API + RLS), not just hidden in the UI.
6. **Never commit secrets.** `.env.local`, service-role keys, recovery codes → `.gitignore` before the first commit.

---

## 1. Stack (mirror the intern portal — decided, do not revisit)

- **Next.js 14** (App Router) on **Vercel**, domain `planning.nandan.co.in`
- **Supabase**: Postgres + Auth + (optionally Storage for retaining raw uploaded files)
- **Excel parsing:** SheetJS (`xlsx`) server-side in a Next.js route handler — port the V 1.9 `parseUpload` logic verbatim into a shared TypeScript module; it is battle-tested against the real files (105/106-job exports, header quirks, image-markdown in notes)
- Same operational conventions as the intern portal: company-email-owned Supabase/Vercel accounts; SQL migrations as numbered files run **strictly in order** (0001…); GitHub → Vercel deploys

```
Browser (planner / admin / Shweta)
   │  Supabase Auth (email + password)
   ▼
Next.js 14 @ Vercel  ──  /api routes: board, upload, plan, tasks, …
   │  service role (server only)
   ▼
Supabase Postgres  ←— the ONLY persistent store
        ▲
        └── data enters ONLY via POST /api/upload (Excel)
```

---

## 2. Auth, users, roles

Supabase Auth email+password. `profiles` table keyed to `auth.users.id` with `role ∈ {admin, planner, uploader}`.

- **admin** — everything, plus the Admin page (family templates + user management: create user with email/password/role via a server route using the service key, list, change role, disable). Seed `raghu@nandan.co.in` and `medhansh@nandan.co.in` as admins.
- **planner** — all boards and editing; no Admin page.
- **uploader** (Shweta) — after login sees ONLY the Morning Update page from V 1.9: three rows (Jobs / Projects / ToDo), each with ERP link, Download link, Upload button, ✓ loaded status for **today**; nothing else. Seed `shweta@nandan.co.in`.

Lessons carried over from the intern portal build: join profiles on `id = auth.users.id` (no separate user_id column); keep the seed script idempotent; Supabase email templates need custom SMTP (Resend, host `smtp.resend.com`, port 465, user `resend`) — only wire this if invite emails are wanted; password-set-by-admin is fine for the test.

---

## 3. Database schema (migrations 0001…000N, in order)

**ERP-derived (replaced/updated by uploads):**
- `jobs` — `id text PK` (10-digit), `tag, fam, cust, val numeric, tdd date, otd date, start date, proj text, stat text, pct numeric, note text, own text, mgmt date, tp numeric, tpv numeric, tpp numeric, kit numeric, active boolean, archived_at timestamptz, updated_batch uuid`
- `projects` — `id text PK` (NGSE-PROJ-…), `mgr text, committed date, exp_end date, so text, stage text, job_numbers text[]`
- `erp_tasks` — tasks originating from ToDo uploads: `id uuid PK, job_id text, source_key text UNIQUE` (= `job_id || '||' || left(title,60)` — the proven merge key), `title, detail, who, due date, cat, esc, done boolean`
- `import_batches` — `id uuid, kind ∈ {jobs, projects, tasks, pre}, filename, uploaded_by, uploaded_at, row_count, summary jsonb`. Keep every batch (history of morning snapshots; enables "as of" questions later).

**App-owned (NEVER touched by uploads):**
- `plans` — `job_id text PK, start date, baseline_on date, baseline_end date`
- `milestones` — `id uuid, job_id, idx int, title, days int, preds int[], crew jsonb` (fitter/helper/welder/painter/electrician/hydraulic), `shift text, offset int, done boolean, done_on date`
- `baseline_milestones` — `job_id, idx, title, start date, end date`
- `manual_tasks` — same shape as erp_tasks minus source_key, plus `created_by`
- `task_comments` — `task_id uuid, task_kind ∈ {erp, manual}, by text, at timestamptz, body text`
- `materials` — `job_id, item, qty, status ∈ {Pending, Received}, custom boolean`
- `family_templates` — `family text PK, milestones jsonb` (seed from V 1.9 `templateFor`)
- `settings` — single row: `priority_order text[]`

RLS: all tables readable by any authenticated non-uploader; writes per role (uploads: uploader+admin; plan/task/material/priority writes: planner+admin; `jobs.mgmt` update and templates/users: admin-guarded, with the mgmt-date column further restricted to raghu's uid by policy). Uploader role can read nothing except its own upload status endpoint.

---

## 4. Upload pipeline — the only door for data

`POST /api/upload` (multipart, uploader/admin): parse with the ported V 1.9 module, auto-detect which file it is (row-1 `ID`+`Customer Tag` → jobs; row-1 `ID`+`Project Stage` → projects; row-1 `Reference Type` → tasks; sheet `Data Analysis` present → full PRE covering jobs+projects), then apply **exactly these merge semantics** inside one transaction:

1. **Jobs file:** upsert every row into `jobs` (`active=true`). Jobs present in DB but absent from the file → `active=false, archived_at=now()` — **never deleted**; their plans/baselines stay reachable (archived group in the Job Plan dropdown). Field mapping = the table in V 1.9's parser (id, tag, fam, cust, val, tdd, otd, start, proj, stat, pct, note→cleaned 150 chars, own, mgmt, tp, tpv, tpp, kit).
2. **Projects file:** upsert `projects`; then blank-fill only — `jobs.own` from `mgr` (via `proj` link or `job_numbers`), `jobs.otd` from `committed`, `jobs.tdd` from `exp_end` — never overwriting non-null job values.
3. **Tasks file:** upsert `erp_tasks` on `source_key`, preserving existing `done` and all `task_comments`. ERP tasks whose key vanishes from the file are closed, not deleted. `manual_tasks` are never touched.
4. `settings.priority_order`: drop archived ids, keep order; new jobs are appended by TDD at read time (V 1.9 render already does this).
5. Record the `import_batch`; response returns the same human summary V 1.9 shows in its "Loaded ✓" alert, including the job count so the ERP-count parity check is a glance.

Order of the three files must not matter. Uploading the same file twice must be a no-op (idempotent upserts).

## 5. API routes (Next.js route handlers, all auth-checked server-side)

`GET /api/board` → one payload: active jobs (+archived stubs having plans), projects, merged tasks (erp+manual, with comment counts), plans+milestones+baselines, materials, priority order, templates, aggregates per §0.4, latest import batch per kind (feeds the "Data: …" header line and the Morning Update ✓s).
`POST /api/plan` (upsert plan+milestones) · `POST /api/milestone/toggle` · `POST /api/baseline` (refuse overwrite without flag) · `POST /api/tasks` (manual create; close/reopen either kind) · `POST /api/comments` · `POST /api/materials` · `POST /api/priority` · `POST /api/templates` (admin) · `POST /api/job-field` (`tdd|stat|mgmt`; `mgmt` allowed only for raghu's uid — these edits are app-local notes of intent; the row shows the job's `nandanerp.in/app/jobmaster/{id}` link so the change is applied in ERP by hand, and tomorrow's upload is the confirmation, exactly the V 1.9 "Update to ERP" workflow, which stays).

## 6. Zero-data-loss contract

No upload, re-upload, or partial upload may ever delete or reset: plans, milestone done flags/dates, baselines, proposed-vs-real for archived jobs, manual tasks, comments, task done-marks (except ERP-side closures from the file), materials, priority order, templates, users. Jobs are archived, never deleted.

## 7. Frontend port (V 1.9 → Next.js pages)

Port the JSX nearly as-is: keep the design system, all five tabs, frozen header, both ISO-week calendars, load board (full range + today autoscroll), WHO dropdown fed from `projects.mgr` + `jobs.own`, Save-as-Baseline and proposed-vs-real chips, kitting formula labels, value masking, the Update-to-ERP tab with per-job ERP links, and the Morning Update panel (now showing per-file "✓ loaded today at HH:MM" from `import_batches`). Replace: `window.storage` → API; login → Supabase; `parseUpload` client call → `POST /api/upload`; embedded DATA → `GET /api/board`. Delete the in-JSX users store (real auth now). Keep the emergency behaviour that the full PRE workbook is an accepted upload. Mobile usability is required.

## 8. Deployment

1. Supabase project (company email) → run migrations 0001…N strictly in order; stop on any error and repair before continuing.
2. Seed: three users, family templates, empty settings row.
3. GitHub repo (private) → Vercel → env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon key; service key server-only) → deploy → attach `planning.nandan.co.in` DNS.
4. Smoke: log in as each role; Shweta's account must land on the upload page only.

## 9. First-morning runbook (the acceptance ritual)

Shweta: Download + Upload the three files → three ✓s. Dr. Raghu: board count equals ERP's live Jobs-in-Process count; open one job, build a plan, Save as Baseline, tick a milestone, add a task + comment, set a priority order. Next morning: Shweta uploads again → every artifact from yesterday intact (this is §10's test, performed by hand once).

## 10. Automated acceptance test (required, run in CI or a script)

Seed plan+baseline+manual task+comment+priority → apply a jobs upload where one job is new and one is missing → assert: new job present; missing job `active=false` with plan reachable; all planning artifacts byte-identical; re-upload same file → zero row changes. Plus: kitting aggregate equals an independent recomputation of Σ val×(1−T%)×Kit% ÷ Σ val×(1−T%); mgmt-date write as non-raghu returns 403.

## 11. Out of scope (later phases)

ERP API integration (explicitly deferred — this spec's architecture must not preclude it, which the upload-pipeline/table split already guarantees); WhatsApp/JoyzAI alerts; BOM-value-weighted kitting; historical trend views over `import_batches`.
