import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { erpConfig, erpSync, type Winner } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/erp-sync — every hour at :05 (Dr Raghu, 4 Sep 2026: "run
 * the cron every hour. All the changes made in the Genie push to the ERP
 * and the changes made in ERP push here").
 *
 * PUSH FIRST, THEN PULL. The order is the whole safety of it: what Genie
 * changed goes up before what the ERP holds comes down, so a date moved in
 * Genie at 10:40 is in Jobmaster by 11:05 and the 11:05 pull brings it back
 * unchanged. Pull first and the ERP's older date would overwrite the edit
 * before it ever travelled -- the very fault chased on 2 September.
 *
 * AND IF THE PUSH FAILS, THERE IS NO PULL. A pull over unpushed edits is
 * the clobber above; better an hour behind than an hour wrong.
 *
 * THE SATURDAY RULE: "currently people are working in ERP and then they
 * will work in the Genie only from saturday." Until 6 September 2026 a
 * field that differs on both sides goes the ERP's way; from that day, it
 * goes Genie's. One date, one line, so the flip is a fact and not a
 * memory.
 */
const GENIE_WINS_FROM = "2026-09-06";
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled || !u.isOwner) throw new HttpError(401, "The hourly cron, or Raghu.");
    }
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM (and the ERP keys) not configured." });
    const cfg = await erpConfig(crmDb());
    if ("error" in cfg) return NextResponse.json({ ok: false, note: cfg.error });
    const genie = adminClient();
    const fallback: Winner = istToday() >= GENIE_WINS_FROM ? "genie" : "erp";

    // 1. PUSH — the button's own road, signed as the cron
    let push: Record<string, unknown> = {};
    if (!secret) return NextResponse.json({ ok: false, note: "CRON_SECRET is not set, so the cron cannot push." });
    const pr = await fetch(new URL("/api/erp-update", req.url), {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "push" }),
    });
    push = (await pr.json().catch(() => ({}))) as Record<string, unknown>;
    if (!pr.ok) {
      await genie.from("erp_sync_log").insert({ by: "cron", dry: false, ok: false, error: `push failed (${pr.status}) — pull skipped: ${String(push.error || "").slice(0, 300)}` }).then(() => null, () => null);
      return NextResponse.json({ ok: false, step: "push", push, note: "Push failed, so the pull was skipped — a pull over unpushed edits would overwrite them." }, { status: 502 });
    }

    // 2. PULL — the ERP's word comes down, with the day's winner
    try {
      const out = await erpSync(genie, cfg, { dry: false, fallback });
      await genie.from("erp_sync_log").insert({
        by: "cron", dry: false, ok: true,
        jobs_new: out.jobs.created, jobs_changed: out.jobs.changed, jobs_archived: out.jobs.archived,
        proj_new: out.projects.created, proj_changed: out.projects.changed,
        deliv_new: out.delivered.created, deliv_changed: out.delivered.changed,
        changes: out.changes, notes: [...(out.notes || []), `winner on a difference: ${fallback}`], seconds: out.seconds,
      }).then(() => null, () => null);
      return NextResponse.json({ ok: true, fallback, push: { pushed: push.pushed, rejected: push.rejected, notInErp: push.notInErp }, pull: { jobs: out.jobs, projects: out.projects, delivered: out.delivered, seconds: out.seconds } });
    } catch (e) {
      await genie.from("erp_sync_log").insert({ by: "cron", dry: false, ok: false, error: `pull: ${String(e instanceof Error ? e.message : e).slice(0, 400)}` }).then(() => null, () => null);
      throw e;
    }
  } catch (e) {
    return errJson(e);
  }
}
