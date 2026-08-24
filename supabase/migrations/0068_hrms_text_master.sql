-- 0068_hrms_text_master.sql
--
-- MASTERS -> STANDARD TEXTS (Dr Raghu, 24 Aug 2026): "Terms of engagement
-- (from Masters - create a module called Masters in HRMS with this in it) -
-- able to change".
--
-- The paragraphs that go into every letter, written once and edited in one
-- place: the terms of employment, and the covering note that carries an
-- offer out by mail. Each offer still SNAPSHOTS the text it used (0067), so
-- editing the master changes the next letter and never a letter already sent.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_text_master (
  key         text primary key,
  title       text not null,
  /** Rich text, the same HTML subset the role register allows. */
  body        text not null default '',
  note        text,
  version     integer not null default 1,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

comment on table public.hrms_text_master is
  'Standard texts used in letters -- terms of employment, covering notes. '
  'Edited here; snapshotted onto each letter that uses them.';

alter table public.hrms_text_master enable row level security;
revoke all on public.hrms_text_master from anon, authenticated;

-- The terms as they stand in the current appointment letter, so the module
-- is usable the moment it is switched on rather than starting empty.
insert into public.hrms_text_master (key, title, body, note)
values (
  'terms_of_engagement',
  'Terms of Employment',
  '<p><b>1. Period of Employment &amp; Probation:</b> Your appointment is effective from the joining date mentioned. You will be on probation for the period stated in your letter, after which your performance will be reviewed and you will be confirmed as a permanent employee of Nandan GSE Pvt Ltd. During probation you will not be entitled to paid leave without the approval of the management or your Head of Department.</p>' ||
  '<p><b>2. Working Hours:</b> Your working hours will be 08:30 AM to 05:30 PM inclusive of a lunch break from 01:00 PM to 01:30 PM. Completion of 9 hours in office is mandatory, failing which salary is subject to deduction. Any reason for reporting late should be informed well in advance.</p>' ||
  '<p><b>3. Salary:</b> You will be paid as per the compensation set out in Annexure 1. Your monthly salary will be credited by the 7th of every month.</p>' ||
  '<p><b>4. Reporting Structure:</b> Your role and reporting manager are as shown at the time of joining.</p>' ||
  '<p><b>5. Employment Terms:</b> During the period of employment you shall not undertake or carry on any business, trade or profession, alone or in partnership, nor take any other employment directly or indirectly with any company, firm, organisation or undertaking. This includes any undeclared work, remunerated or not, related directly or indirectly to your employment with Nandan GSE Pvt Ltd.</p>' ||
  '<p><b>6. Confidentiality:</b> You will take due care to ensure complete confidentiality of any sensitive, privileged or non-public information of the Company that you come across while working with the Company. You will not, without specific prior written consent, copy, divulge or disclose any such information to any third party.</p>' ||
  '<p><b>7. Leave:</b> As per company policy a confirmed employee is entitled to 30 paid leaves in a financial year, besides regional and public holidays.</p>' ||
  '<p><b>8. Appraisals, Increments, Incentives:</b> Performance is reviewed annually. Increments and incentives are at the discretion of the management and are linked to performance.</p>' ||
  '<p><b>9. Company Assets:</b> Any asset issued to you remains the property of the Company and is to be returned on separation.</p>' ||
  '<p><b>10. Termination:</b> The notice period applicable to either side is as set out in the Employee Handbook in force.</p>',
  'From the appointment letter in use in March 2026. Edit here and the next letter picks it up.'
)
on conflict (key) do nothing;

insert into public.hrms_text_master (key, title, body, note)
values (
  'offer_covering_letter',
  'Covering note for the offer e-mail',
  E'Dear <name>\n\nPlease see attached draft offer letter. Please "reply all" to this mail with your acceptance.\n\nIt will be valid for three days after which with no acceptance it will be expired\n\nYour joining date needs to be firm\n\nThe appointment letter will be given to you on joining\n\nThe terms and conditions of employment are also attached.\n\nThanking you\n\nNandan GSE\nHR\nVinay Mande\nhr@nandan.co.in +91 91 360 105 50',
  'Plain text, sent as the body of the offer e-mail. <name> is replaced with the candidate''s name.'
)
on conflict (key) do nothing;
