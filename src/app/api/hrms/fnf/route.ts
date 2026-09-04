import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { ALL_FIELDS, fieldSpec, hrmsTables, type FieldSpec } from "@/lib/hrms";
import { num as pay } from "@/lib/salary";
import { CHECKLIST_DEFAULT, computeFnf, daysInMonth, defaultTexts, fnfNumber, fnfDocHtml, yearsOfService, type CheckItem, type DocKey, type FnfRow } from "@/lib/fnf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Full and Final Settlements.
 *
 * GET                         the table (page 1)
 * GET ?id=                    one settlement, with the statement worked out,
 *                             the person's messages, and the loan rows
 * GET ?id=&wa=1               pull the WhatsApp thread on the personal mobile
 *                             through Periskope, if it is connected
 * GET ?people=1               the roll, for Add new
 * GET ?id=&doc=<key>          the document's HTML
 * POST { action: "create", employee_id, ...dates and money }
 * POST { action: "save", id, patch }        any column; overrides merge
 * POST { action: "check", id, i, done?, remarks? }
 * POST { action: "status", id, status }
 * POST { action: "delete", id }             Open rows only
 */
interface EmpRow {
  id: string; name: string; email: string | null; dob: string | null; doj: string | null;
  department: string | null; designation: string | null; location: string | null; active: boolean;
  extra: Record<string, string> | null;
}
function baseValue(row: EmpRow, f: FieldSpec): string | null {
  if (f.column) {
    if (f.column === "active") return row.active ? "yes" : "no";
    const v = (row as unknown as Record<string, unknown>)[f.column];
    return v == null || v === "" ? null : String(v);
  }
  if (f.sheetHeader) {
    const v = (row.extra || {})[f.sheetHeader];
    return v == null || String(v).trim() === "" ? null : String(v);
  }
  return null;
}

/** One employee, overrides applied, as a flat value map. */
async function record(id: string): Promise<{ row: EmpRow; value: Record<string, string | null> } | null> {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const { data: r } = await admin.from(T.employees)
    .select("id, name, email, dob, doj, department, designation, location, active, extra").eq("id", id).maybeSingle();
  if (!r) return null;
  const row = r as EmpRow;
  const value: Record<string, string | null> = {};
  for (const f of ALL_FIELDS) value[f.key] = baseValue(row, f);
  try {
    const { data: eds } = await admin.from(T.edits).select("field, value").eq("employee_id", id);
    for (const e of eds || []) if (fieldSpec(String(e.field))) value[String(e.field)] = e.value == null ? null : String(e.value);
  } catch { /* pre-0047 */ }
  return { row, value };
}

const iso = (v: unknown) => { const s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const stampOf = (me: { initials: string | null; email: string }) => (me.initials ? `${me.initials} · ${me.email}` : me.email);

const needs = (m: string) => /hrms_fnf|schema cache|does not exist/i.test(m);

export async function GET(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (url.searchParams.get("people")) {
      const T = await hrmsTables(admin);
      const { data } = await admin.from(T.employees).select("id, name, department, designation, active, extra").order("name");
      return NextResponse.json({
        people: (data || []).map((e) => ({ id: e.id, name: e.name, department: e.department, designation: e.designation, active: !!e.active, type: (e.extra || {})["Type"] || null })),
      });
    }

    if (!id) {
      const { data, error } = await admin.from("hrms_fnf")
        .select("id, fnf_no, employee_id, name, designation, department, emp_type, done_on, resignation_date, exit_date, fnf_call_date, loan_closing, pending_expenses, tds_year, advance_paid, advance_to_pay, status, paid_amount, payment_date, checklist, updated_at")
        .order("created_at", { ascending: false });
      if (error) { if (needs(error.message)) return NextResponse.json({ rows: [], needsMigration: true }); throw new Error(error.message); }
      return NextResponse.json({
        rows: (data || []).map((r) => ({
          ...r, checklist_done: ((r.checklist || []) as CheckItem[]).filter((c) => c.done).length, checklist_total: ((r.checklist || []) as CheckItem[]).length,
        })),
      });
    }

    const { data: row, error } = await admin.from("hrms_fnf").select("*").eq("id", id).maybeSingle();
    if (error) { if (needs(error.message)) throw new HttpError(503, "Run migration 0130 first — settlements have nowhere to live yet."); throw new Error(error.message); }
    if (!row) throw new HttpError(404, "No such settlement.");
    const r = row as FnfRow;

    const doc = url.searchParams.get("doc") as DocKey | null;
    if (doc) return NextResponse.json({ html: fnfDocHtml(r, doc, me.displayName || me.email) });

    if (url.searchParams.get("wa")) {
      // "Check his personal mobile and pull all communication with HR" — the
      // WhatsApp thread on the personal number, through Periskope's API.
      const rec = await record(r.employee_id);
      const phone = String(rec?.value.phone || "").replace(/\D/g, "");
      if (!phone) return NextResponse.json({ messages: [], why: "No personal mobile on the record." });
      const { crmDb } = await import("@/crm/db");
      const { periskopeConfig, periskopeMessages } = await import("@/crm/periskope");
      const cfg = await periskopeConfig(crmDb());
      if ("error" in cfg) return NextResponse.json({ messages: [], why: cfg.error, phone });
      const full = phone.length <= 10 ? `91${phone}` : phone;
      const got = await periskopeMessages(cfg, full);
      return NextResponse.json({ messages: got.messages, why: got.error, phone: full });
    }

    const [{ data: comms }, { data: loans }, rec] = await Promise.all([
      admin.from("hrms_communication").select("id, channel, to_address, subject, body, status, error, sent_by, sent_at").eq("employee_id", r.employee_id).order("sent_at", { ascending: false }).limit(100),
      admin.from("hrms_loan").select("id, amount, kind, reason, months, from_month, status, requested_at, decided_at, decision_note").eq("employee_id", r.employee_id).order("requested_at", { ascending: false }),
      record(r.employee_id),
    ]);
    return NextResponse.json({
      row: r, statement: computeFnf(r), defaults: defaultTexts(r),
      communication: comms || [], loans: loans || [],
      person: rec ? { phone: rec.value.phone, personal_email: rec.value.personal_email, email: rec.value.email, company_mobile: rec.value.company_mobile, drive_folder: rec.value.drive_folder, drive_folder_name: rec.value.drive_folder_name, bank: rec.value.bank_name, account: rec.value.account_no, ifsc: rec.value.ifsc } : null,
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const stamp = stampOf(me);

    if (body.action === "create") {
      const employeeId = String(body.employee_id || "").trim();
      if (!employeeId) throw new HttpError(400, "Which person?");
      const rec = await record(employeeId);
      if (!rec) throw new HttpError(404, "No such employee.");
      const v = rec.value;
      const exit = iso(body.exit_date);
      const basic = pay(v.basic_da ?? (rec.row.extra || {})["Basic and DA"]);
      const worker = /^Labour/.test(String(v.type || ""));
      const gross = pay((rec.row.extra || {})["Gross Salary"]) ||
        basic + (worker ? 0 : pay((rec.row.extra || {})["HRA"])) + pay((rec.row.extra || {})["Fixed Allowance"]) + pay((rec.row.extra || {})["Conveyance"]) + (worker ? 0 : pay((rec.row.extra || {})["Medical Allowance"]));
      const { count } = await admin.from("hrms_fnf").select("id", { count: "exact", head: true });
      const row = {
        fnf_no: fnfNumber((count || 0) + 1),
        employee_id: employeeId, name: rec.row.name, designation: v.designation, department: v.department, emp_type: v.type, doj: iso(v.doj),
        done_on: iso(body.done_on) || new Date().toISOString().slice(0, 10),
        resignation_date: iso(body.resignation_date), exit_date: exit, fnf_call_date: iso(body.fnf_call_date),
        notice_days: Number(body.notice_days) || 30, reason: String(body.reason || v.leaving_reason || "").trim() || null,
        loan_closing: pay(body.loan_closing ?? v.loan_as_on), pending_expenses: pay(body.pending_expenses), tds_year: pay(body.tds_year),
        advance_paid: pay(body.advance_paid), advance_to_pay: pay(body.advance_to_pay),
        last_gross: gross, basic_da: basic,
        paid_days: exit ? Number(exit.slice(8, 10)) : null, month_days: daysInMonth(exit),
        leave_balance: pay(v.leave_as_on), gratuity_years: pay(v.gratuity_years) || Math.round(yearsOfService(iso(v.doj), exit) * 10) / 10,
        checklist: CHECKLIST_DEFAULT.map((item) => ({ item, done: false, remarks: "" })),
        status: "Open", created_by: stamp, updated_by: stamp,
      };
      const { data, error } = await admin.from("hrms_fnf").insert(row).select("id").single();
      if (error) { if (needs(error.message)) throw new HttpError(503, "Run migration 0130 first — settlements have nowhere to live yet."); throw new Error(error.message); }
      // the record follows: status and dates on the person
      try {
        const T = await hrmsTables(admin);
        const patches: [string, string | null][] = [["status", "Notice Period"], ["leaving_date", exit], ["leaving_reason", row.reason]];
        for (const [field, value] of patches) if (value) await admin.from(T.edits).upsert({ employee_id: employeeId, field, value, edited_by: me.email, edited_at: new Date().toISOString(), approved_at: null, approved_by: null }, { onConflict: "employee_id,field" });
      } catch { /* the settlement stands without it */ }
      return NextResponse.json({ ok: true, id: data.id });
    }

    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "id required");
    const { data: cur } = await admin.from("hrms_fnf").select("*").eq("id", id).maybeSingle();
    if (!cur) throw new HttpError(404, "No such settlement.");

    if (body.action === "save") {
      const p = (body.patch || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_by: stamp, updated_at: new Date().toISOString() };
      for (const k of ["done_on", "resignation_date", "exit_date", "fnf_call_date", "payment_date"]) if (k in p) patch[k] = iso(p[k]);
      for (const k of ["loan_closing", "pending_expenses", "tds_year", "advance_paid", "advance_to_pay", "last_gross", "basic_da", "leave_balance", "gratuity_years", "paid_amount"]) if (k in p) patch[k] = pay(p[k]);
      for (const k of ["notice_days", "month_days", "paid_days"]) if (k in p) patch[k] = p[k] == null || p[k] === "" ? null : Number(p[k]);
      for (const k of ["reason", "remarks", "resignation_text", "acceptance_text", "relieving_text", "payment_mode", "payment_ref", "designation", "department", "emp_type"]) if (k in p) patch[k] = String(p[k] ?? "").trim() || null;
      if ("overrides" in p) patch.overrides = { ...(cur.overrides || {}), ...(p.overrides as Record<string, unknown>) };
      if ("other_earn" in p) patch.other_earn = Array.isArray(p.other_earn) ? p.other_earn : [];
      if ("other_ded" in p) patch.other_ded = Array.isArray(p.other_ded) ? p.other_ded : [];
      if ("checklist" in p && Array.isArray(p.checklist)) patch.checklist = p.checklist;
      if ("exit_date" in patch && patch.exit_date && !("month_days" in p)) { patch.month_days = daysInMonth(String(patch.exit_date)); if (!("paid_days" in p)) patch.paid_days = Number(String(patch.exit_date).slice(8, 10)); }
      const { error } = await admin.from("hrms_fnf").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "check") {
      const list = ((cur.checklist || []) as CheckItem[]).slice();
      const i = Number(body.i);
      if (!list[i]) throw new HttpError(400, "No such line.");
      if ("done" in body) { list[i].done = !!body.done; list[i].by = stamp; list[i].at = new Date().toISOString(); }
      if ("remarks" in body) list[i].remarks = String(body.remarks || "");
      const { error } = await admin.from("hrms_fnf").update({ checklist: list, updated_by: stamp, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "status") {
      const status = String(body.status || "");
      const patch: Record<string, unknown> = { status, updated_by: stamp, updated_at: new Date().toISOString() };
      if (status === "Closed") {
        // the record follows: left, and the folder must be renamed
        try {
          const T = await hrmsTables(admin);
          await admin.from(T.edits).upsert({ employee_id: cur.employee_id, field: "status", value: "Left", edited_by: me.email, edited_at: new Date().toISOString(), approved_at: null, approved_by: null }, { onConflict: "employee_id,field" });
          await admin.from(T.edits).upsert({ employee_id: cur.employee_id, field: "left_date", value: cur.exit_date, edited_by: me.email, edited_at: new Date().toISOString(), approved_at: null, approved_by: null }, { onConflict: "employee_id,field" });
        } catch { /* the settlement closes regardless */ }
      }
      const { error } = await admin.from("hrms_fnf").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (cur.status !== "Open") throw new HttpError(400, "Only an Open settlement can be removed.");
      const { error } = await admin.from("hrms_fnf").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
