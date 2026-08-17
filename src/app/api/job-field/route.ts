import { NextResponse } from "next/server";
import { requirePlanner, errJson, RAGHU_EMAIL } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { assertJobEditable } from "@/lib/job-state";

export const dynamic = "force-dynamic";

/**
 * The fields Genie may correct, and what the ERP calls each one.
 *
 * The label is not decoration: it is what the export carries, so whoever
 * uploads the corrections does not have to translate `tdd` into "Target
 * Delivery Date Current" in their head at eight in the morning.
 */
const FIELDS: Record<string, { label: string; kind: "date" | "number" | "text" }> = {
  tdd: { label: "Target Delivery Date Current", kind: "date" },
  stat: { label: "Job Status", kind: "text" },
  mgmt: { label: "Management Target Date Request", kind: "date" },
  note: { label: "Current Status", kind: "text" },
  escalation: { label: "Currrent Project Escalation", kind: "text" },
  amt_needed: { label: "Amount needed in next month", kind: "number" },
  kit: { label: "Kitting percentage", kind: "number" },
  pct: { label: "Production Completion %", kind: "number" },
};

/** What goes in the export — never null, never "null". */
const show = (v: unknown): string => (v == null || v === "" ? "" : String(v));

/**
 * POST /api/job-field — correct one field on a job, and queue it for the ERP.
 *
 * Genie is downstream of the ERP: the morning file redraws the board, so a
 * value corrected here is overwritten tomorrow unless somebody puts it into
 * the ERP too. That is what erp_update is for — the change is applied locally
 * AND written to a queue that can be exported and uploaded in one pass.
 *
 * Body: { job_id, field, value }
 */
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const body = await req.json();
    const field: string = body.field;
    const meta = FIELDS[field];
    if (!body.job_id || !meta)
      return NextResponse.json({ error: "job_id and a valid field are required" }, { status: 400 });

    if (field === "mgmt" && user.email.toLowerCase() !== RAGHU_EMAIL) {
      return NextResponse.json(
        { error: "Only raghu@nandan.co.in may edit the Management Target Date" },
        { status: 403 },
      );
    }

    let value: string | number | null;
    if (meta.kind === "number") {
      const n = Number(body.value);
      value = body.value === "" || body.value == null || !Number.isFinite(n) ? null : n;
      // a percentage outside 0-100 is a typo, not a reading
      if (value != null && (field === "kit" || field === "pct")) value = Math.max(0, Math.min(100, value));
    } else if (meta.kind === "date") {
      value = body.value || null;
    } else {
      value = String(body.value ?? "");
    }

    const supabase = supabaseServer();
    // a delivered job's dates and status are settled — the ERP owns them now
    await assertJobEditable(supabase, body.job_id);

    // read the old value first: it is what decides whether anything is queued,
    // and it is what the export shows beside the new one
    // select("*") rather than select(field): a dynamic column name defeats the
    // client's typed row inference and the cast that works around it is worse
    // than reading one row wide.
    const { data: before } = await supabase.from("jobs").select("*").eq("id", body.job_id).maybeSingle();
    const oldValue = before ? (before as unknown as Record<string, unknown>)[field] : null;

    const { error } = await supabase.from("jobs").update({ [field]: value }).eq("id", body.job_id);
    if (error) {
      // the trigger raises 42501 for a non-raghu mgmt edit that slipped past
      const status = /privilege|Management Target Date/i.test(error.message) ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    /**
     * Queue it — but only if it actually changed.
     *
     * Re-typing 40 over 40 must not put a line in front of Pankaj. The
     * comparison is on the SHOWN value so 40 and "40" are the same thing,
     * which is what they are to anybody reading the export.
     */
    const changed = show(oldValue) !== show(value);
    let queued = false;
    if (changed) {
      try {
        const admin = adminClient();
        const who = user.initials || user.displayName || user.email.split("@")[0];
        const row = {
          job_id: body.job_id,
          field,
          label: meta.label,
          old_value: show(oldValue),
          new_value: show(value),
          changed_by: who,
          changed_at: new Date().toISOString(),
        };
        // one pending line per job and field: editing three times before an
        // export leaves the LATEST value, not three edits to apply in order
        const { data: pending } = await admin
          .from("erp_update")
          .select("id, old_value")
          .eq("job_id", body.job_id)
          .eq("field", field)
          .is("exported_at", null)
          .maybeSingle();
        if (pending) {
          // keep the ORIGINAL old value — the export should say what the ERP
          // still holds, not what the last intermediate edit happened to be
          await admin.from("erp_update").update({ ...row, old_value: pending.old_value }).eq("id", pending.id);
        } else {
          await admin.from("erp_update").insert(row);
        }
        queued = true;
      } catch {
        /* 0031 not run yet — the local edit still stands */
      }
    }

    return NextResponse.json({ ok: true, changed, queued, label: meta.label });
  } catch (e) {
    return errJson(e);
  }
}
