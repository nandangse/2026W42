-- 0013: Email Templates become a MASTER (Genie 3.23.1.27, 26 Aug 2026)
--
-- Dr Raghu: templates read "Enquiry - Name" / "Quotation - Name", and the
-- subject, cc, body and attachments are FIXED on the template. The composer
-- offers them; Settings → Email Templates is where they are written.
-- Replaces the template_* Message Variables convention (none existed yet).

create table if not exists email_template (
  id          uuid primary key default gen_random_uuid(),
  module      text not null default 'Enquiry' check (module in ('Enquiry', 'Quotation')),
  name        text not null,
  subject     text,
  cc          text,
  body        text,
  -- one per line:  Display Name | https://drive.google.com/…  (anyone-with-link)
  attachments text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (module, name)
);

drop trigger if exists email_template_touch on email_template;
create trigger email_template_touch before update on email_template
  for each row execute function crm_touch();

alter table email_template enable row level security;
alter table email_template force row level security;
