-- Genie 0106 — the AI master switch (30 Aug 2026)
-- "stop all the genie on planning and crm also" — one owner-held switch
-- that pauses every AI feature across the whole app.
alter table app_settings add column if not exists ai_paused boolean not null default false;
