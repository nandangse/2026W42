// The morning files Shweta downloads + uploads. ERP report links open in
// the user's browser; the app never talks to the ERP itself. Ported from V1.9,
// plus the Delivered Jobs report added 17 Aug 2026.
export interface MorningSource {
  key: "jobs" | "projects" | "tasks" | "delivered" | "employees";
  nm: string;
  desc: string;
  erp: string;
  /** Google-Sheets mirror, where one exists. Blank = ERP download only. */
  gs: string;
  /**
   * Part of the every-morning ritual (counted in "n/n loaded", chased in red
   * when missing). Delivered Jobs is history, not a daily snapshot, so it sits
   * on the page without nagging — it shows when it was last loaded instead.
   */
  daily: boolean;
  /**
   * Restricted to the owner account. "RJ Uploads" on Morning Update — masters
   * that are Dr Raghu's to load, not part of anyone's morning routine.
   */
  ownerOnly?: boolean;
}

/**
 * THE MORNING ROUND IS OVER (Dr Raghu, 1 Sep 2026).
 *
 * Every card below is retired, and each for its own reason:
 *
 *   jobs · projects · delivered — "can we now stop the upload and instead do
 *       the API import from erpnext?" They come straight off nandanerp now,
 *       through the ↻ Synchronise button at the top of this page. The mapping
 *       was checked field by field against what these very sheets had loaded,
 *       and the ERP proved to be AHEAD of them — fourteen of the 112 live jobs
 *       held delivery dates the morning file had never carried across.
 *
 *   tasks — "we are going to be maintaining only in the genie and not in the
 *       ERP, so that also can be dropped out." Genie is the master; there is
 *       nothing left to import.
 *
 *   employees — retired earlier, on 23 Aug 2026: HRMS is the master.
 *
 * THE PARSERS AND MERGE PATHS ARE LEFT IN PLACE, as the Employee Master's
 * were. Restoring any of these is a one-line change if an import is ever
 * needed again, and deleting working code to express a policy is how the
 * policy becomes irreversible by accident.
 */
export const DEFAULT_SOURCES: MorningSource[] = [
  /* {
    key: "jobs",
    nm: "Job in progress - Jobs",
    desc: "All active jobs — TDD, OTD, Job Status, Prod %, value, Mgmt dates (primary file)",
    erp: "https://nandanerp.in/app/jobmaster/view/report/Jobmaster%20-%20Planning%20Reporting",
    gs: "https://docs.google.com/spreadsheets/d/1OURpJfBCohWDRWTBwkBJep0AVUCqGTPWJqsz69sGwl8/edit",
    daily: true,
  },
  {
    key: "projects",
    nm: "Order in Progress - projects",
    desc: "Project Managers (job owners) + Customer Committed / Expected End dates",
    erp: "https://nandanerp.in/app/project/view/report/Open%20Projects%20BPP",
    gs: "https://docs.google.com/spreadsheets/d/1zsFATRDFyt1SEIc7bh2MrWPGjE-XKqFW8qhZy4x7Vkg/edit",
    daily: true,
  },
  {
    key: "delivered",
    nm: "Delivered Jobs",
    desc: "Jobs already delivered + the delivery date — the only file that carries delivery history",
    erp: "https://nandanerp.in/desk/jobmaster/view/report/Delivered%20Jobs%20for%20Analysis",
    gs: "",
    daily: false,
  },
  {
    key: "tasks",
    nm: "To Do Dashboard All",
    desc: "ERP ToDos → task cards on the boards",
    erp: "https://nandanerp.in/app/todo/view/report/ToDo%20Dashboard%20All",
    gs: "https://docs.google.com/spreadsheets/d/18jCqt8d_sIHsYOYPkHFnavWwclfEMIsqCoOCVJsCxrY/edit",
    daily: true,
  }, */
  /**
   * ---- RJ Uploads — owner only ----
   *
   * THE EMPLOYEE MASTER UPLOAD IS RETIRED (Dr Raghu, 23 Aug 2026).
   *
   * HRIS is the master now. The sheet was imported one last time on 23 Aug
   * 2026 -- 380 people, every name corrected off the UAN column, every status
   * carried through -- and the card is off the Morning Update page so nobody
   * can overwrite a maintained record with a stale download.
   *
   * The parser and the merge path are LEFT IN PLACE deliberately. Restoring
   * this entry is a one-line change if a bulk correction is ever needed again,
   * and deleting working code to express a policy is how the policy becomes
   * irreversible by accident.
   */
  /* {
    key: "employees",
    nm: "Employee Master",
    desc: "Active employees from the HR sheet — drives the birthday list, and whatever else we add later",
    erp: "https://docs.google.com/spreadsheets/d/1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE/edit?gid=648281746#gid=648281746",
    gs: "https://docs.google.com/spreadsheets/d/1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE/edit",
    daily: false,
    ownerOnly: true,
  }, */
];

/** Google-Sheets edit URL → direct .xlsx export URL (the "Download sheet" link). */
export function gsExport(u: string): string {
  const m = String(u).match(/\/d\/([\w-]+)/);
  return m
    ? "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=xlsx"
    : u;
}
