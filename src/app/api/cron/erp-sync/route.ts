import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { erpConfig, erpSync, type Winner } from "@/lib/erp-sync";
import { beat } from "@/lib/cron-beat";
import { isOn } from "@/lib/erp-hourly";
import { mayTouchErp, ERP_HANDS_REFUSAL } from "@/lib/erp-hands";

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
/**
 * SUPERSEDED THE SAME DAY: "right now sync all. whichever is a later entry
 * sync it" (Dr Raghu, 4 Sep 2026). The winner is no longer a date on the
 * calendar but the clock on each field -- see Winner "latest" in erp-sync.
 * The Saturday constant stays as the radio's default on the manual screen.
 */
const GENIE_WINS_FROM = "2026-09-06";

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    // beat BEFORE the door: a cron that fires and is refused must show as
    // exactly that (4 Sep 2026 -- this is how CRON_SECRET's absence was found)
    if (!fromCron && req.headers.get("user-agent")?.includes("vercel-cron"))
      await beat("erp-sync", "failed", { error: secret ? "cron call did not carry the CRON_SECRET" : "CRON_SECRET is not set on Vercel" });
    if (!fromCron) {
      /**
       * THE HOURLY CRON, OR THE HANDS THAT MIND THE ERP.
       *
       * Dr Raghu, 29 Sep 2026: "also let pankaj or mukesh make the cron."
       * They already see the Synchronize screen; it was the route behind the
       * button that was still owner-only, so the button existed for them and
       * refused them — the worst of both.
       *
       * The same list as Saamaan's pull and the hourly ticks: one list, in
       * lib/erp-hands, because a permission written in three places will
       * eventually disagree with itself.
       */
      const u = await currentUser();
      if (!u || u.disabled || (!u.isOwner && !mayTouchErp(u.email)))
        throw new HttpError(401, `The hourly cron, or ${ERP_HANDS_REFUSAL.replace(/^The ERP door is /, "")}`);
    }
    await beat("erp-sync", "fired", { fromCron });
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM (and the ERP keys) not configured." });
    const cfg = await erpConfig(crmDb());
    if ("error" in cfg) return NextResponse.json({ ok: false, note: cfg.error });
    const genie = adminClient();

    /**
     * THE TICKS ON THE SCREEN DECIDE (Dr Raghu, 16 Sep 2026: "tick the
     * documents which will refresh here"), and the winner with them: "in all
     * these decisions the later one wins!!!" is the default, not a constant,
     * because it is now his to change without a deploy.
     *
     * A database where 0168 has not run answers nothing, and nothing means
     * everything is on and the later edit wins — which is exactly what was
     * happening before the column existed.
     */
    const st = await genie.from("app_settings").select("erp_hourly, erp_winner").eq("id", true).maybeSingle();
    const ticks = (st.error ? {} : ((st.data?.erp_hourly ?? {}) as Record<string, unknown>));
    const want = { jobs: isOn(ticks, "jobs"), delivered: isOn(ticks, "delivered"), projects: isOn(ticks, "projects") };
    const fallback: Winner = (st.error ? "latest" : (String(st.data?.erp_winner || "latest") as Winner));

    if (!want.jobs && !want.delivered && !want.projects) {
      await beat("erp-sync", "done", { skipped: "every document is unticked on Synchronize to ERP" });
      return NextResponse.json({ ok: true, note: "Nothing is ticked to come down from the ERP." });
    }

    // 1. PUSH — the button's own road, signed as the cron
    let push: Record<string, unknown> = {};
    let pushFailed: { status: number; said: string } | null = null;
    if (!secret) return NextResponse.json({ ok: false, note: "CRON_SECRET is not set, so the cron cannot push." });
    /**
     * THE PUSH GOES TO THE PRODUCTION DOMAIN, NOT TO req.url.
     *
     * 29 Sep 2026, found in the heartbeat: every hourly pass since the
     * morning failed with 401 "Protected deployment" on the push step — and
     * therefore skipped the pull, so the board stopped moving.
     *
     * The cause was here, not in Vercel's settings. When the platform invokes
     * a cron, req.url is the DEPLOYMENT's own URL — the one that looks like
     * genie-abc123.vercel.app — and deployment URLs sit behind Vercel
     * Authentication even on a project whose production domain is open. So
     * the route was calling a door it had locked against itself, once an
     * hour, for hours, while genie.nandan.co.in answered anybody.
     *
     * Named explicitly, so the hop is to the address the world uses.
     */
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://genie.nandan.co.in";
    const pr = await fetch(new URL("/api/erp-update", origin), {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "push" }),
    });
    /**
     * WHAT THE PUSH ACTUALLY SAID (16 Sep 2026).
     *
     * Twenty-six hourly passes in a row logged `push failed (401) — pull
     * skipped: [object Object]`, which names the symptom and hides the
     * cause: an object was put through String(), and the one line that would
     * have explained a day of failures became four words of nothing.
     *
     * It matters WHICH 401 this is. Genie's own route answers JSON — that
     * would mean the CRON_SECRET the caller signs with is not the one the
     * callee reads. A platform answering HTML means the hop never reached
     * the route at all, and the fix is deployment protection, not a secret.
     * The content type tells those two apart, so it is recorded.
     */
    const ctype = pr.headers.get("content-type") || "";
    const raw = await pr.text();
    try { push = JSON.parse(raw) as Record<string, unknown>; } catch { push = { error: raw.slice(0, 300) }; }
    if (!pr.ok) {
      const said = typeof push.error === "string" ? push.error : JSON.stringify(push.error ?? push);
      await genie.from("erp_sync_log").insert({ by: "cron", dry: false, ok: false, error: `push failed (${pr.status}) — pull skipped: ${String(said).slice(0, 300)}` }).then(() => null, () => null);
      await beat("erp-sync", "failed", {
        step: "push", status: pr.status,
        said: String(said).slice(0, 200),
        /* JSON = Genie refused it; HTML = the hop never arrived. */
        answeredWith: ctype.split(";")[0] || "nothing",
        secretSet: !!secret, secretLen: secret ? secret.length : 0,
      });
      /**
       * THE PULL NO LONGER WAITS ON THE PUSH (Dr Raghu, 16 Sep 2026: "in all
       * these decisions the later one wins!!!").
       *
       * This used to return here. The reasoning was sound when it was
       * written — a pull over unpushed edits would overwrite them — but it
       * assumed the ERP always wins. Under LATEST WINS it does not: a Genie
       * edit made after the ERP's own last change survives the pull, which
       * is the whole point of the rule.
       *
       * What that guard actually cost: twenty-six hours in which the push
       * failed every hour and took the jobs, projects and delivered pull
       * down with it, so the board quietly stopped hearing from the ERP
       * because a DIFFERENT half of the same cron was broken. One fault
       * should break one thing.
       *
       * The failure is still recorded and still shown. It simply no longer
       * takes the other half hostage.
       */
      pushFailed = { status: pr.status, said: String(said).slice(0, 200) };
    }

    // 2. PULL — the ERP's word comes down, with the day's winner
    try {
      /* Jobs, delivered and projects are one pull — see ERP_DOCS.group. */
      const out = await erpSync(genie, cfg, { dry: false, fallback });
      await genie.from("erp_sync_log").insert({
        by: "cron", dry: false, ok: true,
        jobs_new: out.jobs.created, jobs_changed: out.jobs.changed, jobs_archived: out.jobs.archived,
        proj_new: out.projects.created, proj_changed: out.projects.changed,
        deliv_new: out.delivered.created, deliv_changed: out.delivered.changed,
        changes: out.changes, notes: [...(out.notes || []), `winner on a difference: ${fallback}`], seconds: out.seconds,
      }).then(() => null, () => null);
      await beat("erp-sync", pushFailed ? "failed" : "done", { fallback, want, pushFailed, pushed: push.pushed, rejected: push.rejected, jobs_changed: out.jobs.changed, proj_changed: out.projects.changed, seconds: out.seconds });
      return NextResponse.json({ ok: !pushFailed, fallback, pushFailed, push: { pushed: push.pushed, rejected: push.rejected, notInErp: push.notInErp }, pull: { jobs: out.jobs, projects: out.projects, delivered: out.delivered, seconds: out.seconds },
        /* WHAT THE PASS ACTUALLY SAID. The sync has always collected notes —
           fields it could not find, delivery dates it kept, rows it could not
           write — and the route threw them away, so a run that half-worked
           looked identical to one that worked. */
        notes: out.notes || [],
        note: pushFailed ? "The push failed; the pull ran anyway because the later edit wins." : undefined });
    } catch (e) {
      await genie.from("erp_sync_log").insert({ by: "cron", dry: false, ok: false, error: `pull: ${String(e instanceof Error ? e.message : e).slice(0, 400)}` }).then(() => null, () => null);
      await beat("erp-sync", "failed", { step: "pull", error: String(e instanceof Error ? e.message : e).slice(0, 300) });
      throw e;
    }
  } catch (e) {
    return errJson(e);
  }
}
