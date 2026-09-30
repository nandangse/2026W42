# CRM merges — the reversible log

Each file is one merge run: every keeper, every row merged into it, and why.
The same facts are in the CRM database — `crm_audit` (one row per merged
record, `before` holding the row as it was) and `crm_clean_finding`
(`status = done` for what was merged, `open` for what was left as a proposal
with a reason).

To reverse a merge: the loser still exists, soft-deleted (`deleted_at`, and
`merged_into_id` on a company). Clear those two fields and re-point the
references named in `/api/crm/merge` back from the keeper. Nothing was hard
deleted except `person_phone` rows that duplicated a number the keeper
already held.

## 2026-09-30-overnight.json
Dr Raghu, 30 Sep 2026: "go to the CRM and check the database. Merge duplicate
companies and duplicate contacts. Use your judicious sense."

Merged only the unambiguous classes; everything else became an open finding
in CRM → Clean Database with a reason on it:

- companies: identical name after Pvt/Ltd/punctuation/case, same city, not a
  person's name — 439 rows into 408 keepers
- persons: same personal e-mail and same name (20,200); same name inside one
  company with no conflicting e-mail or phone (286); same phone and same name
  (3,336) — 23,822 rows into 10,535 keepers
- left as proposals: 906 company groups (person-like names such as
  "Kuldeep" ×4, or different cities), 5,327 person groups (one e-mail carrying
  different names, or conflicting e-mails/phones)
