-- CRM 0038 — the quote becomes a DOCUMENT (30 Aug 2026)
-- Cover Page, Back Page and About Nandan join the template masters; the
-- quote remembers which sections print; Review Quote assembles the PDF.

-- the template master learns three more kinds
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'quote_template'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%kind%';
  if c is not null then execute format('alter table quote_template drop constraint %I', c); end if;
end $$;
alter table quote_template add constraint quote_template_kind_check
  check (kind in ('terms', 'letter', 'cover', 'back', 'about'));

insert into quote_template (kind, name, sort_order, content) values
  ('cover', 'Standard Cover', 1,
   '<p style="text-align:center"><br><br><br></p><h1 style="text-align:center">TECHNO-COMMERCIAL QUOTATION</h1><p style="text-align:center"><b>{{customer}}</b></p><p style="text-align:center">{{quote_no}} · {{quote_date}}</p><p style="text-align:center"><br></p><p style="text-align:center">Nandan Ground Support Equipment Pvt Ltd, Pune, India</p>'),
  ('back', 'Standard Back', 1,
   '<p style="text-align:center"><br><br></p><h2 style="text-align:center">Thank you</h2><p style="text-align:center">Nandan GSE Pvt Ltd · Pune, India<br>sales@nandan.co.in · www.nandan.co.in</p><p style="text-align:center">We look forward to building for you.</p>'),
  ('about', 'About Nandan', 1,
   '<h2>About Nandan</h2><p>Nandan GSE Pvt Ltd is an Indian engineering and manufacturing company building aviation ground support equipment, material handling equipment, defence programme equipment and custom-engineered access solutions — designed, fabricated and tested in Pune, serving airlines, airports, MRO, defence and industry across India and abroad.</p><p>Custom-engineered to your specification. One Indian source responsible for design, structure, hydraulics and controls. Proven in service.</p>')
on conflict (kind, name) do nothing;

-- the quote's own pages and its print recipe
alter table quotation add column if not exists cover_template  text;
alter table quotation add column if not exists cover_text      text;
alter table quotation add column if not exists back_template   text;
alter table quotation add column if not exists back_text       text;
alter table quotation add column if not exists about_template  text;
alter table quotation add column if not exists about_text      text;
alter table quotation add column if not exists print_sections  jsonb not null default '["cover","letter","situational","items","terms","about","back"]'::jsonb;
