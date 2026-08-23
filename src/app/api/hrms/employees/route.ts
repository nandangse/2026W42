import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fieldSpec, type HrmsEmployee } from "@/lib/hrms";

export const dynamic = "force-dynamic";

/** Rows from the master, in the shape the screen reads. */
interface EmpRow {
  id: string;
  name: string;
  email: string | null;
  dob: string | null;
  doj: string | null;
  department: string | null;
  designation: string | null;
  location: string | null;
  active: boolean;
  extra: Record<string, string> | null;
  first_seen: string | null;
  updated_at: string | null;
}

const SHEET_COLUMNS = [
  "name", "email", "dob", "doj", "department", "designation", "location", "active",
] as const;

/** employees.<col> as a string, so overrides and sheet values compare alike. */
function sheetValue(row: EmpRow, key: string): string | null {
  if (key === "active") return row.active ? "yes" : "no";
  const v = (row as unknown as Record<string, unknown>)[key];
  return v == null || v === "" ? null : String(v);
}

/**
 * GET /api/hrms/employees — the whole master, overrides applied.
 *
 * One payload rather than a search endpoint: 364 rows is nothing, and every
 * count, filter and sort on the directory is then computed in the browser
 * without a round trip. Same reasoning as Delivered Jobs.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();

    const { data, error } = await admin
      .from("employees")
      .select("id, name, email, dob, doj, department, designation, location, active, extra, first_seen, updated_at")
      .order("name");
    if (error) throw new Error(error.message);
    const rows = (data || []) as EmpRow[];

    // The overlay. Absent table (pre-0047) reads as "no edits" rather than
    // taking the page down — the directory is useful before anybody edits it.
    const overrides = new Map<string, Map<string, { value: string | null; by: string | null; at: string }>>();
    try {
      const { data: eds } = await admin
        .from("employee_edits")
        .select("employee_id, field, value, edited_by, edited_at");
      for (const e of eds || []) {
        const id = String(e.employee_id);
        if (!overrides.has(id)) overrides.set(id, new Map());
        overrides.get(id)!.set(String(e.field), {
          value: e.value == null ? null : String(e.value),
          by: e.edited_by ?? null,
          at: String(e.edited_at),
        });
      }
    } catch {
      /* pre-0047 */
    }

    const employees: HrmsEmployee[] = rows.map((r) => {
      const ov = overrides.get(r.id);
      const value: Record<string, string | null> = {};
      const sheet: Record<string, string | null> = {};
      const edited: Record<string, { by: string | null; at: string }> = {};

      for (const k of SHEET_COLUMNS) value[k] = sheetValue(r, k);
      for (const [field, o] of ov || []) {
        // only a field we still recognise — a key dropped from the spec must
        // not reappear on screen through an old row
        if (!fieldSpec(field)) continue;
        if (field in value) sheet[field] = value[field];
        value[field] = o.value;
        edited[field] = { by: o.by, at: o.at };
      }

      return {
        id: r.id,
        value,
        sheet,
        edited,
        extra: r.extra || {},
        firstSeen: r.first_seen,
        updatedAt: r.updated_at,
      };
    });

    return NextResponse.json({ employees });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/employees
 *   { action: "edit",   id, field, value }  — set or change one field
 *   { action: "clear",  id, field }         — drop the override, sheet wins again
 *   { action: "create", name, ... }         — somebody the sheet has not caught up with
 *
 * Every write lands in employee_edit_log as well. One field at a time, on
 * purpose: the log then reads as a list of facts rather than a list of saves.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");

    const missing = (msg: string) => {
      throw new HttpError(503, `Run migration 0047 first — ${msg}`);
    };

    if (action === "edit" || action === "clear") {
      const id = String(body.id || "").trim();
      const field = String(body.field || "").trim();
      if (!id || !field) throw new HttpError(400, "id and field are required");
      const spec = fieldSpec(field);
      if (!spec) throw new HttpError(400, `"${field}" is not a field HRMS knows about`);

      // what it reads as right now, for the log
      const { data: cur } = await admin
        .from("employee_edits")
        .select("value")
        .eq("employee_id", id)
        .eq("field", field)
        .maybeSingle();
      const { data: emp } = await admin
        .from("employees")
        .select("id, name, email, dob, doj, department, designation, location, active")
        .eq("id", id)
        .maybeSingle();
      if (!emp) throw new HttpError(404, "No such employee");
      const before = cur ? (cur.value as string | null) : sheetValue(emp as EmpRow, field);

      let after: string | null = null;
      if (action === "edit") {
        after = normalise(spec.kind, body.value);
        const { error } = await admin.from("employee_edits").upsert(
          { employee_id: id, field, value: after, edited_by: me.email, edited_at: new Date().toISOString() },
          { onConflict: "employee_id,field" },
        );
        if (error) {
          if (/employee_edits|schema cache|does not exist/i.test(error.message))
            missing("HRMS has nowhere to save an edit yet");
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin
          .from("employee_edits")
          .delete()
          .eq("employee_id", id)
          .eq("field", field);
        if (error) throw new Error(error.message);
        // back to whatever the sheet says
        after = spec.sheet ? sheetValue(emp as EmpRow, field) : null;
      }

      if (before !== after) {
        // The log must not be able to fail the edit — a lost history line is
        // bad, an edit that reports failure after saving is worse.
        try {
          await admin.from("employee_edit_log").insert({
            employee_id: id,
            field,
            old_value: before,
            new_value: after,
            edited_by: me.email,
          });
        } catch {
          /* logged nowhere else; the edit itself stands */
        }
      }
      return NextResponse.json({ ok: true, value: after });
    }

    if (action === "create") {
      const name = String(body.name || "").trim();
      if (!name) throw new HttpError(400, "A name is required");
      // the same id rule the HR-sheet parser uses, so when the sheet catches
      // up the next upload UPDATES this person rather than duplicating them
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      let id = String(body.id || "").trim() || base;
      const { data: clash } = await admin.from("employees").select("id").eq("id", id).maybeSingle();
      if (clash) {
        if (body.id) throw new HttpError(409, `Employee code "${id}" is already used`);
        id = id + "-2";
      }
      const { error } = await admin.from("employees").insert({
        id,
        name,
        email: String(body.email || "").trim().toLowerCase() || null,
        department: String(body.department || "").trim() || null,
        designation: String(body.designation || "").trim() || null,
        doj: String(body.doj || "").trim() || null,
        active: true,
        extra: { "Added in HRMS": me.email },
      });
      if (error) throw new Error(error.message);
      try {
        await admin.from("employee_edit_log").insert({
          employee_id: id,
          field: "(record)",
          old_value: null,
          new_value: `created in HRMS as "${name}"`,
          edited_by: me.email,
        });
      } catch {
        /* as above */
      }
      return NextResponse.json({ ok: true, id });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}

/** Trim, empty-to-null, and make a tick box read as yes/no. */
function normalise(kind: string, raw: unknown): string | null {
  if (kind === "bool") return raw === true || raw === "yes" ? "yes" : "no";
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (kind === "email") return s.toLowerCase();
  if (kind === "date") {
    // stored as text in the overlay, but refuse anything that is not a date —
    // "joined last March" in a date field is how a report starts lying
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw new HttpError(400, "A date must be YYYY-MM-DD");
    return s;
  }
  return s;
}
