# Gmail OAuth — the ten-minute setup (Dr Raghu's side)

The code is live; it wakes up when these four steps are done.

## 1. Google Cloud console (console.cloud.google.com)
- Pick (or create) a project under the nandan.co.in organisation.
- **APIs & Services → Library** → enable **Gmail API**.
- **APIs & Services → OAuth consent screen** → User type: **Internal**.
  (Internal = only nandan.co.in accounts can connect, and Google skips the
  restricted-scope verification audit entirely.)
- **APIs & Services → Credentials → Create credentials → OAuth client ID**
  - Application type: **Web application**
  - Name: `Genie CRM Gmail`
  - Authorised redirect URI (exactly):
    `https://genie.nandan.co.in/api/crm/gmail/callback`
  - Copy the **Client ID** and **Client secret**.

## 2. Vercel env vars (project → Settings → Environment Variables, Production)
- `GOOGLE_OAUTH_CLIENT_ID` = the client id
- `GOOGLE_OAUTH_CLIENT_SECRET` = the client secret
- Redeploy (or push anything) so the functions pick them up.

## 3. Run migration 0010 on the CRM project
`supabase-crm/migrations/0010_gmail_oauth.sql` — the Vault-reading function
(service-role only). 0009 must be in first.

## 4. Mark and connect
- Admin → Users → tick **✉ OAuth** on your account (already possible).
- Profile → **✉ Connect Gmail** → Google asks for read + send on your mail.

Then, on any record's **Communication** tab:
- **✉ Send email** — composes as you, renders `{{variables}}`, logs into the feed.
- **⟳ Pull Gmail with <address>** — your last six months with that contact,
  landed on the record, idempotent.

Token lives in Supabase Vault; the CRM never sees a password. A revoked or
expired grant flips the mailbox to `auth_failed` and the Profile button
reconnects it.
