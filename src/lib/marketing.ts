/**
 * MARKETING — the door and the scope (Dr Raghu, 6 Sep 2026).
 *
 * Who gets in: the owner; anyone with a marketing_access row; anyone the
 * CRM already treats as sales (a crm_access grant with a CRM profile role
 * of admin, ceo, sales_head, sales or inside_sales).
 *
 * What they see: `all` for the owner, sales people and managers; `mine`
 * for members — only the companies, people, lists and campaigns they made
 * or were assigned. Communication and notes are always of self.
 */
import { currentUser, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hasGrant } from "@/lib/grant";
import { crmDb, crmConfigured } from "@/crm/db";

export interface MarketingUser extends AuthedUser {
  scope: "all" | "mine";
  marketingRole: "owner" | "sales" | "manager" | "member";
}

const SALES_ROLES = new Set(["admin", "ceo", "sales_head", "sales", "inside_sales"]);

export async function resolveMarketing(email: string, isOwner: boolean): Promise<{ ok: boolean; role: MarketingUser["marketingRole"] }> {
  if (isOwner) return { ok: true, role: "owner" };
  const admin = adminClient();
  const e = email.toLowerCase();
  try {
    const { data } = await admin.from("marketing_access").select("role").eq("email", e).maybeSingle();
    if (data) return { ok: true, role: data.role === "manager" ? "manager" : "member" };
  } catch { /* pre-0146 */ }
  // the CRM's sales people walk in and see everything
  if (await hasGrant(admin, "crm_access", e, false) && crmConfigured()) {
    try {
      const { data } = await crmDb().from("profile").select("role").eq("email", e).maybeSingle();
      if (data && SALES_ROLES.has(String(data.role))) return { ok: true, role: "sales" };
    } catch { /* no profile: not sales */ }
  }
  return { ok: false, role: "member" };
}

export async function mayUseMarketing(email: string, isOwner: boolean): Promise<boolean> {
  return (await resolveMarketing(email, isOwner)).ok;
}

export async function requireMarketing(): Promise<MarketingUser> {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (u.lmsOnly) throw new HttpError(403, "This login opens the training library only.");
  const r = await resolveMarketing(u.email, u.isOwner);
  if (!r.ok) throw new HttpError(403, "Marketing is granted per person — the tick on Admin → Users.");
  return { ...u, marketingRole: r.role, scope: r.role === "member" ? "mine" : "all" };
}

/** The rows a member may see: theirs by creation or assignment. */
export function mineFilter(u: MarketingUser): string | null {
  if (u.scope === "all") return null;
  const e = u.email.toLowerCase();
  return `created_by_email.eq.${e},assigned_to.eq.${e}`;
}
