import { NextResponse } from "next/server";
import { crmDb, crmConfigured } from "@/crm/db";
import { beat } from "@/lib/cron-beat";
import { pageAll } from "@/lib/page-all";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE CAMPAIGN FIGURES, REFRESHED ON THE CURVE THEY ACTUALLY MOVE ON.
 *
 * Dr Raghu, 15 Sep 2026: "for the first 2 days 30 mins, for the next week
 * 1 hr, for the time after that once a day — in a cron so we can get the data
 * without it calculating everytime."
 *
 * A campaign's numbers go quiet with age. Nearly everything happens in the
 * first forty-eight hours; opens trail off across the week; after that a
 * figure moves perhaps once a month, when somebody finally reads an old mail
 * or a bounce arrives late. Refreshing all of them every half hour for ever
 * would spend most of its effort re-counting things that finished moving in
 * August.
 *
 * The pass runs every thirty minutes and only touches what is DUE. A campaign
 * still sending is always due, whatever its age — that is the one case where
 * the screen and the truth must not drift.
 */
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** How long this campaign's figures may stand before they are re-counted. */
function staleAfter(startedAt: string | null, createdAt: string, status: string): number {
  if (status === "sending") return 0;                 // always due
  const began = new Date(startedAt || createdAt).getTime();
  const age = Date.now() - began;
  if (age < 2 * DAY) return 30 * MIN;
  if (age < 9 * DAY) return HOUR;
  return DAY;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret) { await beat("marketing-stats", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set on Vercel" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) { await beat("marketing-stats", "failed", { error: "cron call did not carry the CRON_SECRET" }); return NextResponse.json({ error: "The cron, or nobody." }, { status: 401 }); }
  if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured" });
  await beat("marketing-stats", "fired");

  try {
    const db = crmDb();
    type Row = { id: string; status: string; started_at: string | null; created_at: string; stat_at: string | null };
    let camps: Row[];
    try {
      camps = await pageAll<Row>((f, t) => db.from("mk_campaign").select("id, status, started_at, created_at, stat_at").range(f, t), "campaigns");
    } catch (e) {
      /* Before 0070 the columns are not there. Say so plainly rather than
         failing in a way that looks like "no campaigns". */
      const msg = e instanceof Error ? e.message : String(e);
      if (/stat_at|stat_cache/i.test(msg)) { await beat("marketing-stats", "done", { skipped: "run CRM migration 0070" }); return NextResponse.json({ ok: true, note: "run CRM migration 0070" }); }
      throw e;
    }

    const now = Date.now();
    const due = camps.filter((c) => {
      const allowed = staleAfter(c.started_at, c.created_at, c.status);
      if (!c.stat_at) return true;                       // never counted
      return now - new Date(c.stat_at).getTime() >= allowed;
    });

    if (!due.length) {
      await beat("marketing-stats", "done", { campaigns: camps.length, refreshed: 0, note: "nothing was due" });
      return NextResponse.json({ ok: true, campaigns: camps.length, refreshed: 0 });
    }

    /* One query for every due campaign's tally, counted in the database. */
    type Stat = { campaign_id: string; contacts: number; queued: number; sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number; failed: number; skipped: number };
    const stats = new Map<string, Stat>();
    const ids = due.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 200) {
      const r = await db.from("mk_campaign_stat").select("*").in("campaign_id", ids.slice(i, i + 200));
      if (r.error) {
        await beat("marketing-stats", "failed", { error: `mk_campaign_stat: ${r.error.message}`.slice(0, 200), note: "run CRM migration 0069" });
        return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
      }
      for (const x of (r.data as unknown as Stat[]) || []) stats.set(String(x.campaign_id), x);
    }

    const at = new Date().toISOString();
    let written = 0, failed = 0;
    for (const c of due) {
      const x = stats.get(c.id);
      /* A campaign nobody has been queued for has no row in the view; that is
         a real answer — all noughts — not a reason to leave it uncounted. */
      const snap = x
        ? { contacts: x.contacts, queued: x.queued, sent: x.sent, delivered: x.delivered, opened: x.opened, bounced: x.bounced, unsubscribed: x.unsubscribed, failed: x.failed, skipped: x.skipped }
        : { contacts: 0, queued: 0, sent: 0, delivered: 0, opened: 0, bounced: 0, unsubscribed: 0, failed: 0, skipped: 0 };
      const { error } = await db.from("mk_campaign").update({ stat_cache: snap, stat_at: at }).eq("id", c.id);
      if (error) failed++; else written++;
    }

    const out = { campaigns: camps.length, due: due.length, refreshed: written, failed };
    await beat("marketing-stats", "done", out);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("marketing-stats", "failed", { error: error.slice(0, 200) });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
