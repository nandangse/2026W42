import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { allRows } from "@/lib/all-rows";
import { readBody, type AnyBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, ALL_FIELDS, FIELD_GROUPS, fieldSpec } from "@/lib/hrms";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * POST /api/hrms/export — the master as a real .xlsx.
 *
 * BUILT ON THE SERVER, not in the browser, for two reasons. SheetJS is a
 * large library and shipping it to the page would slow every visit for the
 * sake of a button pressed occasionally; and the export can then be assembled
 * from the database rather than from whatever the page happens to be holding,
 * so what comes out is what is actually recorded.
 *
 *   { scope: "filtered", ids: [...] }  — exactly the rows on screen
 *   { scope: "all" }                   — the whole master
 *
 * Every export is logged. A file of 364 people's Aadhaar numbers, bank
 * accounts and salaries leaving the building is precisely the event that
 * somebody will one day need to reconstruct, and "who downloaded it and
 * when" is not a question worth being unable to answer.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const scope = body.scope === "all" ? "all" : "filtered";
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (scope === "filtered" && !ids.length)
      throw new HttpError(400, "Nothing is selected — filter to something first, or choose Export All.");

    let q = admin
      .from(T.employees)
      .select("id, name, email, dob, doj, department, designation, location, active, extra")
      .order("name");
    if (scope === "filtered") q = q.in("id", ids.slice(0, 5000));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data || [];

    const ovr = new Map<string, Map<string, string | null>>();
    try {
      const eds = await allRows<{ employee_id: string; field: string; value: string | null }>(() =>
        admin.from(T.edits).select("employee_id, field, value"));
      for (const e of eds || []) {
        const id = String(e.employee_id);
        if (!ovr.has(id)) ovr.set(id, new Map());
        ovr.get(id)!.set(String(e.field), e.value == null ? null : String(e.value));
      }
    } catch (e) { swallow("hrms/export", e); /* none yet */ }

    const cell = (r: Record<string, unknown>, key: string): string => {
      const f = fieldSpec(key);
      if (!f) return "";
      const o = ovr.get(String(r.id));
      if (o && o.has(key)) return o.get(key) ?? "";
      if (f.column) {
        if (f.column === "active") return r.active ? "Active" : "Left";
        const v = r[f.column];
        return v == null ? "" : String(v);
      }
      if (f.sheetHeader) {
        const v = (r.extra as Record<string, string> | null)?.[f.sheetHeader];
        return v == null ? "" : String(v);
      }
      return "";
    };

    // One sheet, columns in the catalogue's own order, grouped headings kept
    // as the second row so a printed page still says which block is which.
    const header = ["Employee code", ...ALL_FIELDS.map((f) => f.label)];
    const groupRow = ["", ...FIELD_GROUPS.flatMap((g) => g.fields.map(() => g.label))];
    const body2 = rows.map((r) => [String(r.id), ...ALL_FIELDS.map((f) => cell(r as Record<string, unknown>, f.key))]);

    const ws = XLSX.utils.aoa_to_sheet([groupRow, header, ...body2]);
    ws["!freeze"] = { xSplit: 2, ySplit: 2 };
    ws["!cols"] = header.map((h) => ({ wch: Math.min(34, Math.max(11, h.length + 2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Master");

    const stamp = new Date().toISOString().slice(0, 10);
    const meta = XLSX.utils.aoa_to_sheet([
      ["Nandan GSE — HRMS export"],
      ["CONFIDENTIAL — personnel records"],
      [],
      ["Exported by", me.email],
      ["Exported on", new Date().toISOString()],
      ["Scope", scope === "all" ? "Export All — the entire master" : "Export filtered report — only the rows on screen"],
      ["Records", String(rows.length)],
      ["Columns", String(ALL_FIELDS.length + 1)],
      [],
      ["This file carries pay, bank and statutory identity numbers.", ""],
      ["Keep it where personnel records are kept. Do not leave copies here and there.", ""],
    ]);
    XLSX.utils.book_append_sheet(wb, meta, "About this export");

    try {
      await admin.from(T.log).insert({
        employee_id: "(export)",
        field: "export",
        old_value: null,
        new_value: `${scope === "all" ? "Export All" : "Export filtered"} — ${rows.length} records`,
        edited_by: me.email,
      });
    } catch (e) { swallow("hrms/export", e); /* the log must not stop the export */ }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Nandan_HRMS_${scope}_${stamp}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
