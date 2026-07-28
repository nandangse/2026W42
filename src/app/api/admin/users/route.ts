import { NextResponse } from "next/server";
import { requireAdmin, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "planner", "project_owner", "user", "viewer", "uploader"];

/** Normalise a 2-letter initials key, or null. Throws on a bad value. */
function normInitials(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2}$/.test(s)) throw new HttpError(400, "Initials must be exactly two letters (A–Z)");
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
export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await adminClient()
      .from("profiles")
      .select("id, email, role, disabled, initials, display_name, erp_owner, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ users: data || [] });
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

    if (body.action === "profile") {
      // edit initials / display name / the ERP "Project Owner" string to link to
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if ("initials" in body) patch.initials = normInitials(body.initials);
      if ("display_name" in body) patch.display_name = String(body.display_name || "").trim() || null;
      if ("erp_owner" in body) patch.erp_owner = String(body.erp_owner || "").trim() || null;
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

    if (body.action === "password") {
      if (!body.id || String(body.password || "").length < 8)
        return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
      const { error } = await admin.auth.admin.updateUserById(body.id, {
        password: body.password,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
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
