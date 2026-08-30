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
        const mappable = lines.filter((l) => ERP_FIELD[l.field]);
        const orphans = lines.filter((l) => !ERP_FIELD[l.field]);
        if (orphans.length) { rejected += orphans.length; await fate(orphans.map((o) => o.id), "rejected", "no ERP field mapped for this correction"); }
        if (!mappable.length) continue;
        try {
          const probe = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(jobId)}`, { headers: EH });
          if (probe.status === 404) { notInErp += mappable.length; await fate(mappable.map((l) => l.id), "not_in_erp", `no ${doctype} named ${jobId}`); continue; }
          const patch: Record<string, unknown> = {};
          for (const l of mappable) {
            const v = String(l.new_value ?? "");
            patch[ERP_FIELD[l.field]] = NUMERIC.has(l.field) ? Number(v.replace(/[^0-9.-]/g, "")) || 0 : v;
          }
          const w = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(jobId)}`, {
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
      return NextResponse.json({ ok: true, jobs: byJob.size, pushed, rejected, notInErp });
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
