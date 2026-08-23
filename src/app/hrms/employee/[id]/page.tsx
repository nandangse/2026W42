import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import EmployeeRecord from "@/components/hrms/EmployeeRecord";

export const dynamic = "force-dynamic";

/**
 * /hrms/employee/<id> — one record, editable, in its own tab.
 *
 * Same door as /hrms, and the same answer to anybody who is not admitted.
 */
export default async function EmployeeRecordPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F1EFE9", color: "#22303C" }}>
        <div className="text-center">
          <div className="font-bold" style={{ fontSize: 18 }}>
            You are not authorized to view this Page - Login at the right page
          </div>
          <a href="/login" className="inline-block mt-5 text-xs font-bold rounded px-4 py-2" style={{ background: "#E8600A", color: "#fff" }}>
            Go to the login page
          </a>
        </div>
      </div>
    );
  }
  return (
    <EmployeeRecord
      id={decodeURIComponent(params.id)}
      email={user!.email}
      initials={user!.initials}
      displayName={user!.displayName}
    />
  );
}
