import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireIms } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ims/bootstrap — everything the shell needs, once.
 *
 * The caller's role and department, the approval mode, the people who can own
 * things, the standards and the registers. The screens read this instead of
 * each making its own trip for the same three lists.
 *
 * THE PEOPLE ARE GENIE'S PEOPLE. Now that the IMS lives in Genie's database
 * there is no mirror table to keep in step — the owner dropdowns are the
 * actual Genie accounts, named by the same id every other module uses. The
 * IMS role rides alongside from ims_access where a row exists.
 */
export async function GET() {
  try {
    const me = await requireIms();
    const db = imsDb();

    const [people, grants, standards, registers, settings] = await Promise.all([
      db.from("profiles").select("id, email, display_name, initials, disabled").eq("disabled", false).order("email"),
      db.from("ims_access").select("email, role, department"),
      db.from("ims_standard").select("id, code, name, sys, standard_copy_path").order("sort_order"),
      db.from("ims_register_definition").select("id, slug, name, sys, description, is_system").order("sort_order"),
      db.from("ims_settings").select("approval_mode").eq("id", 1).maybeSingle(),
    ]);

    // The IMS tables not existing yet is a migration that has not been run,
    // not an error. The screen says which one.
    if (standards.error && notInstalled(standards.error.message))
      return NextResponse.json({
        configured: true,
        installed: false,
        role: me.imsRole,
        department: me.department,
        profileId: me.profileId,
        approvalMode: "two_step",
        people: [],
        standards: [],
        registers: [],
        note: "Run supabase/migrations/0112_ims_core.sql and 0113_ims_seed.sql on Genie's project.",
      });

    const byEmail = new Map(
      (grants.data ?? []).map((g) => [String(g.email).toLowerCase(), g]),
    );

    return NextResponse.json({
      configured: true,
      installed: true,
      email: me.email,
      role: me.imsRole,
      department: me.department,
      profileId: me.profileId,
      approvalMode: settings.data?.approval_mode ?? "two_step",
      people: (people.data ?? []).map((p) => {
        const g = byEmail.get(String(p.email).toLowerCase());
        return {
          id: p.id,
          email: p.email,
          full_name: p.display_name || String(p.email).split("@")[0],
          initials: p.initials ?? null,
          // Only people actually admitted carry an IMS role. Everybody else
          // is here because they can still be named as an owner — being
          // responsible for a certificate is not the same as having a login
          // to the module.
          role: g ? String(g.role) : "",
          department: g?.department ?? null,
        };
      }),
      standards: standards.data ?? [],
      registers: registers.data ?? [],
    });
  } catch (e) {
    return errJson(e);
  }
}
