-- ============================================================================
-- NANDAN CRM — 0010 — GMAIL OAUTH
-- Dr Raghu, 26 Aug 2026: the OAuth connection with Gmail, so mail can be
-- read and sent from the CRM. The refresh token lives in Supabase Vault
-- (0002's rule: no secret in an application table); this function is the
-- ONLY door to it — security definer, callable by the service role alone,
-- revoked from every client-facing role.
--
-- Additive. Run AFTER 0009. Idempotent — safe to re-run.
-- ============================================================================

create or replace function mailbox_secret(p_mailbox uuid)
returns text
language sql security definer set search_path = '' as $$
  select ds.decrypted_secret
    from vault.decrypted_secrets ds
    join public.mailbox m on m.credential_ref = ds.id
   where m.id = p_mailbox
$$;

-- `public` below is the PUBLIC role, not the schema.
revoke all on function mailbox_secret(uuid) from public, authenticated, anon;
