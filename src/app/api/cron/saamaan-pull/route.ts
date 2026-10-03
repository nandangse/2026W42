import { NextResponse } from "next/server";
import { beat } from "@/lib/cron-beat";
import { adminClient } from "@/lib/supabase/admin";
import { PULL_PHASES, pullPhase } from "@/lib/saamaan-pull";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE FOUR-HOURLY ERP PULL FOR SAAMAAN (Dr Raghu, 3 Oct 2026: "currently it
 * is dependent upon Mukesh, me, or Pankaj pulling it whenever we want it.
 * Please also add this into a cron job so that, once every 4 hours, it will
 * keep pulling it. It will pull it once at 6 am in the morning, then put in
 * a schedule of 4 hours each, and then it should stop at 8 pm").
 *
 * vercel.json fires this at 06:00, 10:00, 14:00 and 18:00 IST (00:30, 04:30,
 * 08:30, 12:30 UTC). The next slot would be 22:00, past his 8 pm, so the day
 * ends at 18:00 and starts again at 06:00. Same seven phases as the button,
 * same code (lib/saamaan-pull), in the same order.
 *
 * THE RECORD ("keep records of this so that it is happening"): every phase
 * writes its own row into material_pull with by = cron@genie, exactly as a
 * hand's pull does — the ledger on Saamaan → ERP pull shows them side by
 * side. And the cron beats fired/done/failed into crm_audit like every
 * other cron, so a day it did not run is a query, not a guess.
 *
 * A whole walk takes about two and a half minutes today (the 22,000 items
 * are two of them). The budget below stops the walk before Vercel would, and
 * says which phase it stopped at — the next slot picks up from the top.
 */
const BUDGET_MS = 270_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret) { await beat("saamaan-pull", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) { await beat("saamaan-pull", "failed", { error: "cron call did not carry the CRON_SECRET" }); return NextResponse.json({ error: "The cron, or nobody." }, { status: 401 }); }
  await beat("saamaan-pull", "fired");
  const t0 = Date.now();
  const done: Record<string, { found: number; written: number; removed: number; ms: number }> = {};
  let stopped = "";
  try {
    for (const phase of PULL_PHASES) {
      if (Date.now() - t0 > BUDGET_MS) { stopped = phase; break; }
      const p0 = Date.now();
      const r = await pullPhase(phase, "cron@genie");
      done[phase] = { found: r.found, written: r.written, removed: r.removed, ms: Date.now() - p0 };
    }
    const out = { ok: !stopped, phases: done, stopped_before: stopped || null, ms: Date.now() - t0 };
    if (stopped) {
      try { await adminClient().from("material_pull").insert({ phase: stopped, found: 0, written: 0, removed: 0, by: "cron@genie", note: `cron ran out of time before this phase — ${Object.keys(done).length} of ${PULL_PHASES.length} phases done in ${Math.round((Date.now() - t0) / 1000)}s; the next slot starts again from items` }); } catch { /* the beat carries it */ }
    }
    await beat("saamaan-pull", stopped ? "failed" : "done", out);
    return NextResponse.json(out);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const failedAt = PULL_PHASES[Object.keys(done).length] || "?";
    try { await adminClient().from("material_pull").insert({ phase: failedAt, found: 0, written: 0, removed: 0, by: "cron@genie", note: `cron failed: ${error.slice(0, 240)}` }); } catch { /* the beat carries it */ }
    await beat("saamaan-pull", "failed", { error: error.slice(0, 300), phases: done, failed_at: failedAt });
    return NextResponse.json({ ok: false, error, phases: done, failed_at: failedAt }, { status: 500 });
  }
}
