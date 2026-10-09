# Genie audit — Bernie's verification and fix plan

**Date:** 09-10-26 · **Checked against:** origin/main at 941b5b6 (Genie 6.3.0.71, one commit after the audited snapshot cccf05e)
**Inputs:** `GENIE_FIX_BRIEF_for_Bernie.md` (Maruti) and `Genie_Code_UI_Audit.md` (second auditor)
**Method:** every item re-read in the code at the cited location, with grep across all migrations and routes; `npm ci`, `tsc`, `next lint` and `npm audit` re-run on a fresh local clone. Live checks limited to signed-out HTTP (headers, robots, /api/version). I did not read the production database (my session is set to refuse production reads), so the two "live" claims about the database (sign-ups open, RLS locked by hand) are taken from Maruti's observation, not re-verified.

## 1. Headline

The brief is accurate. Of 62 numbered claims, 52 are confirmed in the code as written, 8 are partly right (the defect is real, a detail or the proposed fix is wrong), and 2 are not defects. Nothing in the one commit since the audit touched any of the files concerned.

Three things in the brief would have cost time if followed literally:

- **robots.txt** is deliberate (`src/app/robots.ts` explains why `Disallow: /` would make it worse). Leave it.
- **The CORS wildcard on /login** is Vercel's header on a cached static shell, not something set in the repo. Nothing to remove.
- **Next.js patch bump will not clear the audit.** The 14.x line ended at 14.2.35. Two critical advisories (RCE in the image optimizer with AVIF, RCE on Windows hosts) and ~20 high/moderate ones are fixed only in 15.5.24+. That is a major-version upgrade, not a patch.

Four items are already solved in the code and only need adopting: the shared error helper (D2, one line in `src/lib/api.ts`), the IST date helpers (D6, `src/lib/fmt.ts`), the body-shape validator (D10, `src/lib/validate.ts`), and the single version badge (D9, `GenieShell.tsx`).

Three items need Dr Raghu's decision, not code: S0 (dashboard toggle), S8 (the password pattern is his explicit ask), M2 (he said on 6 Sep the English meaning should be hover-only).

## 2. Scorecard

Legend: ✅ confirmed · ◐ partly (defect real, detail wrong) · ✗ not a defect · Effort S/M/L.

### Group 1 — Access and security

| ID | Verdict | What the code shows | Fix note | Eff |
|---|---|---|---|---|
| S0 | ✅ code | `0001:25-45` trigger takes `role` from signup metadata; app never calls signUp (login uses `shouldCreateUser:false`). Admin creation path (`admin/users:413`) sets role and `disabled:false` itself, so a hardened trigger breaks nothing. | Dashboard toggle is the real gate (his). Migration: trigger inserts `viewer, disabled=true`, ignores metadata. The brief's "refuse users with no profile row" does nothing here — the trigger always creates one. | S |
| S1 | ✅ | `page.tsx:47-52` redirect inside `try{}catch{}`; `/api/board` only `requireReader`. Also: page never checks `lmsOnly`. | Compute `allowed` inside try, redirect outside. Add `requirePlanning()` to board and planning writes. | S/M |
| S2 | ✅ | `auth.ts:65-83` error dropped, role defaults to `planner`. | Fail closed: return `disabled:true` on no row / query error so every caller denies without changing page callers. | S |
| S3 | ✅ | `lmsOnly` checked only by `moduleDoor` (Saamaan/Seva/Vishwakarma/Kuber), `requireMaterialHand`, portal, `/api/home`. NOT by `requireRole` (5 helpers), `requireHrms`, `requireLC`, `requireStratcom`, `requireCrm`, `requireIms*`, `requireMarketing`, `requireKuberOr` fallback. | Brief's fix (throw in `requireUser`) would break `/api/lms` which uses `requireUser`. Put it in `requireRole` + the named helpers instead. | S/M |
| S4 | ✅ | `0008:78-84` `FOR ALL USING is_reader()`; never replaced; `jwt_role()` ignores `disabled`. JWT is in a JS-readable cookie, so PostgREST is reachable. | Migration: split policies; `jwt_role()` returns null when disabled. | S |
| S5 | ✅ | `0076:187-199` + 0075/0079/0087/0091-94/0179: `select to authenticated using(true)` on every `kuber_*`. All Kuber APIs use the service key; no browser `.from()` on these tables. | Revoke from anon/authenticated/public and drop `_read` policies (house pattern 0048/0136/0157). | S |
| S6 | ✅ | Both print pages check `currentUser()` only. | `hasGrant(..,"accounts_access")` in both. | S |
| S7 | ✅ | `file/[id]:24-29` any Drive id. Same service account holds backups, payroll, LMS, consult KB. IDs live as `drive:<id>` in photo/path columns and four `*_drive_id` columns. | First pass: refuse unless the file's Drive parent is a Genie upload folder; second pass per-kind guards. | M |
| S8 | ✅ (2 corrections) | 90 candidates per name; SHA-256 **salted** (brief implied unsalted); `pw_temp` is wiped on first login and is read by mass-mail `{{PERS_PAS}}`. Pattern + no forced change are Dr Raghu's documented asks. | Now: scrypt (built-in, rehash on login), per-IP limit, clear `pw_temp` after mass-mail send. Pattern change = his decision. | S/M |
| S9 | ✅ | `payroll:693` stores `m.text`; `Communications.tsx:163,167` renders as HTML if it contains a tag. | Inbound = text with `pre-wrap`; rich = `cleanHtml`. | S |
| S10 | ✅ + 1 new | Landing `body_html` raw; Seva ticket HTML raw; erp-file proxy inline. **New:** the proxy accepts any ERP path, so any CRM user can read any ERP REST resource with the stored API key. | DOMPurify on save (both); proxy: pathname must start `/files/` or `/private/files/`, inline only for image/pdf by sniffed bytes. | S |
| S11 | ◐ | No CSP beyond `frame-ancestors` — true. CORS `*` on `/login` is Vercel's cache header on a static shell, **not in the repo**. | CSP report-only first (M). CORS: nothing to do. | M |
| S12 | ✅ + 3 more | delivered-summary, job-labour `requireReader`; portal/file unrestricted **and has no caller (dead)**; 7 crons accept any login — plus `erp-sync`, `kindle-daily`, `zoom-sweep`. | `requireStratcom` ×2; delete portal/file; one `requireCronOrStratcom` helper in 10 crons. | S |
| S13 | ✅ | Kindle no lockout; VRF/LP honeypot only, no type check; Resend secret = key tail; wa-slip TTL is 2 h (route comment says 1 h), CORS `*` unnecessary (extension has host_permissions). | As proposed. | S/M |
| S14 | ✅ | Zero RLS/grant/revoke hits for all 13 tables; no blanket migration in Genie (CRM has 0061/0062). No browser-side reads of these tables. | Port 0061+0062 (revoke from PUBLIC too, per 0156's lesson). | S |
| S15 | ✅ except 2 | One secret with `"genie"` fallback; `errJson` leaks messages; 15 unescaped `.or()`; Puppeteer JS on; SVG on public bucket; seed password; 31 AI routes uncapped. **Kindle `\|\| true` is a dead conditional on a deliberate feature** (family shown on Directory since 1.0.0) — delete it, no behaviour change. **robots.txt is correct as is.** | As proposed minus those two. | S each |
| S16 | ◐ | next 14.2.33, ssr 0.5.2 (old cookie API), chromium 149 / puppeteer-core 25.9 compatible, xlsx is the patched SheetJS CDN build. **exceljs cannot be dropped** — appraisal sheet needs fills/merges SheetJS Community does not write. | 14.2.35 now; Next 15.5.x as its own project; ssr cookie rewrite M; pin exact. | S / M / L |

### Group 2 — Data correctness

| ID | Verdict | What the code shows | Fix note | Eff |
|---|---|---|---|---|
| D1 | ✅ | Dashboard: bare selects, JS counts/sums. **scope=me IS applied** (`:60`) — ₹606 Cr for one owner is a data question (who the ERP import stamps as owner). `/api/today` same. Paging helpers `allRows`/`pageAll` exist, used by 14 routes. **Hidden variant:** `.limit(2000/5000/10000)` in saamaan/mrp and inventory silently returns 1,000. Ten worst routes listed in §4. | `count:'exact', head:true` for counts + SUM RPC; interim `allRows()`. | S + M sweep |
| D2 | ✅ root cause found | **Client:** `src/lib/api.ts:10` — `{"error":""}` falls through to `String(body)` = `[object Object]`. **Server:** funnel `N()` runs five HEAD counts; a timeout gives an empty message; the Nurturing count on `interaction` is unscoped over ~255k rows. | One-line fix in `api.ts` (the shared helper already exists); scope the count; fall back to `error.code`. | S |
| D3 | ✅ | No RPC/transaction/revision; shrink guard after upsert, job branch only. | plpgsql `save_plan(...)` with `expected_revision`; interim: guard before upsert, both branches. | M |
| D4 | ✅ + 1 | `ok:true` regardless of `skipped`; no `order` in paging. **Also:** a mid-table page failure discards rows already read and drops the table from the count list; the whole export is built in memory. | `ok = skipped.length===0`, `skipped` in the note, `order=id`; Supabase PITR is the real backup. | S / M |
| D5 | ◐ | Stamp = Excel upload time (`MyWeek.tsx:583`), one feed, no threshold. Live value not verifiable from code. | As proposed. | S |
| D6 | ◐ | The cited UTC bugs are real. **But the helper exists:** `fmt.ts` has `istToday`, `dmy`, `fmtAt`, `addDays`. 114 sites still use `toISOString().slice(0,10)`; 6 duplicate `dmy`/`fmtDate` helpers. `fmt.dmy` is DD-MM-YYYY; brief asks DD-MM-YY — decide. | Extend fmt.ts (FY/calendar), then sweep. | M |
| D7 | ✅ | `.slice(0,20)` before grouping; "nothing late" vs original-due badges. | As proposed. | S |
| D8 | ✅ | No abort/cleanup in `Dashboard.tsx:68-73`. | `live` flag in effect cleanup. | S |
| D9 | ✅ / ◐ | Double fetches are real and from distinct components (`PlanningSuite`+`GenieShell` bells; `QuoteOfDay`+`MyWeekPanels`; `DeliveredJobs`+`RunRate`). Negative lakhs: `money.tsx:42` no sign handling. **Version badge is already one component**; "V 6" in Kuber is CSS truncation of the title row. | Share fetches; sign-aware formatter; `flex-shrink-0` on the badge. | S |
| D10 | ✅ | 140 routes pass `{}`; `validate.ts` shapes already exist. | Use the existing shapes before adding zod. | M subset |

### Group 3 — Speed

| ID | Verdict | What the code shows | Fix note | Eff |
|---|---|---|---|---|
| P1 | ✅ + 1 | Middleware `getUser()` on everything but static; `currentUser()` 1 auth + 2 reads, no cache; `requireCrm` adds 2 reads + a write. **New:** `crm/auth.ts:65` defaults a crm_access holder with no CRM profile to `sales_head`. | Matcher to pages only; `cache()` + one read; throttle `last_seen_at` by the value just read. | S/M |
| P2 | ◐ | `loadWorld()` reads all four tables with no `fy`; **once per request, not seven** (one branch per view). FY indexes exist (0178) and are unused here. | `.eq("fy", fy)` on voucher/line + memo keyed on latest upload id. `allBills` must stay unscoped (0178 comment). | S→M |
| P3 | ✅ exact | Three `dynamic()` calls made moot by static imports from the same files. Record 3,332 / Admin 1,511 / Tasking 1,727 / Books 3,765 lines. | Move `UpdateToErp`, `TaskModal`, `Cell/ColumnPicker…` to own files. | M |
| P4 | ◐ | Clock interval leak real (`GenieShell:221`). Two bells don't pause. **Heartbeat already pauses on hidden** (`:71`). Usage read-then-update real. | Store interval id; `document.hidden` guard on bells; atomic usage upsert. | S |
| P5 | ✅ (3 of 3) | 200k-row JS group; per-row company `ilike` in erp-pull; one Chromium launch per request (pages reused within it). 0 `unstable_cache`. 17 crons ≈ 444 runs/day. | As proposed; company Map first. | M |
| P6 | ◐ | Images and `logo.ts` (40 importers, not 26) real; `/api/health` and `/api/version` import the 1.1 MB changelog. **`company.name` trigram index already exists** (CRM 0001:280); `erp_name` has none. Fonts link is in `src/components/MySheet.tsx`. FK counts not re-verified. | As proposed minus the existing index. | S / L |

### Groups 4–7 — Menus, UI, docs, hygiene

| ID | Verdict | What the code shows | Fix note | Eff |
|---|---|---|---|---|
| M1 | ✅ exact | 11 / 8 / 10 entries; `api/home` resolves seva but never returns it. **ModuleMenu.tsx is already dead** (imported by ProjectPage, never rendered). | `src/lib/modules.ts`, derive the rest. | S |
| M2 | ◐ decision | Hover-only was **Dr Raghu's 6 Sep call** (comment at `HomeDoors.tsx:60`). | Ask before reversing. | S |
| M3 | ◐ | 22 HRMS `built:false` exact; they already carry a "Soon" badge, not hidden. **Salary MIS and Muster flags are defensible** — only a print-embedded MIS and a muster print page exist, no screens. Kuber 5 stubs and the two stale CRM blurbs confirmed. | `adminOnly` filter + fix the CRM blurbs. | S |
| M4 | ✅ | Two "Change password" entries in Planning's menu. Kuber nav already has collapsible groups. | Remove `PlanningSuite:632`. | S |
| M5 | ◐ | GoalsBoard, SalesGenie, opsbook dead. `/api/goals/access` is live (keep). **`kindle/Soon.tsx` is in use.** Both Manpower files are live (merge, not delete). | Delete the three; leave the rest. | S |
| U1 | ◐ | 193 `<table`; fixed-width count depends on filter (I get ~1,000). Live phone numbers not re-measured. | Responsive header + cards on 4 screens first. | L |
| U2 | ◐ | 475 "uses" are `var(--muted)`; **one token in globals.css:201** fixes most. 9.5 px at MyWeek 102, 114, 388. | Change the token, then sweep. | S/M |
| U3 | ✅ | 81 / 147 / 19. Certificates delete unconfirmed. | ConfirmDialog first. | M |
| U4 | ◐ | Login **has** `<label>`s, just no `htmlFor`/`id` (0 in codebase). No `role="dialog"`, no Escape. 195 / 8 clickable divs/spans. | id/htmlFor + 40-line Dialog wrapper. | M |
| U5 | ✅ | 104 silent catches, 326 `swallow()`. | Toast on save/delete/upload paths only. | M |
| U6 | ✅ | 13,292 inline styles; 558 distinct hex. No IBM Plex found. | Tokens first. | S / L |
| U7 | ◐ | Glossary absent; ⌘⇧R once; double greeting at `MyWeek:575,579`. **Task job dropdown already shows `jobNo · tag · cust`**; the "raw project IDs" dropdown was not found. | As proposed. | S |
| W1 | ✅ (cites wrong) | All quoted false sentences are at `SoftwareDescription.tsx:311, 775, 781, 622, 1136`. **The libs named as ERP writers are read-only**; real writers are `saamaan-write.ts`, `crm-sync`, `erp-update`, `erp-create-enquiry`, `saamaan/po`, `seva/erp-amc`. Counts: 300 routes, 212+80 migrations, 225 components, 19 planning files. | Rewrite with correct citations. | M |
| W2 | ✅ | package.json 2.6.0 / "Excel-fed"; README v2.4; HANDOVER 10 Aug; NEXT 3.4.0.7. | Prebuild script syncs version. | S |
| W3 | ◐ | 842 entries; `module` field **exists but is free-text headline**; no `type`/`summary`. `/api/updates` is `requireUser` (not admin), badge is a span. 6.3.0.x spans 4 days (06–09). | `headline` + `module` key + `type`; prebuild version check. | M |
| E1 | ✅ | No tests of any kind, no test script. | Playwright auth-matrix + smoke on staging first. | L |
| E2 | ✅ | `ignoreDuringBuilds:true` (Drive-mount lint time); 21 errors / 23 warnings reproduced: 2 are missing-rule-definition in `validate.ts`, rest hook deps. No `.github/`. | Lint in CI, not in the Vercel build. | M |
| E3 | ✅ | All duplicates exist; CRM db client must stay separate (different project). docs/crm-merges 4.8 MB. | Unify paging; leave auth merge. | S |

## 3. Corrections to the brief (so nobody acts on them)

1. S11 CORS, S15 robots.txt — not defects (see §1).
2. S16 — 14.2.35 is the end of the 14 line; the audit needs Next 15.5.24+. Do not promise "patched" after a patch bump.
3. S16 — exceljs stays.
4. S3 — the proposed `requireUser()` throw would lock LMS-only learners out of `/api/lms`.
5. S0 — "refuse users with no profile row" is not a sign-up defence.
6. S8 — hash is salted; `pw_temp` is already wiped on first login; the pattern is Dr Raghu's documented ask.
7. S15 Kindle — a dead `|| true` on an intended feature, not a leak.
8. D1 — `scope=me` is applied; the ₹606 Cr is a data/ownership question.
9. D2 — root cause is `src/lib/api.ts:10`, and that IS the shared helper the brief asks to create.
10. D6, D9, D10 — helpers/components already exist; the work is adoption.
11. P2 — one full read per request, not seven.
12. P4 — heartbeat already pauses when hidden.
13. P6 — `company.name` trigram index exists.
14. M3 — Salary MIS and Muster are not wrongly flagged.
15. M5 — `kindle/Soon.tsx` and both Manpower files are in use.
16. U4 — login has labels; the gap is association.
17. W1 — the three libs named as ERP writers are pull-only.
18. S13 — the slip token TTL is 2 h in code (the brief's "2-hour" is right; the route's own comment says one hour).

## 4. New findings not in either document

- **ERP proxy is an open relay** (`api/crm/erp-file/route.ts:30`): host check only, so any CRM user can fetch any ERP REST path with the stored API key. Fix with S10.
- **`crm/auth.ts:65` defaults to `sales_head`** when a crm_access holder has no CRM profile row.
- **`/api/portal/file` has no caller** — delete rather than restrict.
- **`.limit(N)` above 1,000 is silently 1,000** in `saamaan/mrp` (:52, :220) and `saamaan/inventory` (:213). Same class as D1.
- **Backup drops a whole table on a mid-table page failure** and builds the entire export in memory (D4).
- **Three more crons** (`erp-sync`, `kindle-daily`, `zoom-sweep`) accept any logged-in user (S12).
- **Signed-out `/hrms` answers 200** with the HRMS shell (and `/api/me` → `{"user":null}`), not a 307. Probably a client-side redirect; check under S1/S3 that no data renders before it fires.
- **Ten worst unbounded-read routes** (bare select then count/sum in JS): `admin/users` (18 reads), `saamaan/inventory` (13), `month-plan` (13), `hrms/mass-mail` (7), `saamaan/mrp`, `saamaan/rfq` (6), `hrms/rates:56`, `crm/salesplan:184-186`, `today:63-64`, `cron/erp-pull` (5).
- **Dependency audit, re-run today:** 1 critical, 12 high, 4 moderate. Direct: `next` (fix = 15.5.24+), `postcss` (<=8.5.22, fix 8.5.23+), `tailwindcss` 3.4.x via chokidar/micromatch (fix = 4.x, or accept as build-only), `eslint-config-next` (build-only). `nanoid` has a non-major fix.

## 5. Not verified (needs Dr Raghu or staging)

- Live `disable_signup`, live RLS/grants on the 13 tables, pg_policies on tasks tables — read-only SQL with him.
- The live timings (Kuber 11.8 s, Home 3.8 s) — not re-measured.
- Role-matrix behaviour — needs a staging project and test accounts.
- Whether the morning Excel upload still runs (Home says 31 Aug).

## 6. Decisions for Dr Raghu

1. **S0** — turn off "Allow new users to sign up" in Supabase Auth (30 s, his dashboard).
2. **S8** — keep the NGSE-name-digits pattern (his ask) with scrypt and an IP limit, or move to one-time activation links? And when does HR reset existing passwords?
3. **M2** — reverse the 6 Sep "hover only" decision and print "Kuber · Accounts" on the tiles?
4. **Next 15** — approve a separate upgrade project (it touches every `cookies()`/`headers()`/`params` call) or accept the 14.2.35 ceiling for now?
5. **Date format** — DD-MM-YY (brief) or DD-MM-YYYY (current `fmt.dmy`)?
6. **Staging Supabase** — do we have one? Without it, migrations go straight to production as today (by his hand), and the role-matrix test cannot run.

## 7. Fix plan and order

Each step = one commit on a branch, full `next build` before it moves, migrations delivered as `.sql` files with run steps. Nothing goes live until he pushes/merges.

| # | Scope | Items | Version | Needs from him |
|---|---|---|---|---|
| 1 | Access control | S1, S2, S3, S6, S9, S10, S12, S13 (Kindle lockout, slip TTL/CORS), S15 (errJson, `.or()` escape, secret, Puppeteer, seed), Kindle `\|\|true` cleanup, D2 helper | 6.3.1.0 | nothing |
| 2 | Database lockdown | S0 trigger, S4 policies + `jwt_role`, S5 revoke, S14 blanket RLS, S15 SVG | 0209–0211 .sql | run in SQL editor; S0 toggle |
| 3 | S7 file guard, S8 scrypt + IP limit, S13 Resend signature + upload checks, S16 14.2.35 + pins + `@supabase/ssr` cookie rewrite | | 6.3.1.1 | RESEND webhook secret in Vercel env |
| 4 | Data: D1 dashboard + today, D3 save_plan RPC, D4 backup status, D7, D8, D9 | 6.3.2.0 | 0212 .sql |
| 5 | Speed quick wins: P1 matcher/cache/throttle, P2 fy filter, P3 three moves, P4 timers, P6 health/version import | 6.3.2.x | |
| 6 | Menus/UI: M1, M3, M4, M5, U2 token, U7 greeting | 6.3.3.0 | M2 decision |
| 7 | Docs: W1, W2, W3 | 6.3.3.x | |
| later | E1 tests + CI, Next 15, Floor Mode (U1), dialogs (U3/U4), tokens (U6), FK index audit | — | staging |
