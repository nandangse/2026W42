import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { serviceTeam } from "@/lib/seva-team";

export const dynamic = "force-dynamic";

/**
 * /api/seva/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD — the outdoor service
 * team's punches from /idp/attendance, for the Seva desk (12 Oct 2026):
 * every person on the team, each day's first in, last out, hours, where,
 * and the photos (signed for an hour).
 */
const BUCKET = "field-attendance";
const istDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    const to = ok(sp.get("to")) || istDay();
    const from = ok(sp.get("from")) || to;
    const [team, { data, error }] = await Promise.all([
      serviceTeam(admin),
      admin.from("seva_attendance").select("id, employee_id, employee_name, kind, at, day, lat, lng, accuracy_m, photo_path").gte("day", from).lte("day", to).order("at"),
    ]);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, team, punches: [] }); throw error; }
    const paths = (data || []).map((p) => String(p.photo_path)).filter(Boolean);
    const urls = new Map<string, string>();
    for (let i = 0; i < paths.length; i += 100) {
      const { data: s } = await admin.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
      for (const x of s || []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
    }
    return NextResponse.json({ installed: true, from, to, team, punches: (data || []).map((p) => ({ ...p, photo_url: urls.get(String(p.photo_path)) || null })) });
  } catch (e) { return errJson(e); }
}
