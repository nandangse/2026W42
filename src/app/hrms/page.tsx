import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import Hrms from "@/components/Hrms";

export const dynamic = "force-dynamic";

/**
 * /hrms — its own URL, and its own door.
 *
 * The check runs HERE as well as on every /api/hrms route. Somebody who is
 * refused is told so plainly rather than bounced to the home page: a silent
 * redirect reads as a broken link, and they would try it again tomorrow.
 */
export default async function HrmsPage() {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");

  const allowed = await resolveHrmsAccess(adminClient(), user.email, user.isOwner);
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F1EFE9", color: "#22303C" }}>
        <div className="bg-white rounded-lg border p-6" style={{ borderColor: "#E2E0DA", maxWidth: 420 }}>
          <div className="font-bold mb-1">HRMS is not open to this account</div>
          <div className="text-sm" style={{ color: "#5A6672", lineHeight: 1.6 }}>
            It holds people records — dates of birth, contact details and next of kin — and is granted to
            named accounts only. Ask Dr Raghu if you need it.
          </div>
          <a href="/" className="inline-block mt-4 text-xs font-bold rounded px-3 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>
            ← Back to Genie
          </a>
        </div>
      </div>
    );
  }

  return <Hrms email={user.email} isOwner={user.isOwner} />;
}
