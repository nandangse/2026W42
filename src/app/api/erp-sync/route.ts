import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { erpConfig, erpSync, type SyncOptions, type Winner } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE PROJECTS AND JOBS IMPORT (Dr Raghu, 1 Sep 2026: "can we now stop the
 * upload and instead do the API import from erpnext?").
 *
 *   POST { dry: true }   — read the ERP, report what would change, write
 *                          nothing. Run this first, always.
 *   POST {}              — do it.
 *   GET                  — the hourly cron, signed by Vercel.
 *
 * It replaces two of the morning upload's cards — "Job in progress - Jobs"
 * and "Order in Progress - projects". The upload still works and is left
 * alone; nothing here deletes it, so a bad hour can fall back to the sheet.
 */
/** Run it, and write down what moved — the summary table reads that ledger. */
async function run(dry: boolean, by: string, opts: Omit<SyncOptions, "dry"> = {}) {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP keys live in the CRM's database, and it is not connected here.");
  const cfg = await erpConfig(crmDb());
  if ("error" in cfg) throw new HttpError(400, cfg.error);
  const genie = adminClient();
  try {
    const out = await erpSync(genie, cfg, { ...opts, dry });
    await genie.from("erp_sync_log").insert({
      by, dry, ok: true,
      jobs_new: out.jobs.created, jobs_changed: out.jobs.changed, jobs_archived: out.jobs.archived,
      proj_new: out.projects.created, proj_changed: out.projects.changed,
      deliv_new: out.delivered.created, deliv_changed: out.delivered.changed,
      changes: out.changes, notes: out.notes, seconds: out.seconds,
    }).then(() => null, () => null);
    return out;
  } catch (e) {
    // A failed run is worth as much on the ledger as a good one — more, when
    // somebody is asking why the board looks a day old.
    await genie.from("erp_sync_log").insert({
      by, dry, ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 500),
    }).then(() => null, () => null);
    throw e;
  }
}

/**
 * SYNCHRONISE (Dr Raghu, 1 Sep 2026: "just make a button there saying
 * Synchronise … Anybody pressing that will just synchronise it once again").
 *
 * ANYBODY who may load the morning files may press it — the same hands that
 * used to carry the sheet. It replaces their upload, so gating it tighter
 * than the thing it replaces would just move the bottleneck onto one person.
 */
export async function POST(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
    const mayRun = u.isOwner || ["admin", "planner", "uploader", "project_owner"].includes(String(u.role));
    if (!mayRun) throw new HttpError(403, "Synchronise belongs to the people who run the morning update.");
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    // The radio buttons come back as kind:id:field → "genie" | "erp", and
    // `fallback` is what an unadjudicated difference does: the ERP wins while
    // records are still born there, Genie wins from October.
    const decisions: Record<string, Winner> = {};
    for (const [k, v] of Object.entries((body.decisions ?? {}) as Record<string, unknown>)) {
      if (v === "genie" || v === "erp") decisions[k] = v;
    }
    const fallback: Winner = body.fallback === "genie" ? "genie" : "erp";
    const out = await run(body.dry === true, u.email, { decisions, fallback });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * GET — two jobs.
 *
 *   ?summary=1  the change ledger: what moved in the last day, week and
 *               month, and the runs behind those numbers. This is what the
 *               Morning Update table reads.
 *   (no query)  the cron's own pull, signed by Vercel.
 */
export async function GET(req: Request) {
  try {
    const u2 = new URL(req.url);
    if (u2.searchParams.get("summary")) {
      const me = await currentUser();
      if (!me || me.disabled) throw new HttpError(401, "Sign in first.");
      const genie = adminClient();
      const since = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await genie.from("erp_sync_log")
        .select("id, at, by, dry, ok, error, jobs_new, jobs_changed, jobs_archived, proj_new, proj_changed, deliv_new, deliv_changed, changes, notes, seconds")
        .gte("at", since(31)).order("at", { ascending: false }).limit(200);
      if (error) {
        if (/erp_sync_log|does not exist|schema cache/i.test(error.message))
          return NextResponse.json({ installed: false, runs: [], windows: [] });
        throw new HttpError(500, error.message);
      }
      const runs = (data ?? []).filter((r) => !r.dry && r.ok);
      const win = (days: number) => {
        const from = since(days);
        const rows = runs.filter((r) => String(r.at) >= from);
        const sum = (k: string) => rows.reduce((a, r) => a + (Number((r as Record<string, unknown>)[k]) || 0), 0);
        return {
          days, runs: rows.length,
          jobs_new: sum("jobs_new"), jobs_changed: sum("jobs_changed"), jobs_archived: sum("jobs_archived"),
          proj_new: sum("proj_new"), proj_changed: sum("proj_changed"),
          deliv_new: sum("deliv_new"), deliv_changed: sum("deliv_changed"),
        };
      };
      return NextResponse.json({
        installed: true,
        windows: [win(1), win(7), win(30)],
        lastRun: (data ?? [])[0] ?? null,
        runs: (data ?? []).slice(0, 20),
      });
    }

    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled || !u.isOwner) throw new HttpError(401, "The hourly cron, or Raghu.");
      const out = await run(false, u.email);
      return NextResponse.json({ ok: true, ...out });
    }
    const out = await run(false, "cron");
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errJson(e);
  }
}
