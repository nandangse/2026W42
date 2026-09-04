import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { drainHrmsQueue } from "@/lib/hrms-wa";
import { beat } from "@/lib/cron-beat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The WhatsApp queue drains itself (Dr Raghu, 4 Sep 2026): "send 10, 20,
 * 30, 40, 50 progressively every hour onwards."
 *
 * Every ten minutes. The hour's quota is the warm-up stage × 10 — stage 1
 * for the first hour in which HRMS messages went out, 2 for the second,
 * up to 5 (50 an hour) from the fifth hour on — never above Periskope's own
 * per-hour ceiling. Each run sends a sixth of the hour's quota, so the hour
 * fills evenly and no single run outlasts the function's five minutes at a
 * ten-second gap. Only HRMS rows: the CRM's queue stays a hand's.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const fromVercel = /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!secret) { await beat("wa-drain", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set on Vercel" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) {
    await beat("wa-drain", "failed", { error: fromVercel ? "cron call did not carry the CRON_SECRET" : "The hourly cron, or a signed-in hand." });
    return NextResponse.json({ error: "The hourly cron, or a signed-in hand." }, { status: 401 });
  }
  await beat("wa-drain", "fired");
  try {
    const r = await drainHrmsQueue(adminClient(), { perRunFraction: 6 });
    await beat("wa-drain", "done", r as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("wa-drain", "failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
