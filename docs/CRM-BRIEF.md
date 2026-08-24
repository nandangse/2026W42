# Sales Genie — CRM Module
## Build brief for Claude Code

**Route:** `genie.nandan.co.in/crm`
**Stack:** existing Sales Genie stack — React + Vercel front end, self-hosted Supabase (PostgreSQL) back end. No new infrastructure.
**Schema file:** `001_sales_genie_crm.sql` (apply first)
**Owner:** Dr Raghu, Nandan GSE Pvt Ltd
**Status:** Phase 1 — minimum framework

---

## 1. What this is

A CRM module inside Sales Genie for Nandan GSE — a manufacturer of aviation ground support equipment, defence mobility systems and industrial handling solutions. ~270 employees, ~₹65 Cr revenue, exports to 30+ countries.

The data model is **re-implemented from the Twenty CRM object model** (company / person / opportunity / task / note / timeline / message / call recording), adapted for a manufacturer selling capital equipment with a long aftermarket tail. Structure and naming conventions only — **do not copy, vendor, or import any Twenty source code.** Twenty is AGPL-3.0; Sales Genie stays proprietary. Everything here is written fresh against Supabase.

## 2. What Sales Genie is NOT

- **Not an ERP.** ERPNext stays the system of record for orders, inventory, production and dispatch. ERPNext will not be modified. Integration is one-way and loose: we store `erpnext_item_code` and `erpnext_so_no` as plain text references. No live coupling in Phase 1.
- **Not a second inbox.** Email, WhatsApp and IndiaMART are ingested and answered from here, but the customer never sees a new address.
- **Not multi-tenant.** One company, one workspace. Do not build workspace scoping — it is the single biggest source of complexity in Twenty and we do not need it.

## 3. The workflow, in one line

**Inbound message (email / IndiaMART / WhatsApp / call) → Lead → Opportunity → Quotation → Order (handed to ERPNext).**

Every inbound message becomes a Lead row. No exceptions, no silent drops. A Lead that is junk gets `status = 'spam'` and stays in the table — we need the denominator to know what portal traffic actually costs us.

---

## 4. Non-negotiables

These are decisions already made. Do not re-open them in code review.

1. **Three separate pipelines, never one.** `capital` (Hi-Lift loaders, bowsers, ASRS, platforms), `aftermarket` (service, AMC, retrofits), `spares`. A ₹4 Cr hi-lift and a ₹40,000 spares order must never share a funnel or a conversion rate. The `pipeline` enum is on Lead, Opportunity and Product.
2. **Lost deals require a reason.** Enforced at database level (`opportunity_lost_needs_reason`). If the reason is optional, it will be empty, and the historical data we are building this on will be a flattering lie.
3. **Money is computed in Postgres, never in the browser.** The `crm.recalc_quotation()` trigger owns subtotal, discount, tax and grand total. The front end displays; it does not calculate.
4. **AI proposes, a human sends.** Every AI-drafted reply lands in `crm.ai_draft` with `approved_by` null. Nothing leaves the building without a person tapping approve. Log the edit — the difference between `draft_body` and `edited_body` is our best training signal.
5. **Response clock is a first-class field, not a report.** `lead.first_response_due_at` is set on insert. 15 minutes in working hours, 4 hours overnight/export. `crm.v_response_sla` is the scoreboard.
6. **Owner concentration is visible on the home screen.** `crm.v_owner_concentration` exists because today most order value flows through two people. A number that is not on screen does not get managed.

---

## 5. Build order

### Phase 1 — Framework (build this now)
- Apply `001_sales_genie_crm.sql`.
- Auth: reuse existing Sales Genie Supabase auth. Seed `crm.profile` for the 12 leadership pilot users.
- CRUD screens: Company, Person, Lead, Opportunity, Product, Task.
- Three kanban boards (one per pipeline) driven by `opportunity.stage`.
- Company 360 view: contacts, open opportunities, quotations, installed units, timeline (`crm.activity`), messages.
- Generic ingest endpoint (see §6) — accept and store, no AI yet.
- Seed the product catalogue with the real GSE model list before anything else. The quotation engine is worthless on fake SKUs.

### Phase 2 — Quotation engine
- Quote builder: line items, optional lines, product options, discount, freight/insurance/packing/installation, GST by HSN, Incoterms, validity, warranty, payment terms.
- Revisioning via `parent_quote_id` + `revision`. Never overwrite a sent quote.
- Margin guard: show `margin_pct` live; block send below a floor without `sales_head` approval.
- PDF generation on Nandan letterhead → Supabase Storage → `quotation.pdf_url`.
- "Find similar past quotes" — same product, same country, same quantity band, with won/lost outcome and final price.

### Phase 3 — Channels
- IndiaMART pull (their lead API, polled) → `crm.lead` + `crm.message`.
- WhatsApp Business Cloud API webhook → `crm.message`, matched to `person.whatsapp_number`.
- Email via IMAP/SMTP on `sales@` and named inboxes → `crm.message`, threaded on `thread_key`.
- Google Ads and LinkedIn: attribution fields only in Phase 3. Full connectors later.

### Phase 4 — AI layer
- Lead scorer and pipeline router writing `ai_score`, `ai_reasoning`, `pipeline`.
- Reply drafter writing `crm.ai_draft`, grounded in past quotes and past answered messages.
- AMC/service due radar off `installed_unit.next_service_due` → auto-create `aftermarket` opportunities.

---

## 6. Ingest contract — the Emergent mobile app

A separate mobile app (built in Emergent) records calls on the salesperson's phone, uploads the audio to Google Drive, transcribes and summarises it, and creates a task. Its last step is to POST here.

**Endpoint:** `POST /api/crm/ingest/call`
**Auth:** service-role bearer token, per device.

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
1. Upsert into `crm.call_log` on `external_id` — the app will retry, this must be idempotent.
2. Match `counterpart_number` against `person.primary_phone` / `person.whatsapp_number` (E.164, then last-10-digits fallback). Set `matched_by`.
3. If unmatched, leave `person_id` null and surface it in an "unmatched calls" queue for a human to link. Do not guess.
4. If `ai_next_action` is present, create a `crm.task` assigned to the device owner and link `call_log.task_id`.
5. Write a `crm.activity` row (`verb = 'called'`) against the matched company or person.

**Consent:** call recording is legally sensitive. Only ingest records where `consent_captured` is true, and only for company-issued numbers on company business. Get this in writing from HR before the pilot goes past 12 users.

---

## 7. Conventions

- Dates displayed **DD-MM-YY**. Currency INR, and large figures shown in **Cr** on dashboards.
- All phone numbers stored **E.164**.
- Quote numbering: `NGSE/QT/26-27/0001`, financial year Apr–Mar.
- Everything soft-deletes (`deleted_at`); nothing is hard-deleted from company, person or opportunity.
- Timeline (`crm.activity`) is append-only. Never update or delete a row.
- Secrets live in Supabase Vault. `channel_account.credentials` stores references, never tokens.

---

## 8. Explicitly out of scope for now

- Any modification to ERPNext.
- Marketing email campaign sending (the schema has room; the feature waits).
- Multi-currency consolidation beyond storing `currency` + `fx_rate`.
- Mobile app for the CRM itself — the Emergent app is call capture only.
- Twenty CRM as a runtime dependency. We took the schema shape. We are not running their server.
