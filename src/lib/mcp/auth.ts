import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";
import { RAGHU_EMAIL } from "@/lib/auth";
import { hasGrant } from "@/lib/grant";
import { mayUsePlanning } from "@/lib/planning-door";
import { mayUseCeo } from "@/lib/ceo/auth";
import { isLmsAdmin } from "@/lib/lms-admin";
import { maySeeQuerySolver } from "@/lib/query-solver";

/**
 * WHO IS AT THE DOOR (16 Oct 2026). A key resolves to a Genie login; the login
 * resolves to its module doors — the same tables the screens consult — and
 * the tools offered are those doors. GENIE_MCP_TOKEN, the master key in the
 * environment, is Dr Raghu's own.
 */
export type Caller = {
  email: string; name: string; initials: string | null; role: string; isOwner: boolean;
  lc: boolean; stratcom: boolean; management: boolean;
  doors: Record<string, boolean>;   // planning crm marketing hrms kuber vishwakarma seva ims saamaan portal lc ceo lms queries
  tokenId: string | null; tokenLabel: string | null;
};
const S = (v: unknown) => String(v ?? "").trim();
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const mintToken = () => "gen_" + randomBytes(24).toString("hex");

function presented(req: Request): string {
  const h = req.headers.get("authorization") || "";
  return /^bearer\s+(.+)$/i.exec(h)?.[1]?.trim() || S(req.headers.get("x-api-key")) || S(new URL(req.url).searchParams.get("token"));
}

export async function resolveCaller(admin: SupabaseClient, req: Request): Promise<Caller | null> {
  const t = presented(req);
  if (!t) return null;
  let email = ""; let tokenId: string | null = null; let tokenLabel: string | null = null;
  const master = S(process.env.GENIE_MCP_TOKEN);
  if (master && t === master) email = S(process.env.GENIE_MCP_ACTOR) || RAGHU_EMAIL;
  else {
    const { data } = await admin.from("genie_api_token").select("id, email, label, revoked_at").eq("token_hash", hashToken(t)).maybeSingle();
    if (!data || data.revoked_at) return null;
    email = S(data.email).toLowerCase(); tokenId = String(data.id); tokenLabel = S(data.label) || null;
  }
  const { data: p } = await admin.from("profiles").select("email, role, disabled, initials, display_name, lc, stratcom, management, lms_only").eq("email", email).maybeSingle();
  if (!p || p.disabled) return null;
  const isOwner = email === RAGHU_EMAIL;
  const base = { email, name: S(p.display_name) || email.split("@")[0], initials: p.initials ? S(p.initials) : null, role: S(p.role) as Role, isOwner, lc: !!p.lc, stratcom: !!p.stratcom, management: !!p.management, tokenId, tokenLabel: tokenLabel ?? (tokenId ? null : "master") };
  if (p.lms_only) return { ...base, doors: { lms: true } };
  const g = (table: string) => hasGrant(admin, table, email, isOwner).catch(() => false);
  const [planning, crm, hrms, kuber, vishwakarma, seva, ims, saamaan, marketing, portal, lmsAdmin] = await Promise.all([
    mayUsePlanning(admin, email, isOwner).catch(() => false), g("crm_access"), g("hrms_access"), g("accounts_access"), g("vishwakarma_access"), g("seva_access"), g("ims_access"), g("saamaan_access"), g("marketing_access"),
    admin.from("portal_user").select("role, active").eq("email", email).maybeSingle().then((r) => isOwner || p.role === "admin" || (!!r.data?.active && ["admin", "national_manager", "location_manager", "location_technician"].includes(S(r.data?.role))), () => isOwner),
    isLmsAdmin(admin, { email, isOwner, role: S(p.role) as Role }).catch(() => false),
  ]);
  const u = { email, isOwner, disabled: false, lmsOnly: false, lc: !!p.lc } as unknown as Parameters<typeof mayUseCeo>[0];
  return { ...base, doors: { planning, crm, marketing, hrms, kuber, vishwakarma, seva, ims, saamaan, portal, lc: isOwner || !!p.lc, ceo: mayUseCeo(u), lms: true, lms_admin: lmsAdmin, queries: maySeeQuerySolver({ email, isOwner }) } };
}

/** The key's trail: when it last spoke, and what it asked. Never throws. */
export async function touchToken(admin: SupabaseClient, c: Caller, tool: string) {
  if (!c.tokenId) return;
  try { const { data } = await admin.from("genie_api_token").select("calls").eq("id", c.tokenId).maybeSingle(); await admin.from("genie_api_token").update({ last_used_at: new Date().toISOString(), last_tool: tool, calls: (Number(data?.calls) || 0) + 1 }).eq("id", c.tokenId); } catch { /* the trail is a courtesy */ }
}
