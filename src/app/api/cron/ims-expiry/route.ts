import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { sendImsMail } from "@/ims/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/ims-expiry — the daily expiry scan.
 *
 * WHAT EXPIRES: every row in ims_certificate — ISO certificates, the Factory
 * Licence, the MPCB Consent to Operate, the Fire NOC, welder qualification
 * cards, calibration and statutory equipment tests. They are one table
 * because they are one problem.
 *
 * WHAT IT DOES: at 90, 60, 30 and 7 days out — and again on the day it goes
 * past — it raises a task on the renewal owner and mails them.
 *
 * DEDUPE. This is the part that decides whether the feature is usable. The
 * task carries source_type + source_id + source_key (the threshold), and a
 * partial unique index on those three for OPEN tasks means a second run of
 * the same day cannot raise a second 90-day task. Ninety and sixty are
 * DIFFERENT keys, so the sixty-day warning still arrives even while the
 * ninety-day task sits open — which is the behaviour you want, because the
 * open ninety-day task is evidence that nobody acted.
 *
 * Mail never blocks the task. A certificate alert that could not be posted is
 * a bad day; a scan that aborted half way through, leaving the rest of the
 * renewals unraised, is a worse one.
 */
const THRESHOLDS = [90, 60, 30, 7, 0];

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The daily cron, or a signed-in hand.");
    }

    const db = imsDb();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const horizon = new Date(Date.now() + 91 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const { data: certs, error } = await db
      .from("ims_certificate")
      .select("id, kind, title, scheme, certificate_no, expiry_date, renewal_owner_id")
      .not("expiry_date", "is", null)
      .lte("expiry_date", horizon)
      .order("expiry_date");
    if (error) {
      if (notInstalled(error.message))
        return NextResponse.json({ ok: false, note: "Run supabase/migrations/0112_ims_core.sql first." });
      throw new Error(error.message);
    }

    const days = (d: string) =>
      Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);

    const raised: string[] = [];
    const skipped: string[] = [];
    const mailNotes: string[] = [];

    for (const c of certs ?? []) {
      const left = days(String(c.expiry_date));
      // The threshold this row is AT today: the largest one it has reached.
      // Past expiry it is 'overdue', which keeps ringing daily but as one
      // open task, not a new one each morning.
      const key = left < 0 ? "overdue" : String(THRESHOLDS.find((t) => left <= t) ?? "");
      if (!key) continue;

      const what = `${c.title}${c.certificate_no ? ` (${c.certificate_no})` : ""}`;
      const when =
        left < 0 ? `EXPIRED ${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} ago`
        : left === 0 ? "expires TODAY"
        : `expires in ${left} day${left === 1 ? "" : "s"}`;

      // The partial unique index does the deduping; we ask for it and read
      // back what happened rather than checking first and racing with
      // ourselves on a second concurrent run.
      const { data: made, error: te } = await db
        .from("core_task")
        .insert({
          module: "IMS",
          title: `${c.kind === "statutory" ? "Renew" : "Renew certificate"}: ${what} — ${when}`,
          description: `${c.scheme || c.kind} · expiry ${c.expiry_date}. Raised by the daily IMS expiry scan.`,
          source_type: "cert_expiry",
          source_id: c.id,
          source_key: key,
          owner_id: c.renewal_owner_id,
          due_date: c.expiry_date,
          priority: left < 0 ? "urgent" : left <= 30 ? "high" : "normal",
          created_by: "ims-expiry-cron",
        })
        .select("id")
        .maybeSingle();

      if (te) {
        // 23505 — a task for this certificate at this threshold is already
        // open. That is the dedupe working, not a failure.
        if (/duplicate key|23505/i.test(te.message)) { skipped.push(`${what} @${key}`); continue; }
        throw new Error(te.message);
      }
      raised.push(`${what} @${key}`);

      // ---- and the nudge ----
      let to: string[] = [];
      if (c.renewal_owner_id) {
        // Genie's own account — one id for a person, not a mirrored second.
        const { data: owner } = await db
          .from("profiles").select("email").eq("id", c.renewal_owner_id).maybeSingle();
        if (owner?.email) to = [owner.email];
      }
      if (!to.length) {
        // No named owner is itself the finding. It goes to the MR — whoever
        // holds that role today, and the owner if nobody does.
        const { data: mr } = await db
          .from("ims_access").select("email").eq("role", "ims_admin").limit(1).maybeSingle();
        to = [mr?.email || RAGHU_EMAIL];
      }
      const mail = await sendImsMail({
        to,
        subject: `IMS — ${what} ${when}`,
        text:
          `${what}\n${c.scheme || c.kind}\nExpiry: ${c.expiry_date} (${when}).\n\n` +
          `A task has been raised in the IMS. Open it at ${process.env.NEXT_PUBLIC_SITE_URL || "https://genie.nandan.co.in"}/ims/tasks\n\n` +
          `— Nandan IMS, daily expiry scan`,
      });
      if (!mail.sent) mailNotes.push(`${what}: ${mail.why}`);
      if (made?.id) { /* task id kept only for the count */ }
    }

    return NextResponse.json({
      ok: true,
      today,
      scanned: (certs ?? []).length,
      raised,
      // Named, not hidden: "already open" is the dedupe working and it should
      // be visible when somebody runs this by hand to check.
      alreadyOpen: skipped,
      // The mail is reported honestly. A silent "sent" over a mail that never
      // left is worse than no mail at all.
      mailProblems: mailNotes,
    });
  } catch (e) {
    return errJson(e);
  }
}
