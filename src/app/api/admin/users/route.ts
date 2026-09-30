import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireAdmin, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { normaliseGroups } from "@/lib/groups";
import type { Role } from "@/lib/types";

/** The e-mail-keyed module doors an owner can tick on Admin → Users. */
const DOORS: Record<string, { table: string; label: string; migration: string }> = {
  hrms_access: { table: "hrms_access", label: "HRMS", migration: "0047" },
  vishwakarma_access: { table: "vishwakarma_access", label: "Vishwakarma", migration: "0076" },
  seva_access: { table: "seva_access", label: "Seva", migration: "0107" },
  ims_access: { table: "ims_access", label: "the IMS", migration: "0111" },
  saamaan_access: { table: "material_access", label: "Saamaan", migration: "0118" },
  accounts_access: { table: "accounts_access", label: "Kuber", migration: "0073" },
  crm_access: { table: "crm_access", label: "the CRM", migration: "0055" },
  marketing_access: { table: "marketing_access", label: "Marketing", migration: "0146" },
  /* Planning was open to every login until 8 Sep 2026; 0161 made it a door
     and seeded every login that then existed, so nothing was taken away. */
  planning_access: { table: "planning_access", label: "Planning", migration: "0161" },
};

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "planner", "project_owner", "user", "sales", "viewer", "uploader"];

/**
 * "For now will only give this to Raghu and Vishwas. Other admins can see it."
 * (Dr Raghu, 4 Sep 2026). Every change on the Users app is theirs; the rest
 * of the admins get the table read-only. The owner row stays untouchable
 * and the admin role stays the owner's alone to give, as before.
 */
const USER_EDITORS = new Set<string>([RAGHU_EMAIL, "vishwas@nandan.co.in"]);
const mayEditUsers = (u: { email: string; isOwner: boolean }) => u.isOwner || USER_EDITORS.has(u.email.toLowerCase());

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
    const COLS = "id, email, role, disabled, initials, display_name, erp_owner, reports_to, designation, department_id, lc, stratcom, management, oauth_available, created_at";
    // `kind` arrives with migration 0144; until it has run the column is absent and everyone is an employee
    type Rows = { data: Record<string, unknown>[] | null; error: { message: string } | null };
    let q = (await admin.from("profiles").select(COLS + ", kind").order("created_at", { ascending: true })) as unknown as Rows;
    if (q.error && /kind/i.test(q.error.message)) q = (await admin.from("profiles").select(COLS).order("created_at", { ascending: true })) as unknown as Rows;
    const { data, error } = q;
    if (error) throw new Error(error.message);

    // The HRMS record behind each login, by e-mail: the type (Staff /
    // Labour / Contractor …), the employee id, the phone and personal
    // e-mail the login was or would be made from (5.0.1.0).
    const emp = new Map<string, { type: string | null; employee_id: string | null; phone: string | null; personal_email: string | null; active: boolean }>();
    try {
      const t = await hrmsTables(admin);
      const { data: rows } = await admin.from(t.employees).select("email, user_email, personal_email, type, employee_id, phone, active");
      for (const r of rows || []) {
        const rec = { type: r.type ?? null, employee_id: r.employee_id ?? null, phone: r.phone ?? null, personal_email: r.personal_email ?? null, active: !!r.active };
        for (const k of [r.user_email, r.email, r.personal_email]) if (k) emp.set(String(k).toLowerCase(), rec);
      }
    } catch (e) { swallow("admin/users", e); /* no HRMS yet */ }

    // Sales Genie grants — default NO for everyone; absent table (pre-0013)
    // simply reads as nobody granted.
    const salesIds = new Set<string>();
    try {
      const { data: grants } = await admin.from("sales_access").select("person_id");
      for (const g of grants || []) salesIds.add(g.person_id as string);
    } catch (e) { swallow("admin/users", e); /* pre-0013 */ }

    // HRMS grants. Keyed by EMAIL rather than by id (migration 0047), so a
    // grant can be written before the account exists -- hr@nandan.co.in was
    // granted on the day the module shipped and had no login yet.
    const hrmsEmails = new Set<string>();
    try {
      const { data: hg } = await admin.from("hrms_access").select("email");
      for (const g of hg || []) hrmsEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0047 */ }

    // CRM grants, keyed by email for the same reason as HRMS (0055).
    const crmEmails = new Set<string>();
    try {
      const { data: cg } = await admin.from("crm_access").select("email");
      for (const g of cg || []) crmEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0055 */ }

    // Accounts grants — the fourth module, same arrangement (0073).
    const accEmails = new Set<string>();
    try {
      const { data: ag } = await admin.from("accounts_access").select("email");
      for (const g of ag || []) accEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0073 */ }

    // Vishwakarma grants — the fifth, design (0076).
    const vishEmails = new Set<string>();
    try {
      const { data: vg } = await admin.from("vishwakarma_access").select("email");
      for (const g of vg || []) vishEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0076 */ }

    // Seva grants — the sixth, customer service (0107).
    const sevaEmails = new Set<string>();
    try {
      const { data: sg } = await admin.from("seva_access").select("email");
      for (const g of sg || []) sevaEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0107 */ }

    // IMS grants — the seventh, the Integrated Management System (0111).
    const imsEmails = new Set<string>();
    try {
      const { data: ig } = await admin.from("ims_access").select("email");
      for (const g of ig || []) imsEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0111 */ }

    // Saamaan grants — the eighth, materials (0118). The table is
    // material_access: every Saamaan table wears the material_ prefix.
    const saamaanEmails = new Set<string>();
    try {
      const { data: mg } = await admin.from("material_access").select("email");
      for (const g of mg || []) saamaanEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0118 */ }

    // Last sign-in lives in auth.users, not profiles, so it comes from the
    // admin auth API. Failure here must not take the page down — the column
    // simply reads "—".
    const lastSeen = new Map<string, string | null>();
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users || []) lastSeen.set(u.id, u.last_sign_in_at ?? null);
    } catch (e) { swallow("admin/users", e); /* leave the column empty */ }

    // Departments, so the picker has names rather than uuids.
    let departments: { id: string; name: string }[] = [];
    try {
      const { data: d } = await admin.from("departments").select("id,name").order("sort_order");
      departments = d || [];
    } catch (e) { swallow("admin/users", e); /* pre-0019 */ }

    // Goals access, merged in so it is one row per person rather than two tables
    const goalGrant = new Map<string, boolean>();
    try {
      const { data: g } = await admin.from("goal_access").select("person_id, can_edit");
      for (const r of g || []) goalGrant.set(r.person_id as string, !!r.can_edit);
    } catch (e) { swallow("admin/users", e); /* pre-0010 */ }

    const mkEmails = new Set<string>();
    try {
      const { data: mg } = await admin.from("marketing_access").select("email");
      for (const g of mg || []) mkEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0146 */ }

    /* Planning became a door on 8 Sep 2026 (migration 0161). Before it ran
       the table does not exist, and an EMPTY set would read as "nobody has
       Planning" — so until then everyone is shown as holding it, which is
       what was true. */
    const plEmails = new Set<string>();
    let planningDoorLive = false;
    try {
      const { data: pg } = await admin.from("planning_access").select("email");
      planningDoorLive = true;
      for (const g of pg || []) plEmails.add(String(g.email || "").toLowerCase());
    } catch (e) { swallow("admin/users", e); /* pre-0161 — everyone has it */ }

    const caller = await requireAdmin();

    /**
     * THE IDP PEOPLE BELONG ON THIS LIST TOO (Dr Raghu, 8 Sep 2026: "in this
     * also show IDP users which is all the workers").
     *
     * Until now this was the register of GENIE logins, so the hundred and
     * ninety-odd men who sign in at /idp with the password HR issued did not
     * appear at all — the very people the IDP round was run for. They have no
     * profile row, so nothing joined them.
     *
     * They are read from hrms_idp_login and folded in: anybody who already
     * has a Genie login is marked as also having an IDP one, and anybody who
     * has only the IDP login gets a row of his own. Those rows carry no
     * module access and cannot be given any — there is nothing behind them to
     * grant — which is why they are marked `idp_only` and shown read-only.
     */
    const idpLogin = new Map<string, { email: string; last: string | null; empId: string }>();
    try {
      const { data: lg } = await admin.from("hrms_idp_login").select("employee_id, email, last_login_at");
      for (const r of (lg || []) as { employee_id: string; email: string; last_login_at: string | null }[])
        idpLogin.set(String(r.email || "").toLowerCase(), { email: String(r.email || ""), last: r.last_login_at, empId: String(r.employee_id) });
    } catch (e) { swallow("admin/users idp", e); }

    /** name, type and id for an IDP person, from the employee master */
    const byEmpId = new Map<string, { name: string; type: string | null; active: boolean }>();
    if (idpLogin.size) {
      try {
        const tt = await hrmsTables(admin);
        const { data: rows } = await admin.from(tt.employees).select("id, name, type, active")
          .in("id", [...idpLogin.values()].map((v) => v.empId));
        for (const r of (rows || []) as { id: string; name: string; type: string | null; active: boolean }[])
          byEmpId.set(String(r.id), { name: r.name, type: r.type ?? null, active: !!r.active });
      } catch (e) { swallow("admin/users idp names", e); }
    }

    const haveProfile = new Set((data || []).map((u) => String(u.email || "").toLowerCase()));
    const idpOnly = [...idpLogin.entries()]
      .filter(([mail]) => !haveProfile.has(mail))
      .map(([mail, v]) => {
        const e = byEmpId.get(v.empId);
        return {
          id: `idp:${v.empId}`, email: v.email, full_name: e?.name || v.empId, initials: null,
          role: "idp", disabled: false, created_at: null,
          kind: "employee", idp_only: true, has_idp: true,
          emp_type: e?.type ?? null, emp_id: v.empId, emp_phone: null, emp_active: e?.active ?? null,
          last_sign_in_at: v.last,
        };
      });

    return NextResponse.json({
      departments,
      mayEdit: mayEditUsers(caller),
      editors: [...USER_EDITORS],
      users: [...(data || []).map((u) => ({
        ...u,
        kind: (u.kind as string | undefined) || "employee",
        emp_type: emp.get(String(u.email || "").toLowerCase())?.type ?? null,
        emp_id: emp.get(String(u.email || "").toLowerCase())?.employee_id ?? null,
        emp_phone: emp.get(String(u.email || "").toLowerCase())?.phone ?? null,
        emp_active: emp.get(String(u.email || "").toLowerCase())?.active ?? null,
        sales_access: salesIds.has(String(u.id)) || String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        sales_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        last_sign_in_at: lastSeen.get(String(u.id)) ?? null,
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
        ims_access:
          imsEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        ims_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        saamaan_access:
          saamaanEmails.has(String(u.email || "").toLowerCase()) ||
          String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        saamaan_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        marketing_access: mkEmails.has(String(u.email || "").toLowerCase()) || String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        marketing_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        planning_access: !planningDoorLive || plEmails.has(String(u.email || "").toLowerCase()) || String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        planning_implicit: String(u.email || "").toLowerCase() === RAGHU_EMAIL,
        goals_level:
          String(u.email || "").toLowerCase() === RAGHU_EMAIL
            ? "edit"
            : goalGrant.has(String(u.id))
              ? goalGrant.get(String(u.id))
                ? "edit"
                : "view"
              : "none",
        has_idp: idpLogin.has(String(u.email || "").toLowerCase()),
        idp_only: false,
      })), ...idpOnly],
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
    if (!mayEditUsers(caller))
      throw new HttpError(403, "Only Dr Raghu and Vishwas may change users here. Other admins may look.");
    const admin = adminClient();
    const body = await readBody(req, { action: "string", grant: "boolean?" });

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
      if (t.role === "admin" && !mayEditUsers(caller))
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
    } catch (e) { swallow("admin/users", e); /* pre-0105, or a ledger hiccup */ }

    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const role: Role = ROLES.includes(body.role) ? body.role : "planner";
      if (!email || !body.password)
        return NextResponse.json({ error: "email and password required" }, { status: 400 });
      if (String(body.password).length < 8)
        return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
      /**
       * ALREADY THERE IS NOT A FAILURE, IT IS AN ANSWER.
       *
       * Supabase refuses a second login on the same address with "A user
       * with this email address has already been registered", which arrived
       * here as a 500 and read like the button was broken. It happens most
       * often when the person was made from another tab — the list in THIS
       * tab was fetched before he existed, so a search for him finds nobody
       * and adding him is refused, and both halves look like a bug.
       */
      {
        const { data: already } = await admin.from("profiles")
          .select("id, disabled").eq("email", email).maybeSingle();
        if (already)
          return NextResponse.json({
            error: `${email} is already on Genie${already.disabled ? " (disabled — open the row and enable)" : ""}. Reload this page and search for them.`,
          }, { status: 409 });
      }
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
      if (!mayEditUsers(caller))
        throw new HttpError(403, `Only Dr Raghu and Vishwas may set LC, Stratcom or Management.`);
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
      /* FOUR KINDS (Dr Raghu, 8 Sep 2026: "make a type called staff,
         employees, consultant, intern — this should do for now"). Staff is
         the new one; the other three stand. The stored word stays singular,
         because it describes one person. */
      if ("kind" in body) {
        const k = String(body.kind || "employee");
        if (!["staff", "employee", "consultant", "intern"].includes(k))
          throw new HttpError(400, "kind must be staff, employee, consultant or intern");
        patch.kind = k;
      }
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
     * { action: "<module>_access", id, grant } — owner only.
     *
     * One handler for the seven e-mail-keyed doors (Genie 5.0.0.2; it was
     * seven copies of the same twenty lines). Not routed through
     * guardTarget() for the same reason "groups" is not: the owner check is
     * the stricter of the two, and the people most likely to be given a
     * module are admins, whom guardTarget would refuse to touch. HRMS holds
     * dates of birth, home addresses and next of kin -- who may read that is
     * not an ordinary admin's decision, and the same hand holds every door.
     */
    const door = DOORS[String(body.action)];
    if (door) {
      if (!mayEditUsers(caller))
        throw new HttpError(403, `Only Dr Raghu and Vishwas may grant ${door.label}.`);
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: t } = await admin.from("profiles").select("email").eq("id", body.id).maybeSingle();
      const target = String(t?.email || "").toLowerCase();
      if (!target) return NextResponse.json({ error: "no such user" }, { status: 404 });
      if (target === RAGHU_EMAIL)
        return NextResponse.json({ error: `The owner holds ${door.label} implicitly — there is nothing to tick.` }, { status: 400 });
      if (body.grant) {
        const { error } = await admin.from(door.table).upsert({ email: target, granted_by: caller.email }, { onConflict: "email" });
        if (error) {
          if (new RegExp(`${door.table}|schema cache|does not exist`, "i").test(error.message))
            return NextResponse.json({ error: `Run migration ${door.migration} first — the ${door.label} grant table doesn't exist yet` }, { status: 400 });
          throw new Error(error.message);
        }
      } else {
        const { error } = await admin.from(door.table).delete().eq("email", target);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /**
     * { action: "provision", preview?: true, types?: string[] } — owner only.
     *
     * "there will be users made of ALL the active employees where they will
     * get a login id and password based on their personal mobile no and
     * personal email address" (Dr Raghu, 6 Sep 2026). The login id is the
     * personal e-mail, or the official one when there is none; the first
     * password is the mobile number's digits. Preview lists who would be
     * made and who cannot be (no e-mail at all); the real run creates them
     * confirmed, so the code-by-email sign-in works at once.
     */
    if (body.action === "provision") {
      if (!caller.isOwner) throw new HttpError(403, "Only the owner may make logins for the roll.");
      const want = new Set((Array.isArray(body.types) ? body.types : []).map((t: unknown) => String(t).toLowerCase()));
      const t = await hrmsTables(admin);
      const { data: rows, error: e1 } = await admin.from(t.employees).select("id, name, email, user_email, personal_email, phone, type, employee_id, active").eq("active", true);
      if (e1) throw new Error(e1.message);
      const { data: profs } = await admin.from("profiles").select("id, email");
      const have = new Set((profs || []).map((p) => String(p.email || "").toLowerCase()));
      const plan: { name: string; employee_id: string | null; type: string | null; login: string | null; password: string | null; why: string }[] = [];
      for (const r of rows || []) {
        const type = String(r.type || "");
        const bucket = /labour/i.test(type) ? "labour" : /contract/i.test(type) ? "contractors" : "staff";
        if (want.size && !want.has(bucket)) continue;
        const login = String(r.personal_email || r.user_email || r.email || "").trim().toLowerCase() || null;
        const digits = String(r.phone || "").replace(/\D/g, "");
        const password = digits.length >= 8 ? digits.slice(-10) : null;
        let why = "will be made";
        if (!login) why = "no e-mail on the record";
        else if (have.has(login)) why = "already has a login";
        else if (!password) why = "no mobile number on the record — the code-by-email sign-in still works";
        plan.push({ name: r.name, employee_id: r.employee_id ?? null, type: r.type ?? null, login, password: password ? "•••" + password.slice(-4) : null, why });
      }
      if (body.preview) return NextResponse.json({ plan });
      let made = 0; const failed: string[] = [];
      for (const r of rows || []) {
        const login = String(r.personal_email || r.user_email || r.email || "").trim().toLowerCase();
        if (!login || have.has(login)) continue;
        const type = String(r.type || "");
        const bucket = /labour/i.test(type) ? "labour" : /contract/i.test(type) ? "contractors" : "staff";
        if (want.size && !want.has(bucket)) continue;
        const digits = String(r.phone || "").replace(/\D/g, "");
        const password = digits.length >= 8 ? digits.slice(-10) : undefined;
        const initials = String(r.name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || null;
        const { data: created, error } = await admin.auth.admin.createUser({ email: login, password, email_confirm: true, user_metadata: { display_name: r.name, initials } });
        if (error || !created.user) { failed.push(`${r.name}: ${error?.message || "?"}`); continue; }
        await admin.from("profiles").upsert({ id: created.user.id, email: login, role: "user", display_name: r.name, initials, disabled: false }, { onConflict: "id" });
        await admin.from("admin_audit").insert({ by_email: caller.email, action: "provision", target: login }).then(() => null, () => null);
        have.add(login); made++;
      }
      return NextResponse.json({ ok: true, made, failed });
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
