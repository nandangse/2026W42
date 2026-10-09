import { redirect } from "next/navigation";
import { currentUser, hasPlanningGrant, RAGHU_EMAIL } from "@/lib/auth";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import { mayUsePlanning } from "@/lib/planning-door";
import PlanningSuite from "@/components/PlanningSuite";
import MorningUpload from "@/components/MorningUpload";
import LabourHome from "@/components/LabourHome";
import StaffHome from "@/components/StaffHome";
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
  }
  /* A learner's only door is the library (audit S3) */
  if (user.lmsOnly) redirect("/lms");

  /**
   * PLANNING IS A DOOR — AND ITS OWN WORLD (Dr Raghu, 8 Sep 2026: "in this
   * we will want to go to Planning also"; 10 Oct 2026: "It is only applicable
   * to those people who are applied to the planning … Please stop that.
   * Make a plain vanilla front page for them").
   *
   * Migration 0161 seeded every login; 0214 narrowed the grant to the
   * planning roles and the rooms (LC, Stratcom, Management), the tick on
   * Admin → Users adding anyone else. A login without it — a worker, the
   * CMO, a sales login — lands on the plain page: birthdays, the thought,
   * their own doors, nothing from the floor. Admins are not exempt: the
   * tick decides. The owner always holds it.
   */
  if (!(await mayUsePlanning(adminClient(), user.email, user.isOwner)))
    return <StaffHome email={user.email} displayName={user.displayName} initials={user.initials} role={user.role} />;

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
