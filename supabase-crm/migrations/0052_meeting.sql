-- 0052_meeting.sql
--
-- MEETINGS (Dr Raghu, 4 Sep 2026: "after every zoom call the summary and the
-- recording ... pulled into genie in a section called meetings. This zoom is
-- basically a meeting so the attendees, date, MoM and then tagging it to a
-- deal will be useful").
--
-- A meeting IS an interaction -- the CRM already logs calls and visits
-- against a company, a person, an opportunity, a quotation -- so the deal
-- tag lives on the interaction row the meeting creates, and the meeting
-- table holds what an interaction does not: who was in the room, Zoom's own
-- summary, the MoM as a person writes it, and the recording.
--
-- ZOOM IS THE SOURCE, GENIE IS THE MASTER, DRIVE IS THE ARCHIVE. Rows are
-- born from Zoom's webhooks (and an hourly sweep for anything a webhook
-- missed); a person then tags and writes. Nothing here is typed twice.
--
-- ASCII only, additive, safe to re-run.
create table if not exists meeting (
  id               uuid primary key default gen_random_uuid(),
  zoom_meeting_id  text,                            -- the 11-digit id (recurs across occurrences)
  zoom_uuid        text unique,                     -- this occurrence, the true key
  topic            text,
  host_email       text,
  host_id          uuid references profile(id),
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_min     int,
  attendees        jsonb not null default '[]'::jsonb,   -- [{name,email,join,leave,person_id?}]
  attendee_names   text,                            -- the same, as a line, for the list
  summary          text,                            -- Zoom AI Companion, as it came
  next_steps       jsonb not null default '[]'::jsonb,
  mom              text,                            -- the minutes, a person's hand, rich text
  recording_url    text,                            -- Zoom's play link
  recording_download text,                          -- Zoom's download link (needs the token)
  recording_drive_url text,                         -- the archive copy, when made
  interaction_id   uuid references interaction(id),
  company_id       uuid references company(id),
  opportunity_id   uuid references opportunity(id),
  quotation_id     uuid references quotation(id),
  status           text not null default 'new' check (status in ('new','tagged','done')),
  raw              jsonb,                           -- the last Zoom payloads, for the day something looks wrong
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists meeting_started_idx on meeting (started_at desc);
create index if not exists meeting_company_idx on meeting (company_id, started_at desc);
create index if not exists meeting_zoom_id_idx on meeting (zoom_meeting_id);
