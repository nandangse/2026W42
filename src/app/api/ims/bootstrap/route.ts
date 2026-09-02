import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireIms } from "@/ims/auth";
import { imsConfigured, imsDb, notInstalled } from "@/ims/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ims/bootstrap — everything the shell needs, once.
 *
 * The caller's role and department, the approval mode, the people who can own
 * things, the standards and the registers. The screens read this instead of
 * each making its own trip for the same three lists.
 */
export async function GET() {
  try {
    const me = await requireIms();
    if (!imsConfigured())
      return NextResponse.json({
        configured: false,
        installed: false,
        role: me.imsRole,
        note: "Set IMS_SUPABASE_URL and IMS_SUPABASE_SERVICE_KEY, then run supabase-ims/migrations/ in order.",
      });

    const db = imsDb();
    const [people, standards, registers, settings] = await Promise.all([
      db.from("ims_profile").select("id, email, full_name, initials, role, department").eq("is_active", true).order("full_name"),
      db.from("ims_standard").select("id, code, name, sys, standard_copy_path").order("sort_order"),
      db.from("ims_register_definition").select("id, slug, name, sys, description, is_system").order("sort_order"),
      db.from("ims_settings").select("approval_mode").eq("id", 1).maybeSingle(),
    ]);

    if (people.error && notInstalled(people.error.message))
      return NextResponse.json({
        configured: true,
        installed: false,
        role: me.imsRole,
        note: "Run supabase-ims/migrations/0001_core.sql and 0002_seed.sql on the IMS project.",
      });

    return NextResponse.json({
      configured: true,
      installed: true,
      email: me.email,
      role: me.imsRole,
      department: me.department,
      profileId: me.profileId,
      approvalMode: settings.data?.approval_mode ?? "two_step",
      people: people.data ?? [],
      standards: standards.data ?? [],
      registers: registers.data ?? [],
    });
  } catch (e) {
    return errJson(e);
  }
}
