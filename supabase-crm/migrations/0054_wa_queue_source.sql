-- 0054_wa_queue_source.sql  (CRM project)
--
-- HRMS SENDS THROUGH THE SAME QUEUE (Dr Raghu, 4 Sep 2026): "Add the queue
-- called WhatsApp and let it send from there. Any WhatsApp sending will
-- happen through Periskope for now."
--
-- The WhatsApp queue was the CRM's alone; every row hung off a person,
-- company or opportunity. HRMS messages hang off an EMPLOYEE, which lives in
-- the other database, so the queue gains two plain columns: where a row
-- came from (source) and the id it belongs to over there (ref). Nothing
-- else changes; the ceilings and the send path are the same for both.
--
-- ASCII only, additive, safe to re-run.

alter table public.wa_queue add column if not exists source text not null default 'crm';
alter table public.wa_queue add column if not exists ref    text;

create index if not exists wa_queue_source_ref_idx on public.wa_queue (source, ref);

comment on column public.wa_queue.source is 'crm | hrms -- which app queued it';
comment on column public.wa_queue.ref    is 'For hrms: the employee id in the Genie database';
