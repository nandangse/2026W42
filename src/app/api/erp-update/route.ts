import { NextResponse } from "next/server";
import { requireReader, requirePlanner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/erp-update[?scope=waiting|pushed|rejected|all] — the corrections
 * queue with its FATE (Dr Raghu, 29 Aug 2026): waiting by default; pushed
 * and rejected are one chip away.
 */
export async function GET(req: Request) {
  try {
    await requireReader();
    const scope = new URL(req.url).searchParams.get("scope")
      || (new URL(req.url).searchParams.get("all") === "1" ? "all" : "waiting");
    let q = adminClient()
      .from("erp_update")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(800);
    if (scope === "waiting") q = q.is("exported_at", null);
    else if (scope === "pushed") q = q.eq("push_status", "pushed");
    else if (scope === "rejected") q = q.in("push_status", ["rejected", "not_in_erp"]);
    else if (scope === "cancelled") q = q.eq("push_status", "cancelled");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ installed: true, rows: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/erp_update|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ installed: false, rows: [] });
    return errJson(e);
  }
}

/** Genie's correction fields onto the Jobmaster's own — read from the ERP
 *  itself on 29 Aug 2026 (yes, the escalation field really wears three r's). */
const ERP_FIELD: Record<string, string> = {
  tdd: "target_delivery_date_current",
  kit: "kitting_percentage",
  pct: "custom_production_completion_pc",
  stat: "job_status",
  note: "current_status",
  amt_needed: "custom_amount_needed_in_next_month",
  escalation: "custom_currrent_project_escalation",
};
const NUMERIC = new Set(["kit", "pct", "amt_needed"]);

/**
 * PROJECT corrections travel to a different doctype (Dr Raghu, 2 Sep 2026:
 * "Short Summary Description - ERP / Description - Genie / Projects please
 * mapp for the import and export too").
 *
 * The queue was written when only jobs could be corrected, so it put every
 * line to Jobmaster. A project line sent there would have been rejected as a
 * job that does not exist -- which reads like a missing job rather than a
 * missing feature, and that is the kind of error nobody chases.
 */
const PROJECT_ERP_FIELD: Record<string, string> = {
  description: "short_summary_description",
};
/** ERP project ids wear their doctype: NGSE-PROJ-1716. Jobs are numeric. */
const isProjectRef = (id: string) => /^NGSE-PROJ-/i.test(String(id));

/**
 * POST /api/erp-update
 *   { action: "exported", ids? } — mark applied by hand (the CSV road).
 *   { action: "push" }          — THE BUTTON (Dr Raghu, 29 Aug 2026: "me or
 *     Pankaj"): every waiting line goes to the ERP through the API, one PUT
 *     per job carrying all its fields. Each line records its fate — pushed,
 *     rejected (with the ERP's words), or not-in-ERP. Planner and admin
 *     hands only; the keys are the ones Raghu holds in Integrations.
 */
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const body = await req.json();
    const admin = adminClient();
    const who = user.initials || user.displayName || user.email.split("@")[0];

    // ticked lines leave the queue as CANCELLED (Dr Raghu, 30 Aug 2026) —
    // never pushed, never deleted: the record of the correction stays
    if (String(body.action || "") === "cancel") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
      if (!ids.length) throw new HttpError(400, "Tick the lines to cancel first.");
      const { error } = await admin.from("erp_update")
        .update({ push_status: "cancelled", push_error: `cancelled by ${who}`, exported_at: new Date().toISOString() })
        .in("id", ids).is("exported_at", null);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, cancelled: ids.length });
    }

    if (String(body.action || "") === "push") {
      const { data: cfgRow } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
      const cfg = (cfgRow?.config || {}) as Record<string, string>;
      if (!cfg.url || !cfg.api_key || !cfg.api_secret)
        throw new HttpError(400, "The ERPNext keys are not saved — Integrations in the CRM, Raghu's card.");
      const base = cfg.url.replace(/\/+$/, "");
      const EH = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };
      const doctype = cfg.push_doctype || "Jobmaster";

      const { data: waiting, error } = await admin.from("erp_update")
        .select("id, job_id, field, new_value").is("exported_at", null).order("job_id").limit(500);
      if (error) throw new Error(error.message);
      if (!waiting?.length) return NextResponse.json({ ok: true, pushed: 0, rejected: 0, note: "Nothing waiting." });

      // one PUT per job, carrying all its corrections together
      const byJob = new Map<string, { id: string; field: string; new_value: string | null }[]>();
      for (const r of waiting) {
        const k = String(r.job_id);
        (byJob.get(k) ?? byJob.set(k, []).get(k)!).push(r as { id: string; field: string; new_value: string | null });
      }

      const now = new Date().toISOString();
      let pushed = 0, rejected = 0, notInErp = 0;
      const fate = async (ids: string[], status: string, err = "") => {
        await admin.from("erp_update").update({
          push_status: status, push_error: err.slice(0, 300) || null,
          pushed_at: now, pushed_by: who,
          ...(status === "pushed" ? { exported_at: now, exported_by: who } : {}),
        }).in("id", ids);
      };

      for (const [jobId, lines] of byJob) {
        // Which book this correction belongs in, and under which names.
        const isProj = isProjectRef(jobId);
        const FIELD = isProj ? PROJECT_ERP_FIELD : ERP_FIELD;
        const dt = isProj ? "Project" : doctype;
        const mappable = lines.filter((l) => FIELD[l.field]);
        const orphans = lines.filter((l) => !FIELD[l.field]);
        if (orphans.length) { rejected += orphans.length; await fate(orphans.map((o) => o.id), "rejected", "no ERP field mapped for this correction"); }
        if (!mappable.length) continue;
        try {
          const probe = await fetch(`${base}/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(jobId)}`, { headers: EH });
          if (probe.status === 404) { notInErp += mappable.length; await fate(mappable.map((l) => l.id), "not_in_erp", `no ${dt} named ${jobId}`); continue; }
          const patch: Record<string, unknown> = {};
          for (const l of mappable) {
            const v = String(l.new_value ?? "");
            patch[FIELD[l.field]] = NUMERIC.has(l.field) ? Number(v.replace(/[^0-9.-]/g, "")) || 0 : v;
          }
          const w = await fetch(`${base}/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(jobId)}`, {
            method: "PUT", headers: { ...EH, "content-type": "application/json" }, body: JSON.stringify(patch),
          });
          if (w.ok) { pushed += mappable.length; await fate(mappable.map((l) => l.id), "pushed"); }
          else {
            const msg = ((await w.json().catch(() => null)) as { exception?: string; _server_messages?: string } | null);
            rejected += mappable.length;
            await fate(mappable.map((l) => l.id), "rejected", `${w.status}: ${String(msg?.exception || msg?._server_messages || "").slice(0, 200) || "the ERP refused"}`);
          }
        } catch (e) {
          rejected += mappable.length;
          await fate(mappable.map((l) => l.id), "rejected", String(e).slice(0, 200));
        }
      }
      // THE RECORD DOCUMENT (Dr Raghu, 30 Aug 2026): every push files its
      // own CSV into the Drive archive — FY / 11 ERP Push Records / month —
      // job, field, value, was, by whom, and the fate the ERP gave it.
      let recordFiled = false;
      try {
        const { driveConfig, archiveUpload } = await import("@/lib/drive");
        const dCfg = driveConfig();
        if (dCfg) {
          const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
          const { data: batch } = await admin.from("erp_update").select("job_id, label, new_value, old_value, changed_by, push_status, push_error")
            .eq("pushed_at", now).order("job_id");
          const csv = [
            ["Job ID", "Field", "New value", "Was", "Changed by", "Fate", "ERP's words"].join(","),
            ...(batch || []).map((r) => [r.job_id, r.label, r.new_value, r.old_value, r.changed_by, r.push_status, r.push_error].map(esc).join(",")),
            "", `Pushed by ${who} · ${pushed} pushed · ${rejected} rejected · ${notInErp} not in ERP`,
          ].join("\n");
          await archiveUpload(dCfg, new TextEncoder().encode(csv).buffer as ArrayBuffer, "erp-push-record.csv", "erp");
          recordFiled = true;
        }
      } catch { /* the record is a mirror, never the push */ }

      // AND THE PULL COMES STRAIGHT BACK: what the ERP now says returns to
      // Genie at once, not at a quarter past — the same walk the cron makes.
      let pulledBack = false;
      try {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const r2 = await fetch(new URL("/api/cron/erp-pull", req.url), { headers: { authorization: `Bearer ${secret}` } });
          pulledBack = r2.ok;
        }
      } catch { /* the hourly walk still covers it */ }

      return NextResponse.json({ ok: true, jobs: byJob.size, pushed, rejected, notInErp, recordFiled, pulledBack });
    }

    if (String(body.action || "") !== "exported")
      return NextResponse.json({ error: "unknown action" }, { status: 400 });

    const stamp = {
      exported_at: new Date().toISOString(),
      exported_by: who,
    };
    let q = admin.from("erp_update").update(stamp).is("exported_at", null);
    if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.map(String));
    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
