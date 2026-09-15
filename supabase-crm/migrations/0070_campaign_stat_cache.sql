/*
  0070 — THE CAMPAIGN FIGURES, KEPT RATHER THAN RECKONED.

  Dr Raghu, 15 Sep 2026: "this campaign data should refresh every — for the
  first 2 days 30 mins, for the next week 1 hr, for the time after that once
  a day — in a cron so we can get the data without it calculating everytime."

  He is right, and the reason is arithmetic. The view added in 0069 counts in
  the database, which is the correct way to count — but it still counts. Open
  the Email Marketing screen with twenty campaigns of ten thousand people
  each and it aggregates two hundred thousand rows to print sixty numbers,
  and it does it again on every keystroke in the search box.

  A CAMPAIGN'S NUMBERS GO QUIET WITH AGE. Almost everything happens in the
  first two days; opens trail off over a week; after that a figure changes
  perhaps once a month, when somebody finally reads an old mail or a bounce
  arrives late. So the refresh follows the decay:

      under 2 days old     every 30 minutes
      under 9 days old     every hour
      older                once a day

  The cron writes the snapshot here and the LIST reads it. The campaign's own
  page still counts live, because that is the screen somebody watches while a
  send is running, and there a number 30 minutes old would be a lie of a
  different kind.

  `stat_at` is kept beside the numbers and shown on the screen, so nobody has
  to wonder how old they are. A figure without its date is a rumour.
*/

alter table public.mk_campaign
  add column if not exists stat_cache jsonb,
  add column if not exists stat_at    timestamptz;

comment on column public.mk_campaign.stat_cache is
  'Last snapshot of mk_campaign_stat for this campaign, written by /api/cron/marketing-stats.';
comment on column public.mk_campaign.stat_at is
  'When that snapshot was taken. Shown on screen — a figure without its date is a rumour.';

create index if not exists mk_campaign_stat_at_idx on public.mk_campaign (stat_at nulls first);
