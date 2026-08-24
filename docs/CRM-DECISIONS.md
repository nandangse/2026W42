# CRM — decisions taken on 24 Aug 2026

The handover package (docs/CRM-HANDOVER.md, docs/CRM-DATABASE-SPLIT.md,
docs/CRM-BRIEF.md) is the spec for what the CRM does. Where this repo departs
from how the package assumed it would be built, the departure was decided by
Dr Raghu on 24 Aug 2026 and is recorded here. Read this file after the
handover docs and believe this one.

## 1. The database was reset onto the handover model

The first foundation (0001_crm_foundation.sql, Genie 3.18.0.0) and the
handover schema overlapped under different names — customer/contact/deal
against company/person/opportunity. The CRM project held no transactional
data, so it was wiped (supabase-crm/reset/2026-08-24_reset_to_core.sql) and
rebuilt as 0001_core.sql + 0002_sales_settings.sql. From there the
additive-only rule is absolute again.

What the foundation had that the handover lacked was folded into 0001_core:
the fourteen-stage funnel as rows (with the stage-history trigger), sector
and industry, the FY-aware number_series, crm_audit, the BANT percentages.
Where the two disagreed on a name, the handover's name won.

## 2. One login. No second Google sign-in. Ever.

The package's DATABASE-SPLIT §4 ("Two sessions, one login") is NOT how this
repo works. Genie's session cookie is the only session; the CRM Supabase
project has no auth users, issues no tokens, and its RLS is forced with no
policies — the service key after `requireCrm()` is the only way in.

Planned addition, not yet built: a device-authorisation step — a second OTP
to Dr Raghu approving a device before it may open the CRM. That is one more
check inside `requireCrm()`, not a second login.

## 3. The identity bridge is the email address

`profile.id` is the CRM database's own uuid. The Genie auth id is never
written to any CRM table — `requireCrm()` returns `profileId` and every
`created_by` / `owner_id` / `by_user` takes that. Matching is on lowercase
email, both directions.

## 4. The funnel is Dr Raghu's, not the package's enum

opportunity.stage_id references the `stage` table (Suspect → … → Bucket 0 →
Order Received, plus Quote Lost and Not Target). The package's seven-value
opportunity_stage enum was not created. Lost-reason enforcement lives in the
stage trigger instead of a CHECK, and the won stage flips company.is_customer.

## 5. Layout follows this repo, not the package

`src/crm/` (not `src/modules/crm/`), the doctype registry drives every CRUD
screen, API routes live under `src/app/api/crm/`, and the version number is
Genie's — one sequence, no CRM version of its own.
