-- 0236 — THE ISSUE SLIP MOVES THE STOCK (Genie 6.10.2.3)
--
-- Dr Raghu, 15 Oct 2026: "In the issue slip, when the release is done … the
-- stock should be physically moved by reducing it from stock, blocked or
-- reserve. From there it has to be moved to the WIP warehouse for that
-- particular job. That is not happening."
--
-- It was not happening because nothing was written anywhere: Release only
-- marked the line. Stock lives in the ERP, so from now a release makes an
-- ERP Stock Entry (Material Transfer, with the job number) from the Stock
-- warehouse to WIP, and the line keeps the entry's number — or the ERP's
-- reason when it would not move.

alter table public.material_slip_line add column if not exists erp_ste   text;
alter table public.material_slip_line add column if not exists erp_from  text;
alter table public.material_slip_line add column if not exists erp_to    text;
alter table public.material_slip_line add column if not exists erp_error text;
alter table public.material_slip_line add column if not exists erp_at    timestamptz;

-- the WIP warehouse the store issues into; changeable in Masters' settings
insert into public.material_setting (key, value) values ('wip_warehouse', 'Khopoli Work In Progress - NGSE') on conflict (key) do nothing;

insert into public.feature_request (title, body, want, status, note, by)
select 'Saamaan — the issue slip moves the stock: an ERP Stock Entry to WIP on every release', '<p>"In the issue slip, when the release is done and then Mark Done is completed for all of them, the stock should be physically moved by reducing it from stock, blocked, or reserve. From there, it has to be moved to the WIP warehouse for that particular job. That is not happening. Please check why the error is happening." (Dr Raghu, 15 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.2.3.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Saamaan — the issue slip moves the stock%');

insert into public.genie_migration (name) values ('0236_slip_stock_entry') on conflict (name) do nothing;
