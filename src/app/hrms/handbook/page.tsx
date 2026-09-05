import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import Handbook from "@/components/hrms/Handbook";
import { LOGO } from "@/lib/logo";
import { adminClient } from "@/lib/supabase/admin";
import { people } from "@/lib/hrms-wa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Employee Handbook · Nandan GSE" };

/**
 * /hrms/handbook — the Employee Handbook for every Genie login. HRMS is a
 * granted door; the handbook is not. Inside HRMS the same screen carries the
 * editor and the answering; here it reads, asks, and acknowledges.
 */
export default async function HandbookPage() {
  const user = await currentUser();
  if (!user || user.disabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F1EFE9", color: "#22303C" }}>
        <div className="text-center">
          <div className="font-bold" style={{ fontSize: 18 }}>Please sign in to read the Employee Handbook</div>
          <a href="/login?next=/hrms/handbook" className="inline-block mt-5 text-xs font-bold rounded px-4 py-2" style={{ background: "#E8600A", color: "#fff" }}>Go to the login page</a>
        </div>
      </div>
    );
  }
  // Labour reads Hindi first (Dr Raghu, 5 Sep 2026); everyone can switch.
  let defaultLang: "en" | "hi" = "en";
  try {
    const me = (await people(adminClient())).find((p) => String((p as { email?: string | null }).email || "").toLowerCase() === user.email.toLowerCase());
    if (me && /labour/i.test(String(me.type || ""))) defaultLang = "hi";
  } catch { /* the record is optional here */ }
  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9" }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#16232F", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Nandan GSE" style={{ height: 26, background: "#fff", borderRadius: 4, padding: "2px 6px" }} />
        <div><div className="font-bold" style={{ fontSize: 15 }}>Employee Handbook</div><div className="text-xs" style={{ color: "#8FA1B3" }}>How things work at Nandan GSE · read, ask, acknowledge</div></div>
        <span style={{ flex: 1 }} />
        <span className="text-xs" style={{ color: "#8FA1B3" }}>{user.displayName || user.email}</span>
      </div>
      <Handbook who={user.displayName || user.email} standalone defaultLang={defaultLang} />
    </div>
  );
}
