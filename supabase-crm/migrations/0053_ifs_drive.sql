-- 0053_ifs_drive.sql
--
-- THE INSTAFINANCIALS REPORTS ALREADY IN DRIVE (Dr Raghu, 4 Sep 2026: "when
-- we have the instafinancials then pl put it here. Put the link from drive
-- as well as put in the summary here. Also put the CIN number here and also
-- on the first page" -- the folder "All Instafinancial downloads").
--
-- ifs_pdf (0043) held only a filename. Now the Drive file id and its link
-- are kept too, so the report is one click away, and the summary can be
-- READ OUT OF THE PDF rather than bought again: ifs_source says whether the
-- summary on the row came from the API ('api') or the Drive report ('pdf').
--
-- ASCII only, additive, safe to re-run.
alter table company add column if not exists ifs_pdf_id  text;
alter table company add column if not exists ifs_pdf_url text;
alter table company add column if not exists ifs_source  text;
