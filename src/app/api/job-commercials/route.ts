import { NextResponse } from "next/server";
import { errJson, HttpError, requireStratcom } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { adminClient } from "@/lib/supabase/admin";
import { swallow } from "@/lib/swallow";
import { marginsFor } from "@/lib/job-margin";

export const dynamic = "force-dynamic";

/**
 * POST /api/job-commercials — one job's terms, entered together
 * (Dr Raghu, 8 Sep 2026: "show a lightbox to edit for each job ... this will
 * be done by suresh. Access only to STRATCOM").
 *
 * WHY A WHOLE DOCUMENT AND NOT SEVEN FIELDS. The screen had per-cell editing
 * and across 116 jobs it had recorded a payment term exactly ZERO times — no
 * job on the board carries a pay_pct_on or an advance. The database took the
 * writes when asked directly, so nothing was refusing them; the sequence was
 * simply too long to complete — press the pencil, then press the cell, then
 * type, then click away, seven times over, on a table twenty-nine columns
 * wide. A number that is never entered is the same as a number that cannot
 * be. This takes them all at once and answers with what it stored.
 *
 * STRATCOM ONLY, on his instruction. The pencil is hidden from everyone else
 * and this route refuses them, because a screen that hides a button while the
 * endpoint behind it stays open is not access control.
 *
 * THE FOUR MUST MAKE 100. Terms that add to 90 quietly lose a tenth of the
 * order book from the 13-week plan, and nothing on the page would say so.
 * Zero is allowed — that means "not yet entered" — but a set that is neither
 * empty nor 100 is refused with its own total quoted back.
 */
const N = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const PCTS = ["pay_pct_on", "pay_pct_30", "pay_pct_60", "pay_pct_90"] as const;

/** GET /api/job-commercials?id=<job> — the margin as it stands. */
export async function GET(req: Request) {
  try {
    await requireStratcom();
    const id = String(new URL(req.url).searchParams.get("id") ?? "").trim();
    if (!id) throw new HttpError(400, "Which job?");
    const [margin] = await marginsFor(adminClient(), [id]);
    if (!margin) throw new HttpError(404, `No job ${id} on the board.`);
    return NextResponse.json({ ok: true, margin });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireStratcom();
    const b = await readBody(req, {});
    const id = String(b.job_id ?? "").trim();
    if (!id) throw new HttpError(400, "Which job?");

    const patch: Record<string, number | null> = {};
    for (const k of ["val", "gst", "advance", "wip_labour", "transport", "overheads"] as const) {
      if (k in b) {
        const n = N(b[k]);
        if (n != null && n < 0) throw new HttpError(400, `${k} cannot be negative.`);
        patch[k] = n;
      }
    }
    let touchedPct = false;
    for (const k of PCTS) {
      if (k in b) {
        const n = N(b[k]);
        if (n != null && (n < 0 || n > 100)) throw new HttpError(400, "A percentage outside 0–100 is a typo, not a term.");
        patch[k] = n;
        touchedPct = true;
      }
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change.");

    if (touchedPct) {
      const sum = PCTS.reduce((s, k) => s + (Number(patch[k] ?? 0) || 0), 0);
      if (sum !== 0 && Math.round(sum) !== 100)
        throw new HttpError(400, `The four terms add to ${Math.round(sum)}% of the balance, not 100%. Nothing was saved — a job whose terms do not total 100 is money either invented or lost from the 13-week plan.`);
    }

    /**
     * THE GUARD AUTHORISES; THE SERVICE ROLE WRITES (Suresh Lalzare, through
     * Dr Raghu, 9 Sep 2026: "we are editing the data in Job commercial, but
     * taking too much to save, see it's showing under process ... not saved
     * yet").
     *
     * This was written with supabaseServer(), which is the ANON key carrying
     * the reader's own cookie — so every write went through RLS. Dr Raghu is
     * the owner and the policy let him through, which is why the one job
     * saved on the 8th was his; Suresh is Stratcom and it did not, so his
     * update matched no row, the route answered 500, and the button sat on
     * "Saving..." for ever.
     *
     * requireStratcom() above IS the authorisation. Doing it twice — once in
     * the route and again in a policy that disagrees — is how a screen comes
     * to refuse the very people it was built for.
     */
    const db = adminClient();
    const { data: before } = await db.from("jobs").select("id, val, delivered, delivered_on").eq("id", id).maybeSingle();
    if (!before) throw new HttpError(404, `No job ${id} on the board.`);

    /* A DELIVERED JOB'S TERMS ARE STILL LIVE. Its dates are a record and stay
       shut, but the money it has yet to collect is exactly what this screen
       is for, so the terms are writable after the lorry has gone. */
    const { data, error } = await db.from("jobs").update(patch).eq("id", id)
      .select("id, val, gst, advance, pay_pct_on, pay_pct_30, pay_pct_60, pay_pct_90").maybeSingle();
    if (error) throw new HttpError(400, error.message);
    if (!data) throw new HttpError(500, "The update matched no row — nothing was stored.");

    /* Value belongs to the ERP; changing it here must be told over there.
       The four percentages and the advance are Genie's own and queue nothing. */
    if ("val" in patch && Number(before.val) !== Number(patch.val)) {
      try {
        const admin = adminClient();
        const who = user.initials || user.displayName || user.email.split("@")[0];
        await admin.from("erp_update").insert({
          job_id: id, field: "val", label: "Order value",
          old_value: before.val == null ? "" : String(before.val),
          new_value: patch.val == null ? "" : String(patch.val),
          changed_by: who, changed_at: new Date().toISOString(),
        });
      } catch (e) { swallow("job-commercials", e); /* the local edit still stands */ }
    }

    /* the margin, worked out fresh off what was just stored — so the screen
       never shows a figure computed from what it thought it was saving */
    let margin = null;
    try { [margin] = await marginsFor(db, [id]); } catch (e) { swallow("job-commercials margin", e); }
    return NextResponse.json({ ok: true, row: data, margin });
  } catch (e) { return errJson(e); }
}
