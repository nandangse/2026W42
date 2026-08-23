import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, splitMulti } from "@/lib/hrms";

export const dynamic = "force-dynamic";

/**
 * GET /api/hrms/competency?employee=<id>
 *
 * One person's competencies, and where each came from. The list is BUILT, not
 * stored: their roles' requirements, plus anything added to them by hand, with
 * a hand-added level winning over the role's. The role list is never copied
 * onto the person — roles change, and a copy would go stale in silence.
 *
 * Without ?employee it returns the master, for the pickers.
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const empId = new URL(req.url).searchParams.get("employee");

    let master: { name: string; definition: string; category: string | null }[] = [];
    try {
      const { data } = await admin
        .from("hrms_competency").select("name, definition, category, sort_order").order("sort_order").order("name");
      master = (data || []).map((c) => ({ name: String(c.name), definition: String(c.definition), category: c.category ?? null }));
    } catch { /* pre-0056 */ }

    if (!empId) return NextResponse.json({ master });

    // which roles they hold
    const { data: roleEdit } = await admin
      .from(T.edits).select("value").eq("employee_id", empId).eq("field", "role").maybeSingle();
    const { data: emp } = await admin.from(T.employees).select("designation").eq("id", empId).maybeSingle();
    const roleNames = splitMulti(roleEdit?.value as string | null);
    if (!roleNames.length && emp?.designation) roleNames.push(String(emp.designation));

    const fromRole = new Map<string, { level: number; roles: string[] }>();
    if (roleNames.length) {
      const { data: roles } = await admin.from("hrms_role").select("id, role").in("role", roleNames);
      const ids = (roles || []).map((r) => String(r.id));
      const nameOf = new Map((roles || []).map((r) => [String(r.id), String(r.role)]));
      if (ids.length) {
        const { data: rc } = await admin
          .from("hrms_role_competency").select("role_id, competency, level").in("role_id", ids);
        for (const r of rc || []) {
          const key = String(r.competency);
          const prev = fromRole.get(key);
          // two roles asking for the same thing: the HIGHER bar is the bar
          if (!prev) fromRole.set(key, { level: Number(r.level), roles: [nameOf.get(String(r.role_id)) || ""] });
          else {
            prev.level = Math.max(prev.level, Number(r.level));
            prev.roles.push(nameOf.get(String(r.role_id)) || "");
          }
        }
      }
    }

    let added: { competency: string; level: number; reason: string | null; added_by: string | null }[] = [];
    try {
      const { data } = await admin
        .from("hrms_employee_competency")
        .select("competency, level, reason, added_by").eq("employee_id", empId);
      added = (data || []).map((a) => ({
        competency: String(a.competency), level: Number(a.level),
        reason: a.reason ?? null, added_by: a.added_by ?? null,
      }));
    } catch { /* pre-0058 */ }

    const addedBy = new Map(added.map((a) => [a.competency, a]));
    const names = new Set<string>([...fromRole.keys(), ...addedBy.keys()]);
    const list = [...names].map((name) => {
      const role = fromRole.get(name);
      const own = addedBy.get(name);
      return {
        competency: name,
        definition: master.find((m) => m.name === name)?.definition || "",
        category: master.find((m) => m.name === name)?.category || null,
        level: own ? own.level : role!.level,
        roleLevel: role?.level ?? null,
        fromRoles: role?.roles.filter(Boolean) ?? [],
        added: !!own,
        reason: own?.reason ?? null,
        addedBy: own?.added_by ?? null,
      };
    }).sort((a, b) => b.level - a.level || a.competency.localeCompare(b.competency));

    return NextResponse.json({ master, roles: roleNames, competencies: list });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/competency
 *   { employee, competency, level, reason }  — add, or set the level
 *   { employee, competency, remove: true }   — take off what was added here
 *
 * REMOVING ONLY EVER REMOVES WHAT WAS ADDED HERE. A competency the role
 * requires cannot be taken off a person from this screen — that would be
 * disagreeing with the role definition one record at a time. Change the role,
 * or set a level for this person that says what is actually expected of them.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const stampEarly = me.initials ? `${me.initials} · ${me.email}` : me.email;

    /**
     * THE MASTER ITSELF — add a competency, rewrite its definition, remove it.
     *
     * It belongs in Module Masters beside every other list, because that is
     * where somebody looks for "the list of things we can choose from". The
     * difference from the other masters is that a competency carries a
     * DEFINITION as well as a name: the name alone is a word people would
     * each read differently, which is the thing a master exists to prevent.
     */
    if (String(body.action || "").startsWith("master-")) {
      const name = String(body.name || "").trim();
      if (!name) throw new HttpError(400, "A name is required");

      if (body.action === "master-delete") {
        const [{ count: onRoles }, { count: onPeople }] = await Promise.all([
          admin.from("hrms_role_competency").select("competency", { count: "exact", head: true }).eq("competency", name),
          admin.from("hrms_employee_competency").select("competency", { count: "exact", head: true }).eq("competency", name),
        ]);
        if ((onRoles || 0) + (onPeople || 0) > 0)
          throw new HttpError(
            409,
            `“${name}” is required by ${onRoles || 0} role${onRoles === 1 ? "" : "s"} and set on ${onPeople || 0} person/people. ` +
              `Take it off those first — deleting it here would remove it from all of them at once.`,
          );
        const { error } = await admin.from("hrms_competency").delete().eq("name", name);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      const definition = String(body.definition || "").trim();
      if (!definition) throw new HttpError(400, "A competency without a definition is just a word. Write what it means.");
      const category = String(body.category || "").trim() || null;

      if (body.action === "master-add") {
        const { data: clash } = await admin.from("hrms_competency").select("name").eq("name", name).maybeSingle();
        if (clash) throw new HttpError(409, `“${name}” is already in the master.`);
        const { error } = await admin
          .from("hrms_competency").insert({ name, definition, category, sort_order: 900, created_by: stampEarly });
        if (error) {
          if (/hrms_competency|does not exist|schema cache/i.test(error.message))
            throw new HttpError(503, "Run migration 0056 first — the competency master does not exist yet.");
          throw new Error(error.message);
        }
        return NextResponse.json({ ok: true });
      }

      if (body.action === "master-save") {
        const { error } = await admin.from("hrms_competency").update({ definition, category }).eq("name", name);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
    }

    const employee = String(body.employee || "");
    const competency = String(body.competency || "");
    if (!employee || !competency) throw new HttpError(400, "employee and competency are required");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const T = await hrmsTables(admin);

    if (body.remove) {
      const { error } = await admin
        .from("hrms_employee_competency").delete().eq("employee_id", employee).eq("competency", competency);
      if (error) throw new Error(error.message);
    } else {
      const level = Math.max(1, Math.min(5, Number(body.level) || 3));
      const { error } = await admin.from("hrms_employee_competency").upsert(
        { employee_id: employee, competency, level, reason: String(body.reason || "").trim() || null, added_by: stamp },
        { onConflict: "employee_id,competency" },
      );
      if (error) {
        if (/hrms_employee_competency|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0058 first — a person's own competencies have nowhere to live yet.");
        if (/foreign key|violates/i.test(error.message))
          throw new HttpError(400, `“${competency}” is not in the competency master.`);
        throw new Error(error.message);
      }
    }

    // it is a change to their record, so it waits for the owner like the rest
    try {
      await admin.from(T.log).insert({
        employee_id: employee, field: "competency",
        old_value: body.remove ? competency : null,
        new_value: body.remove ? null : `${competency} — level ${Math.max(1, Math.min(5, Number(body.level) || 3))}`,
        edited_by: stamp,
      });
    } catch { /* the change matters more than the line about it */ }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
