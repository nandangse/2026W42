import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import IdpDiscussion from "@/components/IdpDiscussion";
import { idpSession } from "@/lib/idp-session";
import { adminClient } from "@/lib/supabase/admin";

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
  if (user && !user.disabled)
    return <IdpDiscussion name={user.displayName || user.email.split("@")[0]} initials={user.initials} />;

  /**
   * NOT EVERY EMPLOYEE HAS A GENIE LOGIN (Dr Raghu, 7 Sep 2026: "whoever is
   * logged into Genie already can access their records; whoever is not can
   * use their personal email ID"). The workers sign in with the personal
   * address and the password HR issued, which sets its own cookie.
   */
  const who = await idpSession();
  if (who) {
    const { data } = await adminClient().from("hrms_employees").select("name").eq("id", who).maybeSingle();
    const nm = String(data?.name || who);
    return <IdpDiscussion name={nm.split(" ")[0]} initials={null} />;
  }
  redirect("/idp/sign-in");
}
