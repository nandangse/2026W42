-- 0014: WhatsApp Templates master (Genie 3.23.1.28, 26 Aug 2026)
--
-- Same shape as Email Templates (0013), minus subject and cc — a WhatsApp
-- message is body + attachments, fixed on the template, named Module - Name.

create table if not exists whatsapp_template (
  id          uuid primary key default gen_random_uuid(),
  module      text not null default 'Enquiry' check (module in ('Enquiry', 'Quotation')),
  name        text not null,
  body        text,
  -- one per line:  Display Name | https://drive.google.com/…  (anyone-with-link)
  attachments text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (module, name)
);

drop trigger if exists whatsapp_template_touch on whatsapp_template;
create trigger whatsapp_template_touch before update on whatsapp_template
  for each row execute function crm_touch();

alter table whatsapp_template enable row level security;
alter table whatsapp_template force row level security;
