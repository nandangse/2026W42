-- 0195 — every field of every ERP Issue, kept whole (Dr Raghu, 3 Oct 2026:
-- "support tickets are Issues. Pull all of them please. Make all the fields
-- which are in erp" — "add this also to the hourly erp pull").
--
-- The typed columns from 0166 stay for the screen and the search; `erp`
-- holds the Issue document verbatim, every field the ERP returned, so the
-- one being argued about is never missing. The hourly cron walks Issues by
-- `modified` from a cursor kept in the ERP integration's config, and the
-- attachments by `creation` from another.

alter table public.seva_issue add column if not exists erp jsonb;
create index if not exists seva_issue_modified_idx on public.seva_issue (erp_modified desc);
create index if not exists seva_attachment_parent_idx on public.seva_attachment (parent_type, parent_name);

comment on column public.seva_issue.erp is 'The ERP Issue document as pulled — every field, verbatim.';

-- the FRF forms, copied off the ERP into the Drive (Dr Raghu, 3 Oct 2026):
-- where each copy went, when, and why it did not if it did not
alter table public.seva_attachment add column if not exists drive_ref  text;
alter table public.seva_attachment add column if not exists drive_url  text;
alter table public.seva_attachment add column if not exists drive_at   timestamptz;
alter table public.seva_attachment add column if not exists drive_error text not null default '';
create index if not exists seva_attachment_drive_idx on public.seva_attachment (parent_type, drive_at);
