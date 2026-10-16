/**
 * PULL THE MUSTERS FROM THE HR SHEET (Dr Raghu, 16 Oct 2026: "should have
 * more months"). The Main Salary Sheet carries one "Muster <Month> <Year>"
 * tab per month back to April 2024. Each is read through Genie's service
 * account, parsed by the same parseMuster the payroll upload uses, and kept
 * in hrms_muster_import — only for months no payroll run in Genie already
 * carries, because the run's own muster is what the salary was paid on.
 *
 * WHICH MONTH A TAB IS. The day columns say (1/6 … 30/6 is June) and they
 * win over the tab's name — the sheet has named a tab for the month the
 * salary was paid in, not the month the marks are for.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveConfig, driveToken } from "@/lib/drive";
import { parseMuster } from "@/lib/muster";

export const HR_SHEET_ID = "1dp-ce1pWMMTUFqBgMCeXpWXlRE394VWxrx4Xz-PQhvE";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TAB = /^muster\s*([a-z]+)\.?\s+(20\d\d)\s*$/i;

export interface ImportResult { imported: { tab: string; month: number; year: number; people: number; days: number }[]; skipped: { tab: string; why: string }[]; sa_email: string | null; error?: string }

export function saEmail(): string | null { return driveConfig()?.email || null; }

export async function importMusters(admin: SupabaseClient, by: string, opts: { force?: boolean } = {}): Promise<ImportResult> {
  const cfg = driveConfig();
  if (!cfg) return { imported: [], skipped: [], sa_email: null, error: "Google service account is not configured on this server." };
  const token = await driveToken(cfg);
  const H = { authorization: `Bearer ${token}` };
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HR_SHEET_ID}?fields=sheets.properties.title`, { headers: H, signal: AbortSignal.timeout(30000) });
  if (!meta.ok) {
    const j = await meta.json().catch(() => ({})) as { error?: { message?: string } };
    return { imported: [], skipped: [], sa_email: cfg.email, error: meta.status === 403 || meta.status === 404 ? `Google would not open the HR sheet for ${cfg.email} — share the Main Salary Sheet with that address as Viewer, then pull again.` : `Sheets API ${meta.status}: ${j.error?.message || ""}` };
  }
  const tabs = ((await meta.json()) as { sheets?: { properties: { title: string } }[] }).sheets?.map((s) => s.properties.title) || [];
  // months a payroll run already carries
  const { data: runs } = await admin.from("hrms_salary_sheet").select("month, year, muster");
  const have = new Set((runs || []).filter((r) => ((r.muster as { rows?: unknown[] } | null)?.rows || []).length).map((r) => `${r.year}-${r.month}`));
  const { data: done } = await admin.from("hrms_muster_import").select("year, month, tab");
  const doneTabs = new Set((done || []).map((d) => String(d.tab)));
  const out: ImportResult = { imported: [], skipped: [], sa_email: cfg.email };
  for (const tab of tabs) {
    const m = TAB.exec(tab.trim()); if (!m) continue;
    const tabMonth = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1; const tabYear = Number(m[2]);
    if (!tabMonth) { out.skipped.push({ tab, why: "month not recognised" }); continue; }
    if (!opts.force && doneTabs.has(tab)) { out.skipped.push({ tab, why: "already pulled" }); continue; }
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HR_SHEET_ID}/values/${encodeURIComponent(`'${tab}'!A1:ZZ1200`)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, { headers: H, signal: AbortSignal.timeout(60000) });
    if (!res.ok) { out.skipped.push({ tab, why: `Sheets API ${res.status}` }); continue; }
    const grid = (((await res.json()) as { values?: unknown[][] }).values || []);
    const parsed = parseMuster(grid);
    if (!parsed.rows.length) { out.skipped.push({ tab, why: parsed.warnings[0] || "no rows" }); continue; }
    // the marks' own month wins; the year follows the tab, stepping back across a January
    const month = parsed.month || tabMonth;
    const year = month === 12 && tabMonth === 1 ? tabYear - 1 : (parsed.year && Math.abs(parsed.year - tabYear) <= 1 ? parsed.year : tabYear);
    if (have.has(`${year}-${month}`)) { out.skipped.push({ tab, why: `a payroll run in Genie already carries ${month}/${year}` }); continue; }
    const row = { year, month, tab, people: parsed.rows.length, days: parsed.days || parsed.rows[0]?.days?.length || 0, muster: { ...parsed, month, year }, source_sheet: HR_SHEET_ID, warnings: parsed.warnings.slice(0, 20), imported_at: new Date().toISOString(), imported_by: by };
    const { error } = await admin.from("hrms_muster_import").upsert(row, { onConflict: "year,month" });
    if (error) { out.skipped.push({ tab, why: /hrms_muster_import/.test(error.message) ? "run migration 0241 first" : error.message }); if (/hrms_muster_import/.test(error.message)) break; continue; }
    out.imported.push({ tab, month, year, people: row.people, days: row.days });
  }
  return out;
}
