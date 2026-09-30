-- 0185 — THE SAME REGISTER, FOR BILLS COMING IN AS WELL AS GOING OUT
--
-- Dr Raghu, 30 Sep 2026, on the Purchase Register: "in this also there has to
-- be the items, we should be able to click it, the lightbox will open up
-- showing the particular invoice thumbnail in large, the invoice details and
-- later on details from the items, etc. this will be VERY important for the
-- audit of the bills. the scanned copy can be attached by accounts team when
-- they do an entry."
--
-- 0184 keyed the table on the invoice number alone, which was right while it
-- only held sales. A purchase voucher number is Suresh's own running number —
-- 1296, 72, 253523114 — and nothing stops one of those colliding with an
-- invoice number one day. The key becomes (kind, bill) before that can
-- happen rather than after.

alter table sales_invoice_meta add column if not exists kind text not null default 'sales';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'sales_invoice_meta_pkey'
      and conrelid = 'sales_invoice_meta'::regclass
  ) then
    alter table sales_invoice_meta drop constraint sales_invoice_meta_pkey;
  end if;
end $$;

alter table sales_invoice_meta add primary key (kind, bill);

create index if not exists sales_invoice_meta_kind on sales_invoice_meta (kind, party);

-- THE SCANS GO TO DRIVE, NOT TO THE BUCKET.
--
-- "The saving of all my files will be in the drive. make the relevant folders
-- for it." Genie already files job photos, selfies and visiting cards into
-- the shared drive and keeps "drive:<id>" in the same column a bucket path
-- used; bills now do the same, into their own two folders. The bucket stays
-- as the fallback so an upload is never refused because a Drive setting is
-- missing, and nothing uploaded before today has to move.
