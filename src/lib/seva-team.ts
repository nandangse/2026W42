import type { SupabaseClient } from "@supabase/supabase-js";
import { hrmsTables } from "@/lib/hrms";

/**
 * THE SERVICE TEAM AND ITS NAMED HANDS (Dr Raghu, 12 Oct 2026).
 *
 * The team is the HRMS roll's Service department, active — the same people
 * who see Attendance on /idp. "Aakash or Yash can make this" — the plan's
 * writers are names, kept here in one line each, with the owner implicit.
 */
export const PLAN_WRITERS = ["aakash@nandan.co.in", "yashavantha@nandan.co.in"];
export const mayPlan = (email: string, isOwner: boolean) => isOwner || PLAN_WRITERS.includes(email.toLowerCase());

export interface ServicePerson { id: string; name: string; designation: string | null; email: string | null }

export async function serviceTeam(admin: SupabaseClient): Promise<ServicePerson[]> {
  const T = await hrmsTables(admin);
  const { data } = await admin.from(T.employees).select("id, name, designation, email, active, department").eq("department", "Service").eq("active", true).order("name");
  /* the managers and the coordinator first, then engineers, then technicians */
  const rank = (d: string | null) => { const s = String(d || "").toLowerCase(); return /manager/.test(s) ? 0 : /coordinator/.test(s) ? 1 : /engineer/.test(s) ? 2 : /techn|tecican|techician/.test(s) ? 3 : 4; };
  return (data || []).map((e) => ({ id: String(e.id), name: String(e.name || "").trim(), designation: e.designation ? String(e.designation) : null, email: /@/.test(String(e.email || "")) ? String(e.email).toLowerCase() : null }))
    .sort((a, b) => rank(a.designation) - rank(b.designation) || a.name.localeCompare(b.name));
}

/** "route it to the Service Manager for approval" — the two Service Managers on the roll; the owner implicit. */
export const QUOTE_APPROVERS = ["aakash@nandan.co.in", "sunder@nandan.co.in"];
export const mayApproveQuote = (email: string, isOwner: boolean) => isOwner || QUOTE_APPROVERS.includes(email.toLowerCase());

/** Whose ERP quotations are the service team's ("Sarita, Yash, Aakash or the service team"): these, plus every Service e-mail on the roll. */
export const SERVICE_QUOTERS = ["sarita@nandan.co.in", "aakash@nandan.co.in", "yashavantha@nandan.co.in"];
export async function serviceQuoters(admin: SupabaseClient): Promise<string[]> {
  const team = await serviceTeam(admin).catch(() => []);
  return [...new Set([...SERVICE_QUOTERS, ...team.map((p) => p.email).filter((e): e is string => !!e)])];
}
