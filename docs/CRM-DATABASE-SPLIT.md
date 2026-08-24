# Sales Genie — the database split

One repository. One git history. One version number. **Two Supabase projects.**

Read this before writing a query, because the single most likely bug in this codebase is someone trying to join across the two.

---

## 1. Why there are two

| | Project | Holds | Written by |
|---|---|---|---|
| **Genie** | `sales-genie` | Planning Suite, HRMS, employee master, shared auth | Planning / HR work |
| **CRM** | `sales-genie-crm` | Everything under `/crm` | CRM work only |

The CRM is the module that will grow fastest and heaviest — years of quotations, every inbound message, call transcripts, installed base. Keeping it in its own project means a heavy CRM query cannot slow down a planning screen, and a Planning Suite migration cannot lock a CRM table. That isolation is the whole point of the split. Do not erode it.

**Both projects use the `public` schema.** The CRM project is dedicated, so a custom schema would add dashboard configuration (PostgREST "Exposed schemas") for no isolation benefit that the separate project does not already give.

---

## 2. The rule

> **The CRM writes only to the CRM project. It reads the Genie project and never writes to it. There is no cross-database join, and there never will be.**

PostgreSQL cannot join across two Supabase projects. If you find yourself wanting to, you have modelled something wrong. Denormalise instead — copy the small, slow-changing field you need into the CRM database and keep it fresh.

---

## 3. The identity bridge

Both projects authenticate the same person through **Google Workspace SSO on `nandan.co.in`**, but each issues its own `auth.users` row with its own UUID.

**The email address is the only stable key across the two.** Never store a Genie user id in the CRM database, or a CRM user id in the Genie database. They look like UUIDs, they will appear to work, and they will point at the wrong person the moment someone re-enrols.

`public.profile` in the CRM project is a thin local mirror:

```
profile.id     → CRM project's own auth.users(id)
profile.email  → the bridge. Unique. Always lowercase.
```

The employee master stays in the Genie project. Sync one way, on a schedule or on login: match on email, update name and role, never the other direction.

```ts
// Correct
const email = await currentEmail();                  // from the CRM session
const hr = await genieDb().from('employee').select('*').eq('email', email);

// Wrong — this id means nothing in the other project
const hr = await genieDb().from('employee').select('*').eq('id', crmUserId);
```

---

## 4. Two sessions, one login

Two Supabase projects means two auth sessions in the browser. Handled properly this is invisible to the user:

1. Enable **Google as an auth provider on both projects**, restricted to the `nandan.co.in` domain.
2. Give each client a distinct `storageKey` (`sg-genie-auth`, `sg-crm-auth`) — already done in `lib/supabase.ts`. Without this the second client overwrites the first's token and silently logs the user out of the other module.
3. On entering `/crm`, if there is no CRM session, trigger the Google sign-in. Because the user already has a live Google Workspace session, this completes without a second password prompt.

If you ever see a user being asked to log in twice, the bug is one of these three things — not something to solve by sharing a token between projects. Never do that.

---

## 5. Migrations

Each project has its own migration folder and its own sequence. The CRM's numbers start at `0001` and have nothing to do with the Genie project's numbering — separate databases cannot collide.

```
supabase/                  ← Genie project (Planning Suite, HRMS)
  migrations/
supabase-crm/              ← CRM project  (this module)
  migrations/0001_core.sql
  migrations/0002_sales_settings.sql
  seed/crm_seed.sql
```

Link and push per project:

```bash
supabase link --project-ref <genie-ref>
supabase db push

supabase link --project-ref <crm-ref> --workdir supabase-crm
supabase db push --workdir supabase-crm
```

Rules unchanged: additive only, never edit an applied migration, `supabase db reset` must run clean from empty.

---

## 6. Environments

Two projects means **four** databases once you add dev. Do not skip this — `supabase db reset` against a production CRM would delete every quotation you have.

| | Genie | CRM |
|---|---|---|
| Production | `sales-genie` | `sales-genie-crm` |
| Development | `sales-genie-dev` | `sales-genie-crm-dev` |

Vercel preview deployments point at both dev projects. Production keys live in Vercel's production environment only — not on a laptop, not in Claude Code's context.

---

## 7. Version numbering

**One version number for the whole of Genie**, across all three modules and both databases. A release is a single tag on the single git history:

```
v0.4.0
```

Not `crm-v0.4.0`. The CRM does not version independently — if it ships, Genie ships.

Note in the release what changed and which databases need a migration run:

```
v0.4.0 — CRM quotation engine
  migrations: crm 0003, 0004
  genie: none
```
