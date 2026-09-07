-- 0154_idp_personal_login.sql — Genie 5.0.13.0 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026, on genie.nandan.co.in/idp:
--
--   "All the IDP correspondences should be done with their personal mail ID
--    ... whoever is logged into Genie already can access their records.
--    Whoever is not can use their personal email ID, and then a login
--    password will be given to all of them."
--
-- WHY THE PERSONAL ADDRESS AND NOT THE WORK ONE. Five or six people share a
-- single company mailbox, so a password sent there is a password shared with
-- five colleagues — and a payslip is not a thing to share. The personal
-- address is the only one that belongs to one person.
--
-- The shape of the password is his: NGSE, two letters of the first name, two
-- of the last, two digits, and an asterisk — NGSEViRu47*.
--
-- WHAT IS STORED. The HASH is what the login checks. The plain password is
-- kept beside it ONLY so the first mail can carry it as a mail-merge field,
-- and it is wiped the moment the person signs in or changes it. Anyone with
-- HRMS access can read a temporary password until then; that is the price of
-- mail-merging one, and it is why it is cleared on first use.
create table if not exists public.hrms_idp_login (
  employee_id   text primary key,
  email         text not null,                 -- the PERSONAL address, lowercased
  pw_hash       text not null,                 -- sha-256 of salt + password
  pw_salt       text not null,
  pw_temp       text,                          -- the plain temporary one, until first use
  must_change   boolean not null default false,-- he asked NOT to force it
  issued_by     text,
  issued_at     timestamptz not null default now(),
  last_login_at timestamptz,
  login_count   integer not null default 0,
  locked_until  timestamptz,                   -- set by repeated wrong tries
  wrong_tries   integer not null default 0
);
create unique index if not exists hrms_idp_login_email_idx on public.hrms_idp_login (lower(email));
create index if not exists hrms_idp_login_issued_idx on public.hrms_idp_login (issued_at desc);

-- One address must not belong to two people, or a sign-in cannot say who it is.
comment on table public.hrms_idp_login is
  'Personal-email sign-in for /idp. One row per employee; the e-mail is theirs alone.';

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0154_idp_personal_login') on conflict (name) do nothing;
