import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import RoleRecord from "@/components/hrms/RoleRecord";

export const dynamic = "force-dynamic";

/**
 * HRMS opens in its own tabs — a record, an employee, a role — and every one of them
 * should say which app it is. Without this they all read "Nandan Works Planning
 * Suite" and a row of tabs becomes unnavigable.
 */
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/** /hrms/role/<id> — one role, editable, in its own tab. Same door as HRIS. */
export default async function RoleRecordPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--paper)", color: "var(--ink)" }}>
        <div className="text-center">
          <div className="font-bold" style={{ fontSize: 18 }}>
            You are not authorized to view this Page - Login at the right page
          </div>
          <a href="/login" className="inline-block mt-5 text-xs font-bold rounded px-4 py-2" style={{ background: "var(--accent)", color: "#fff" }}>
            Go to the login page
          </a>
        </div>
      </div>
    );
  }
  return (
    <RoleRecord
      id={params.id}
      email={user!.email}
      initials={user!.initials}
      displayName={user!.displayName}
      isOwner={user!.isOwner}
    />
  );
}
