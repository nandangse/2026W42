-- 0180_board_report.sql
--
-- THE BOARD REPORT, AND ITS ARCHIVE.
--
-- Dr Raghu, 30 Sep 2026: "then pdf u made put it here in the CFO note" --
-- "as a button" -- "and keep it in bottom as archieve".
--
-- WHY A SNAPSHOT AND NOT A RE-RUN. A management report is a statement of what
-- was known on a date. If reopening October's report recomputed it from
-- today's books, the figures the Board was given would quietly change after
-- the meeting -- and the one document whose whole value is that it can be
-- referred back to would be the one document that cannot. So the data the
-- report was built from is stored whole, and reopening renders exactly what
-- was presented.
--
-- It is also why the row records WHO generated it and WHEN. Two reports for
-- the same month, drawn a week apart, will differ; the archive should say so
-- rather than leave somebody guessing which is which.
--
-- THE SNAPSHOT IS THE DATA, NOT THE PAGE. Storing rendered HTML would freeze
-- the layout too, and a typo in the prose could never be corrected. The
-- numbers are frozen; the way they are laid out is not.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.board_report (
  id        uuid primary key default gen_random_uuid(),
  on_date   date not null,
  fy        text not null default '',
  title     text,
  snapshot  jsonb not null,
  by        text,
  at        timestamptz not null default now()
);

create index if not exists board_report_at_idx on public.board_report (at desc);
create index if not exists board_report_on_idx on public.board_report (on_date desc);

comment on table public.board_report is
  'One row per Management Report to the Board. snapshot holds the DATA the report was '
  'built from, so reopening it shows what the Board was actually given -- never a '
  'recomputation against later books.';

alter table public.board_report enable row level security;
drop policy if exists board_report_read on public.board_report;
create policy board_report_read on public.board_report
  for select to authenticated using (true);
