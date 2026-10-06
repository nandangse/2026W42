import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { runDbm } from "@/lib/kanban-shelf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/kanban-daily — the Kanban's daily DBM step, 06:30 IST
 * (vercel.json). Dynamic buffer management works on days: the zone each
 * item is in is recorded once a day, and a target grows after one lead
 * time of red or shrinks after three of green. Without a daily read the
 * counters would only move when somebody pressed a button.
 *
 * The cron's secret, or a signed-in hand — the same rule as every Genie cron.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The daily cron, or a signed-in hand.");
    }
    const r = await runDbm(adminClient(), "cron@genie", "daily");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return errJson(e);
  }
}
