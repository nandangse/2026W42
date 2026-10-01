import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { sendKindleMail } from "@/lib/kindle/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/kindle-daily — 7 am IST, every day (vercel.json).
 *
 * 1. BIRTHDAYS (Dr Raghu, 1 Oct 2026: "whenever it comes, make sure there is
 *    an email sent out to everybody… also for the legally wedded wife and
 *    children… only the legal spouses and legal children"): a member's own
 *    birthday, and a family row with is_legal and mail_wishes — one mail to
 *    every active member, once per (person, year).
 * 2. CHECK-IN REMINDER: four days and three days before the next monthly
 *    meeting, to each member who has not filed that month (4.25: three days
 *    before; fine Rs 3,000).
 * 3. 1-2-1 REMINDER: on the 10th and the 25th, to each member with a
 *    planned pair still owed this month (4.24; fine Rs 5,000).
 * Every send goes through sendKindleMail, which refuses a repeat.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    if (!fromCron) { const u = await currentUser(); if (!u || !u.isOwner) throw new HttpError(401, "The daily cron, or the owner."); }
    const admin = adminClient();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const [y, mm, dd] = today.split("-");
    const out: Record<string, unknown> = { today };

    const { data: members, error } = await admin.from("kindle_member").select("id,email,name,short_name,birthday,active").eq("active", true);
    if (error) return NextResponse.json({ ok: false, note: error.message });
    const all = members || [];
    const first = (m: { short_name: string | null; name: string }) => m.short_name || m.name.split(" ")[0];

    /* ---- 1. birthdays */
    const { data: fam } = await admin.from("kindle_family").select("member_id,relation,name,birthday,is_legal,mail_wishes");
    const todays: { who: string; of: string | null; relation: string }[] = [];
    for (const m of all) if (m.birthday && String(m.birthday).slice(5) === `${mm}-${dd}`) todays.push({ who: m.name, of: null, relation: "member" });
    for (const f of fam || []) if (f.birthday && f.is_legal && f.mail_wishes && String(f.birthday).slice(5) === `${mm}-${dd}`) { const of = all.find((m) => m.id === f.member_id); if (of) todays.push({ who: f.name, of: first(of), relation: f.relation }); }
    const bday: string[] = [];
    for (const t of todays) {
      const subject = t.of ? `🎂 ${t.who} — ${first({ short_name: null, name: t.of })}'s ${t.relation} — has a birthday today` : `🎂 ${t.who} has a birthday today`;
      const html = `<div style="font-family:Georgia,serif;max-width:520px;color:#2a2420"><div style="font-size:20px;font-weight:700">Kindle</div><p style="font-size:16px">${t.of ? `Today is the birthday of <b>${t.who}</b>, ${t.relation} of ${t.of}.` : `Today is <b>${t.who}</b>'s birthday.`}</p><p>A call or a line on the group would be the Kindle thing to do.</p><p style="font-size:12px;color:#8a7f72">Sent by the Kindle site at 7 am; birthdays come from each member's profile.</p></div>`;
      for (const m of all) bday.push(`${m.email}: ${await sendKindleMail("birthday", m.email, subject, html, `${t.who}-${y}`)}`);
    }
    out.birthdays = { people: todays.map((t) => t.who), sends: bday.length };

    /* ---- 2. check-in reminders */
    const { data: next } = await admin.from("kindle_meeting").select("id,meeting_on").eq("kind", "monthly").neq("status", "cancelled").gte("meeting_on", today).order("meeting_on").limit(1).maybeSingle();
    const rem: string[] = [];
    if (next) {
      const days = Math.round((new Date(String(next.meeting_on)).getTime() - new Date(today).getTime()) / 864e5);
      if (days === 4 || days === 3) {
        const period = String(next.meeting_on).slice(0, 7) + "-01";
        const { data: filed } = await admin.from("kindle_checkin").select("member_id").eq("period", period);
        const done = new Set((filed || []).map((f) => String(f.member_id)));
        for (const m of all) if (!done.has(m.id)) {
          const subject = days === 4 ? "Your Kindle check-in is due tomorrow" : "Kindle check-in — today is the day (4.25)";
          const html = `<div style="font-family:Georgia,serif;max-width:520px;color:#2a2420"><div style="font-size:20px;font-weight:700">Kindle</div><p>Dear ${first(m)},</p><p>The TG meets on <b>${new Date(String(next.meeting_on)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</b>. Your check-in for the month is not in yet. The constitution asks for it three days before (4.25; Rs 3,000 if it is not received).</p><p><a href="https://genie.nandan.co.in/kindle/checkins/mine" style="background:#f26b1d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;font-family:system-ui,sans-serif">Write my check-in</a></p><p style="font-size:12px;color:#8a7f72">Your goals are already on the form.</p></div>`;
          rem.push(`${m.email}: ${await sendKindleMail("checkin_reminder", m.email, subject, html, `${period}-d${days}`)}`);
        }
      }
      out.checkin = { next: next.meeting_on, days, sends: rem.length };
    }

    /* ---- 3. 1-2-1 reminders */
    const one: string[] = [];
    if (dd === "10" || dd === "25") {
      const period = `${y}-${mm}-01`;
      const { data: pairs } = await admin.from("kindle_one_to_one").select("member_a,member_b,planned,done_on").eq("period", period).eq("planned", true).is("done_on", null);
      const owed = new Map<string, string[]>();
      for (const p of pairs || []) { const a = all.find((m) => m.id === p.member_a), b2 = all.find((m) => m.id === p.member_b); if (!a || !b2) continue; owed.set(a.id, [...(owed.get(a.id) || []), first(b2)]); owed.set(b2.id, [...(owed.get(b2.id) || []), first(a)]); }
      for (const [id, names] of owed) {
        const m = all.find((x) => x.id === id)!;
        const html = `<div style="font-family:Georgia,serif;max-width:520px;color:#2a2420"><div style="font-size:20px;font-weight:700">Kindle</div><p>Dear ${first(m)},</p><p>Your 1-2-1 this month with <b>${names.join(" and ")}</b> is still owed. The constitution makes it mandatory every month (4.24; Rs 5,000 if missed).</p><p><a href="https://genie.nandan.co.in/kindle/one21" style="background:#f26b1d;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;font-family:system-ui,sans-serif">Mark it done</a></p></div>`;
        one.push(`${m.email}: ${await sendKindleMail("one21_reminder", m.email, `Your Kindle 1-2-1 with ${names.join(" and ")} this month`, html, `${period}-${dd}`)}`);
      }
      out.one21 = { sends: one.length };
    }
    return NextResponse.json({ ok: true, ...out, detail: { bday, rem, one } });
  } catch (e) { return errJson(e); }
}
