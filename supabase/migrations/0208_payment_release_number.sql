-- 0208 · SUPPLIER PAYMENT RELEASE: a number, a state, and Send / Cancel (Dr Raghu, 8 Oct 2026: "give it a
-- number so that we can have trackability also. The number and the date will define that. Also, have a
-- button on the right side that will say Send or Cancel … maybe there has to be a cancel button so that
-- he can check it out once again").
-- A release is SAVED first (draft — nothing in Kuber, no mail), then SENT (into Kuber's payment plan,
-- accounts@ told) or CANCELLED. Numbers run SPR-00001, SPR-00002 … in the order raised, for ever.
create sequence if not exists public.material_payment_release_no start 1;
alter table public.material_payment_release
  add column if not exists no text,
  add column if not exists status text not null default 'sent' check (status in ('draft', 'sent', 'cancelled')),
  add column if not exists sent_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text;
-- the releases already raised get their numbers in the order they were raised
update public.material_payment_release r
   set no = 'SPR-' || lpad(x.rn::text, 5, '0')
  from (select id, row_number() over (order by at) as rn from public.material_payment_release where no is null) x
 where r.id = x.id;
select setval('public.material_payment_release_no', coalesce((select count(*) from public.material_payment_release), 0) + 1, false);
alter table public.material_payment_release alter column no set default ('SPR-' || lpad(nextval('public.material_payment_release_no')::text, 5, '0'));
create unique index if not exists material_payment_release_no_idx on public.material_payment_release (no);
create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0208_payment_release_number') on conflict (name) do nothing;
