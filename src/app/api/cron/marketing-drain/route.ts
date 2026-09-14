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

    /**
     * IS IT THE FILTER, OR IS IT THE CLIENT? (14 Sep 2026, third pass.)
     *
     * The second diagnostic made the contradiction plain rather than
     * solving it: `.select("status")` saw {draft: 1, sending: 1} and, in the
     * same process a millisecond later, the same table filtered to
     * status = sending returned no rows AND no error. Both cannot be true.
     *
     * Two things are being tested at once there, so this separates them,
     * and it uses DRAFT as the fixture — the draft campaign is always there
     * and draining never touches it, so the probe survives a campaign
     * finishing and costs nothing.
     *
     *   jsDraft   the drain's exact shape, through supabase-js
     *   rawDraft  the same question over plain HTTP, no client at all
     *
     * One equals one: filtered reads are sound, and the sending failure was
     * particular to that row or that moment — the probe stays in and catches
     * it live next time. Zero and one: the client is the fault. Zero and
     * zero: PostgREST answers Vercel differently from a laptop, and rawHttp
     * carries the status code that says how.
     *
     * Only counts and a status code are recorded. Never the key.
     */
    const { data: jsD } = await db
      .from("mk_campaign")
      .select("id, name, subject, body_html, channel_ids, speed_per_hour, status")
      .eq("status", "draft");
    let rawDraft = -1, rawHttp = 0;
    try {
      const qs = new URLSearchParams({ select: "id,name,status", status: "eq.draft" });
      const rr = await fetch(`${process.env.CRM_SUPABASE_URL}/rest/v1/mk_campaign?${qs.toString()}`, {
        headers: {
          apikey: String(process.env.CRM_SUPABASE_SERVICE_KEY),
          authorization: `Bearer ${String(process.env.CRM_SUPABASE_SERVICE_KEY)}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      rawHttp = rr.status;
      const j = await rr.json().catch(() => null);
      rawDraft = Array.isArray(j) ? j.length : -2;
    } catch { rawHttp = -1; }

    const r = await drain(db);
    await beat("marketing-drain", "done", {
      ...r,
      crmHost: host,
      campaignsVisible: (seen || []).length,
      byStatus: tally,
      seeError: seenErr ? String(seenErr.message).slice(0, 160) : null,
      sendingSeen: (same || []).length,
      sameError: sameErr ? String(sameErr.message).slice(0, 200) : null,
      jsDraft: (jsD || []).length,
      rawDraft, rawHttp,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("marketing-drain", "failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
