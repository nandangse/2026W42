import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { parseSheet, totalsFor, type SheetRow } from "@/lib/salary-sheet";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;

/**
 * GET — the register: one row per month, newest first.
 * GET ?id= — one sheet in full, with its lines and a link to the original file.
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data, error } = await admin.from("hrms_salary_sheet").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new HttpError(404, "No such sheet.");
      let fileUrl: string | null = null;
      if (data.file_path) {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(String(data.file_path), LINK_TTL);
        fileUrl = sgn?.signedUrl ?? null;
      }
      return NextResponse.json({ sheet: { ...data, fileUrl } });
    }

    const { data, error } = await admin
      .from("hrms_salary_sheet")
      .select("id, month, year, file_name, status, uploaded_by, uploaded_at, staff_count, staff_value, labour_count, labour_value, total_count, total_salary, earned_pay, deductions, net_payable, paid_to_bank, frozen_by, frozen_at, mapping, note")
      .order("year", { ascending: false }).order("month", { ascending: false })
      .limit(240);
    if (error) {
      if (/hrms_salary_sheet|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ sheets: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ sheets: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST multipart — upload the month's sheet. The file is stored as sent, and
 * a parsed copy plus the totals are stored beside it. A FROZEN month refuses
 * a new upload: that is the whole point of freezing it.
 *
 * POST json — { action: "freeze" | "unfreeze" | "paid" | "delete" }.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;
    const now = new Date().toISOString();
    const ct = req.headers.get("content-type") || "";

    /* ── the upload ── */
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const month = Number(form.get("month"));
      const year = Number(form.get("year"));
      const file = form.get("file");
      if (!month || month < 1 || month > 12) throw new HttpError(400, "Which month?");
      if (!year || year < 2020 || year > 2100) throw new HttpError(400, "Which year?");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "No file was attached.");
      if (file.size > 8 * 1024 * 1024) throw new HttpError(400, "That file is over 8MB — a salary sheet should be far smaller.");

      const { data: existing } = await admin
        .from("hrms_salary_sheet").select("id, status").eq("month", month).eq("year", year).maybeSingle();
      if (existing?.status === "Frozen")
        throw new HttpError(409, "That month is frozen. Unfreeze it first — freezing is what makes it a record.");

      const buf = Buffer.from(await file.arrayBuffer());
      let grid: unknown[][];
      try {
        const wb = XLSX.read(buf, { type: "buffer", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error("the file has no sheet in it");
        grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as unknown[][];
      } catch (e) {
        throw new HttpError(400, `That file could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }

      const { rows, mapping } = parseSheet(grid);

      // types AS THEY STAND NOW — frozen with the sheet, so a later change
      // of type cannot restate a month that has already been paid
      const T = await hrmsTables(admin);
      const typeById = new Map<string, string>();
      const ids = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[];
      if (ids.length) {
        const [{ data: emps }, { data: eds }] = await Promise.all([
          admin.from(T.employees).select("id, extra").in("id", ids),
          admin.from(T.edits).select("employee_id, value").eq("field", "type").in("employee_id", ids),
        ]);
        for (const e of emps || []) {
          const t = ((e.extra || {}) as Record<string, string>)["Type"];
          if (t) typeById.set(String(e.id), String(t));
        }
        for (const e of eds || []) if (e.value) typeById.set(String(e.employee_id), String(e.value));
      }
      const missing = ids.filter((i) => !typeById.has(i));
      if (missing.length)
        mapping.warnings.push(
          `${missing.length} EmployeeID${missing.length === 1 ? " is" : "s are"} not in the master (${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}) — counted as Staff.`,
        );

      const totals = totalsFor(rows as SheetRow[], (id) => (id ? typeById.get(id) ?? null : null));

      const ext = (file.name.split(".").pop() || "csv").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `salary-sheets/${year}-${String(month).padStart(2, "0")}/${Date.now()}.${ext}`;
      const { error: up } = await admin.storage.from(BUCKET)
        .upload(path, buf, { contentType: file.type || "text/csv" });
      if (up) throw new Error(`Could not store the file: ${up.message}`);

      const row = {
        month, year,
        file_name: file.name, file_path: path,
        uploaded_by: stamp, uploaded_at: now,
        status: "Draft",
        ...totals,
        mapping, rows,
        frozen_by: null, frozen_at: null,
        updated_at: now,
      };
      const { error } = await admin.from("hrms_salary_sheet").upsert(row, { onConflict: "month,year" });
      if (error) {
        if (/hrms_salary_sheet|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0066 first — a salary sheet has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, totals, mapping, lines: rows.length });
    }

    /* ── the decisions ── */
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "Which sheet?");

    /**
     * { action: "reparse" } — read the SAME stored file again with the
     * current parser. Exists because the parser learns columns over time
     * (the register set arrived after July was uploaded); the data still
     * comes from the sheet alone — this changes what we UNDERSTOOD of the
     * file, never the file. A frozen month is a record: owner only.
     */
    if (action === "reparse") {
      const { data: sheet } = await admin.from("hrms_salary_sheet").select("*").eq("id", String(body.id || "")).maybeSingle();
      if (!sheet) throw new HttpError(404, "No such sheet.");
      if (sheet.status === "Frozen" && !owner)
        throw new HttpError(409, "That month is frozen — only Dr Raghu may re-read it.");
      if (!sheet.file_path) throw new HttpError(400, "There is no stored file to read.");

      const { data: blob, error: dl } = await admin.storage.from(BUCKET).download(String(sheet.file_path));
      if (dl || !blob) throw new HttpError(502, `Could not fetch the stored file: ${dl?.message || "empty"}`);
      const buf = Buffer.from(await blob.arrayBuffer());
      let grid: unknown[][];
      try {
        const wb = XLSX.read(buf, { type: "buffer", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error("the file has no sheet in it");
        grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as unknown[][];
      } catch (e) {
        throw new HttpError(400, `The stored file could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      const { rows, mapping } = parseSheet(grid);

      const T2 = await hrmsTables(admin);
      const typeById2 = new Map<string, string>();
      const ids2 = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[];
      if (ids2.length) {
        const [{ data: emps2 }, { data: eds2 }] = await Promise.all([
          admin.from(T2.employees).select("id, extra").in("id", ids2),
          admin.from(T2.edits).select("employee_id, value").eq("field", "type").in("employee_id", ids2),
        ]);
        for (const e of emps2 || []) {
          const t = ((e.extra || {}) as Record<string, string>)["Type"];
          if (t) typeById2.set(String(e.id), String(t));
        }
        for (const e of eds2 || []) if (e.value) typeById2.set(String(e.employee_id), String(e.value));
      }
      const totals2 = totalsFor(rows as SheetRow[], (i) => (i ? typeById2.get(i) ?? null : null));

      const { error } = await admin.from("hrms_salary_sheet")
        .update({ rows, mapping, ...totals2, updated_at: now }).eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, lines: rows.length, mapping });
    }

    /** What actually left the bank — HR's reconciliation figure. */
    if (action === "paid") {
      const paid = String(body.paid_to_bank ?? "").trim();
      const { error } = await admin.from("hrms_salary_sheet")
        .update({ paid_to_bank: paid === "" ? null : Number(paid.replace(/[^0-9.]/g, "")) || 0, note: String(body.note || "").trim() || null, updated_at: now })
        .eq("id", id).neq("status", "Frozen");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "freeze" || action === "unfreeze") {
      if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may freeze a salary sheet.`);
      const patch = action === "freeze"
        ? { status: "Frozen", frozen_by: stamp, frozen_at: now, updated_at: now }
        : { status: "Draft", frozen_by: null, frozen_at: null, updated_at: now };
      const { error } = await admin.from("hrms_salary_sheet").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may remove a month.`);
      const { data: row } = await admin.from("hrms_salary_sheet").select("status").eq("id", id).maybeSingle();
      if (row?.status === "Frozen") throw new HttpError(409, "A frozen month cannot be removed. Unfreeze it first.");
      const { error } = await admin.from("hrms_salary_sheet").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
