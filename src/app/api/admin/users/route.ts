import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "planner", "uploader"];

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
      .select("id, email, role, disabled, created_at")
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
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { role },
      });
      if (error) throw new Error(error.message);
      // handle_new_user() already inserted the profile; ensure the role sticks
      await admin.from("profiles").upsert(
        { id: data.user!.id, email, role, disabled: false },
        { onConflict: "id" },
      );
      return NextResponse.json({ ok: true, id: data.user!.id });
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
