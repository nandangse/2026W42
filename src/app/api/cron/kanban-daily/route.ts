import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { cronCaller } from "@/lib/cron-auth";
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
    /* the cron's secret, or the owner / Stratcom / the hands named (audit S12, 9 Oct 2026) */
    const { fromCron } = await cronCaller(req, "kanban-daily");
    const r = await runDbm(adminClient(), "cron@genie", "daily");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return errJson(e);
  }
}
