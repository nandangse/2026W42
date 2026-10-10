import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/lc/people — every active employee on the HRMS rolls, for the
 * attendees pick-list (Dr Raghu, 10 Oct 2026: "employees first, then
 * mention non-employees"). Name, designation, department; paged, because
 * PostgREST stops at a thousand without a word.
 */
export async function GET() {
  try {
    await requireLeader();
    const admin = adminClient();
    const out: { name: string; designation: string | null; department: string | null; email: string | null }[] = [];
    try {
      const t = await hrmsTables(admin);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from(t.employees).select("name, designation, department, email, user_email, active").eq("active", true).order("name").range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) if (r.name) out.push({ name: String(r.name).trim(), designation: r.designation || null, department: r.department || null, email: (r.user_email || r.email || null)?.toLowerCase() || null });
        if (!data || data.length < 1000) break;
      }
    } catch { /* no HRMS tables: the council alone */ }
    return NextResponse.json({ people: out });
  } catch (e) { return errJson(e); }
}
