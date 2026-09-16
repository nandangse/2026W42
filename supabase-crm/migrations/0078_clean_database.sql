/*
  0078 — CLEAN DATABASE.

  Dr Raghu, 16 Sep 2026: "make a section in Tools called Clean Database —
  merge duplicate company names; clean company names, Pvt Ltd :: Private
  Limited, Pvt. Ltd., etc; clean contacts, duplicate exacts, similar email
  id, similar mobile no; clean mobile nos, format as per whatsapp number
  +<country code> then the number behind it. This can be done by Shweta."

  WHAT IS ACTUALLY IN THERE, measured 16 Sep 2026 rather than guessed:

      companies                  57,817
      names that collide          1,262 groups over 2,869 rows
      "Pvt Ltd" spelled           Pvt Ltd 5,918 · Limited 2,850 · PVT LTD 583
                                  · Ltd 264 · LLP 229 · Pvt  Ltd 94 · pvt ltd 30
      people (live)             255,288
      sharing an address         30,797 surplus rows over 13,696 addresses
      sharing a mobile           28,343 surplus rows over 13,751 numbers
      phone not in +cc form      10,907

  THE SCAN IS KEPT, NOT REPEATED. Reading a quarter of a million people takes
  84 seconds; doing it on every page load would make the screen unusable and
  the database miserable. So a scan runs, writes what it found here, and the
  screen reads that — with the time it was taken shown, because a count
  without its date is a rumour.

  NOTHING IS MERGED AUTOMATICALLY, and the measurement is why. Among the
  colliding company names are "Kuldeep" four times and "Rahul Kumar" four
  times — people's names used as a company, almost certainly four different
  people at four different firms. A name alone is not identity. Every group
  is proposed and a human presses the button, and the ones that are obviously
  not duplicates can be dismissed for good.
*/

create table if not exists public.crm_clean_run (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  by_email  text not null,
  seconds   numeric,
  summary   jsonb not null default '{}'::jsonb
);

create table if not exists public.crm_clean_finding (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid references public.crm_clean_run(id) on delete cascade,
  /* company_dup   two company rows that normalise to one name
     company_name  a company whose suffix is spelled unusually
     person_email  people sharing one e-mail address
     person_phone  people sharing one mobile number
     phone_format  a number not written as +<country code><number> */
  kind      text not null check (kind in ('company_dup','company_name','person_email','person_phone','phone_format')),
  grp       text not null,                 -- the normalised key they collide on
  ids       uuid[] not null default '{}',
  labels    jsonb  not null default '[]'::jsonb,
  n         int    not null default 0,
  suggestion text,                         -- what the fix would write
  status    text not null default 'open' check (status in ('open','done','ignored')),
  acted_by  text,
  acted_at  timestamptz
);

create index if not exists crm_clean_finding_work on public.crm_clean_finding (kind, status, n desc);
create index if not exists crm_clean_finding_run  on public.crm_clean_finding (run_id);
/* One live finding per group per kind, so a rescan updates rather than piles up. */
create unique index if not exists crm_clean_finding_grp on public.crm_clean_finding (kind, grp);

comment on table public.crm_clean_finding is
  'What a Clean Database scan found. Proposals only — nothing is merged or rewritten until somebody presses the button.';

alter table public.crm_clean_run     enable row level security;
alter table public.crm_clean_finding enable row level security;
