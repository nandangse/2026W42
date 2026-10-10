-- 0221 — IMS: THE AUDITOR'S REMARK ON EVERY CLAUSE, PER AUDIT (Genie 6.4.0.12)
--
-- Dr Raghu, 10 Oct 2026: "the clause-wise remarks will be key … an internal
-- auditor will be able to write comments for every audit."
--
-- One row per remark: which clause number (the logical clause across the
-- merged standards), which standard if the auditor was looking at one, which
-- audit, what kind of finding, the words, who and when. Nothing is edited in
-- place — an audit trail is written once.

create table if not exists public.ims_clause_audit_remark (
  id           uuid primary key default gen_random_uuid(),
  clause_no    text not null,
  standard_id  uuid references public.ims_standard(id) on delete set null,
  audit_label  text not null,                 -- "Internal audit — Oct 2026", "Surveillance audit — Pyramid, Mar 2027"
  kind         text not null default 'Observation'
               check (kind in ('Conforms', 'Observation', 'OFI', 'Minor NC', 'Major NC')),
  remark       text not null,
  added_by     text not null,
  added_at     timestamptz not null default now()
);
create index if not exists ims_clause_audit_remark_clause on public.ims_clause_audit_remark (clause_no);
alter table public.ims_clause_audit_remark enable row level security;
revoke all on public.ims_clause_audit_remark from anon, authenticated;

insert into public.genie_migration (name) values ('0221_ims_clause_audit_remark') on conflict (name) do nothing;
