-- CRM 0037 — the quote learns BCC (30 Aug 2026)
alter table quotation add column if not exists mail_bcc jsonb not null default '[]'::jsonb;
