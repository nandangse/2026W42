-- 0238 — THE CEO'S MESSAGE ON THE CUSTOMER'S PORTAL (Genie 6.10.3.1)
--
-- Dr Raghu, 16 Oct 2026: "show message from CEO on the top and on landing —
-- Dear <name>, Thank you for <organization> being our valued clients! Message.
-- Keep this as a rich text field, editable by Raghu. I will get Genie to
-- write this."

alter table public.portal_org add column if not exists ceo_message text;

-- a first message on every customer door, until he writes his own
update public.portal_org set ceo_message =
'It is a privilege to build for you. Every machine that leaves Khopoli carries the names of the people who made it, and this portal is our way of keeping the whole journey in your view — the orders under build, what has been delivered, the service behind each machine, and a place to ask us anything and get a straight answer.

If anything here is not as it should be, write to me directly. We would rather hear it early.

Warm regards,
Dr Raghunandan Jagdish
Managing Director, Nandan GSE'
where kind = 'customer' and (ceo_message is null or ceo_message = '');

insert into public.feature_request (title, body, want, status, note, by)
select 'Portal — the CEO''s message on top of every customer''s landing page, rich text, Dr Raghu edits', '<p>"show message from CEO on the top and on landing. Dear &lt;name&gt;, Thank you for &lt;organization&gt; being our valued clients! Message. Keep this as a rich text field - editable by Raghu. I will get genie to write this." (Dr Raghu, 16 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.3.1.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Portal — the CEO''s message%');

insert into public.genie_migration (name) values ('0238_portal_ceo_message') on conflict (name) do nothing;
