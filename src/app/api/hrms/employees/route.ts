import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import {
  fieldSpec, hrmsTables, ALL_FIELDS, CLAIMED_HEADERS, NAMED_COLUMNS,
  type FieldSpec, type HrmsEmployee,
} from "@/lib/hrms";

export const dynamic = "force-dynamic";

interface EmpRow {
  id: string;
  name: string; email: string | null; dob: string | null; doj: string | null;
  department: string | null; designation: string | null; location: string | null; active: boolean;
  extra: Record<string, string> | null;
  first_seen: string | null; updated_at: string | null;
}

/**
 * What the record says for one field, BEFORE any override.
 *
 * Three places it can come from, in order: one of the eight named columns,
 * the HR sheet's own column kept verbatim in `extra`, or nowhere. The
 * catalogue in hrms.ts decides which — see FieldSpec.column / .sheetHeader.
 */
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

/**
 * GET /api/hrms/employees — the whole master, overrides applied.
 *
 * One payload: a few hundred records, and every count, filter and sort on the
 * directory is then computed in the browser without a round trip.
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);

    // ?id= — one record, for the record page opened in its own tab.
    const only = new URL(req.url).searchParams.get("id");
    let sel = admin
      .from(T.employees)
      .select("id, name, email, dob, doj, department, designation, location, active, extra, first_seen, updated_at")
      .order("name");
    if (only) sel = sel.eq("id", only);
    const { data, error } = await sel;
    if (error) throw new Error(error.message);
    const rows = (data || []) as EmpRow[];

    const overrides = new Map<string, Map<string, { value: string | null; by: string | null; at: string }>>();
    try {
      const { data: eds } = await admin.from(T.edits).select("employee_id, field, value, edited_by, edited_at");
      for (const e of eds || []) {
        const id = String(e.employee_id);
        if (!overrides.has(id)) overrides.set(id, new Map());
        overrides.get(id)!.set(String(e.field), {
          value: e.value == null ? null : String(e.value),
          by: e.edited_by ?? null,
          at: String(e.edited_at),
        });
      }
    } catch { /* pre-0047 */ }

    const employees: HrmsEmployee[] = rows.map((r) => {
      const ov = overrides.get(r.id);
      const value: Record<string, string | null> = {};
      const sheet: Record<string, string | null> = {};
      const edited: Record<string, { by: string | null; at: string }> = {};

      for (const f of ALL_FIELDS) value[f.key] = baseValue(r, f);
      for (const [field, o] of ov || []) {
        const f = fieldSpec(field);
        if (!f) continue; // a key dropped from the catalogue must not reappear
        sheet[field] = value[field] ?? null;
        value[field] = o.value;
        edited[field] = { by: o.by, at: o.at };
      }

      // The "From the sheet" tab is gone (Dr Raghu, 23 Aug 2026): every column
      // the master carries now has a field of its own. Anything genuinely new
      // that turns up in a future import still surfaces here rather than being
      // swallowed, so a column added at the HR end cannot go unnoticed.
      const leftover: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.extra || {})) {
        if (!CLAIMED_HEADERS.has(k) && String(v).trim()) leftover[k] = String(v);
      }

      return { id: r.id, value, sheet, edited, extra: leftover, firstSeen: r.first_seen, updatedAt: r.updated_at };
    });

    // Genie's own accounts, for the "Genie user" picker on a record. This is
    // how HRIS answers "how many of these people actually use Genie".
    let users: { email: string; name: string | null; initials: string | null; role: string }[] = [];
    try {
      const { data: u } = await admin
        .from("profiles")
        .select("email, display_name, initials, role, disabled")
        .order("display_name");
      users = (u || [])
        .filter((x) => !x.disabled)
        .map((x) => ({
          email: String(x.email || "").toLowerCase(),
          name: x.display_name ?? null,
          initials: x.initials ?? null,
          role: String(x.role || ""),
        }));
    } catch { /* the picker simply has no options */ }

    return NextResponse.json({ employees, users });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/employees
 *   { action: "edit",   id, field, value }
 *   { action: "clear",  id, field }
 *   { action: "create", name, ... }
 *
 * HRMS IS THE MASTER NOW (Dr Raghu, 23 Aug 2026): the HR sheet stops feeding
 * this table when he says so, and from that moment an edit here is not an
 * override of anything — it is the record. The mechanism does not change,
 * which is the point: every value still lands in hrms_employee_edits with a
 * line in the log, so the day the sheet is switched off is not a day anything
 * has to be migrated.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "edit" || action === "clear") {
      const id = String(body.id || "").trim();
      const field = String(body.field || "").trim();
      if (!id || !field) throw new HttpError(400, "id and field are required");
      const spec = fieldSpec(field);
      if (!spec) throw new HttpError(400, `"${field}" is not a field HRMS knows about`);
      if (spec.derived)
        throw new HttpError(400, `${spec.label} is worked out from another field and cannot be typed into.`);
      if (spec.kind === "select" && spec.options && body.value && !spec.options.includes(String(body.value)))
        throw new HttpError(400, `${spec.label} must be one of: ${spec.options.join(", ")}`);

      /**
       * Unique fields — initials today.
       *
       * "The first one will be allowed, and the second one says already
       * exists" (Dr Raghu). Checked against every other employee's current
       * value, which for initials lives entirely in the overlay.
       */
      if (spec.unique && action === "edit") {
        const wanted = String(body.value ?? "").trim().toUpperCase();
        if (wanted) {
          const { data: clash } = await admin
            .from(T.edits)
            .select("employee_id, value")
            .eq("field", field);
          const taken = (clash || []).find(
            (c) => String(c.value ?? "").trim().toUpperCase() === wanted && String(c.employee_id) !== id,
          );
          if (taken) {
            const { data: whoHas } = await admin
              .from(T.employees).select("name").eq("id", taken.employee_id).maybeSingle();
            throw new HttpError(
              409,
              `Already exists — ${wanted} belongs to ${whoHas?.name || taken.employee_id}. Choose different initials.`,
            );
          }
        }
      }

      const { data: cur } = await admin
        .from(T.edits).select("value").eq("employee_id", id).eq("field", field).maybeSingle();
      const { data: emp } = await admin
        .from(T.employees)
        .select("id, name, email, dob, doj, department, designation, location, active, extra")
        .eq("id", id).maybeSingle();
      if (!emp) throw new HttpError(404, "No such employee");
      const before = cur ? (cur.value as string | null) : baseValue(emp as EmpRow, spec);

      let after: string | null = null;
      if (action === "edit") {
        after = normalise(spec.kind, body.value);
        const { error } = await admin.from(T.edits).upsert(
          { employee_id: id, field, value: after, edited_by: me.email, edited_at: new Date().toISOString() },
          { onConflict: "employee_id,field" },
        );
        if (error) {
          if (/employee_edits|schema cache|does not exist/i.test(error.message))
            throw new HttpError(503, "Run migration 0047 first — HRMS has nowhere to save an edit yet");
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from(T.edits).delete().eq("employee_id", id).eq("field", field);
        if (error) throw new Error(error.message);
        after = baseValue(emp as EmpRow, spec);
      }

      if (before !== after) {
        try {
          // Signed with initials where the account has them — "RJ", not an
          // email address, because that is how everyone here refers to
          // everyone here.
          await admin.from(T.log).insert({
            employee_id: id, field, old_value: before, new_value: after,
            edited_by: me.initials ? `${me.initials} · ${me.email}` : me.email,
          });
        } catch { /* a lost history line must not fail the edit */ }
      }
      return NextResponse.json({ ok: true, value: after });
    }

    if (action === "create") {
      const name = String(body.name || "").trim();
      if (!name) throw new HttpError(400, "A name is required");
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      let id = String(body.id || "").trim() || base;
      const { data: clash } = await admin.from(T.employees).select("id").eq("id", id).maybeSingle();
      if (clash) {
        if (body.id) throw new HttpError(409, `Employee code "${id}" is already used`);
        id = id + "-2";
      }
      const { error } = await admin.from(T.employees).insert({
        id, name,
        email: String(body.email || "").trim().toLowerCase() || null,
        department: String(body.department || "").trim() || null,
        designation: String(body.designation || "").trim() || null,
        doj: String(body.doj || "").trim() || null,
        dob: String(body.dob || "").trim() || null,
        location: String(body.location || "").trim() || null,
        active: true,
        extra: { "Added in HRMS": me.email },
      });
      if (error) throw new Error(error.message);
      try {
        await admin.from(T.log).insert({
          employee_id: id, field: "(record)", old_value: null,
          new_value: `created in HRIS as "${name}"`,
          edited_by: me.initials ? `${me.initials} · ${me.email}` : me.email,
        });
      } catch { /* as above */ }
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, "A date must be YYYY-MM-DD");
    return s;
  }
  return s;
}
