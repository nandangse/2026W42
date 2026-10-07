/**
 * EACH PERSON'S OWN SALARY SLIP, AS A PDF, FOR ANY MAIL THAT WANTS IT (Dr
 * Raghu, 7 Oct 2026: "We did the salary slip through communication, choosing
 * that template for the mass mail. However, the attachment of the salary
 * slip did not happen"). The mass mail carried one shared attachment set
 * to everybody and knew nothing of slips; the dedicated Mail-slips screen
 * did. This is the slip-making lifted out so both roads press the same A5
 * slip from the same register.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { people } from "@/lib/hrms-wa";
import { slipsFromRegister, type Slip } from "@/lib/salary-slip";
import { slipHtml } from "@/lib/slip-html";
import { pressPdfMany } from "@/lib/pdf-press";
import { MONTHS } from "@/lib/salary-sheet";
import { swallow } from "@/lib/swallow";

let stampCache: string | null | undefined;
async function stampDataUri(): Promise<string | undefined> {
  if (stampCache !== undefined) return stampCache ?? undefined;
  try { const b = await readFile(join(process.cwd(), "public", "nandan-stamp.png")); stampCache = `data:image/png;base64,${b.toString("base64")}`; }
  catch (e) { swallow("slip-pack stamp", e); stampCache = null; }
  return stampCache ?? undefined;
}

export interface SlipPdf { id: string; name: string; hold: boolean; base64: string | null; fileName: string }

/** The newest month with a register (or the month asked for), its slips for `ids`, pressed. */
export async function monthSlipPdfs(admin: SupabaseClient, ids: string[], month?: number | null, year?: number | null): Promise<{ period: string; month: number; year: number; status: string; slips: Map<string, SlipPdf> }> {
  let q = admin.from("hrms_salary_sheet").select("id, month, year, status, rows").order("year", { ascending: false }).order("month", { ascending: false }).limit(1);
  if (month && year) q = admin.from("hrms_salary_sheet").select("id, month, year, status, rows").eq("month", month).eq("year", year).limit(1);
  const { data } = await q;
  const sheet = data?.[0];
  if (!sheet) throw new Error("No payroll month with a register.");
  const rows = (sheet.rows || []) as Record<string, unknown>[];
  const ppl = await people(admin, rows.map((r) => String(r.employee_id)));
  const by = new Map(ppl.map((p) => [p.id, p]));
  const days = new Date(Date.UTC(Number(sheet.year), Number(sheet.month), 0)).getUTCDate();
  const all = slipsFromRegister(rows as never[], (id) => (by.get(id)?.value || {}) as Record<string, string | null>, days);
  const want = new Set(ids);
  const picked = all.filter((s: Slip) => want.has(s.id));
  const period = `${MONTHS[Number(sheet.month) - 1]} ${sheet.year}`;
  const stampUrl = await stampDataUri();
  const pdfs = picked.length ? await pressPdfMany(picked.map((s) => slipHtml(s, Number(sheet.month), Number(sheet.year), { draft: sheet.status !== "Frozen", stampUrl }))) : [];
  const out = new Map<string, SlipPdf>();
  picked.forEach((s, i) => out.set(s.id, { id: s.id, name: String(s.name || ""), hold: !!s.hold, base64: pdfs[i] ? pdfs[i]!.toString("base64") : null, fileName: `${period} - ${s.id} - ${s.name}.pdf` }));
  return { period, month: Number(sheet.month), year: Number(sheet.year), status: String(sheet.status), slips: out };
}
