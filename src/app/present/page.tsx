import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { idpSession } from "@/lib/idp-session";
import PresentScreen from "@/components/PresentScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance — Nandan Genie" };

/**
 * genie.nandan.co.in/present (Dr Raghu, 8 Sep 2026: "the guy would login from
 * his IDP then do attendance. The dedicated screen for the same is present").
 *
 * The same two doors as /idp: a Genie login, or the IDP cookie the two
 * hundred men without one carry. Anyone else is sent to sign in rather than
 * shown a screen that cannot work.
 */
export default async function PresentPage() {
  const eid = await idpSession();
  if (!eid) {
    const u = await currentUser();
    if (!u || u.disabled) redirect("/idp/sign-in?next=/present");
  }
  return <PresentScreen />;
}
