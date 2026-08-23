import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import IdpDiscussion from "@/components/IdpDiscussion";

export const dynamic = "force-dynamic";

/**
 * genie.nandan.co.in/idp — everybody's own IDP.
 *
 * NOT behind the HRMS gate. HRMS is for three people; this is for everybody
 * who works here, reached with the Genie login they already have. They see
 * their own and only their own: every query behind it is scoped to the
 * caller's email, so there is no parameter that could name somebody else.
 */
export default async function IdpPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  return <IdpDiscussion name={user.displayName || user.email.split("@")[0]} initials={user.initials} />;
}
