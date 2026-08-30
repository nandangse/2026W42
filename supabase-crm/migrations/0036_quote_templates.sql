-- CRM 0036 — Terms & Conditions and the Covering Letter (30 Aug 2026)
-- Both tabs pick from a Quote Templates master; choosing one dumps its
-- default text into the quote, where the hand (or Genie, twice) refines it.

create table if not exists quote_template (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('terms', 'letter')),
  name        text not null,
  content     text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, name)
);

-- the three Terms sets and the eight Letter flavours, as placeholders the
-- master's own editor will grow into the real house text
insert into quote_template (kind, name, sort_order, content) values
  ('terms', 'Standard Sales',     1, '<p><b>Terms &amp; Conditions — Standard Sales</b></p><p>Prices are ex-works Pune unless stated otherwise. Delivery as quoted, counted from receipt of advance and technically clear order. Payment as per the terms on this quotation. Warranty 12 months from dispatch against manufacturing defects. Taxes as applicable at the time of billing.</p>'),
  ('terms', 'Spares and Service', 2, '<p><b>Terms &amp; Conditions — Spares and Service</b></p><p>Prices are for the listed spares/service only. Payment 100% advance unless agreed otherwise. Dispatch by surface transport, freight to the customer''s account. Warranty on spares limited to manufacturing defects; consumables excluded.</p>'),
  ('terms', 'Export',             3, '<p><b>Terms &amp; Conditions — Export</b></p><p>Prices quoted are on the Incoterms stated in this quotation. Payment by irrevocable LC or advance wire transfer. Delivery counted from receipt of payment instrument. Packing seaworthy export standard. Warranty 12 months from bill of lading.</p>'),
  ('letter', 'Standard',          1, '<p>Dear Sir/Madam,</p><p>Thank you for your enquiry. We are pleased to enclose our quotation for your kind consideration. The offer reflects our standard specifications and the delivery and payment terms stated within.</p><p>We look forward to your order and remain available for any clarification.</p>'),
  ('letter', 'Spares',            2, '<p>Dear Sir/Madam,</p><p>Thank you for your enquiry for spares. Our offer for the required items is enclosed, with availability and dispatch terms stated within. Genuine Nandan spares keep your equipment at its rated performance.</p>'),
  ('letter', 'Aggresive',         3, '<p>Dear Sir/Madam,</p><p>We want this order — and the enclosed offer says so. Sharpest commercial terms, committed delivery, and the full weight of our works behind it. Give us the order and we will give you a reason to never look elsewhere.</p>'),
  ('letter', 'First time',        4, '<p>Dear Sir/Madam,</p><p>Thank you for the opportunity to quote for the first time. Nandan GSE designs and builds ground support and material handling equipment in Pune, serving airlines, defence and industry across India and abroad. The enclosed offer is our introduction — we intend it to be the first of many.</p>'),
  ('letter', 'Proposal',          5, '<p>Dear Sir/Madam,</p><p>Further to our discussions, please find enclosed our detailed proposal. It sets out the situation as we understand it, the solution we recommend, and the commercial terms. We would be glad to walk your team through it.</p>'),
  ('letter', 'Defense Customer',  6, '<p>Dear Sir/Madam,</p><p>We thank you for the enquiry and enclose our offer. Nandan GSE is a proven supplier to the Indian defence establishment, with equipment in service across commands. The enclosed offer conforms to the stated requirements; certifications and registrations are available on request.</p>'),
  ('letter', 'Tender',            7, '<p>Dear Sir/Madam,</p><p>With reference to the subject tender, we enclose our offer in the prescribed format, together with the required annexures. We confirm compliance with the tender terms except where expressly stated.</p>'),
  ('letter', 'Export',            8, '<p>Dear Sir/Madam,</p><p>Thank you for your enquiry. We are pleased to enclose our export offer on the Incoterms stated within. Nandan GSE equipment serves customers across continents; packing, documentation and logistics are handled to export standard.</p>')
on conflict (kind, name) do nothing;

-- the quote remembers which template it chose and the text as edited
alter table quotation add column if not exists terms_template   text;
alter table quotation add column if not exists terms_text       text;
alter table quotation add column if not exists letter_template  text;
alter table quotation add column if not exists letter_text      text;
alter table quotation add column if not exists letter_genie_runs int not null default 0;
