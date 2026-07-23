// The three morning files Shweta downloads + uploads. ERP report links open in
// the user's browser; the app never talks to the ERP itself. Ported from V1.9.
export interface MorningSource {
  key: "jobs" | "projects" | "tasks";
  nm: string;
  desc: string;
  erp: string;
  gs: string;
}

export const DEFAULT_SOURCES: MorningSource[] = [
  {
    key: "jobs",
    nm: "Job in progress - Jobs",
    desc: "All active jobs — TDD, OTD, Job Status, Prod %, value, Mgmt dates (primary file)",
    erp: "https://nandanerp.in/app/jobmaster/view/report/Jobmaster%20-%20Planning%20Reporting",
    gs: "https://docs.google.com/spreadsheets/d/1OURpJfBCohWDRWTBwkBJep0AVUCqGTPWJqsz69sGwl8/edit",
  },
  {
    key: "projects",
    nm: "Order in Progress - projects",
    desc: "Project Managers (job owners) + Customer Committed / Expected End dates",
    erp: "https://nandanerp.in/app/project/view/report/Open%20Projects%20BPP",
    gs: "https://docs.google.com/spreadsheets/d/1zsFATRDFyt1SEIc7bh2MrWPGjE-XKqFW8qhZy4x7Vkg/edit",
  },
  {
    key: "tasks",
    nm: "To Do Dashboard All",
    desc: "ERP ToDos → task cards on the boards",
    erp: "https://nandanerp.in/app/todo/view/report/ToDo%20Dashboard%20All",
    gs: "https://docs.google.com/spreadsheets/d/18jCqt8d_sIHsYOYPkHFnavWwclfEMIsqCoOCVJsCxrY/edit",
  },
];

/** Google-Sheets edit URL → direct .xlsx export URL (the "Download sheet" link). */
export function gsExport(u: string): string {
  const m = String(u).match(/\/d\/([\w-]+)/);
  return m
    ? "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=xlsx"
    : u;
}
