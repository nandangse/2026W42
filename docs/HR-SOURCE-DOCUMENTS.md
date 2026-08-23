# HR source documents — what they hold, and what HRMS takes from them

Read 22 Aug 2026 from Dr Raghu's three links. This file is the note of what is
**in** them, so the HRMS modules can be built against the real shape of the
data rather than against a guess. It is a description, not a copy: no salary
figure, no Aadhaar number and no bank account is reproduced here.

---

## 1. Main Salary Sheet 2026-27 — `1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE`

**The employee master lives here, and it is the main document.** This is also
the sheet the Morning Update "Employee Master" upload already reads.

Too large for Drive to export as a workbook; read through its own **Index**
tab, which lists ~48 tabs:

| # | Tab | Becomes, in HRMS |
|---|-----|------------------|
| 4 | Employee Master | Employee Master ✅ (built) |
| 47 | Left Employees Master · 10 Left Employees Data | Left Employees |
| 7 | Employee Report Card | Individual Report Card |
| 9 | Appraisal | Appraisal |
| 48 | KRA & KPI | IDP → Roles, JD, KRA, KPI |
| 20 | INDIVIDUAL DEVELOPMENT PLAN (IDP) | IDP → Individual IDP |
| 21 | Intension Statement | Regular Reports → Intention Statement |
| 19 | Daily Reporting | Regular Reports → Daily Reporting |
| 14 | Salary Sheets — one tab per month, Apr 2025 → Jul 2026 | Finalized Salary Sheets |
| 15 | Attendance Muster — one tab per month + 2025 muster | Attendance Muster |
| 3 | Salary MIS 2025-26 · 2 MIS of Current Demographic · 42 Summary Data Analysis | Salary MIS Report |
| 46 | Employee Handbook v 13.0 | Employee Handbook (editable) |
| 26 | HR Accountabilities · 25 HR Playbook | HR Departmental ToDos |
| 27 | Compliance Calendar · 43 EPF & ESI · 44 MLWF · 45 PoSH | Statutory Records |
| 16 | Salary Processing Checklist · 22 Leave Applications · 23–29 Holiday Lists · 29 Loan Applications · 8 Loan Register · 30 LIC Term Insurance | later |
| 18 | Attrition Analysis · 35 Employee List with Tenure · 36 Doubtful Cases · 37 Unauthorised Absence | later |
| 31 | InternMaster · 40 Turbhe Employees · 28 Khalapur | later |

**Population as the sheet states it (Aug 2026): 200 active** — Management 3,
Staff 63, Contractor 7, Labour 116, plus the remainder. `Type` is one of
**Management / Staff / Contractor / Labour**; `Status` is **Active /
Resigned / Terminated** (and the master's own banner also counts *Doubtful*,
*Notice Period* and *F&F Due*).

**The master's own columns — 115 of them**, far beyond the eight Genie's
`hrms_employees` table names today:

- *Identity* — ID, Name, Type, Status, Joining Date, Experience in Nandan,
  Date of Birth, Age, Department, Designation, Reporting Manager, Job
  Location, Casual Name, Shift, Coming From
- *Statutory* — PF No, UAN No, UAN Name, AADHAR No, PAN No, ESIC Eligible,
  ESIC No, MLWF LIN No, Income Tax Applicable
- *Pay* — Days Paid, Basic and DA, HRA, Fixed Allowance, Conveyance, Medical
  Allowance, Gross Salary, Per Day Rate, and Gross Salary for each year back
  to 2020-21
- *Contact* — Personal Mobile ×2, Company Mobile, Company Email (= the
  nandanerp login), Personal Mail ID, WhatsApp, Permanent Address, Current
  Address
- *Bank* — Name in bank, Bank Name, Account No, 15-digit Account No, Branch,
  IFSC
- *Person* — Qualification, Experience before Nandan, Blood Group, Religion,
  Marital Status, Gender, Age Group, Shirt/Pant/Shoe size, Passport Photo,
  Vaccine 1 & 2 dates
- *Family* — Next of Kin, NOK Relation, NOK Contact, Spouse, 1st/2nd/3rd
  Child (four columns each), Wedding Anniversary, Family details updated on
- *Benefits* — Mediclaim Premium & ID, LIC Policy/Premium/Sum Assured, Loan
  as on, Leave as on, Referral Employee
- *Exit* — Leaving Date, Left Date, Leaving Reason, Total Months in Nandan,
  Years for Gratuity, Gratuity Amount
- *Performance* — In LC, Evaluation, IDP Link in ERP, Latest IDP PDF, Latest
  Work Responsibility, Attendance %, Late Coming %, Skill Level

> Genie's `hrms_employees` table carries 8 named columns and puts the rest in
> `extra` jsonb. Every one of the above is therefore ALREADY in the database
> after an upload — it is simply unnamed. Naming the ones a module needs is a
> per-module decision, not a re-import.

---

## 2. Nandan GSE Employee Plan 2026 Appraisal — `1JDG8xvJ2zwg76rQd4AqYWwsjPhM5si5s2vPuSgpv_JM`

Owned by hr@nandan.co.in. 17 tabs. **This is the shape the Appraisal module
should take.**

| Tab | Rows | What it is |
|-----|------|-----------|
| Appraisal Discussions | 1001 | The decision table: Employee ID, Name, Age, In Company, Previous Gross, Increase, %, New Gross, note, Variables, CTC |
| Individual Report Card | 63 | One person per card — Employee ID, Reporting Manager, and the year's assessment. A CARD, not a row |
| EmployeeMaster | 383 | The 115-column master, copied in |
| Summary of Appraisals | 231 | By band: Count, Current Pay, Average/month, Increased Pay, Average, Appraisal % (13.25% overall) |
| Rating of Individuals — Leaders / Staff / Contract / Labour | 15 / 56 / 8 / 131 | Four rating tables, one per employee type |
| Job Descriptions | 97 | Role · JD · Role Definition · Responsibility Deliverable · Tasks & Activities · Measurement Metrics KPI |
| IDP | 116 | Sr, ID, Docstatus, Employee ID, Email, Full Name, **My Accountability**, **My Tasks for this Month Tracker**, **What Support I need**, **My KPIs of Importance**, **Quarterly Goals**, Department, Reporting Manager, **Learning Goals**, then 11 rated dimensions: Job Knowledge · Job Skills · Quality of work · Dependability · Time Management · Initiative and Creativity · Communication Skills · Listening Skills … |
| Form Responses Questionnaire | 63 | The self-appraisal form — 41 questions. Includes the outcomes-not-activities list, what was missed, dependency reduction, REALISTICS value demonstrated, "if you were MD", readiness for a bigger role, and a final confirmation tick |
| Copy of Evaluation For 2026 | 148 | Grade bands, % for staff, rupees per day for labour |
| Filled Up from Claude · Active Sheet | 204 each | Working sheets |
| Index · Intention Statement · Daily Reporting | empty | Named, never filled — HRMS is where they get filled |

**The appraisal cycle this implies:** self-appraisal form → rating against 11
dimensions per person → a rating table per employee type → an individual
report card → a discussion with a decided increase → a summary by band.
That is five screens and one audit trail, and it matches the navigation
Dr Raghu asked for almost exactly.

---

## 3. Nandan_Breakthrough_2026-27_Annual_Goalbook_W35 — `1EvqHB2Y7o9f-7Ovn54M-rgaitZEEqbxvuMwJ5PJnZkQ`

11 tabs. The one that matters for HRMS is **"2026 Definition of Roles - JD,
KRA, KPI"** — 88 rows:

> Sr · **Role** · Department · **Grade** · **Reports To** · Location · **Job
> Description** · **Deliverable** · **Measurement Metric**

A second, older cut sits in *BAK 2026 Definition of Roles* (Department ·
Designation · Job Description · Responsibility Deliverable · Measurable
Metric) and *Copy of Role Index* (Sr · Role · Department · Grade · Reports To
· Location).

The rest is company goal machinery rather than HR, and it already has a home
in Genie's Goals workspace — but it is where a KPI's definition comes from,
so the IDP module should read role KPIs from here rather than inventing them:

- **90-Day Goal Plan** (93) — Department, Goal #, SMART goal, Baseline,
  Target, Goal Owner, Initiative, Initiative Owner, Due/Cadence, How measured,
  Status, Related CSF
- **Departmental KPI** (53) — KPI #, Name, Related to, Responsible, Annual
  Target, Where to see it, What it measures, How calculated, Baseline,
  Frequency, then a column per month Apr 2026 → Mar 2027
- **Systems Audit** (21) — Block, System, Scope, RACI, SOP link & status,
  Primary KPI, target, actual, cadence, Maturity 1-5, **Founder Dependency
  1-5**, Leader Competence, Leader Will, System Score /25, RAG, CHRO people
  action
- **Nandan Warriors** (28) — Name, Code, Department, Role, what they carry,
  goals/initiatives/KPIs/systems owned, email, mobile
- Owner Load · Audit Lists · Goalbook Index · How To Use

---

## What this means for the build order

1. **Employee Master** is real today and is the spine — every other module
   keys off `hrms_employees.id`.
2. **Roles, JD, KRA, KPI** is a small, self-contained import from the
   Goalbook's roles tab, and both IDP and Appraisal depend on it. It should
   come second.
3. **IDP** and **Appraisal** are the substantial builds, and they share the
   Individual Report Card.
4. **Regular Reports** (Intention Statement, Daily/Weekly/Monthly/Quarterly,
   1-2-1) are empty in the sheets — there is nothing to migrate, so they can
   be designed cleanly rather than inherited.
5. **Salary, Attendance, Statutory** are the sheet's own strength and are
   heavy with confidential figures — they are the last thing to move, and the
   first thing to think about who may see.
