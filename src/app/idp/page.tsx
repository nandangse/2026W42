import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import IdpDiscussion from "@/components/IdpDiscussion";
import { idpSession } from "@/lib/idp-session";
import { firstName } from "@/lib/person-name";
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
/* The two faces the design uses — Barlow for headings and figures, Source
   Sans 3 for reading. Both fall back to the system stack if the network is
   poor, which on a shop floor it often is. */
export const metadata = { title: "Nandan Genie" };

export default async function IdpPage() {
  const user = await currentUser();
  if (user && !user.disabled)
    return <IdpDiscussion name={firstName(user.displayName) || user.email.split("@")[0]} initials={user.initials} />;

  /**
   * NOT EVERY EMPLOYEE HAS A GENIE LOGIN (Dr Raghu, 7 Sep 2026: "whoever is
   * logged into Genie already can access their records; whoever is not can
   * use their personal email ID"). The workers sign in with the personal
   * address and the password HR issued, which sets its own cookie.
   */
  const who = await idpSession();
  if (who) {
    const { data } = await adminClient().from("hrms_employees").select("name").eq("id", who).maybeSingle();
    /* HIS OWN LETTERS, NOT "??" (Dr Raghu, 7 Sep 2026: "the name on right top
       is also corner"). A man who signed in with the password HR sent him is
       as known to us as one with a Genie login; the corner said ?? only
       because nobody had worked his initials out. */
    const full = String(data?.name || "").trim();
    const ini = full.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || null;
    return <IdpDiscussion name={firstName(full || String(who))} initials={ini} />;
  }
  redirect("/idp/sign-in");
}
