import { NextResponse } from "next/server";
import { requireStratcom, errJson, HttpError } from "@/lib/auth";
import { ensureManpowerRollover } from "@/lib/manpower-rollover";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/manpower-rollover — 4:00 AM IST, from vercel.json, with no
 * interference from anyone: today's manpower rows are written for every job
 * on the floor before the first person walks in.
 *
 * Vercel signs its cron calls with CRON_SECRET when that env var is set; a
 * signed-in Stratcom hand may also fire it by hand. The work is idempotent
 * either way — a second run finds nothing to do.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      try {
        await requireStratcom();
      } catch {
        throw new HttpError(401, "The 4 AM cron or Stratcom only.");
      }
    }
    const result = await ensureManpowerRollover();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return errJson(e);
  }
}
