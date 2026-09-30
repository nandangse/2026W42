import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
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
const FIELDS: Record<string, { label: string; kind: "date" | "number" | "text"; genieOnly?: boolean }> = {
  tdd: { label: "Target Delivery Date Current", kind: "date" },
  // The ERP takes this one (custom_otd_date) and now Genie can send it.
  otd: { label: "OTD Date", kind: "date" },
  stat: { label: "Job Status", kind: "text" },
  mgmt: { label: "Management Target Date Request", kind: "date" },
  note: { label: "Current Status", kind: "text" },
  escalation: { label: "Currrent Project Escalation", kind: "text" },
  amt_needed: { label: "Amount needed in next month", kind: "number" },
  kit: { label: "Kitting percentage", kind: "number" },
  pct: { label: "Production Completion %", kind: "number" },
  // Genie's own field. The ERP has no column for it, so it is marked so the
  // export skips it rather than queueing a line nothing can receive.
  quality_owner:    { label: "Quality Owner",    kind: "text", genieOnly: true },
  production_owner: { label: "Production Owner", kind: "text", genieOnly: true },
  kitting_owner:    { label: "Kitting Owner",    kind: "text", genieOnly: true },
  design_owner:     { label: "Design Owner",     kind: "text", genieOnly: true },
  /**
   * APPROX MANDAYS (Dr Raghu, 2 Sep 2026). A BAND, not a number: nobody knows
   * a job is 237 mandays, they know it is a two-to-three-hundred job, and a
   * spurious 237 gets planned against as though it were measured. B/O is the
   * honest answer for a bought-out job Nandan does not build -- which is NOT
   * zero mandays and must never average in as though it were.
   *
   * Genie's own. The ERP has mandays_at_site_ and custom_planned_days, both
   * numbers about something else; writing a band into either would corrupt a
   * field somebody else is already using.
   */
  mandays:          { label: "Approx Mandays",   kind: "text", genieOnly: true },
  /* The vehicle a job is built on. Genie's own — the ERP has a chassis
     INSPECTION CHECKLIST and no field for the numbers themselves, and
     writing them into something else's column is how two systems begin to
     disagree (0173). */
  chassis_no:       { label: "Chassis No",       kind: "text", genieOnly: true },
  engine_no:        { label: "Engine No",        kind: "text", genieOnly: true },
  /**
   * JOB COMMERCIALS (Dr Raghu, 2 Sep 2026) — the cash a job throws off, and
   * when. Genie's own: the ERP carries a costing model that means something
   * else, and writing a collection term into it would corrupt a field
   * somebody is already using.
   */
  advance:     { label: "Advance received",     kind: "number", genieOnly: true },
  invested:    { label: "Amount invested",      kind: "number", genieOnly: true },
  wip_labour:  { label: "WIP labour invested",  kind: "number", genieOnly: true },
  pay_pct_on:  { label: "% on delivery",        kind: "number", genieOnly: true },
  pay_pct_30:  { label: "% at 30 days",         kind: "number", genieOnly: true },
  pay_pct_60:  { label: "% at 60 days",         kind: "number", genieOnly: true },
  pay_pct_90:  { label: "% at 90 days",         kind: "number", genieOnly: true },
  gst:         { label: "GST rate",             kind: "number", genieOnly: true },
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
    const body = await readBody(req, {});
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

    /**
     * THE GUARD AUTHORISES; THE SERVICE ROLE WRITES (9 Sep 2026).
     *
     * This used supabaseServer() — the ANON key carrying the reader's own
     * cookie — so every correction went through RLS on `jobs`. That is why
     * across 116 live jobs a payment term had been recorded exactly ZERO
     * times, and why the one job that did save was the owner's: the policy
     * let him through and let nobody else. The route's own checks above are
     * the authorisation, and `requirePlanner()` has already run.
     *
     * THE MANAGEMENT-DATE TRIGGER IS NOT LOST WITH IT. That rule is enforced
     * in this file, explicitly, a few lines up: a mgmt edit by anyone other
     * than Dr Raghu is refused 403 before a single byte reaches the table.
     * The database trigger was the second lock on the same door.
     */
    const supabase = adminClient();
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
    // A Genie-only field has no ERP column to be pushed to. Queueing one would
    // put a line in Pankaj's export that nothing on the other side can receive.
    const changed = show(oldValue) !== show(value);

    /**
     * THE HISTORY, WHICH THE QUEUE IS NOT (0176).
     *
     * erp_update collapses repeated edits on purpose — the ERP must receive
     * the latest value, not three edits to replay in order. That makes it
     * useless as a record, and the Current Update is the one field on a job
     * that is prose: "W30 : Ord rcd", then "W36 : panels at paint". The
     * earlier line is the only account there is of how the job actually
     * went, and it was being written over.
     *
     * Logged for every field, not only the note, because "who moved the
     * target date, and from what" is asked more often than anything else and
     * needs no second design.
     */
    if (changed) {
      try {
        const { error: le } = await adminClient().from("job_field_log").insert({
          job_id: body.job_id,
          field,
          label: meta.label,
          old_value: show(oldValue),
          new_value: show(value),
          by_email: user.email,
          by_name: user.displayName || user.initials || user.email.split("@")[0],
        });
        /* The client returns the error rather than throwing it, so a missing
           table would otherwise pass silently as a success. */
        if (le) swallow("job-field/log", new Error(le.message));
      } catch (e) { swallow("job-field/log", e); /* 0176 not run yet — the edit still stands */ }
    }

    let queued = false;
    if (changed && !meta.genieOnly) {
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
      } catch (e) { swallow("job-field", e); /* 0031 not run yet — the local edit still stands */ }
    }

    return NextResponse.json({ ok: true, changed, queued, label: meta.label });
  } catch (e) {
    return errJson(e);
  }
}
