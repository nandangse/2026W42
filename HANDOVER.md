# GENIE — HANDOVER

**Written 10 Aug 2026, end of the original build conversation.** Everything a new machine — or a new Claude Code session — needs to continue this project. On a new device: open the `test-planning-suite` folder in Claude Code and say *"read HANDOVER.md, then …"*.

---

## 1. What this is

**Genie** (`genie.nandan.co.in`, currently live at **nandan-planning-suite.vercel.app**) is Nandan GSE's standalone planning platform. It is deliberately **not connected to ERPNext** — the only data inflow is the morning Excel upload (3 files: Jobs / Projects / ToDo, or the full PRE workbook). ERP hyperlinks open in the browser; the app never calls the ERP. That rule comes from the spec (`Nandan_Works_Planning_Standalone_Spec.md`, in repo root) and is non-negotiable.

Four workspaces behind one login:

| Workspace | What it is | Who sees it |
|---|---|---|
| 🧭 **Planning Suite** | My Week (landing), Job Delivery Board, Load Board, Job Plan, Update to ERP, Morning Update (admins), Admin | every non-uploader |
| 🎯 **Goals** | OPSP goal cascade (goal→project→objective→key result→tactic), live-fed key results, swimlane kanban | explicit grant only (`goal_access`) |
| 📋 **Nandan Tasking** | tasks per job, board + ISO-week calendar | every non-uploader |
| 💼 **Sales Genie** | two panes: **My Sales Plan** (interactive companies/industries/products/pipeline app, auto-saves + live realtime sync) and **Playbook** (the Sales Regrow HTML served byte-identical, admin backup import/export) | explicit grant only (`sales_access`) — currently raghu + medhansh |

The `uploader` role (Shweta) sees only the Morning Update page.

## 2. Stack & accounts

- **Next.js 14** (App Router) + **Supabase** (Postgres/Auth, project `kpcwgsgqzhfajjhapvlf`) + **Vercel**, GitHub repo `medhanshg/nandan-planning-suite` (private), branch `main`, auto-deploys on push.
- **Secrets are NOT in git.** `.env.local` needs 4 values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Project Settings → API), and `RAGHU_EMAIL=raghu@nandan.co.in`. Copy the file from the old machine or re-create from `.env.local.example`.
- New device setup: `npm install` → create `.env.local` → `npm run dev` → localhost:3000.

## 3. Repo map (the files that matter)

```
src/components/PlanningSuite.tsx   the whole suite UI — workspaces, tabs, MyWeek,
                                   DeliveryBoard, JobPlan, Tasking, Admin (~large, single file)
src/components/GoalsBoard.tsx      Goals cascade + swimlane kanban + inspector
src/components/SalesGenie.tsx      Sales Genie iframe wrapper + backup toolbar + watermark
src/components/MorningUpload.tsx   uploader page (also embedded as admin tab)
src/components/QuoteOfDay.tsx      daily quote popup (static data, no DB)
src/lib/parse-upload.ts            Excel parser — VERBATIM port of V1.9, do not "improve"
src/lib/upload-merge.ts            upload → RPC merge orchestration (§4 semantics)
src/lib/board.ts                   buildBoard(): the one /api/board payload; owner resolution
src/lib/goals.ts / goal-tree.ts / goal-metrics.ts   goals domain, tree assembly, LIVE metrics
src/lib/auth.ts                    role tiers + requireX() gates + owner (isOwner)
src/lib/goal-access.ts / sales-access.ts   the two explicit-grant checks
src/lib/notify.ts                  assignment notifications (fail-silent by design)
src/lib/quotes-data.ts             360 quotes AUTO-GENERATED from Raghu's workbook
src/sales-regrow/Sales_Regrow.html bundled fallback for the Playbook pane (DB copy wins)
src/sales-plan/                    My Sales Plan sources — shell.html + styles + seed +
                                   adapted app.js + boot.js; /api/sales/plan assembles them
                                   into ONE authed HTML document (login/Team tab removed;
                                   boot.js bridges the Genie session, parent keeps the only
                                   refresh token; tables are sp_-prefixed)
src/app/api/...                    ~20 route handlers, all auth-checked server-side
supabase/migrations/0001..0014     run IN ORDER in Supabase SQL editor
supabase/ALL_MIGRATIONS.sql        all of them concatenated (idempotent, safe to re-run)
scripts/seed.ts                    users + family templates (idempotent)
scripts/seed-goals.ts              full 43-node goal tree (`-- --reset` to wipe & reseed)
scripts/acceptance-test.ts         §10 zero-data-loss test — SCRATCH DB ONLY (does real uploads)
```

## 4. Permission model (memorise this)

- Roles: `admin · planner · project_owner · user · viewer · uploader`. Editors (admin/planner/project_owner) may change plans; `user` works tasks only; `viewer` read-only.
- **Owner tier:** `raghu@nandan.co.in` sits above admins — only the owner can change another admin (role/password/disable/delete/grants) or mint new admins. The owner account itself is protected by API checks **and** a DB trigger; nobody can demote/disable/delete it.
- **Two explicit grant tables**, deliberately separate from roles: `goal_access` (see/edit the goal tree) and `sales_access` (open Sales Genie, default NO for everyone). Owner is implicit in both. Managed in Admin → Goals access panel / "Sales Genie" column in User management.
- **Tree visibility ≠ own-work visibility** (spec §9): someone with no goals grant still gets their assigned tactics via `/api/today`… *except* the "My goal work" card on My Week was later gated by the grant at Raghu's request — a person with tactics but no grant currently sees them nowhere. If someone must work tactics, give them View.
- `jobs.mgmt` (Management Target Date) is editable **only by raghu** — enforced in `/api/job-field` *and* a DB trigger.
- **Initials** (2 letters, unique, on profiles) are the assignment key everywhere. **ERP owner name** on a profile links a login to the Jobmaster's free-text `Project Owner` (this is how jobs resolve to accounts).

## 5. Database / migrations state (as of handover)

- **Confirmed applied by testing:** 0001–0010 (base + goals), 0009 (updated_at fix), 0013 (sales — grants seeded for raghu + medhansh; playbook seeded byte-identical, sha `8b68c0996…`).
- **0011 (owner tier) and 0012 (notifications): written and pushed, but never explicitly confirmed as run in the original conversation.** Verify before assuming: the 🔔 bell only renders if 0012 is applied; `is_owner()` RPC existing means 0011 is in. If missing, run them from `supabase/ALL_MIGRATIONS.sql` — everything is idempotent.
- **0014 (My Sales Plan tables, sp_*) shipped 10 Aug — must be run in the SQL editor before the plan pane can load data.** Until then the pane shows a graceful "run migration 0014" message. RLS gates every sp_ table on the sales_access grant (owner implicit); company delete is admin-only; realtime publication included.
- Live data (approx at handover): ~111 active jobs, 46 goal nodes (43 seeded + 3 Raghu test nodes), 12 accounts.
- **Zero-data-loss contract (spec §6):** uploads only touch `jobs/projects/erp_tasks/import_batches`. Plans, milestones, baselines, manual tasks, comments, materials, priority, templates, grants are app-owned and must survive every upload. Jobs are **archived, never deleted**. This was verified end-to-end against live data — keep it true.
- **Kitting formula is fixed** (spec §0.4): `Σ val×(1−tpp/100)×kit/100 ÷ Σ val×(1−tpp/100)`. Never derive from checklists.

## 6. Deploy & rollback

- Push to `main` → Vercel builds (~1–2 min). Verify with `curl -s -o /dev/null -w "%{http_code}" https://nandan-planning-suite.vercel.app/login` → 200.
- Rollback: tag **`pre-goals-v2.4`** marks the pre-goals production state; `git revert -m 1 <merge-sha>` for the goals merge; individual commits are small and revertable. Migrations are all additive, so code rollbacks never need DB changes.
- Local rhythm that avoids the two classic accidents: **never run `next build` while the dev server is running** (corrupts `.next` → `__webpack_modules__ is not a function`), and **kill orphaned node on port 3000** before restarting (a zombie keeps serving the broken build while the new server silently takes 3001). Fix is always: stop server → `rm -rf .next` → build/dev.

## 7. Open items (the actual to-do list)

1. **genie.nandan.co.in DNS never completed.** Records must go in **Cloudflare** (authoritative for nandan.co.in — NOT the VPS): CNAME `genie` → `4f4dba9206813907.vercel-dns-017.com` (DNS only/grey) + TXT `_vercel` → `vc-domain-verify=genie.nandan.co.in,945f972ba1818f56ee38`. Then Supabase → Auth → URL config: add the domain. Production runs on the vercel.app URL meanwhile.
2. **Job-owner linking incomplete.** The Jobmaster's five owner strings (`Pankaj Sutar`, `Anil Shinde`, `Alpesh`, `vikash`, `Pratish Govind`) need Project Owner accounts with matching **ERP owner name** fields; until then those jobs read Unassigned and the owner filter is thin. Raghu was to confirm the mapping (esp. vikash / Pratish Govind).
3. **Medhansh currently has NO goals access** (his grant row was removed, presumably while testing the admin panel — only the owner can re-grant an admin).
4. **Run migration 0014** (My Sales Plan tables) in the Supabase SQL editor, then open Sales Genie → My Sales Plan as an admin and click "Load starting data" once (253 industries, 85 products, 9-stage process). Version drift is fixed — badge and package.json both say 2.6 now.
5. **Sales Regrow phases P1–P5 unbuilt** (product master, quote engine, approvals, metrics — see `Sales_Regrow_Architecture_Spec.md` on the old Desktop). Its §12 lists business decisions that block P2 (price bands, gate criteria, quote numbering ownership). What shipped is P0: the playbook live behind auth with per-user grants + backup import.
6. **VPS hosting:** a full Hostinger guide was given (fresh VPS — never the ERP VPS; Node 20 + PM2 + Nginx + certbot; build on the server because `NEXT_PUBLIC_*` bakes at build). Not executed; Vercel remains live.
7. **Notifications are in-app only** (60s poll). Email/WhatsApp would need Resend/API accounts.

## 8. Conventions for whoever (or whichever Claude) continues

- Match the existing design system: paper `#F1EFE9` / navy `#16232F` / orange `#E8600A`, `Chip`/`Gauge`/`tnum` patterns, V1.9 look. One product, not two.
- Every new surface follows the same shape: RLS + server-side `require*()` gate + one aggregated GET payload + small POST actions; UI hiding is presentation, never enforcement.
- Migrations: numbered, idempotent, **additive** (that's what keeps rollback = code revert).
- Excel parser and merge semantics are battle-tested — extend, don't rewrite.
- Test against the live DB read-only freely; anything destructive (acceptance test!) only on a scratch Supabase project.
- Source artifacts live on the old machine's Desktop (specs, `goal-book.jsx`, `Sales_Regrow.html`, quotes workbook) — the load-bearing ones are already embedded in the repo.
