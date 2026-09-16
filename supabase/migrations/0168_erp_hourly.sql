/*
  0168 — WHICH DOCUMENTS COME DOWN EVERY HOUR.

  Dr Raghu, 16 Sep 2026: "i want hourly refresh with nandanerp — jobs,
  delivered jobs, opportunity, quote, contact, company, sales order, project,
  BOM, item, purchase order, grn ... also in all these decisions the later one
  wins!!! ... tick the documents which will refresh here."

  Until now the answer was scattered across three crons and two databases, and
  the only way to know what refreshed was to read the source. A tick-box is
  the honest shape: the list of documents is on the screen, what is on is on,
  and nobody has to ask.

  LATER ONE WINS is recorded beside it because it is the rule that makes the
  rest safe. Under last-write-wins a pull can never trample a newer Genie
  edit — which is what let the pull stop waiting on a working push, after the
  push had been failing for twenty-six hours and taking the pull down with it.

  An empty object means "the defaults in the code", so this column arriving
  changes nothing until somebody unticks something.
*/

alter table public.app_settings
  add column if not exists erp_hourly jsonb not null default '{}'::jsonb;

comment on column public.app_settings.erp_hourly is
  'Which ERP documents refresh on the hour: {"jobs":true,"quotation":false,...}. Empty = the code''s defaults.';

alter table public.app_settings
  add column if not exists erp_winner text not null default 'latest';

comment on column public.app_settings.erp_winner is
  'Who wins when Genie and the ERP disagree: latest (the later edit), erp, or genie.';
