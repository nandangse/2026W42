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

export const DEFAULT_SOURCES: MorningSource[] = [
  {
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
  // Third on the page by Dr Raghu's instruction (17 Aug 2026). It sits with
  // the jobs files it belongs beside rather than last, even though it is the
  // one file that is not part of the daily ritual.
  {
    key: "delivered",
    nm: "Delivered Jobs",
    desc: "Jobs already delivered + the delivery date — the only file that carries delivery history",
    // URL exactly as given by Dr Raghu (ERPNext serves /desk and /app alike).
    erp: "https://nandanerp.in/desk/jobmaster/view/report/Delivered%20Jobs%20for%20Analysis",
    // No Google-Sheets mirror for this report — download it from the ERP itself.
    gs: "",
    // History, not a daily snapshot — see MorningSource.daily.
    daily: false,
  },
  {
    key: "tasks",
    nm: "To Do Dashboard All",
    desc: "ERP ToDos → task cards on the boards",
    erp: "https://nandanerp.in/app/todo/view/report/ToDo%20Dashboard%20All",
    gs: "https://docs.google.com/spreadsheets/d/18jCqt8d_sIHsYOYPkHFnavWwclfEMIsqCoOCVJsCxrY/edit",
    daily: true,
  },
  // ---- RJ Uploads — owner only ----
  {
    key: "employees",
    nm: "Employee Master",
    desc: "Active employees from the HR sheet — drives the birthday list, and whatever else we add later",
    erp: "https://docs.google.com/spreadsheets/d/1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE/edit?gid=648281746#gid=648281746",
    gs: "https://docs.google.com/spreadsheets/d/1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE/edit",
    daily: false,
    ownerOnly: true,
  },
];

/** Google-Sheets edit URL → direct .xlsx export URL (the "Download sheet" link). */
export function gsExport(u: string): string {
  const m = String(u).match(/\/d\/([\w-]+)/);
  return m
    ? "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=xlsx"
    : u;
}
