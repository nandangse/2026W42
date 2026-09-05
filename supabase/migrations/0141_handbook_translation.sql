-- 0141_handbook_translation.sql
--
-- THE HANDBOOK IN HINDI AND MARATHI (Dr Raghu, 5 Sep 2026): "convert this
-- into Hindi and Marathi. On the top, show a dropdown ... English, Hindi, or
-- Marathi. By default English ... For the labour contract, later on, it can
-- be Hindi by default."
--
-- One translated copy per section per language, stamped with the English
-- version it was made from: when HR edits the English, the translation is
-- stale until Genie re-translates it, and the screen says so. ASCII, additive.

create table if not exists public.hrms_handbook_translation (
  slug           text not null,
  lang           text not null check (lang in ('hi','mr')),
  title          text not null default '',
  summary        text not null default '',
  body           text not null default '',
  source_version integer not null default 0,
  translated_at  timestamptz not null default now(),
  translated_by  text,
  primary key (slug, lang)
);
alter table public.hrms_handbook_translation enable row level security;
revoke all on public.hrms_handbook_translation from anon, authenticated;
