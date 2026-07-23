import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "planner", "uploader"];

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
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const admin = adminClient();
    const body = await req.json();

    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const role: Role = ROLES.includes(body.role) ? body.role : "planner";
      if (!email || !body.password)
        return NextResponse.json({ error: "email and password required" }, { status: 400 });
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
      const { error } = await admin.from("profiles").update({ role }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "disable") {
      const { error } = await admin
        .from("profiles")
        .update({ disabled: !!body.disabled })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
