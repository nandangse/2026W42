/*
  0072 — A HOME FOR THE CARD THANK-YOU.

  Dr Raghu, 15 Sep 2026, looking at New email template: the Module dropdown
  offers Enquiry and Quotation and nothing else — so the thank-you a scanned
  visiting card is supposed to trigger has nowhere to be written.

  That is why both template tables are empty and why the two ticks on the
  card lightbox have had nothing to send. The feature was finished except
  for the place to put the words.

  Three modules are opened, not one, because the same gap is about to appear
  for each:

    Visiting card  — the thank-you after a card is scanned
    Marketing      — the campaign letters, written once and reused
    General        — everything that belongs to no particular doctype

  The constraint is replaced rather than dropped. A typo'd module is still a
  typo, and a list of four is still a list.
*/

alter table public.email_template    drop constraint if exists email_template_module_check;
alter table public.whatsapp_template drop constraint if exists whatsapp_template_module_check;

alter table public.email_template
  add constraint email_template_module_check
  check (module in ('Enquiry', 'Quotation', 'Visiting card', 'Marketing', 'General'));

alter table public.whatsapp_template
  add constraint whatsapp_template_module_check
  check (module in ('Enquiry', 'Quotation', 'Visiting card', 'Marketing', 'General'));
