# Sales Genie — CRM Module
## Brief Addendum · §9 Sales Settings

Append this to `SALES-GENIE-CRM-BRIEF.md`. Migration file: `002_sales_settings.sql`.

---

## 9. Sales Settings

Two things live here: **each salesperson's own mailbox**, and **the one company WhatsApp number**.

### 9.1 Per-user mailbox

Every user connects their own `@nandan.co.in` mailbox so mail is sent and received **as them**, from inside Sales Genie. The customer sees `santosh.patra@nandan.co.in` — never a new address, never a shared alias.

**Settings screen fields (`/crm/settings/mailbox`):**

| Field | Notes |
|---|---|
| Email address | Must end `@nandan.co.in` — enforced by DB constraint |
| Display name | "Santosh Patra · Nandan GSE" |
| App password | Write-only. Never rendered back, never returned by any API |
| IMAP host / port / security | Defaults `imap.gmail.com` / 993 / SSL-TLS |
| SMTP host / port / security | Defaults `smtp.gmail.com` / 465 / SSL-TLS |
| Sync since | Default 90 days back |
| Signature | Rich text, appended on send |
| Auto-log inbound / outbound | Default on |

Show status as a badge: **Unverified → Active → Auth failed → Disabled.**

### 9.2 The password rule — read this before writing the form

**Use an app-specific password, not the user's actual login password.**

On Google Workspace this is Security → 2-Step Verification → App passwords. On Zoho it is Security → App Passwords. It is a 16-character token scoped to mail only. If it leaks, it opens the mailbox — not Drive, not the account, not SSO. It can be revoked from the admin console in one click without the user changing anything else.

If instead we ask 270 people to type their real Google password into a form on `genie.nandan.co.in`, we have built a phishing page and taught the whole company to trust it. Do not do that. The settings screen must say, in plain words on the form: *"Paste an app password, not your Google password."* Link to the Workspace app-password page.

**Storage:** the password never touches a `crm.*` table. The server route calls `crm.store_mailbox_credential()`, which writes to Supabase Vault and returns a UUID. The table stores the UUID. This mirrors how Twenty handles IMAP/SMTP credentials (AES-256-GCM under a server key, never plaintext at rest) — Vault is our equivalent and it is already in the stack.

**Rules for the implementation:**

1. Password field is `type="password"`, `autocomplete="new-password"`, write-only. No GET endpoint ever returns it or its ref.
2. Credential handling happens **only** in a Supabase Edge Function or server route using the service role. The browser never holds it beyond the POST body over TLS.
3. On save, **verify before storing**: open a real IMAP connection and a real SMTP handshake. If either fails, do not save — return the actual error ("authentication failed" vs "host unreachable"). Set `status = 'active'` only on success.
4. On repeated auth failure during sync, set `status = 'auth_failed'`, stop retrying, and notify the user in-app. Do not hammer the mail server — Google will lock the account.
5. Rotation: `crm.rotate_mailbox_credential()`. Offboarding: delete the mailbox row, which deletes the vault secret. Add this to the HR exit checklist.
6. RLS is already written so a salesperson can read only their own mailbox row. Do not loosen it. Ankeet has no business seeing Nitu's mail configuration.
7. Use `crm.v_my_mailbox` for the settings screen. It deliberately omits `credential_ref`.

**Longer term:** move to Google Workspace OAuth with domain-wide delegation. Then nobody types a password at all, and offboarding is automatic when the Workspace account is suspended. The schema already allows it (`credential_kind = 'oauth_refresh_token'`). App passwords are the Phase-3 answer, not the permanent one.

### 9.3 Company WhatsApp

WhatsApp Business API is **one number for the whole company**, with many agents behind it — not one number per salesperson. Personal WhatsApp on personal handsets is exactly the problem this replaces: when a salesperson leaves, the customer relationship walks out with the SIM.

**Admin screen (`/crm/settings/whatsapp`), CEO/admin only:**

- Display number (E.164), verified business name
- Provider: Meta Cloud API (recommended — direct, cheapest) or Gupshup / Wati if we want an Indian BSP with easier onboarding
- WABA ID, Phone Number ID
- Access token and webhook verify token → both into Vault, refs only in the table
- Default owner for unrouted chats
- Business hours (defaults to IST, Mon–Fri 09:30–18:30, Sat 09:30–14:00)

**Agent routing (`crm.whatsapp_agent`):** each salesperson gets an agent label the customer sees ("Santosh — Nandan GSE"), the pipelines they cover, and keyword hints (`spares`, `hi-lift`, `bowser`). Inbound message → match `from_handle` against `person.whatsapp_number` → if the person has an owner, route there; else route by keyword; else to `default_owner_id`. Write `message.agent_profile_id`.

**Two practical constraints to design around, not discover later:**

- Outside a 24-hour window from the customer's last message, WhatsApp only permits **pre-approved template messages**. Build a template library table before Phase 3, or the first quote follow-up will silently fail to send.
- Meta requires business verification and a number not currently registered on the WhatsApp app. Pick a number that is **not** anyone's personal handset. Start this paperwork early — it takes weeks, not days.

### 9.4 What goes in the same settings area later

Reserve the routes now, build them when the phase lands: IndiaMART seller credentials, Google Ads account link, quote numbering series, GST/HSN defaults, approval thresholds, SLA clock (15 min / 4 hr), and the call-recording consent register.
