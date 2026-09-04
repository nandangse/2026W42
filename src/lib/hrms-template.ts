/**
 * Templates with variables (Dr Raghu, 4 Sep 2026): "in masters keep a
 * provision to add template. Have a list of variables in the side."
 *
 * A variable is {{key}} where key is a field of the employee record —
 * {{name}}, {{designation}}, {{doj}} — plus a few that are not on the record
 * ({{today}}, {{first_name}}). The old <name> form the offer covering note
 * used keeps working. Unknown variables are left as they are, so a typo is
 * visible in the preview rather than silently blank.
 *
 * Pure: no database, no React. The Masters screen lists TEMPLATE_VARS down
 * its side; the communication route renders with renderTemplate.
 */
import { ALL_FIELDS, FIELD_GROUPS } from "@/lib/hrms";

export interface TemplateVar { key: string; label: string; group: string }

/** Which record fields make sense in a letter — the confidential groups stay out. */
export const TEMPLATE_VARS: TemplateVar[] = [
  { key: "first_name", label: "First name", group: "Letter" },
  { key: "today", label: "Today's date", group: "Letter" },
  { key: "cycle", label: "Appraisal cycle", group: "Letter" },
  ...FIELD_GROUPS.filter((g) => !g.confidential).flatMap((g) =>
    g.fields.filter((f) => !/^doc_|^drive_|^notes$|^file_name$/.test(f.key)).map((f) => ({ key: f.key, label: f.label, group: g.label })),
  ),
];

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** The variable map for one employee, from the merged record value. */
export function employeeVars(value: Record<string, string | null>, extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ALL_FIELDS) {
    const v = f.derived ? f.derived(value) : value[f.key];
    out[f.key] = v == null ? "" : f.kind === "bool" ? (v === "no" ? "no" : "yes") : String(v);
  }
  const name = String(value.name || "").trim();
  out.first_name = name.split(/\s+/)[0] || "";
  out.today = fmtDate(new Date());
  out.cycle = "2026-27";
  return { ...out, ...extra };
}

/** {{key}} and <key> both replaced; unknown ones left visible. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return String(tpl || "")
    .replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    .replace(/<\s*([a-zA-Z_][\w]*)\s*>/g, (m, k: string) => (k in vars && !/^(p|b|i|u|br|em|strong|div|span|ol|ul|li|h3|h4|tr|td|table|a)$/i.test(k) ? vars[k] : m));
}

/** Every variable a template mentions, known or not. */
export function templateVars(tpl: string): string[] {
  const s = new Set<string>();
  for (const m of String(tpl || "").matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)) s.add(m[1]);
  return [...s];
}
