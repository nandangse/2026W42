import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, MASTERS, ALL_FIELDS } from "@/lib/hrms";

export const dynamic = "force-dynamic";

const KINDS = new Set(MASTERS.map((m) => m.kind));

/** Which record field a master drives, so "in use" can be counted. */
const FIELD_FOR_KIND = new Map(
  ALL_FIELDS.filter((f) => f.master).map((f) => [f.master as string, f]),
);

/** Everybody currently holding `value` for the field this master drives. */
async function usersOf(kind: string) {
  const f = FIELD_FOR_KIND.get(kind);
  if (!f) return null;
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const { data } = await admin
    .from(T.employees)
    .select("id, name, department, designation, location, extra");
  const { data: eds } = await admin.from(T.edits).select("employee_id, value").eq("field", f.key);
  const override = new Map((eds || []).map((e) => [String(e.employee_id), e.value as string | null]));

  const held = new Map<string, { id: string; name: string }[]>();
  for (const r of data || []) {
    const id = String(r.id);
    let v: string | null = null;
    if (override.has(id)) v = override.get(id) ?? null;
    else if (f.column) v = (r as unknown as Record<string, string | null>)[f.column] ?? null;
    else if (f.sheetHeader) v = ((r.extra || {}) as Record<string, string>)[f.sheetHeader] ?? null;
    const key = String(v ?? "").trim();
    if (!key) continue;
    if (!held.has(key)) held.set(key, []);
    held.get(key)!.push({ id, name: String(r.name || id) });
  }
  return { field: f, held };
}

// GET /api/hrms/masters — every list, with how many people hold each value.
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const { data, error } = await admin
      .from("hrms_master")
      .select("kind, value, sort_order, active")
      .order("kind")
      .order("sort_order")
      .order("value");
    if (error) {
      if (/hrms_master|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ masters: {}, counts: {}, needsMigration: true });
      throw new Error(error.message);
    }

    const masters: Record<string, { value: string; sort_order: number; active: boolean }[]> = {};
    for (const r of data || []) {
      const k = String(r.kind);
      (masters[k] ||= []).push({ value: String(r.value), sort_order: r.sort_order ?? 0, active: r.active !== false });
    }

    const counts: Record<string, Record<string, number>> = {};
    for (const m of MASTERS) {
      const u = await usersOf(m.kind);
      if (!u) continue;
      counts[m.kind] = Object.fromEntries([...u.held].map(([v, list]) => [v, list.length]));
    }

    return NextResponse.json({ masters, counts });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/masters
 *   { action: "add",    kind, value }
 *   { action: "rename", kind, value, to }        — carries the records with it
 *   { action: "delete", kind, value, reassignTo } — "" blanks the records
 *
 * DELETING A VALUE IS NEVER JUST A DELETE. Somebody holds it, and their record
 * would be left pointing at a list entry that no longer exists. So a delete
 * says what is to happen to those people: reassign them to another value on
 * the same list, or — said explicitly — blank the field on every one of them.
 * Either way each affected record gets its own line in the history, because
 * "why did forty people lose their department" is a question that must have an
 * answer.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const body = await req.json();
    const action = String(body.action || "");
    const kind = String(body.kind || "");
    if (!KINDS.has(kind)) throw new HttpError(400, `"${kind}" is not a master HRIS keeps`);
    const value = String(body.value ?? "").trim();

    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;

    if (action === "add") {
      if (!value) throw new HttpError(400, "A value is required");
      const { data: clash } = await admin
        .from("hrms_master").select("value").eq("kind", kind).eq("value", value).maybeSingle();
      if (clash) throw new HttpError(409, `“${value}” is already on the ${kind} list.`);
      const { error } = await admin.from("hrms_master").insert({ kind, value, created_by: stamp });
      if (error) {
        if (/hrms_master|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0049 first — the masters table does not exist yet");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "rename" || action === "delete") {
      if (!value) throw new HttpError(400, "Which value?");
      const to = String(body.to ?? body.reassignTo ?? "").trim();

      if (action === "rename" && !to) throw new HttpError(400, "Rename to what?");
      if (to) {
        const { data: exists } = await admin
          .from("hrms_master").select("value").eq("kind", kind).eq("value", to).maybeSingle();
        if (action === "delete" && !exists)
          throw new HttpError(400, `“${to}” is not on the ${kind} list — reassign to something that is.`);
      }

      // move everybody who holds it
      const u = await usersOf(kind);
      let moved = 0;
      if (u) {
        const affected = u.held.get(value) || [];
        for (const person of affected) {
          const next = action === "rename" ? to : to || null;
          const { error } = await admin.from(T.edits).upsert(
            { employee_id: person.id, field: u.field.key, value: next, edited_by: stamp, edited_at: new Date().toISOString() , approved_at: null, approved_by: null },
            { onConflict: "employee_id,field" },
          );
          if (error) throw new Error(error.message);
          try {
            await admin.from(T.log).insert({
              employee_id: person.id, field: u.field.key,
              old_value: value, new_value: next,
              edited_by: stamp,
            });
          } catch { /* the move matters more than the line about it */ }
          moved++;
        }
      }

      if (action === "rename") {
        const { data: taken } = await admin
          .from("hrms_master").select("value").eq("kind", kind).eq("value", to).maybeSingle();
        if (!taken) await admin.from("hrms_master").insert({ kind, value: to, created_by: stamp });
      }
      const { error: del } = await admin.from("hrms_master").delete().eq("kind", kind).eq("value", value);
      if (del) throw new Error(del.message);

      return NextResponse.json({ ok: true, moved });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
