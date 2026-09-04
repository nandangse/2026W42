import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import HrQueries from "@/components/hrms/HrQueries";
import { LOGO } from "@/lib/logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "HR Queries · Nandan GSE" };

/**
 * /hrms/query — the "How can we help you?" form for ANY Genie login.
 *
 * HRMS itself is a granted door; the form is not. A person who cannot open
 * HRMS still needs to put a question to HR, so the form has its own page,
 * behind the plain login and nothing else. Inside HRMS the same screen sits
 * under HR Queries with the "for others" button for HR.
 */
export default async function HrQueryPage() {
  const user = await currentUser();
  if (!user || user.disabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F1EFE9", color: "#22303C" }}>
        <div className="text-center">
          <div className="font-bold" style={{ fontSize: 18 }}>Please sign in to put a question to HR</div>
          <a href="/login?next=/hrms/query" className="inline-block mt-5 text-xs font-bold rounded px-4 py-2" style={{ background: "#E8600A", color: "#fff" }}>Go to the login page</a>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9" }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16232F", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Nandan GSE" style={{ height: 26, background: "#fff", borderRadius: 4, padding: "2px 6px" }} />
        <div><div className="font-bold" style={{ fontSize: 15 }}>HR Queries</div><div className="text-xs" style={{ color: "#8FA1B3" }}>How can we help you? · हम आपकी किस प्रकार मदद कर सकते हैं?</div></div>
        <span style={{ flex: 1 }} />
        <span className="text-xs" style={{ color: "#8FA1B3" }}>{user.displayName || user.email}</span>
      </div>
      <HrQueries who={user.displayName || user.email} standalone />
    </div>
  );
}
