import { redirect } from "next/navigation";
import { currentUser, RAGHU_EMAIL } from "@/lib/auth";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import PlanningSuite from "@/components/PlanningSuite";
import MorningUpload from "@/components/MorningUpload";
import LabourHome from "@/components/LabourHome";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";

export const dynamic = "force-dynamic";

// Role routing (spec §2, §8): uploader (Shweta) lands on the Morning Update
// page ONLY; everyone else gets the full suite.
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.disabled) redirect("/login");

  if (user.role === "uploader") {
    return <MorningUpload email={user.email} />;
  }

  // Labour lands on their own sheet's door, not the planning boards
  // (Dr Raghu, 6 Sep 2026). The HRMS record's type decides; admins never
  // count as labour.
  if (user.role !== "admin") {
    try {
      const admin = adminClient();
      const t = await hrmsTables(admin);
      const e = user.email.toLowerCase();
      const { data } = await admin.from(t.employees).select("type").or(`user_email.eq.${e},email.eq.${e}`).eq("active", true).limit(1).maybeSingle();
      if (/labour/i.test(String(data?.type || "")))
        return <LabourHome email={user.email} displayName={user.displayName} initials={user.initials} role={user.role} />;
    } catch { /* no HRMS yet: the suite */ }

    /**
     * PLANNING IS A DOOR (Dr Raghu, 8 Sep 2026: "in this we will want to go to
     * Planning also" — of the Apps ticks on a login).
     *
     * Migration 0161 seeded every login that existed when it ran, so this took
     * nothing from anybody. Two guards keep it that way: an owner always holds
     * it, and if the TABLE is missing — the migration not yet run — everyone
     * passes, because an empty answer must not read as "nobody may come in".
     * A man without the tick is sent to his own sheet, which is the room he
     * actually wants.
     */
    try {
      const admin = adminClient();
      const { data: grant, error } = await admin.from("planning_access")
        .select("email").eq("email", user.email.toLowerCase()).maybeSingle();
      if (!error && !grant && !user.isOwner) redirect("/idp");
    } catch { /* pre-0161: Planning is open, as it always was */ }
  }

  /* the Saamaan tick opens the material dates and remarks (3 Oct 2026) */
  const saamaan = await resolveSaamaanAccess(adminClient(), user.email, user.isOwner).catch(() => false);
  return (
    <PlanningSuite
      email={user.email}
      role={user.role}
      saamaan={saamaan}
      initials={user.initials}
      displayName={user.displayName}
      erpOwner={user.erpOwner}
      isRaghu={user.email.toLowerCase() === RAGHU_EMAIL}
      lc={user.lc}
      stratcom={user.stratcom}
      management={user.management}
    />
  );
}
