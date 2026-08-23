-- 0051_hrms_role_changes.sql
--
-- Roles: Location, a change history, and the approval queue (Dr Raghu, 23 Aug 2026).
--
-- 1. LOCATION. The Goalbook defines every role against a place -- Belapur,
--    Khalapur, WFH -- and the register did not carry it. It does now.
--
-- 2. CHANGES. A role's job description is a document people are appraised
--    against, so what it USED to say matters as much as what it says. Every
--    edit writes a row here: field, from, to, who, when. Append-only.
--
--    This is also where a REPLACED VOICE NOTE goes. The rule Dr Raghu set is
--    that a role carries exactly ONE recording, ONE transcript and ONE
--    summary -- the current ones -- because the summary is what flows into
--    the IDP and three competing summaries would mean nobody knows which. So
--    re-recording REPLACES, and the recording it replaced is kept here rather
--    than thrown away. The audio file itself stays in the bucket; only the
--    row moves.
--
-- 3. THE APPROVAL QUEUE. The moment a role is changed it is pending Dr
--    Raghu's approval and appears under Approvals -> RJ Approval - Records.
--    Two columns carry that: who left it pending and when. Approval clears
--    them; it does not delete the change history.
--
--    Stage stays separate and stays his: Draft/Final is whether the role is
--    AGREED, pending is whether the latest edit has been SEEN.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_role add column if not exists location      text;
alter table public.hrms_role add column if not exists pending_since timestamptz;
alter table public.hrms_role add column if not exists pending_by    text;

comment on column public.hrms_role.location is
  'Where the role sits -- Belapur, Khalapur, WFH. From the Goalbook definition.';
comment on column public.hrms_role.pending_since is
  'Set on every edit; cleared when the owner approves. Drives Approvals -> RJ Approval - Records.';

create index if not exists hrms_role_pending_idx on public.hrms_role (pending_since);

-- ---------------------------------------------------------------------------
-- The change history
-- ---------------------------------------------------------------------------
create table if not exists public.hrms_role_change (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid not null references public.hrms_role (id) on delete cascade,
  /** A field name, or 'voice' when a recording was replaced. */
  field      text not null,
  old_value  text,
  new_value  text,
  /** For a replaced recording: where the old audio still sits in the bucket. */
  old_audio  text,
  changed_by text,
  changed_at timestamptz not null default now()
);

comment on table public.hrms_role_change is
  'Append-only history of every change to a role, including superseded voice '
  'notes. Never updated, never deleted -- a job description is what somebody '
  'is appraised against, so what it used to say is part of the record.';

create index if not exists hrms_role_change_role_idx
  on public.hrms_role_change (role_id, changed_at desc);

alter table public.hrms_role_change enable row level security;
revoke all on public.hrms_role_change from anon, authenticated;
