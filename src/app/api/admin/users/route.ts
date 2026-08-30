import { NextResponse } from "next/server";
import { requireAdmin, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { normaliseGroups } from "@/lib/groups";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales", "viewer", "uploader"];

/** Normalise a 2-letter initials key, or null. Throws on a bad value. */
function normInitials(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2,3}$/.test(s))
    throw new HttpError(400, "Initials must be two or three letters (A–Z)");
  return s;
}

/** First free 2-letter key derived from a name/email, e.g. ravi.kumar → RK. */
async function suggestInitials(seed: string): Promise<string | null> {
  const letters = seed.toUpperCase().replace(/[^A-Z]/g, "");
  const parts = seed.split(/[.\s_@-]+/).filter(Boolean);
  const candidates = [
    parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : "",
    letters.slice(0, 2),
    ...Array.from({ length: 26 }, (_, i) => (letters[0] || "X") + String.fromCharCode(65 + i)),
  ].filter((c) => /^[A-Z]{2}$/.test(c));

  const { data } = await adminClient().from("profiles").select("initials").not("initials", "is", null);
  const taken = new Set((data || []).map((r) => r.initials as string));
  return candidates.find((c) => !taken.has(c)) ?? null;
}

const LAST_ADMIN_MSG =
  "This is the last active admin — promote another admin first, or the Admin page becomes unreachable for everyone.";

/**
 * True if disabling/demoting `id` would leave zero active admins. Losing the
 * last admin locks user management out for everyone, and only the service key
 * could undo it — so it is blocked server-side.
 */
async function wouldStrandAdmins(id: string): Promise<boolean> {
  const { data } = await adminClient()
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("disabled", false);
  const active = data || [];
  return active.length <= 1 && active.some((u) => u.id === id);
}

// GET /api/admin/users — list users. admin only.
export async function GET(req: Request) {
  try {
    await requireAdmin();
    if (new URL(req.url).searchParams.get("log")) {
      const { data } = await adminClient().from("admin_audit")
        .select("at, by_email, action, target").order("at", { ascending: false }).limit(100);
      return NextResponse.json({ log: data ?? [] });
    }
    const admin = adminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, role, disabled, initials, display_name, erp_owner, reports_to, designation, department_id, lc, stratcom, management, oauth_available, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Sales Genie grants — default NO for everyone; absent table (pre-0013)
    // simply reads as nobody granted.
    const salesIds = new Set<string>();
    try {
      const { data: grants } = await admin.from("sales_access").select("person_id");
      for (const g of grants || []) salesIds.add(g.person_id as string);
    } catch { /* pre-0013 */ }

    // HRMS grants. Keyed by EMAIL rather than by id (migration 0047), so a
    // grant can be written before the account exists -- hr@nandan.co.in was
    // granted on the day the module shipped and had no login yet.
    const hrmsEmails = new Set<string>();
    try {
      const { data: hg } = await admin.from("hrms_access").select("email");
      for (const g of hg || []) hrmsEmails.add(String(g.email || "").toLowerCase());
    } catch { /* pre-0047 */ }

    // CRM grants, keyed by email for the same reason as HRMS (0055).
    const crmEmails = new Set<string>();
    try {
      const { data: cg } = await admin.from("crm_access").select("email");
      for (const g of cg || []) crmEmails.add(String(g.email || "").toLowerCase());
    } catch { /* pre-0055 */ }

    // Accounts grants — the fourth module, same arrangement (0073).
    const accEmails = new Set<string>();
    try {
      const { data: ag } = await admin.from("accounts_access").select("email");
      for (const g of ag || []) accEmails.add(String(g.email || "").toLowerCase());
    } catch { /* pre-0073 */ }

    // Vishwakarma grants — the fifth, design (0076).
    const vishEmails = new Set<string>();
    try {
      const { data: vg } = await admin.from("vishwakarma_access").select("email");
      for (const g of vg || []) vishEmails.add(String(g.email || "").toLowerCase());
    } catch { /* pre-0076 */ }

    // Seva grants — the sixth, customer service (0107).
    const sevaEmails = new Set<string>();
    try {
      const { data: sg } = await admin.from("seva_access").select("email");
      for (const g of sg || []) sevaEmails.add(String(g.email || "").toLowerCase());
    } catch { /* pre-0107 */ }

    // Last sign-in lives in auth.users, not profiles, so it comes from the
    // admin auth API. Failure here must not take the page down — the column
    // simply reads "—".
    const lastSeen = new Map<string, string | null>();
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users || []) lastSeen.set(u.id, u.last_sign_in_at ?? null);
    } catch {
      /* leave the column empty */
    }

    // Departments, so the picker has names rather than uuids.
    let departments: { id: string; name: string }[] = [];
    try {
      const { data: d } = await admin.from("departments").select("id,name").order("sort_order");
      departments = d || [];
    } catch {
      /* pre-0019 */
    }

    // Goals access, merged in so it is one row per person rather than two tables
    const goalGrant = new Map<string, boolean>();
    try {
      const { data: g } = await admin.from("goal_access").select("person_id, can_edit");
      for (const r of g || []) goalGrant.set(r.person_id as string, !!r.can_edit);
    } catch {
      /* pre-0010 */
    }

    return NextResponse.json({
      departments,
      users: (data || []).map((u) => ({
        ...u,
        sales_access: salesIds.has(u.id) || String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        sales_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        last_sign_in_at: lastSeen.get(u.id) ?? null,
        hrms_access:
          hrmsEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        hrms_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        crm_access:
          crmEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        crm_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        accounts_access:
          accEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        accounts_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        vishwakarma_access:
          vishEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        vishwakarma_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        seva_access:
          sevaEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        seva_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        goals_level:
          String(u.email || "").toLowerCase() === RAGHU_EMAIL
            ? "edit"
            : goalGrant.has(u.id)
              ? goalGrant.get(u.id)
                ? "edit"
                : "view"
              : "none",
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/admin/users — admin only. Uses the service key.
//   { action: "create", email, password, role }
//   { action: "role", id, role }
//   { action: "disable", id, disabled }
//   { action: "password", id, password }   — set a new password
//   { action: "delete", id }               — remove the account (not yourself)
export async function POST(req: Request) {
  try {
    const caller = await requireAdmin();
    const admin = adminClient();
    const body = await req.json();

    /**
     * The owner sits above the admin tier:
     *   · the owner's own account can never be demoted, disabled or removed
     *   · only the owner may act on ANOTHER admin
     * Ordinary admins keep full control of everyone below them.
     */
    const guardTarget = async (id: string) => {
      if (!id) return;
      const { data: t } = await admin.from("profiles").select("email, role").eq("id", id).maybeSingle();
      if (!t) return;
      const targetIsOwner = String(t.email || "").toLowerCase() === RAGHU_EMAIL;
      if (targetIsOwner) {
        // The owner's PROFILE fields (initials, ERP owner, the OAuth tick)
        // are the owner's own to set — it was exactly Dr Raghu who could not
        // tick OAuth on himself (26 Aug 2026). Role, disable, password and
        // delete stay locked for the owner row, always.
        if (!(caller.isOwner && body.action === "profile"))
          throw new HttpError(403, "The owner account cannot be changed here.");
      }
      if (t.role === "admin" && !caller.isOwner)
        throw new HttpError(
          403,
          `Only ${RAGHU_EMAIL} may change another admin. Ask them to make this change.`,
        );
    };
    if (["role", "disable", "password", "delete", "profile", "sales_access"].includes(body.action))
      await guardTarget(body.id);

    // making a new admin creates a peer, so that too is the owner's call
    if ((body.action === "create" || body.action === "role") && body.role === "admin" && !caller.isOwner)
      throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant the admin role.`);

    // "we should log it" (Dr Raghu, 30 Aug 2026) — every user-management
    // change of hands into admin_audit (Genie migration 0105). Passwords
    // never ride along; the ledger never blocks the change.
    try {
      const { password: _pw, pw: _pw2, ...clean } = body as Record<string, unknown>;
      let target = String(body.email || "");
      if (!target && body.id) {
        const { data: t } = await admin.from("profiles").select("email").eq("id", String(body.id)).maybeSingle();
        target = String(t?.email || body.id);
      }
      await admin.from("admin_audit").insert({
        by_email: String((caller as { email?: string }).email || ""), action: String(body.action || ""), target, detail: clean,
      });
    } catch { /* pre-0105, or a ledger hiccup */ }

    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const role: Role = ROLES.includes(body.role) ? body.role : "planner";
      if (!email || !body.password)
        return NextResponse.json({ error: "email and password required" }, { status: 400 });
      if (String(body.password).length < 8)
        return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
      // initials are the assignment key — auto-derive one if not supplied
      const initials = normInitials(body.initials) ?? (await suggestInitials(body.display_name || email));
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { role },
      });
      if (error) throw new Error(error.message);
      // handle_new_user() already inserted the profile; ensure the rest sticks
      const { error: pe } = await admin.from("profiles").upsert(
        {
          id: data.user!.id,
          email,
          role,
          disabled: false,
          initials,
          display_name: String(body.display_name || "").trim() || null,
          erp_owner: String(body.erp_owner || "").trim() || null,
        },
        { onConflict: "id" },
      );
      if (pe) {
        if (/initials/i.test(pe.message))
          return NextResponse.json({ error: `Initials "${initials}" are already taken` }, { status: 409 });
        throw new Error(pe.message);
      }
      return NextResponse.json({ ok: true, id: data.user!.id, initials });
    }

    if (body.action === "role") {
      const role: Role = ROLES.includes(body.role) ? body.role : "planner";
      // never let the last active admin demote themselves out of the system
      if (role !== "admin" && (await wouldStrandAdmins(body.id)))
        return NextResponse.json({ error: LAST_ADMIN_MSG }, { status: 400 });
      const { error } = await admin.from("profiles").update({ role }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "disable") {
      const disabled = !!body.disabled;
      // guard the two ways an admin can lock everyone (including themselves) out
      if (disabled && body.id === caller.id)
        return NextResponse.json(
          { error: "You cannot disable your own account" },
          { status: 400 },
        );
      if (disabled && (await wouldStrandAdmins(body.id)))
        return NextResponse.json({ error: LAST_ADMIN_MSG }, { status: 400 });
      const { error } = await admin
        .from("profiles")
        .update({ disabled })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * { action: "groups", id, lc, stratcom, management } — owner only.
     *
     * NOT routed through guardTarget(): that blocks any change to an admin
     * unless the caller is the owner, and blocks the owner's row outright.
     * Both are right for role and password and wrong here — the whole point of
     * these three is that the owner decides who is in the room, and admins are
     * exactly the people most likely to be in it. The owner check below is the
     * only gate this action needs, and it is stricter than guardTarget's.
     *
     * The owner's own row is still refused, because the owner is in all three
     * implicitly (see src/lib/groups.ts) and a stored tick on a row the admin
     * page cannot edit could never be taken off again.
     */
    if (body.action === "groups") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may set LC, Stratcom or Management.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      if (String(t?.email || "").toLowerCase() === RAGHU_EMAIL)
        return NextResponse.json(
          { error: "The owner is in all three already — there is nothing to tick." },
          { status: 400 },
        );
      // Stratcom implies LC, applied here as well as in the database so the
      // answer the page gets back is the answer that was stored.
      const g = normaliseGroups({
        lc: !!body.lc,
        stratcom: !!body.stratcom,
        management: !!body.management,
      });
      const { error } = await admin.from("profiles").update(g).eq("id", body.id);
      if (error) {
        if (/lc|stratcom|management|column/i.test(error.message))
          throw new HttpError(503, "Run migration 0034 first — the three groups have nowhere to save yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, ...g });
    }

    if (body.action === "profile") {
      // edit initials / display name / the ERP "Project Owner" string to link to
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if ("initials" in body) patch.initials = normInitials(body.initials);
      if ("display_name" in body) patch.display_name = String(body.display_name || "").trim() || null;
      if ("erp_owner" in body) patch.erp_owner = String(body.erp_owner || "").trim() || null;
      if ("designation" in body) patch.designation = String(body.designation || "").trim() || null;
      // The admin's mark that this person may connect Gmail — the connect
      // itself happens with an administrator in tow (comms build).
      if ("oauth_available" in body) patch.oauth_available = !!body.oauth_available;
      if ("department_id" in body) patch.department_id = body.department_id || null;
      if ("reports_to" in body) {
        // the line manager, which Tasking's "people reporting to me" reads.
        // Nobody reports to themselves — that would make them their own report
        // and double every task in that filter.
        const mgr = String(body.reports_to || "").trim() || null;
        if (mgr && mgr === body.id) throw new HttpError(400, "Someone cannot report to themselves");
        patch.reports_to = mgr;
      }
      if (!Object.keys(patch).length)
        return NextResponse.json({ error: "nothing to update" }, { status: 400 });
      const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
      if (error) {
        if (/initials/i.test(error.message))
          return NextResponse.json({ error: `Initials "${patch.initials}" are already taken` }, { status: 409 });
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "sales_access") {
      // grant or revoke Sales Genie for one person (default is no for everyone)
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (body.grant) {
        const { error } = await admin
          .from("sales_access")
          .upsert({ person_id: body.id, granted_by: caller.email }, { onConflict: "person_id" });
        if (error) {
          if (/sales_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0013 first — the sales tables don't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("sales_access").delete().eq("person_id", body.id);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /**
     * { action: "hrms_access", id, grant } — owner only.
     *
     * Not routed through guardTarget() for the same reason "groups" is not:
     * the owner check below is the stricter of the two, and the people most
     * likely to be given HR access are admins, whom guardTarget would refuse
     * to touch. HRMS holds dates of birth, home addresses and next of kin --
     * who may read that is not an ordinary admin's decision.
     */
    if (body.action === "hrms_access") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant HRMS.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json(
          { error: "The owner holds HRMS implicitly — there is nothing to tick." },
          { status: 400 },
        );
      if (body.grant) {
        const { error } = await admin
          .from("hrms_access")
          .upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (/hrms_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0047 first — the HRMS tables don't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("hrms_access").delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /** { action: "vishwakarma_access", id, grant } — owner only, as with HRMS. */
    if (body.action === "vishwakarma_access") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant Vishwakarma.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json({ error: "The owner holds Vishwakarma implicitly." }, { status: 400 });
      if (body.grant) {
        const { error } = await admin.from("vishwakarma_access").upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (/vishwakarma_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0076 first — the Vishwakarma grant table doesn't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("vishwakarma_access").delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /** { action: "seva_access", id, grant } — owner only, as with HRMS. */
    if (body.action === "seva_access") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant Seva.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json({ error: "The owner holds Seva implicitly." }, { status: 400 });
      if (body.grant) {
        const { error } = await admin.from("seva_access").upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (/seva_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0107 first — the Seva grant table doesn't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("seva_access").delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /** { action: "accounts_access", id, grant } — owner only, as with HRMS. */
    if (body.action === "accounts_access") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant Accounts.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json({ error: "The owner holds Accounts implicitly." }, { status: 400 });
      if (body.grant) {
        const { error } = await admin.from("accounts_access").upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (/accounts_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0073 first — the Accounts grant table doesn't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("accounts_access").delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /** { action: "crm_access", id, grant } — owner only, as with HRMS. */
    if (body.action === "crm_access") {
      if (!caller.isOwner)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may grant the CRM.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json({ error: "The owner holds the CRM implicitly." }, { status: 400 });
      if (body.grant) {
        const { error } = await admin.from("crm_access").upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (/crm_access|schema cache|does not exist/i.test(error.message))
            return NextResponse.json({ error: "Run migration 0055 first — the CRM grant table doesn't exist yet" }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from("crm_access").delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "password") {
      if (!body.id || String(body.password || "").length < 8)
        return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(body.id, {
        password: body.password,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * Send the person a password-reset email.
     *
     * Preferred over typing a password for them: the admin never sees or
     * handles a credential, and the link lands in the account's own inbox.
     * The "password" action above stays for the case where someone has lost
     * access to their mail.
     */
    if (body.action === "reset_email") {
      const { data: who } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      if (!who?.email) return NextResponse.json({ error: "no such user" }, { status: 404 });
      const site =
        process.env.NEXT_PUBLIC_SITE_URL ||
        req.headers.get("origin") ||
        "https://genie.nandan.co.in";
      const { error } = await admin.auth.resetPasswordForEmail(who.email, {
        redirectTo: `${site}/login`,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, email: who.email });
    }

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (body.id === caller.id)
        return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
      if (await wouldStrandAdmins(body.id))
        return NextResponse.json({ error: LAST_ADMIN_MSG }, { status: 400 });
      // deleting the auth user cascades to profiles (FK on delete cascade);
      // their plans/comments/edits remain — only the login goes away
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
