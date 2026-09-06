import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import type { Metadata } from "next";
import LMS from "@/components/LMS";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Learning" };

/**
 * genie.nandan.co.in/lms — the library at its own URL (Dr Raghu, 29 Aug 2026).
 *
 *   /lms              the LMS itself
 *   /lms/4271         the lesson wearing that 4-digit code
 *   /lms/wcm-kaizen   the book wearing that slug (two words max, dashed)
 *
 * The key resolves client-side once the library loads, so one page serves
 * all three shapes; the address bar then follows whatever stands open —
 * every lesson and book has a URL worth pasting into WhatsApp.
 */
export default async function LmsPage({ params }: { params: { key?: string[] } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  const key = (params.key?.[0] || "").slice(0, 60) || null;
  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EC" }}>
      <div className="mx-auto px-4 py-4" style={{ maxWidth: 1240 }}>
        <a href="/" className="text-xs font-bold" style={{ color: "var(--dim)" }}>← Genie</a>
        <LMS initialKey={key} />
      </div>
    </div>
  );
}
