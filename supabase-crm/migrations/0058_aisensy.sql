-- 0058 — AiSensy: a queue row that can carry a template instead of prose.
--
-- Dr Raghu, 8 Sep 2026: "AI sensy can we try to integrate".
--
-- Periskope drives a phone and takes a sentence. AiSensy goes through Meta's
-- own Business API and takes a CAMPAIGN — an approved template — with its
-- variables in order. A queue row therefore needs somewhere to put those
-- variables, and somewhere to put the document a payslip message carries.
--
-- Nothing here changes how Periskope works: `body` still holds the sentence,
-- `template_name` still names the template, and rows without params behave
-- exactly as they did. Safe to run twice.

alter table if exists public.wa_queue
  add column if not exists params jsonb,          -- template variables, in order
  add column if not exists media  jsonb;          -- { url, filename } — AiSensy FETCHES this

comment on column public.wa_queue.params is
  'AiSensy templateParams, in the order the approved template declares them. Null for a free-text (Periskope) row.';
comment on column public.wa_queue.media is
  'AiSensy media as { url, filename }. Their servers GET the url, so for anything private this must be a SIGNED url with a short expiry — never a permanent public link.';

-- The AiSensy settings live beside Periskope's, in the same table and shape,
-- so Settings → Integrations shows them the same way.
insert into public.integration_setting (key, config)
values ('aisensy', jsonb_build_object(
  'api_key', '',
  'campaign', '',
  'paused', 'yes',            -- OFF until the key is pasted and a campaign is Live
  'per_hour', '100',
  'per_day', '500',
  'gap_seconds', '3'
))
on conflict (key) do nothing;
