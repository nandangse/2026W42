-- 0057_apollo_pool.sql — CRM database — Genie 5.0.3.0 (6 Sep 2026)
--
-- APOLLO LEADS — the pool (Dr Raghu, 6 Sep 2026): "ok make a new table
-- called Apollo lead. Sync it there. We can do a workflow where to import
-- from apollo to the leads is a click away! We can search with filters and
-- then do select all and then add to leads. Apollo list name will come in
-- as tag on the apollo lead."
--
-- WHY A SEPARATE TABLE. Apollo holds 3.1 million people across 253 lists.
-- Loading those into `person` would add about 3 GB — the rows are the small
-- part; person carries seven indexes including a full-text one, and company
-- carries two. Every CRM search would then share an instance whose working
-- set no longer fits in memory. This table is deliberately cheap: flat text,
-- no generated columns, no full-text index, three indexes in all — about
-- 350 bytes a row, so even the whole 3.1 million is around 1 GB and it never
-- touches the CRM's own tables until somebody promotes a row.
--
-- A row is promoted (mk_apollo_promote) when it is wanted: only then does a
-- person and a company appear in the CRM, tagged Apollo and with the Apollo
-- list names as tags.

create table if not exists mk_apollo (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,             -- lower(email), or name|name|company when there is no e-mail
  email text,
  first_name text,
  last_name text,
  title text,
  seniority text,
  department text,
  phone text,
  linkedin text,
  city text,
  state text,
  country text,
  company_name text,
  domain text,
  website text,
  industry text,
  employees int,
  company_city text,
  company_country text,
  lists text[] not null default '{}',   -- the Apollo list names, as tags
  promoted_person_id uuid references person(id) on delete set null,
  promoted_at timestamptz,
  imported_by text,
  imported_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create unique index if not exists mk_apollo_key_uq on mk_apollo (dedupe_key);
create index if not exists mk_apollo_lists_idx on mk_apollo using gin (lists);
create index if not exists mk_apollo_open_idx on mk_apollo (imported_at desc) where promoted_person_id is null;

alter table mk_apollo enable row level security;
revoke all on mk_apollo from anon, authenticated;

-- ─────────────────────────── the intake ───────────────────────────
-- One call a batch. Rows that are already here keep what they have and gain
-- the new list name; blanks are filled in from the newer row. Duplicates
-- inside one batch are folded before the insert, or Postgres refuses the lot.
create or replace function mk_apollo_take(payload jsonb, list_name text, by_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_new int := 0;
  v_merged int := 0;
  v_list text[] := case when coalesce(trim(list_name), '') = '' then '{}'::text[] else array[trim(list_name)] end;
begin
  with raw as (
    select
      coalesce(
        nullif(lower(trim(r->>'email')), ''),
        nullif(lower(trim(coalesce(r->>'first_name','') || '|' || coalesce(r->>'last_name','') || '|' || coalesce(r->>'company',''))), '||')
      ) as key,
      nullif(lower(trim(r->>'email')), '') as email,
      nullif(trim(r->>'first_name'), '') as first_name,
      nullif(trim(r->>'last_name'), '') as last_name,
      nullif(trim(r->>'title'), '') as title,
      nullif(trim(r->>'seniority'), '') as seniority,
      nullif(trim(r->>'department'), '') as department,
      nullif(trim(r->>'phone'), '') as phone,
      nullif(trim(r->>'linkedin'), '') as linkedin,
      nullif(trim(r->>'city'), '') as city,
      nullif(trim(r->>'state'), '') as state,
      nullif(trim(r->>'country'), '') as country,
      nullif(trim(r->>'company'), '') as company_name,
      nullif(lower(trim(r->>'domain')), '') as domain,
      nullif(trim(r->>'website'), '') as website,
      nullif(trim(r->>'industry'), '') as industry,
      nullif(regexp_replace(coalesce(r->>'employees',''), '[^0-9]', '', 'g'), '')::int as employees,
      nullif(trim(r->>'company_city'), '') as company_city,
      nullif(trim(r->>'company_country'), '') as company_country
    from jsonb_array_elements(payload) r
  ),
  src as (
    select distinct on (key) * from raw where key is not null and key <> ''
  ),
  ins as (
    insert into mk_apollo (dedupe_key, email, first_name, last_name, title, seniority, department, phone, linkedin,
                           city, state, country, company_name, domain, website, industry, employees,
                           company_city, company_country, lists, imported_by)
    select key, email, first_name, last_name, title, seniority, department, phone, linkedin,
           city, state, country, company_name, domain, website, industry, employees,
           company_city, company_country, v_list, by_email
    from src
    on conflict (dedupe_key) do update set
      email = coalesce(mk_apollo.email, excluded.email),
      first_name = coalesce(mk_apollo.first_name, excluded.first_name),
      last_name = coalesce(mk_apollo.last_name, excluded.last_name),
      title = coalesce(mk_apollo.title, excluded.title),
      seniority = coalesce(mk_apollo.seniority, excluded.seniority),
      department = coalesce(mk_apollo.department, excluded.department),
      phone = coalesce(mk_apollo.phone, excluded.phone),
      linkedin = coalesce(mk_apollo.linkedin, excluded.linkedin),
      city = coalesce(mk_apollo.city, excluded.city),
      state = coalesce(mk_apollo.state, excluded.state),
      country = coalesce(mk_apollo.country, excluded.country),
      company_name = coalesce(mk_apollo.company_name, excluded.company_name),
      domain = coalesce(mk_apollo.domain, excluded.domain),
      website = coalesce(mk_apollo.website, excluded.website),
      industry = coalesce(mk_apollo.industry, excluded.industry),
      employees = coalesce(mk_apollo.employees, excluded.employees),
      company_city = coalesce(mk_apollo.company_city, excluded.company_city),
      company_country = coalesce(mk_apollo.company_country, excluded.company_country),
      lists = (select array(select distinct e from unnest(mk_apollo.lists || excluded.lists) e where coalesce(e,'') <> '')),
      seen_at = now()
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_new, v_merged from ins;
  return jsonb_build_object('new', v_new, 'merged', v_merged);
end
$fn$;

-- ─────────────────────────── the promotion ───────────────────────────
-- "add to leads is a click away": the pooled row becomes a person (and a
-- company when it names one) in the CRM's own tables — matched on e-mail,
-- then domain, then name, so nothing is duplicated — tagged Apollo and with
-- every Apollo list it came from as a tag. Idempotent: a row already
-- promoted is skipped.
create or replace function mk_apollo_promote(p_ids uuid[], p_by text, p_list uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_company uuid;
  v_person uuid;
  v_tag uuid;
  v_promoted int := 0;
  v_new_people int := 0;
  v_new_companies int := 0;
  l text;
begin
  for r in select * from mk_apollo where id = any(p_ids) and promoted_person_id is null loop
    v_company := null;
    if coalesce(r.domain, '') <> '' then
      select id into v_company from company where lower(domain_name) = r.domain and deleted_at is null limit 1;
    end if;
    if v_company is null and coalesce(r.company_name, '') <> '' then
      select id into v_company from company where lower(name) = lower(r.company_name) and deleted_at is null limit 1;
    end if;
    if v_company is null and coalesce(r.company_name, '') <> '' then
      insert into company (name, domain_name, website, city, country, source, is_lead, created_by_email, assigned_to)
      values (r.company_name, r.domain, r.website, coalesce(r.company_city, r.city), coalesce(r.company_country, r.country), 'apollo', true, p_by, p_by)
      returning id into v_company;
      v_new_companies := v_new_companies + 1;
      foreach l in array (array['Apollo', 'Leads'] || r.lists) loop
        select id into v_tag from crm_tag where lower(name) = lower(l) and owner_id is null limit 1;
        if v_tag is null then insert into crm_tag (name, owner_id) values (l, null) returning id into v_tag; end if;
        insert into crm_tag_link (tag_id, entity, entity_id) values (v_tag, 'company', v_company) on conflict do nothing;
      end loop;
    end if;

    v_person := null;
    if coalesce(r.email, '') <> '' then
      select id into v_person from person where lower(primary_email) = r.email and deleted_at is null limit 1;
    end if;
    if v_person is null then
      insert into person (first_name, last_name, job_title, department, primary_email, primary_phone, linkedin_url,
                          city, country, company_id, source, created_by_email, assigned_to)
      values (r.first_name, r.last_name, r.title, r.department, r.email, r.phone, r.linkedin,
              r.city, r.country, v_company, 'apollo', p_by, p_by)
      returning id into v_person;
      v_new_people := v_new_people + 1;
    elsif v_company is not null then
      update person set company_id = coalesce(company_id, v_company) where id = v_person;
    end if;

    foreach l in array (array['Apollo'] || r.lists) loop
      select id into v_tag from crm_tag where lower(name) = lower(l) and owner_id is null limit 1;
      if v_tag is null then insert into crm_tag (name, owner_id) values (l, null) returning id into v_tag; end if;
      insert into crm_tag_link (tag_id, entity, entity_id) values (v_tag, 'person', v_person) on conflict do nothing;
    end loop;

    if p_list is not null then
      insert into mk_list_member (list_id, person_id, added_by_email) values (p_list, v_person, p_by) on conflict do nothing;
    end if;

    update mk_apollo set promoted_person_id = v_person, promoted_at = now() where id = r.id;
    v_promoted := v_promoted + 1;
  end loop;
  return jsonb_build_object('promoted', v_promoted, 'new_people', v_new_people, 'new_companies', v_new_companies);
end
$fn$;

revoke all on function mk_apollo_take(jsonb, text, text) from anon, authenticated;
revoke all on function mk_apollo_promote(uuid[], text, uuid) from anon, authenticated;

-- ─────────────────────────── the lists, counted ───────────────────────────
-- Every Apollo list name in the pool, with how many sit under it and how
-- many have been taken into the CRM already.
create or replace function mk_apollo_lists()
returns table (name text, total bigint, promoted bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select l as name, count(*) as total, count(*) filter (where promoted_person_id is not null) as promoted
  from mk_apollo, unnest(lists) l
  group by l
  order by count(*) desc
$fn$;
revoke all on function mk_apollo_lists() from anon, authenticated;
