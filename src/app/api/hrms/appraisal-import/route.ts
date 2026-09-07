import { NextResponse } from "next/server";
import { allRows } from "@/lib/all-rows";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { hrmsTables } from "@/lib/hrms";
import { salaryTable, NO_HRA_NO_MEDICAL } from "@/lib/salary";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CYCLE = "2026-27";

/**
 * POST /api/hrms/appraisal-import — the workers' revision, in one go
 * (Dr Raghu, 7 Sep 2026: "yes. the staff and others i will do in the HRMS
 * itself").
 *
 * Rows come from the Salary Revision Master, read in the browser: the ID and
 * the NEW block. For each, the appraisal is written with the new gross and
 * its split, the previous gross taken from what the person is on today, and
 * the day the rate starts. Nothing is finalised here — every row lands as
 * proposed, so the table's own tick finalises and then releases.
 *
 * { preview: true } says what would happen and writes nothing.
 */
type In = { employee_id: string; basic_da?: number; hra?: number; fixed_allowance?: number; conveyance?: number; medical_allowance?: number; gross?: number; prev_gross?: number; designation?: string };

export async function POST(req: Request) {
  try {
    const u = await requireHrms();
    if (!u.isOwner) throw new HttpError(403, "Only Dr Raghu loads a salary revision.");
    const b = await readBody(req, { rows: "array", effective_from: "date?", note: "string?", preview: "boolean?" });
    const rows = (b.rows as In[]).slice(0, 500);
    if (!rows.length) throw new HttpError(400, "nothing to load");
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const { data: emps } = await admin.from(T.employees).select("id, name, designation, active, extra");
    const byId = new Map((emps || []).map((e) => [String(e.id), e]));
    const eds = await allRows<{ employee_id: string; field: string; value: string | null }>(() =>
      admin.from(T.edits).select("employee_id, field, value").in("field", ["type", "basic_da", "hra", "fixed_allowance", "conveyance", "medical_allowance"]));
    const ovBy = new Map<string, Map<string, string>>();
    for (const e of eds || []) {
      const id = String(e.employee_id);
      if (!ovBy.has(id)) ovBy.set(id, new Map());
      ovBy.get(id)!.set(String(e.field), e.value == null ? "" : String(e.value));
    }

    const took: { id: string; name: string; type: string; prev: number; next: number; diff: number; moved: boolean }[] = [];
    const skipped: { id: string; name: string; why: string }[] = [];
    const writes: Record<string, unknown>[] = [];
    const eff = b.effective_from || "2026-08-01";
    const note = String(b.note || "").slice(0, 500) || null;

    for (const r of rows) {
      const id = String(r.employee_id || "").trim();
      const e = byId.get(id);
      if (!e) { skipped.push({ id, name: "", why: "no such EmployeeID in Genie" }); continue; }
      const ex = (e.extra || {}) as Record<string, string>;
      const ov = ovBy.get(id);
      const type = (ov?.get("type") || ex["Type"] || "").trim();
      if (!NO_HRA_NO_MEDICAL.has(type)) { skipped.push({ id, name: String(e.name || ""), why: `type is ${type || "blank"} — this load is Labour and Labour - Contract only` }); continue; }
      const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[₹,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
      const comps = {
        basic_da: num(r.basic_da), hra: num(r.hra), fixed_allowance: num(r.fixed_allowance),
        conveyance: num(r.conveyance), medical_allowance: num(r.medical_allowance),
      };
      const next = comps.basic_da + comps.hra + comps.fixed_allowance + comps.conveyance + comps.medical_allowance;
      if (next <= 0) { skipped.push({ id, name: String(e.name || ""), why: "the new gross reads zero" }); continue; }
      if (num(r.gross) && Math.abs(num(r.gross) - next) > 1) {
        skipped.push({ id, name: String(e.name || ""), why: `the parts add to ${next.toLocaleString("en-IN")} but the sheet says ${num(r.gross).toLocaleString("en-IN")}` });
        continue;
      }
      /**
       * THE PREVIOUS GROSS COMES FROM THE SHEET, NOT THE RECORD (7 Sep 2026).
       * Sixty-one of these workers had the new rate typed straight onto their
       * record on 3 and 4 September, so reading "today" off the record would
       * have called the new rate the old one and shown a zero increase. The
       * sheet's own old column is the rate before the revision — that is what
       * becomes 2025-26. The record is used only when the sheet is silent.
       */
      const get = (k: string) => {
        const fk = ({ "Basic and DA": "basic_da", "HRA": "hra", "Fixed Allowance": "fixed_allowance", "Conveyance": "conveyance", "Medical Allowance": "medical_allowance" } as Record<string, string>)[k];
        const o = fk ? ov?.get(fk) : undefined;
        return o != null && String(o).trim() !== "" ? o : ex[k];
      };
      const onRecord = salaryTable(get, type)?.gross ?? 0;
      const fromSheet = num(r.prev_gross);
      const prev = fromSheet > 0 ? fromSheet : onRecord;
      // the record has already been moved to the new rate by hand
      const moved = onRecord > 0 && Math.abs(onRecord - next) <= 1 && Math.abs(onRecord - prev) > 1;
      took.push({ id, name: String(e.name || ""), type, prev, next, diff: next - prev, moved });
      writes.push({
        employee_id: id, cycle: CYCLE, new_gross: next, prev_gross: prev || null,
        structure: { components: comps }, effective_from: eff, note,
        new_designation: r.designation || e.designation || null,
        pending_since: new Date().toISOString(), pending_by: u.email,
        updated_at: new Date().toISOString(),
      });
    }

    const totals = {
      people: took.length, skipped: skipped.length,
      prev: took.reduce((a, x) => a + x.prev, 0),
      next: took.reduce((a, x) => a + x.next, 0),
      unchanged: took.filter((x) => Math.abs(x.diff) < 1).length,
      down: took.filter((x) => x.diff < -1).length,
      moved: took.filter((x) => x.moved).length,
    };
    if (b.preview) return NextResponse.json({ ok: true, preview: true, totals, took: took.slice(0, 400), skipped: skipped.slice(0, 100) });

    for (let i = 0; i < writes.length; i += 100) {
      const { error } = await admin.from("hrms_appraisal").upsert(writes.slice(i, i + 100), { onConflict: "employee_id,cycle" });
      if (error) {
        if (/effective_from|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0150 first — the effective date has nowhere to live yet.");
        if (/new_designation/i.test(error.message)) {
          const plain = writes.slice(i, i + 100).map((w) => { const { new_designation: _d, ...rest } = w as Record<string, unknown>; void _d; return rest; });
          const { error: e2 } = await admin.from("hrms_appraisal").upsert(plain, { onConflict: "employee_id,cycle" });
          if (e2) throw new Error(e2.message);
          continue;
        }
        throw new Error(error.message);
      }
    }
    try { await admin.from("admin_audit").insert({ by_email: u.email, action: "appraisal-import", target: `${writes.length} workers from ${eff}` }); } catch (e) { swallow("appraisal-import", e); }
    return NextResponse.json({ ok: true, totals, skipped: skipped.slice(0, 100) });
  } catch (e) {
    return errJson(e);
  }
}
