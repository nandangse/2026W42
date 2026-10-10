-- 0220 — IMS: ONE EVIDENCE ACROSS THE MERGED STANDARDS (Genie 6.4.0.11)
--
-- Dr Raghu, 10 Oct 2026, on Standards: "on top make another tab — Clauses and
-- evidence. In that show the checkboxes for the standard, then merge the same;
-- show combined and logical clause; next to it show the single cell with the
-- standard: 9001 / AS9100D / 27001 / 45001; next to it a cell with the
-- evidence — let the man write; then on saving automatically let Genie
-- rewrite all."
--
-- The standards share the Annex SL numbering (4 to 10), so a clause number is
-- the logical clause across them. What the man writes once per clause number
-- is kept here; Genie rewrites it into each standard's own evidence note
-- (ims_clause_evidence_note), tailored to that standard's clause.

create table if not exists public.ims_clause_group_note (
  clause_no     text primary key,
  raw           text,                       -- what the man wrote, once
  standard_ids  uuid[] not null default '{}', -- the standards ticked when it was written
  updated_by    text,
  updated_at    timestamptz not null default now(),
  rewritten_at  timestamptz                 -- when Genie last wrote it into the standards' notes
);
alter table public.ims_clause_group_note enable row level security;
revoke all on public.ims_clause_group_note from anon, authenticated;

insert into public.genie_migration (name) values ('0220_ims_clause_group_note') on conflict (name) do nothing;
