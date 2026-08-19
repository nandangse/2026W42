import { redirect } from "next/navigation";
import { currentUser, RAGHU_EMAIL } from "@/lib/auth";
import PlanningSuite from "@/components/PlanningSuite";
import MorningUpload from "@/components/MorningUpload";

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
