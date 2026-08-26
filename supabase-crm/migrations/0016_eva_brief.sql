-- 0016: EVA BRIEF on the company (Genie 3.23.1.35, 26 Aug 2026)
-- The AI dossier: who they are, their LinkedIn, industry brief, dated news,
-- our own correspondence and warmth, and the similar-industry work that
-- gives us credibility. Written by /api/crm/eva-brief, kept on the row.

alter table company add column if not exists eva_brief text;
alter table company add column if not exists eva_brief_at timestamptz;
