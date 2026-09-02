import { NextResponse } from "next/server";
import { errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * IMS → Settings — the approval mode, and who is what.
 *
 * WHY ROLES ARE SET HERE AND NOT ON THE ADMIN PAGE. Admin → module access
 * answers one question — may this person open the IMS at all — and it is the
 * owner's tick, the same as every other module. Which of them is the MR,
 * which head owns which department, and who audits is a question about the
 * MANAGEMENT SYSTEM, and the MR is the person who knows the answer. So the
 * tick lets somebody in as a `member` and the MR promotes them here.
 */
export async function GET() {
  try {
    await requireIms();
    const db = imsDb();
    const [settings, grants] = await Promise.all([
      db.from("ims_settings").select("approval_mode").eq("id", 1).maybeSingle(),
      db.from("ims_access").select("email, role, department").order("email"),
    ]);
    if (grants.error && notInstalled(grants.error.message))
      return NextResponse.json({ installed: false, approvalMode: "two_step", grants: [] });
    return NextResponse.json({
      installed: true,
      approvalMode: settings.data?.approval_mode ?? "two_step",
      grants: grants.data ?? [],
      // Named so the screen can explain why the owner has no row and no
      // dropdown, instead of appearing to have lost them.
      ownerEmail: RAGHU_EMAIL,
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action, ... }
 *   approval_mode { mode }             — two_step | single
 *   set_role      { email, role, department }
 */
export async function POST(req: Request) {
  try {
    const me = await requireImsAdmin();
    const body = await req.json();
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "approval_mode") {
      const mode = String(body.mode || "");
      need(mode === "two_step" || mode === "single", "The approval mode is two_step or single.");
      const { error } = await db
        .from("ims_settings")
        .update({ approval_mode: mode, updated_by: me.email, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw new Error(error.message);
      await log(me, "ims_settings", "1", "approval_mode", { mode });
      return ok({ approvalMode: mode });
    }

    if (action === "set_role") {
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "");
      need(email, "Which person?");
      need(["ims_admin", "dept_head", "auditor", "member"].includes(role), "Unknown role.");
      // The owner has no row on purpose — they are the MR implicitly, and a
      // row that could be edited is a row that could lock the module's only
      // administrator out of it.
      if (email === RAGHU_EMAIL)
        throw new HttpError(400, "The owner is the MR implicitly and has no row to edit.");

      const { data: existing } = await db.from("ims_access").select("email").eq("email", email).maybeSingle();
      if (!existing)
        throw new HttpError(
          404,
          "That person has not been let into the IMS yet — tick IMS for them on Admin → module access first.",
        );

      const { error } = await db
        .from("ims_access")
        .update({ role, department: String(body.department || "") || null })
        .eq("email", email);
      if (error) throw new Error(error.message);
      await log(me, "ims_access", email, "set_role", { role, department: body.department });
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
