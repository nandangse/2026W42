/*
  0079 — A LEAD IS A STATE, NOT A PLACE.

  Dr Raghu, 16 Sep 2026: "enquiries are opportunities! leads are leads ...
  something just added and having no opportunity or quotations. A lead can be
  seen in customer list. But it shows as a lead only."

  That is the whole model, and it is better than moving rows about:

      a LEAD is a person or a company with NO opportunity and NO quotation
      the moment either exists, they stop being a lead
      they never move anywhere — they are in the same list, wearing a badge

  Measured under that rule, 16 Sep 2026:

      people    15,509 have an opportunity or a quotation ... contacts
               241,363 do not ............................... leads
      firms     37,549 have one ............................. live
                20,269 do not ............................... leads

  WHY A COLUMN RATHER THAN A QUERY. The honest version of this is a NOT EXISTS
  against two tables, and on 256,872 people that cannot be counted, paged or
  filtered at the speed a list screen needs. So it is written down, kept true
  at the moment an opportunity or a quotation is saved, and recomputed in full
  on demand — with the date of that recompute shown, because a flag without
  its date is a rumour.

  DEFAULT TRUE, deliberately. Somebody just added is a lead until the work
  says otherwise, which is exactly what the word means.

  The old `lead` doctype — the inbound-message table, 0 rows — is NOT what
  this is. Enquiries are opportunities, and that table has never held one.
*/

alter table public.person
  add column if not exists is_lead boolean not null default true;

/*
  AND A HUMAN MAY OVERRULE THE RULE (Dr Raghu, same conversation: "always
  interchangeable. Make a toggle saying convert lead to contact, and then
  vice versa").

  The rule is a good default, not a truth. Somebody worth calling a contact
  before a single quotation exists is a real case, and so is a dead customer
  worth putting back among the leads.

  So a hand-set value is REMEMBERED AS HAND-SET, and the recompute steps
  around it. Without this the nightly rule would quietly undo the decision
  and nobody would know why the badge kept changing back — which is the
  worst kind of bug, because it looks like the screen is lying.
*/
alter table public.person
  add column if not exists lead_manual     boolean not null default false,
  add column if not exists lead_changed_by text,
  add column if not exists lead_changed_at timestamptz;

alter table public.company
  add column if not exists lead_manual     boolean not null default false,
  add column if not exists lead_changed_by text,
  add column if not exists lead_changed_at timestamptz;

comment on column public.person.lead_manual is
  'Somebody set this by hand. The automatic rule leaves it alone from then on.';

comment on column public.person.is_lead is
  'No opportunity and no quotation yet. Set false the moment either is saved; recomputed in full from Clean Database.';

create index if not exists person_is_lead_idx on public.person (is_lead) where deleted_at is null;
create index if not exists company_is_lead_idx on public.company (is_lead) where deleted_at is null;
