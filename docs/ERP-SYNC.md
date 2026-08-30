# The ERP ↔ Genie sync — how the two systems talk

_Written 30 Aug 2026, at Dr Raghu's ask. This is the whole contract in one page._

## The standing law

**Sales-side is PULL-ONLY.** Opportunity, Quotation and Sales Order edits made in
Genie are tracked in the audit trail and NOT written back to the ERP — until
Raghu says sync. Two sanctioned exceptions exist, both explicit buttons:

1. **⬆ Push to ERP** on a Genie-born enquiry — CREATES the Opportunity in the
   ERP (with a new Customer and Contact when the ERP lacks them). Creation only.
2. **⬆ Push to ERP** on the Update-to-ERP console (Planning Suite) — writes the
   queued JOB corrections (TDD, kitting %, production %, status, W-note, amount
   needed, escalation) onto the Jobmaster, one PUT per job. Raghu and Pankaj's
   hands only. Ticked lines can leave the queue as **cancelled** instead.

## The pull — hourly, at a quarter past

`/api/cron/erp-pull` (vercel.json cron, `15 * * * *`) walks two phases:

- **Phase 1 — new enquiries.** Every ERP Opportunity CREATED since the cursor
  comes into the CRM: 1:1 customer and contact links, enquiry text as rich
  text, stage / sector / product family / salesperson mapped. Enquiries Genie
  itself pushed into the ERP are recognised by their ERP name and never come
  back as twins.
- **Phase 2 — the delivered ledger.** Every Jobmaster MODIFIED since its cursor
  rewrites its `delivered_jobs` row: tag, family, customer, value, delivery /
  OTD / start dates, status, owner, throughput, percentages — field names read
  from a live ERP document, never guessed.

A quiet hour still walks both phases and writes an `erp_pull` line into
`crm_audit` — proof of life. Cursors (`last_pull`, `jm_cursor`) live in the
`erpnext` integration config. A signed-in browser can fire a walk on demand by
opening `/api/cron/erp-pull`.

## Push triggers pull

Every successful push — job corrections or a created enquiry — immediately
fires the same pull walk, so what the ERP now says returns to Genie at once
rather than at a quarter past.

## Every push files its document

A job-corrections push writes a CSV record into the Drive archive —
`FY / 11 ERP Push Records / <month>` — one line per correction with the job,
field, new value, old value, who changed it, and the fate the ERP gave it
(pushed / rejected with the ERP's words / not-in-ERP). CRM attachments file to
`FY / 10 CRM Attachments / <month>` the same way.

## Where the keys live

The ERPNext URL, API key and secret sit in CRM → Settings → Integrations
(Raghu's card alone), with the field mapping used by the push — set from
🔍 Inspect readings of live ERP documents, never guessed.
