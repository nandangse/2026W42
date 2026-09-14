import { NextResponse } from "next/server";
import { crmDb, crmConfigured } from "@/crm/db";
import { drain } from "@/lib/marketing-send";
import { beat } from "@/lib/cron-beat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every ten minutes: one pass over every sending campaign, at its speed, within each channel's limits. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret) { await beat("marketing-drain", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set on Vercel" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) { await beat("marketing-drain", "failed", { error: "cron call did not carry the CRON_SECRET" }); return NextResponse.json({ error: "The cron, or nobody." }, { status: 401 }); }
  if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured" });
  await beat("marketing-drain", "fired");
  try {
    /**
     * WHICH DATABASE, AND WHAT DOES IT SEE? (14 Sep 2026.)
     *
     * Four passes in a row reported "campaigns: 0" while a campaign sat
     * plainly at status = sending, and the identical query returns that
     * campaign from a laptop using the same service key. One of the two is
     * looking at something different from the other, and guessing which has
     * cost an afternoon.
     *
     * So the heartbeat now carries the CRM's HOST — never the key, never a
     * secret, just which project answered — and a tally of campaigns by
     * status as this process sees them. If the host is wrong the answer is
     * an environment variable; if the host is right and the tally is empty,
     * the answer is permissions. Either way it is one pass away instead of
     * an afternoon of inference.
     */
    const db = crmDb();
    const host = (() => { try { return new URL(String(process.env.CRM_SUPABASE_URL)).host; } catch { return "unreadable"; } })();
    const { data: seen, error: seenErr } = await db.from("mk_campaign").select("status");
    const tally: Record<string, number> = {};
    for (const x of seen || []) tally[String(x.status)] = (tally[String(x.status)] || 0) + 1;

    /**
     * AND THE SAME QUESTION THE DRAIN ASKS (14 Sep 2026, second pass).
     *
     * The first diagnostic answered half of it: the host is right
     * (ixzwpgexrumdirtqzoxz), the campaign is visible, the read returned no
     * error — and the drain still found nothing. So the fault is no longer
     * "which database"; it is inside the drain's own query.
     *
     * This asks the drain's exact question in the same process, a moment
     * before the drain asks it, and reports what came back. Two answers that
     * disagree cannot both be right, and this is the line where they meet:
     * if `sendingSeen` is 1 and `campaigns` is 0, the difference is in the
     * drain; if both are 0 while the tally says otherwise, it is the filter.
     */
    const { data: same, error: sameErr } = await db
      .from("mk_campaign")
      .select("id, name, subject, body_html, channel_ids, speed_per_hour, status")
      .eq("status", "sending");

    const r = await drain(db);
    await beat("marketing-drain", "done", {
      ...r,
      crmHost: host,
      campaignsVisible: (seen || []).length,
      byStatus: tally,
      seeError: seenErr ? String(seenErr.message).slice(0, 160) : null,
      sendingSeen: (same || []).length,
      sameError: sameErr ? String(sameErr.message).slice(0, 200) : null,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("marketing-drain", "failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
