import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import Hrms from "@/components/Hrms";

export const dynamic = "force-dynamic";

/**
 * /hrms — its own URL, and its own door.
 *
 * The check runs HERE as well as on every /api/hrms route; the routes do not
 * trust this page, and this page does not do the routes' job for them.
 *
 * Everybody who is not admitted gets the SAME page, whether they are signed
 * out, disabled, or signed in and simply not on the list. That is deliberate:
 * three different answers would let somebody work out which one applies to
 * them, and the only thing an unauthorised visitor needs from this page is
 * where to go instead.
 */
export default async function HrmsPage() {
  const user = await currentUser();
  // Signed out, disabled, or signed in without the grant — one answer for all
  // three. Distinguishing them would tell an unauthorised visitor which of the
  // three they are, which is the one thing they should not learn here.
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    // Dr Raghu's own wording, 22 Aug 2026. It says nothing about what is
    // behind the door -- not what HRMS holds, not who has it, not even that
    // the page exists for somebody else. Somebody who has arrived here by
    // mistake is told where to go; somebody who has arrived deliberately
    // learns nothing they did not already know.
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "#F1EFE9", color: "#22303C" }}
      >
        <div className="text-center">
          <div className="font-bold" style={{ fontSize: 18 }}>
            You are not authorized to view this Page - Login at the right page
          </div>
          <a
            href="/login"
            className="inline-block mt-5 text-xs font-bold rounded px-4 py-2"
            style={{ background: "#E8600A", color: "#fff" }}
          >
            Go to the login page
          </a>
        </div>
      </div>
    );
  }

  return <Hrms email={user.email} isOwner={user.isOwner} />;
}
