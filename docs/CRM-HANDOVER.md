# Sales Genie · CRM — Handover

**Module:** CRM · **Route:** `genie.nandan.co.in/crm`
**Stack:** React + Vercel · Supabase
**Repo:** one repository, one git history, **one Genie version number across all modules**
**Database:** the CRM has its **own dedicated Supabase project**, separate from the shared Genie database
**Owner:** Dr Raghu, Nandan GSE Pvt Ltd
**Package:** 0.1.0 — framework handover

---

## 0. How to use this package

1. Copy the contents of this folder into the Sales Genie repo root. Nothing overwrites Planning Suite or HRMS — everything lives under `src/modules/crm/`, `api/crm/`, `supabase-crm/`, `docs/`.
2. Open Claude Code in the repo root.
3. Give it exactly this:

   > Read `CLAUDE.md`, `docs/DATABASE-SPLIT.md` and `docs/HANDOVER.md`. Then implement Phase 1 as described in §5. Ask me before touching anything in `src/shared/`, the Genie `supabase/` folder, or the Planning Suite and HRMS modules.

4. Create the CRM dev project, link it, apply migrations:

   ```bash
   supabase link --project-ref <crm-dev-ref> --workdir supabase-crm
   supabase db reset --workdir supabase-crm
   ```

**Read §2 and §3 before writing code.** They contain decisions already made.

---

## 1. What this is

A CRM inside Sales Genie for **Nandan GSE Pvt Ltd** — a manufacturer of aviation ground support equipment, defence mobility systems and industrial handling solutions. Founded 1991, ~270 employees, ~₹65 Cr revenue, exports to 30+ countries, ~95% share of Hi-Lift catering loaders at Indian airports. Target ₹120 Cr at 8% PBT by 2027.

A CRM for a company that sells **capital equipment with a long aftermarket tail** — not a SaaS pipeline tool.

The data model is re-implemented from the **Twenty CRM** object model (company / person / opportunity / task / note / timeline / message / call recording), adapted for manufacturing. **Structure and naming conventions only — no Twenty source code is copied, vendored or imported.** Twenty is AGPL-3.0; Sales Genie stays proprietary.

### What it is not

- **Not an ERP.** ERPNext stays the system of record for orders, inventory, production, dispatch. **ERPNext is not modified.** We store `erpnext_item_code` and `erpnext_so_no` as plain text. No live coupling.
- **Not multi-tenant.** One company, one workspace. Do not build workspace scoping.
- **Not a new inbox.** Mail sends and receives through each user's own `@nandan.co.in` mailbox. The customer never sees a new address.

---

## 2. Architecture — the part most likely to bite you

The CRM has **its own Supabase project**, deliberately. It is the module that grows fastest and heaviest, and it must never slow down Planning Suite — or be slowed by it.

**One rule:** the CRM writes only to the CRM project, reads the Genie project, and never joins across the two. The bridge between them is the user's `@nandan.co.in` email address, nothing else.

Full detail in **`docs/DATABASE-SPLIT.md`**. Read it. The most likely bug in this codebase is someone storing a Genie user id in a CRM table — it will look like it works and point at the wrong person.

Both projects use the `public` schema. CRM migrations live in `supabase-crm/migrations/` with their own sequence starting at `0001`.

---

## 3. Non-negotiables

Already decided. Do not re-open in code review.

1. **Three separate pipelines, never one.** `capital` (Hi-Lift loaders, bowsers, ASRS, platforms) · `aftermarket` (service, AMC, retrofits) · `spares`. A ₹4 Cr hi-lift and a ₹40,000 spares order must never share a funnel or a conversion rate.
2. **Every inbound message becomes a Lead row.** No silent drops. Junk gets `status = 'spam'` and stays — we need the denominator to know what portal traffic actually costs.
3. **Lost deals require a reason.** DB constraint. Optional means empty, and empty means the AI eventually learns a flattering lie about how good we are.
4. **Money is computed in Postgres**, by `public.recalc_quotation()`. The front end displays; it does not calculate.
5. **AI proposes, a human sends.** Drafts land in `ai_draft` with `approved_by` null. Log the edit — the delta between `draft_body` and `edited_body` is the best training signal we will get.
6. **The response clock is a field, not a report.** `lead.first_response_due_at` is set on insert: 15 minutes in working hours, 4 hours overnight and export.
7. **Owner concentration is on the home screen.** `v_owner_concentration` exists because today most order value flows through two people. A number nobody sees is a number nobody manages.
8. **No password is ever stored in an application table.** Supabase Vault holds it; the table holds a UUID.

---

## 4. The workflow in one line

**Inbound (email · IndiaMART · WhatsApp · call) → Lead → Opportunity → Quotation → Order (handed to ERPNext).**

---

## 5. Build phases

### Phase 1 — Framework · build this now

- [ ] Create CRM Supabase projects (prod + dev); enable Google auth restricted to `nandan.co.in`
- [ ] Apply `0001_core.sql` and `0002_sales_settings.sql`
- [ ] Seed `profile` for the 12 leadership pilot users, keyed on email
- [ ] Seed the **real** GSE product catalogue — before the quote builder, which is worthless on invented SKUs
- [ ] CRUD screens: Company · Person · Lead · Opportunity · Product · Task
- [ ] Three kanban boards, one per pipeline, driven by `opportunity.stage`
- [ ] Company 360: contacts, open opportunities, quotations, installed units, timeline, messages
- [ ] Sales Settings: mailbox connect + WhatsApp config (§7)
- [ ] Call ingest endpoint (§6) — accept and store, no AI yet
- [ ] CEO cockpit: `v_owner_concentration`, `v_funnel`, `v_response_sla`

### Phase 2 — Quotation engine

Line items, optional lines, product options, discount, freight/insurance/packing/installation, GST by HSN, Incoterms, validity, warranty, payment terms. Revisions via `parent_quote_id` + `revision` — never overwrite a sent quote. Live `margin_pct` with a floor requiring `sales_head` approval to breach. PDF on Nandan letterhead → Supabase Storage. "Find similar past quotes": same product, country, quantity band, with won/lost outcome and final price.

### Phase 3 — Channels

IndiaMART lead API (polled) · WhatsApp Business Cloud API webhook · IMAP/SMTP per user. Google Ads and LinkedIn: attribution fields only.

### Phase 4 — AI layer

Lead scorer and pipeline router → `ai_score`, `ai_reasoning`, `pipeline`. Reply drafter → `ai_draft`, grounded in past quotes and past answered messages. Service/AMC radar off `installed_unit.next_service_due` → auto-create `aftermarket` opportunities.

---

## 6. Ingest contract — the Emergent mobile app

A separate mobile app records calls, uploads audio to Google Drive, transcribes, summarises, creates a task, then POSTs here.

**`POST /api/crm/ingest/call`** · service-role bearer token, one per device.

```json
{
  "external_id": "device-uuid-1234",
  "device_owner_email": "santosh.patra@nandan.co.in",
  "direction": "outbound",
  "counterpart_number": "+919876543210",
  "started_at": "2026-08-24T10:14:00+05:30",
  "ended_at": "2026-08-24T10:23:40+05:30",
  "duration_seconds": 580,
  "recording_url": "https://drive.google.com/file/d/.../view",
  "drive_file_id": "1AbC...",
  "transcript": "...",
  "transcript_lang": "hi-IN",
  "ai_summary": "...",
  "ai_next_action": "Send revised quote for 2 x HL-7000 by Wed",
  "consent_captured": true
}
```

Server behaviour:

1. Upsert on `external_id` — the app retries; this must be idempotent.
2. Match `counterpart_number` against `person.primary_phone` / `whatsapp_number`: E.164 exact, then last-10-digits fallback. Record `matched_by`.
3. Unmatched → leave `person_id` null and surface an "unmatched calls" queue. **Do not guess.**
4. `ai_next_action` present → create a `task` for the device owner, link `call_log.task_id`.
5. Write an `activity` row, `verb = 'called'`.
6. Reject anything with `consent_captured = false`.

**Distribution reality check:** third-party call recording apps cannot be published to the public Play Store. Route this through **Managed Google Play as a private app** on Workspace-enrolled devices, or move capture to cloud telephony. Either way the ingest contract above is unchanged.

**Consent is a legal matter, not a boolean.** Written consent in the employment terms before the pilot goes past 12 users.

---

## 7. Sales Settings

### 7.1 Per-user mailbox

Each user connects their own `@nandan.co.in` mailbox so mail sends and receives **as them**. Fields: email address (domain-constrained), display name, app password (write-only), IMAP/SMTP host, port, security, sync-since, signature, auto-log toggles. Status badge: Unverified → Active → Auth failed → Disabled.

**Use an app-specific password, never the user's real login password.** Google Workspace: Security → 2-Step Verification → App passwords. A 16-character token scoped to mail only, revocable from the admin console. Asking 270 people to type their real Google password into a form on `genie.nandan.co.in` builds a phishing page and teaches the company to trust it. Say so on the form itself.

Rules:

1. Password field is write-only. No endpoint returns it or its Vault ref.
2. Credentials handled server-side only, with the service role. `store_mailbox_credential()` writes to Vault and returns a UUID; the table stores the UUID.
3. **Verify before storing** — open a real IMAP connection and SMTP handshake. Save only on success; return the actual error on failure.
4. On repeated auth failure set `status = 'auth_failed'` and stop retrying, or Google will lock the account.
5. RLS lets a user read only their own mailbox row. Do not loosen it.
6. Settings screen reads `v_my_mailbox`, which omits `credential_ref` by design.
7. Offboarding: delete the mailbox row. Add to the HR exit checklist.

Longer term, move to Workspace OAuth with domain-wide delegation — nobody types a password, offboarding is automatic. The schema already allows it (`credential_kind = 'oauth_refresh_token'`).

### 7.2 Company WhatsApp

**One business number, many agents.** Not one per salesperson — personal WhatsApp on personal handsets is the problem this replaces: when a salesperson leaves, the customer relationship walks out with the SIM.

Admin-only screen: display number (E.164), verified name, provider (Meta Cloud direct, or Gupshup/Wati as an Indian BSP), WABA ID, phone number ID, access token and webhook verify token (both → Vault), default owner, business hours (IST, Mon–Fri 09:30–18:30, Sat 09:30–14:00).

Routing: inbound → match `from_handle` to `person.whatsapp_number` → that person's owner; else keyword match on `whatsapp_agent.keywords`; else `default_owner_id`. Write `message.agent_profile_id`.

Two constraints to design around now:

- Outside 24 hours from the customer's last message, WhatsApp allows **only pre-approved templates**. Build the template library before Phase 3 or the first quote follow-up silently fails.
- Meta requires business verification and a number not registered on the consumer WhatsApp app. Pick a number that is **not** anyone's handset. Start the paperwork early — weeks, not days.

---

## 8. Conventions

| | |
|---|---|
| Dates displayed | `DD-MM-YY` |
| Currency | INR; dashboards in **Cr** |
| Phones stored | E.164 |
| Quote numbering | `NGSE/QT/26-27/0001`, FY Apr–Mar |
| Deletes | Soft (`deleted_at`) on company, person, opportunity |
| `activity` | Append-only. Never update or delete |
| Secrets | Supabase Vault only |
| Migrations | `supabase-crm/migrations/`, own sequence, additive only |
| Version | One Genie version number. `v0.4.0`, not `crm-v0.4.0` |
| Branching | One fork at a time. Short-lived branch, squash-merge to `main` |

---

## 9. Out of scope

Any modification to ERPNext · marketing campaign sending · multi-currency consolidation beyond `currency` + `fx_rate` · a mobile app for the CRM itself (the Emergent app is call capture only) · running Twenty CRM as a dependency · any cross-database join.

---

## 10. Package contents

```
CLAUDE.md                              read first, every session
docs/HANDOVER.md                       this file
docs/DATABASE-SPLIT.md                 two projects, one email bridge

supabase-crm/migrations/0001_core.sql            schema, views, RLS
supabase-crm/migrations/0002_sales_settings.sql  mailbox + WhatsApp, Vault
supabase-crm/seed/crm_seed.sql                   dev seed (PLACEHOLDER SKUs)

src/modules/crm/types.ts               TypeScript types mirroring the schema
src/modules/crm/constants.ts           stages, sources, SLA, guardrails
src/modules/crm/lib/supabase.ts        crm() / genieDb() / getServiceClient()
src/modules/crm/lib/money.ts           INR / Cr formatting, DD-MM-YY
src/modules/crm/lib/phone.ts           E.164 normalise + match strategy
src/modules/crm/lib/quoteNumber.ts     NGSE/QT series on FY Apr–Mar
src/modules/crm/lib/sla.ts             the response clock
src/modules/crm/data/*.ts              typed data access per object

api/crm/ingest/call.ts                 Emergent mobile app endpoint
api/crm/settings/mailbox.ts            verify-then-store credential flow

.env.example
```

Vercel Functions in `api/` work under both Vite and Next.js. If Sales Genie is Next.js App Router, move `api/crm/**` to `app/api/crm/**/route.ts` — the logic is unchanged.

---

## 11. Known gaps — fix before this reaches 270 people

1. **Quote numbering uses a client-side count** (`data/quotations.ts`, marked TODO). Two people creating a quote at the same moment will both get `0042`. Move sequence allocation into a Postgres function.
2. **The seed catalogue is placeholder SKUs.** Replace with the real GSE model list before anyone builds a quotation on it.
3. **Profile sync from the Genie employee master is not built.** Phase 1 seeds 12 users by hand — fine for a pilot, not for 270.
