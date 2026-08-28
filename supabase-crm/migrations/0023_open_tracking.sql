-- 0023_open_tracking.sql  (CRM project)
--
-- Email open tracking, the OnePageCRM feature Dr Raghu pointed at
-- (28 Aug 2026): a tracked mail carries an invisible pixel; the pixel's URL
-- answers with a 1x1 gif and stamps the message row. Opened-ness then shows
-- in Tools → Email → Open tracking.
--
-- Honest caveats live in the UI: Gmail's image proxy and Apple's privacy
-- relay can fire the pixel without a human, and text-only readers never
-- fire it. It is a signal, not a court record.
--
-- Line comments only. Additive and safe to re-run.

alter table message add column if not exists track_token text;
alter table message add column if not exists opened_at  timestamptz;
alter table message add column if not exists open_count integer not null default 0;

create unique index if not exists message_track_token_idx on message (track_token) where track_token is not null;
