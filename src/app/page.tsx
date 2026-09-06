import { redirect } from "next/navigation";
import { currentUser, RAGHU_EMAIL } from "@/lib/auth";
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
  }

  return (
    <PlanningSuite
      email={user.email}
      role={user.role}
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
