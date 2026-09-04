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
  // Open to all (Dr Raghu, 4 Sep 2026: "will this be visible open?") — the
  // form needs no login; a login only adds the list of one's own queries.
  const user = await currentUser();
  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9" }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16232F", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Nandan GSE" style={{ height: 26, background: "#fff", borderRadius: 4, padding: "2px 6px" }} />
        <div><div className="font-bold" style={{ fontSize: 15 }}>HR Queries</div><div className="text-xs" style={{ color: "#8FA1B3" }}>How can we help you? · हम आपकी किस प्रकार मदद कर सकते हैं?</div></div>
        <span style={{ flex: 1 }} />
        <span className="text-xs" style={{ color: "#8FA1B3" }}>{user ? (user.displayName || user.email) : <a href="/login?next=/hrms/query" style={{ color: "#F5B32B" }}>Sign in to see your earlier queries</a>}</span>
      </div>
      <HrQueries who={user ? (user.displayName || user.email) : "open form"} standalone />
    </div>
  );
}
