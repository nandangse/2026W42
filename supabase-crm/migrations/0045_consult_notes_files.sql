-- CRM 0045 — the consultation writes itself into the record (30 Aug 2026)
-- "Can the discussion be in the notes of that transaction?" — each chat keeps
-- the id of the one note it maintains on its record, and every message can
-- carry attachments.
alter table consult_chat add column if not exists note_id uuid;
alter table consult_msg add column if not exists files jsonb;
