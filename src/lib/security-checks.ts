/**
 * THE SECURITY CHECKLIST (Dr Raghu, 10 Oct 2026: "give me a checklist in the
 * software description page which showcases all the things to be tested …
 * a collapsible section called Security checks conducted on <date>").
 *
 * One row per thing to test, from the 9 Oct 2026 audit (Maruti's fix brief
 * and the second auditor's report — docs/GENIE-AUDIT-ANALYSIS-2026-10-09.md
 * has the verification of each). The page reads this list; the heading's
 * date is the latest `tested` date in it, so it cannot say a date nobody
 * tested on.
 *
 * HOW A RUN WORKS. The tester goes down the list on the test copy, does
 * `how`, compares with `expect`, and the outcome is written back here:
 * `status` and `tested`. Repairs are bunched between runs; after a repair
 * `fixedIn` carries the version and `status` goes back to "fixed" until the
 * next run proves it. A row only becomes "pass" by somebody testing it.
 *
 *   pass      tested on the stated date and behaved as expected
 *   fail      tested and did not — the repair is owed
 *   fixed     repaired in code or migration, re-test still owed
 *   open      known, not yet repaired
 *   decision  waits on Dr Raghu's decision before anybody repairs it
 *   na        looked at and found not to be a defect
 */
export type CheckStatus = "pass" | "fail" | "fixed" | "open" | "decision" | "na";

export interface SecurityCheck {
  id: string;
  group: string;
  title: string;
  /** What the tester does. */
  how: string;
  /** What must happen. */
  expect: string;
  status: CheckStatus;
  /** ISO date of the last time somebody actually ran `how`. */
  tested: string | null;
  /** Genie version or migration that carries the repair. */
  fixedIn?: string;
  /** Anything the tester must know — a tool, a login, a caveat. */
  note?: string;
}

const G = {
  access: "1 · Access control",
  input: "2 · Input and content",
  db: "3 · Database posture",
  secrets: "4 · Secrets and tokens",
  data: "5 · Data correctness",
  speed: "6 · Speed",
  ui: "7 · Menus, UI and accessibility",
  docs: "8 · Documentation and versioning",
  deps: "9 · Dependencies and hygiene",
} as const;

export const SECURITY_CHECKS: SecurityCheck[] = [
  /* ───────────── 1 · access control ───────────── */
  { id: "S0", group: G.access, title: "Public sign-up cannot create a usable account",
    how: "Supabase dashboard → Authentication → Providers → Email: “Allow new users to sign up” is OFF. Then, with the anon key, call auth.signUp with metadata { role: \"admin\" }.",
    expect: "Sign-up refused. If it is ever on again, the profile made by the trigger is viewer + disabled (migration 0209) and the login is shut.",
    status: "fixed", tested: "2026-10-09", fixedIn: "0209", note: "Seen live on 9 Oct: disable_signup was false. The toggle is Dr Raghu's to flip." },
  { id: "S1", group: G.access, title: "The Planning tick is enforced on the page and on the API",
    how: "Log in as a reader WITHOUT the Planning tick (Admin → module access). Open /. Then GET /api/board and POST /api/plan.",
    expect: "Page redirects to /idp. /api/board and /api/plan answer 403.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S2", group: G.access, title: "A login with no profile row, or a failed profile read, is refused",
    how: "On the test database delete one test user's profiles row, keep the auth user, log in. Then GET /api/me and /api/board.",
    expect: "No planner access. /api/* answer 403 “not set up on Genie”; a read failure answers 503, never a default role.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S3", group: G.access, title: "A training-only (LMS) login opens the library and nothing else",
    how: "Make a user with lms_only ticked and a role of user. Call /api/board, /api/tasks, /api/goals-v2, /api/consult, /api/file/<id>, /api/crm/dashboard, /api/ims, /api/marketing, /api/kuber/books?view=summary, /api/hrms/employees. Then /api/lms and /api/me.",
    expect: "Every module route 403; /api/lms and /api/me 200; the home page lands on /lms.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S4", group: G.access, title: "A viewer cannot delete tasks or comments through the database",
    how: "With a viewer's session token (sb-* cookie) call PostgREST DELETE on manual_tasks and task_comments. Repeat for a disabled user's still-valid token on any SELECT.",
    expect: "0 rows affected for the viewer; 0 rows returned for the disabled token (migration 0209 — per-verb policies, jwt_role() null when disabled).",
    status: "fixed", tested: null, fixedIn: "0209", note: "Verify live first: select * from pg_policies where tablename in ('manual_tasks','task_comments')." },
  { id: "S5", group: G.access, title: "Kuber tables are closed to the browser key",
    how: "With any non-Kuber user's session token GET <supabase>/rest/v1/kuber_ledger?select=*&limit=1, kuber_voucher, kuber_voucher_line.",
    expect: "401 or 0 rows (migration 0210). The Kuber screens still work for a Kuber-ticked user (they read through the service key).",
    status: "fixed", tested: null, fixedIn: "0210" },
  { id: "S6", group: G.access, title: "CFO and Board report print pages need the Kuber tick",
    how: "As a non-Kuber user open /cfo-report/print?month=2026-09 and /board-report/print.",
    expect: "“Not allowed” — no figures rendered. A Kuber user sees the report.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S7", group: G.access, title: "The Drive file door serves only Genie's own files",
    how: "As any user GET /api/file/<a Drive id of a backup zip or a payroll file>. Then a job photo's id for a job the user may see.",
    expect: "Backup/payroll id → 404. Job photo → 200.",
    status: "open", tested: "2026-10-09", note: "Not yet repaired: today any sanitised Drive id the service account can see is served." },
  { id: "S8", group: G.access, title: "IDP (employee sheet) passwords are not guessable and are hashed slowly",
    how: "Read src/lib/idp-password.ts: the pattern and the hash. Try six wrong passwords from the same IP on two different accounts.",
    expect: "scrypt or argon2 hashing; a per-IP limit as well as the per-account lockout; pw_temp cleared after the mail goes out.",
    status: "decision", tested: "2026-10-09", note: "The NGSE+name+2-digits pattern and no forced change are Dr Raghu's documented asks (idp-password.ts header). Hash + IP limit can ship without changing the pattern." },
  { id: "S12a", group: G.access, title: "Delivery value and labour day-rates read only for LC / Stratcom",
    how: "As a plain user GET /api/delivered-summary and /api/job-labour.",
    expect: "403 on both; 200 for an LC or Stratcom member.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S12b", group: G.access, title: "Portal logins cannot fetch other suppliers' registration files",
    how: "As a portal login GET /api/portal/file?path=vrf/1/pan-x.pdf.",
    expect: "404 — the route no longer exists (it had no caller).",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S12c", group: G.access, title: "A cron run by hand needs the owner, Stratcom or a named hand",
    how: "As a plain user GET /api/cron/crm-sync, erp-pull, fx, ims-expiry, kanban-daily, playbooks, saamaan-escalate, kindle-daily, zoom-sweep without the bearer secret.",
    expect: "403 for the plain user; 200 for the owner; the Vercel cron with CRON_SECRET unaffected.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S13a", group: G.access, title: "Kindle login locks after five wrong tries",
    how: "POST /api/kindle/auth {action:login} with a wrong password six times for one e-mail.",
    expect: "Sixth answer is 429 “Too many tries”; clears after fifteen minutes.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S13b", group: G.access, title: "Vendor registration and landing forms resist abuse",
    how: "POST /api/portal/vrf twenty times from one IP in a minute; upload a .exe renamed .pdf.",
    expect: "Rate-limited after a handful; the renamed file refused by its first bytes, not its extension.",
    status: "open", tested: "2026-10-09", note: "Honeypot only today." },
  { id: "S13c", group: G.access, title: "The Resend webhook verifies a signature",
    how: "POST /api/marketing/webhook with a forged body and no Svix headers.",
    expect: "401. A genuine Resend event (test mode) is accepted.",
    status: "open", tested: "2026-10-09", note: "Today the secret is the last 12 characters of the API key in the URL." },
  { id: "S13d", group: G.access, title: "Salary-slip WhatsApp link is short-lived and carries no open CORS",
    how: "Open a slip link from the HRMS screen; wait 31 minutes; open it again. Check response headers.",
    expect: "Second open says expired. No Access-Control-Allow-Origin header; the helper extension still fetches.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },

  /* ───────────── 2 · input and content ───────────── */
  { id: "S9", group: G.input, title: "A WhatsApp reply cannot run script in HR's browser",
    how: "On the test database insert an hrms_communication row (direction in) with body <img src=x onerror=alert(1)>. Open HRMS → Communications and expand it.",
    expect: "The text shows literally; nothing runs.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S10a", group: G.input, title: "Landing-page body is sanitised on save and on show",
    how: "Marketing → Landing pages: save a body containing <script>alert(1)</script><b>ok</b>. Open /lp/<slug>.",
    expect: "Bold “ok” shows; no script in the stored row or the page.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S10b", group: G.input, title: "ERP ticket HTML in Seva is sanitised",
    how: "On the test database set a seva issue's description_html to <svg onload=alert(1)>text</svg>. Open the issue.",
    expect: "“text” shows; nothing runs.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S10c", group: G.input, title: "The ERP file door passes files only, never the ERP API",
    how: "As a CRM user GET /api/crm/erp-file?u=https://<erp host>/api/resource/Customer, then ?u=https://<erp host>/files/<a real image>.",
    expect: "First → 403. Second → the image inline with content-type from its bytes, nosniff, sandbox CSP.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S11", group: G.input, title: "A Content-Security-Policy is in place",
    how: "curl -I https://<test host>/ and read content-security-policy.",
    expect: "A script-src policy (report-only first, then enforced), not frame-ancestors alone.",
    status: "open", tested: "2026-10-09", note: "The CORS * seen on /login is Vercel's static-cache header, not a Genie setting — nothing to remove." },
  { id: "S15c", group: G.input, title: "Search boxes cannot widen a database filter",
    how: "In Saamaan → Items search for   x),or(item_code.ilike.%   and in Kuber → vouchers search for   a,b)   .",
    expect: "An ordinary empty or narrow result; no 500, no widened list.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S15d", group: G.input, title: "PDF pressing runs no script",
    how: "Make a feature request or memo whose HTML carries <script>document.title='x'</script> and press it to PDF.",
    expect: "PDF renders; the script has no effect (JavaScript is off in the press).",
    status: "fixed", tested: null, fixedIn: "6.3.1.0" },
  { id: "S15e", group: G.input, title: "No SVG on the public marketing bucket",
    how: "Marketing → upload an .svg asset.",
    expect: "Refused by the bucket (migration 0212). PNG/JPEG/PDF still accepted.",
    status: "fixed", tested: null, fixedIn: "0212" },

  /* ───────────── 3 · database posture ───────────── */
  { id: "S14", group: G.db, title: "Every table has RLS; nothing is reachable with the anon key",
    how: "Run the proof query at the end of migration 0211. Then with the anon key GET rest/v1/<t>?select=*&limit=1 for hrms_salary_history, genie_backup, hrms_mass_mail, consult_kb, audit_query, labour_rate, job_manpower, plan_belief, seva_master, hrms_idp_login.",
    expect: "Proof query returns no rows. Each GET is 401 or empty.",
    status: "fixed", tested: "2026-10-09", fixedIn: "0211", note: "Live on 9 Oct these answered 401/empty because somebody locked them by hand; 0211 makes the repository say the same." },
  { id: "S4b", group: G.db, title: "A disabled person's existing session is dead at the database",
    how: "Log in as a test user, copy the sb-* cookie, disable the user in Admin → Users, replay the cookie against rest/v1/manual_tasks.",
    expect: "0 rows (jwt_role() answers null for a disabled profile, 0209).",
    status: "fixed", tested: null, fixedIn: "0209" },

  /* ───────────── 4 · secrets and tokens ───────────── */
  { id: "S15a", group: G.secrets, title: "No fixed-word signing secret anywhere",
    how: "grep -rn '\"genie\"' src/lib/idp-session.ts src/lib/kindle/auth.ts src/lib/portal/auth.ts src/lib/wa-slip-token.ts. Then unset SESSION_SECRET and SUPABASE_SERVICE_ROLE_KEY locally and open /idp.",
    expect: "No hits. With neither key set the login errors rather than signing with a known word.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0", note: "Setting SESSION_SECRET on Vercel for the first time signs everyone on those four doors out once." },
  { id: "S15b", group: G.secrets, title: "Server errors do not leak database words to the browser",
    how: "Trigger a 500 (e.g. a route against a renamed test table) and read the JSON.",
    expect: "“Something went wrong on the server. It has been logged.” The real message is in Vercel's function log.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S15f", group: G.secrets, title: "The seed script refuses to run without a password",
    how: "node scripts/seed.ts without SEED_PASSWORD, against the test database only.",
    expect: "Stops with “SEED_PASSWORD must be set”.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0" },
  { id: "S15g", group: G.secrets, title: "AI routes have a per-user daily cap",
    how: "Call /api/brain-dump/ai (or any Claude route) 200 times as one user in a day.",
    expect: "A cap answers 429 before the 200th.",
    status: "open", tested: "2026-10-09" },
  { id: "S15h", group: G.secrets, title: "Kindle family details: who sees whose",
    how: "Log in as a Kindler; open Directory → another member.",
    expect: "Their family is shown — by design since 1.0.0 (birthdays for the group). Dr Raghu confirms this is intended.",
    status: "decision", tested: "2026-10-09" },

  /* ───────────── 5 · data correctness ───────────── */
  { id: "D1", group: G.data, title: "CRM dashboard counts and sums are not cut at 1,000 rows",
    how: "On the test database seed 1,200 quotations in the year. CRM → Dashboard. Compare with select count(*), sum(grand_total).",
    expect: "The dashboard shows 1,200 and the SQL sum, not 1,000. /api/today lists a task beyond the first thousand.",
    status: "open", tested: "2026-10-09", note: "Live showed exactly 1000 quotations. scope=me IS applied; the ₹606 Cr is a data question (who the ERP import stamps as owner)." },
  { id: "D1b", group: G.data, title: ".limit() above 1,000 is honoured",
    how: "Saamaan → MRP and Inventory on a run with more than 1,000 items.",
    expect: "All items counted (today .limit(5000) silently returns 1,000).",
    status: "open", tested: "2026-10-09" },
  { id: "D2", group: G.data, title: "No screen ever prints [object Object]",
    how: "CRM → Dashboard → Funnel with the test database's statement timeout set low; and any route returning {\"error\":\"\"}.",
    expect: "A sentence (“HTTP 500” at worst) and a Retry; the funnel's Nurturing count scoped to the person.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0", note: "The message helper is repaired; the funnel's own count scoping is still owed." },
  { id: "D3", group: G.data, title: "A plan save is all-or-nothing and detects a stale save",
    how: "Make a milestone insert fail (bad data) and save. Then open the same job in two tabs, save in both.",
    expect: "Failed save leaves plan AND milestones unchanged; the second stale save answers 409.",
    status: "open", tested: "2026-10-09" },
  { id: "D4", group: G.data, title: "A backup that skipped a table is not reported ok",
    how: "Revoke the service key's read on one table in the test database; run /api/cron/backup.",
    expect: "The run shows incomplete in red in 💾 Backups and names the table; paging carries order=id.",
    status: "open", tested: "2026-10-09" },
  { id: "D5", group: G.data, title: "Home says how old each feed is",
    how: "Home, two days after the last Excel upload.",
    expect: "“Data is N days old — owner: X” in red per feed (Excel, ERP sync, Tally).",
    status: "open", tested: "2026-10-09", note: "Confirm with Dr Raghu whether the morning Excel upload still runs — Home said 31 Aug on 9 Oct." },
  { id: "D6", group: G.data, title: "Dates are Indian time and one format",
    how: "Before 05:30 IST open CRM → Funnel “Today”; press “This year”.",
    expect: "Today is today in India; This year is the financial or calendar year as labelled; dates print DD-MM-YY everywhere.",
    status: "decision", tested: "2026-10-09", note: "fmt.ts already has istToday/dmy (DD-MM-YYYY); Dr Raghu to pick YY or YYYY before the sweep." },
  { id: "D7", group: G.data, title: "Home's lateness figures agree with its cards",
    how: "Home with jobs overdue against original delivery date.",
    expect: "“Late vs current plan: N” and “Late vs original commitment: M” shown separately; “20 of N” with Show all.",
    status: "open", tested: "2026-10-09" },
  { id: "D8", group: G.data, title: "Fast filter changes never show a stale answer",
    how: "CRM → Dashboard: change scope three times quickly on a slow connection.",
    expect: "The widgets settle on the last choice; each widget has its own loading / empty / error state.",
    status: "open", tested: "2026-10-09" },
  { id: "D9", group: G.data, title: "No duplicate calls; negative money reads right; one version badge",
    how: "Home with DevTools Network open. Kuber with a negative figure. Kuber header.",
    expect: "notifications, my-week, run-rate fetched once each; “−₹1.13 Cr” not “₹-113.3 L”; the badge reads the full version.",
    status: "open", tested: "2026-10-09" },
  { id: "D10", group: G.data, title: "Mutations validate their input",
    how: "POST /api/plan with milestones: \"x\" and a date of 2026-13-45.",
    expect: "400 with the field named, not a 500 or a half-written row.",
    status: "open", tested: "2026-10-09" },

  /* ───────────── 6 · speed ───────────── */
  { id: "P1", group: G.speed, title: "Auth is not re-resolved on every static request",
    how: "DevTools: load Home; count requests to the Supabase auth endpoint; load an mp3 or /lp/<slug> signed out.",
    expect: "No auth call for public files; one profile read per API request; last_seen_at written at most every five minutes.",
    status: "open", tested: "2026-10-09" },
  { id: "P2", group: G.speed, title: "Kuber dashboard under 2 s",
    how: "Time /api/kuber/books?view=summary on the live-sized book.",
    expect: "Under 2 s (was 11.1 s on 9 Oct). Filtered by financial year; cached per upload.",
    status: "open", tested: "2026-10-09" },
  { id: "P3", group: G.speed, title: "Large screens are code-split",
    how: "next build output: first-load JS for /, /crm, /kuber.",
    expect: "Home well under 2.4 MB decoded; Record, Admin, Tasking, Books chunks load on demand.",
    status: "open", tested: "2026-10-09" },
  { id: "P4", group: G.speed, title: "Idle tabs stop polling; no timer leaks",
    how: "Open Home, switch tabs for five minutes, watch Network. Navigate between modules ten times and check setInterval count.",
    expect: "No bell/heartbeat calls while hidden; interval count does not grow.",
    status: "open", tested: "2026-10-09" },
  { id: "P5", group: G.speed, title: "No per-row database calls in the ERP pull; bulk actions are one request",
    how: "Run /api/cron/erp-pull with Supabase query logs on; bulk-delete 20 CRM rows.",
    expect: "Companies looked up once into a map; one request for the bulk action.",
    status: "open", tested: "2026-10-09" },
  { id: "P6", group: G.speed, title: "Assets are sized for where they show",
    how: "Network tab on Home: consult-raghu.png and Raghu Solo.png sizes; /api/health response time.",
    expect: "Small WebP; /api/health does not load the 1.1 MB changelog.",
    status: "open", tested: "2026-10-09" },

  /* ───────────── 7 · menus, UI, accessibility ───────────── */
  { id: "M1", group: G.ui, title: "One module registry",
    how: "Compare Home tiles, the GenieShell menu and /api/home.",
    expect: "The same modules in all three, including Marketing, Seva and Portal where granted; Planning called Planning everywhere.",
    status: "open", tested: "2026-10-09" },
  { id: "M2", group: G.ui, title: "English meaning on each tile",
    how: "Home on a phone.",
    expect: "“Kuber · Accounts”, “Saamaan · Materials” visible without hover.",
    status: "decision", tested: "2026-10-09", note: "Dr Raghu asked for hover-only on 6 Sep 2026; his call to reverse." },
  { id: "M3", group: G.ui, title: "Unfinished items are hidden from non-admins",
    how: "HRMS and Kuber menus as a non-admin.",
    expect: "No “Soon” items; CRM Dashboard/Analytics blurbs no longer say “Being built”.",
    status: "open", tested: "2026-10-09" },
  { id: "M4", group: G.ui, title: "One Change-password entry in the Planning menu",
    how: "Planning → account menu.",
    expect: "One entry.",
    status: "open", tested: "2026-10-09" },
  { id: "M5", group: G.ui, title: "Dead code removed",
    how: "GoalsBoard.tsx, SalesGenie.tsx, the opsbook tab.",
    expect: "Gone; /api/goals/access and kindle/Soon.tsx kept (they are live).",
    status: "open", tested: "2026-10-09" },
  { id: "U1", group: G.ui, title: "Phone layout: account menu reachable, tap targets 44 px",
    how: "375 px wide: Home, On Floor, My Tasks, Job Live.",
    expect: "Account menu on screen; no sideways scroll of header bars; cards instead of wide tables.",
    status: "open", tested: "2026-10-09" },
  { id: "U2", group: G.ui, title: "Contrast and type size",
    how: "Any screen: muted text against white; MyWeek delivery cards.",
    expect: "Muted ≥ 4.5:1 (one token in globals.css); no text under 12 px.",
    status: "open", tested: "2026-10-09" },
  { id: "U3", group: G.ui, title: "No browser pop-ups; deletes confirm",
    how: "IMS → Certificates → delete; any Save that fails.",
    expect: "A dialog or toast of Genie's own; the certificate delete asks first.",
    status: "open", tested: "2026-10-09" },
  { id: "U4", group: G.ui, title: "Labels, dialogs and keyboard",
    how: "/login with a screen reader; New Task → Escape.",
    expect: "Inputs announced by their labels (htmlFor/id); the dialog closes on Escape and returns focus.",
    status: "open", tested: "2026-10-09" },
  { id: "U5", group: G.ui, title: "A failed save, delete, upload or send is visible",
    how: "Disconnect the network and press Save on a task.",
    expect: "A visible error, not silence.",
    status: "open", tested: "2026-10-09" },
  { id: "U7", group: G.ui, title: "One greeting on Home; no Mac-only tips",
    how: "Home as a non-admin.",
    expect: "One greeting; “reload” not “⌘⇧R”.",
    status: "open", tested: "2026-10-09" },

  /* ───────────── 8 · documentation and versioning ───────────── */
  { id: "W1", group: G.docs, title: "The Software Description is true",
    how: "Read sections 1, 5 and 13 of this page against vercel.json, src/app/portal, src/app/kindle, src/app/lp.",
    expect: "No claim of “not wired into the ERP” or “staff only”; suppliers list Apollo, AiSensy, Periskope, Zoom, Resend; counts current; a 💾 Backups section with the restore status.",
    status: "open", tested: "2026-10-09" },
  { id: "W2", group: G.docs, title: "package.json and the repo docs match the running version",
    how: "package.json version and description; README, HANDOVER.md, NEXT.md headers.",
    expect: "Version equals the badge; description current; old docs marked historical.",
    status: "fixed", tested: "2026-10-09", fixedIn: "6.3.1.0", note: "Version synced; description and the three docs still owed." },
  { id: "W3", group: G.docs, title: "What's new is visible to everyone and the version rule is checked",
    how: "Click the version badge as a non-admin. Run the build with a changelog entry out of order.",
    expect: "The last ten summaries by module; the build refuses an out-of-order version.",
    status: "open", tested: "2026-10-09" },

  /* ───────────── 9 · dependencies and hygiene ───────────── */
  { id: "S16", group: G.deps, title: "Framework and dependencies patched",
    how: "npm audit on the lockfile; package.json next, @supabase/ssr, @sparticuz/chromium, puppeteer-core.",
    expect: "No critical; Next on a supported line (14.2.35 is the end of 14 — the current advisories need 15.5.24+); ssr on getAll/setAll; chromium and puppeteer pinned exactly.",
    status: "decision", tested: "2026-10-09", note: "On 9 Oct: 1 critical, 12 high, 4 moderate. Next 15 is a major upgrade — Dr Raghu's call. exceljs stays (appraisal sheet styling)." },
  { id: "E1", group: G.deps, title: "Automated tests exist and run on every change",
    how: "ls for *.test.* ; the CI workflow.",
    expect: "Auth role matrix, policy tests on staging, money totals vs SQL, plan save rollback, XSS regressions, smoke per app.",
    status: "open", tested: "2026-10-09" },
  { id: "E2", group: G.deps, title: "Lint is clean and runs in CI",
    how: "next lint; .github/workflows.",
    expect: "0 errors; typecheck → lint → test → build on every push.",
    status: "open", tested: "2026-10-09", note: "9 Oct: 21 errors (2 missing-rule definitions) and 23 warnings." },
  { id: "E3", group: G.deps, title: "One paging helper; the 5 MB merge log out of the repo",
    how: "grep for hand-rolled range loops in kuber/books and crm/[doctype]; du -sh docs/crm-merges.",
    expect: "All paging through one helper; the JSON gone from git.",
    status: "open", tested: "2026-10-09" },
];

/** The latest date anybody ran a check — what the section heading shows. */
export function lastSecurityTestDate(): string | null {
  return SECURITY_CHECKS.reduce<string | null>((m, c) => (c.tested && (!m || c.tested > m) ? c.tested : m), null);
}

export function securityCheckTotals(): Record<CheckStatus, number> {
  const t: Record<CheckStatus, number> = { pass: 0, fail: 0, fixed: 0, open: 0, decision: 0, na: 0 };
  for (const c of SECURITY_CHECKS) t[c.status] += 1;
  return t;
}
