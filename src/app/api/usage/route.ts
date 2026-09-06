import { NextResponse } from "next/server";
import { requireUser, requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { istToday } from "@/lib/fmt";

export const dynamic = "force-dynamic";

/**
 * POST /api/usage — the shell's heartbeat: one call a minute while the tab
 * is visible, carrying how many /api requests the browser made since the
 * last beat. Adds a minute and the requests to today's row (5.0.1.0).
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const b = await readBody(req, { requests: "number?" });
    const admin = adminClient();
    const day = istToday();
    const { data: row } = await admin.from("genie_usage").select("minutes, requests").eq("user_id", u.id).eq("day", day).maybeSingle();
    const requests = Math.max(0, Math.min(500, Math.round(b.requests ?? 0)));
    if (row) {
      await admin.from("genie_usage").update({ minutes: row.minutes + 1, requests: row.requests + requests, last_seen: new Date().toISOString() }).eq("user_id", u.id).eq("day", day);
    } else {
      await admin.from("genie_usage").insert({ user_id: u.id, day, minutes: 1, requests });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

/** GET /api/usage?user=<id> — admin: the last 60 days for one person. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const user = new URL(req.url).searchParams.get("user") || "";
    if (!user) return NextResponse.json({ days: [] });
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await adminClient().from("genie_usage").select("day, minutes, requests, first_seen, last_seen").eq("user_id", user).gte("day", since).order("day", { ascending: false });
    if (error) {
      if (/genie_usage|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ days: [], installed: false });
      throw new Error(error.message);
    }
    return NextResponse.json({ days: data ?? [], installed: true });
  } catch (e) {
    return errJson(e);
  }
}
