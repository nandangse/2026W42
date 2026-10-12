import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUser } from "@/lib/auth";
import { idpSession } from "@/lib/idp-session";
import { hrmsTables } from "@/lib/hrms";

/**
 * WHO IS STANDING HERE, AS AN EMPLOYEE (12 Oct 2026, for the field
 * attendance). /idp is reached two ways — a Genie login, or the personal
 * e-mail and the password HR issued (the idp cookie). Either way the
 * attendance belongs to the EMPLOYEE NUMBER, not an address: half the
 * service technicians have "na" or nothing in the e-mail column.
 */
export interface FieldPerson { id: string; name: string; email: string | null; department: string | null; designation: string | null; active: boolean }

/** The outdoor service team: everyone on the roll in the Service department (Dr Raghu, 12 Oct 2026). */
export const isFieldTeam = (p: FieldPerson | null) => !!p && p.active && /^service$/i.test(String(p.department || "").trim());

export async function fieldPerson(admin: SupabaseClient): Promise<FieldPerson | null> {
  const T = await hrmsTables(admin);
  const shape = (e: Record<string, unknown> | null | undefined): FieldPerson | null => e ? ({
    id: String(e.id), name: String(e.name || "").trim(), email: /@/.test(String(e.email || "")) ? String(e.email).toLowerCase() : null,
    department: (e.department as string) ?? null, designation: (e.designation as string) ?? null, active: e.active !== false,
  }) : null;
  const eid = await idpSession();
  if (eid) {
    const { data } = await admin.from(T.employees).select("id, name, email, department, designation, active").eq("id", eid).maybeSingle();
    return shape(data);
  }
  const u = await currentUser();
  if (!u || u.disabled) return null;
  const { data: byMail } = await admin.from(T.employees).select("id, name, email, department, designation, active").ilike("email", u.email).order("active", { ascending: false }).limit(1);
  if (byMail?.length) return shape(byMail[0]);
  const { data: link } = await admin.from(T.edits).select("employee_id").eq("field", "user_email").ilike("value", u.email).limit(1);
  if (link?.length) {
    const { data } = await admin.from(T.employees).select("id, name, email, department, designation, active").eq("id", link[0].employee_id).maybeSingle();
    return shape(data);
  }
  return null;
}
