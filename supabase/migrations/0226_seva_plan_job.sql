-- 0226 — SEVA: A PLAN LINE CAN NAME A JOB (Genie 6.6.0.0)
--
-- Dr Raghu, 12 Oct 2026: "make a sub module called Installation. Show jobs in
-- installation. Deploy people there." Deploying a person on an installation
-- is a line on the same plan the roster shows, kind Installation, with the
-- job number on it, so the roster and the installation screen are one record.
-- Also logged: "show jobs also on the side … only show the jobs with an issue
-- ticket" (Seva → Jobs, no table needed).

alter table public.seva_plan add column if not exists job_id text;
create index if not exists seva_plan_job_idx on public.seva_plan (job_id);

insert into public.feature_request (title, body, want, status, note, by)
select x.title, x.body, 'must', 'done', 'Shipped as Genie 6.6.0.0.', 'raghu@nandan.co.in'
from (values
  ('Seva — Installation: the jobs at installation, and people deployed on them', '<p>"make a sub module called Installation. Show jobs in installation. Deploy people there." (Dr Raghu, 12 Oct 2026.)</p>'),
  ('Seva — Jobs: every job with an issue ticket, with the usual filters', '<p>"show jobs also on the side so that all the jobs which are there can be seen, with the same filters as normal. Only show the jobs with an issue ticket." (Dr Raghu, 12 Oct 2026.)</p>'),
  ('Seva — Discussion points: filter, search, sortable; the plan by drag and drop; dashboard 12M/YTD/QTD/MTD/dates', '<p>"have a filter on top and also the search, make them sortable" · "Show date also. Make this drag and drop" · "put from and to also — 12 m, YTD, QTD, MTD or date" (Dr Raghu, 12 Oct 2026.)</p>')
) as x(title, body)
where not exists (select 1 from public.feature_request f where f.title = x.title);

insert into public.genie_migration (name) values ('0226_seva_plan_job') on conflict (name) do nothing;
