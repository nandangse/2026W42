import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson } from "@/lib/auth";
import { currentKindler, isKindleAdmin, isKindleTreasurer, notInstalled } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/kindle/boot — everything the shell needs in one read: who I am,
 * the ten members (public fields), the group's settings, the constitution,
 * the meetings with attendance, each member's tally, fines due, birthdays
 * this month, and (1.5.0) each member's participation this year. One round
 * trip, then the sections draw.
 */
export async function GET() {
  try {
    const k = await currentKindler();
    if (!k) return NextResponse.json({ error: "Sign in to Kindle first." }, { status: 401 });
    const admin = adminClient();
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);

    const [mem, set, con, mtg, att, fine, fam, meRow, ck, o21, fb] = await Promise.all([
      admin.from("kindle_member").select("id,email,name,short_name,company,sector,designation,phone,linkedin,city,birthday,stay_at,office_at,about,photo_path,roles,is_admin,active,joined_on,left_on,sort_order,last_login_at,onboarded_at").order("sort_order"),
      admin.from("kindle_setting").select("key,value"),
      admin.from("kindle_constitution").select("id,version,revised_on,passed_by,body,created_at").eq("is_current", true).maybeSingle(),
      admin.from("kindle_meeting").select("id,meeting_on,date_exact,kind,title,venue,starts_at,ends_at,agenda,minutes,minutes_url,guru,presenters,status").order("meeting_on"),
      admin.from("kindle_attendance").select("meeting_id,member_id,status,late_min,early_min,note"),
      admin.from("kindle_fine").select("id,member_id,meeting_id,rule_code,amount,reason,levied_on,paid_on,paid_amount,waived"),
      admin.from("kindle_family").select("id,member_id,relation,name,birthday,is_legal,mail_wishes"),
      admin.from("kindle_member").select("must_change,onboarded_at").eq("id", k.id).maybeSingle(),
      /* for the participation score — each read tolerated if its table is not there yet */
      admin.from("kindle_checkin").select("member_id,period").gte("period", `${today.getFullYear()}-01-01`),
      admin.from("kindle_one_to_one").select("period,member_a,member_b,planned,done_on").gte("period", `${today.getFullYear()}-01-01`),
      admin.from("kindle_meeting_feedback").select("meeting_id,member_id"),
    ]);
    const firstErr = [mem, set, con, mtg, att, fine, fam].find((r) => r.error)?.error;
    if (firstErr) {
      if (notInstalled(firstErr)) return NextResponse.json({ error: "Kindle is not installed yet — run migration 0187.", notInstalled: true }, { status: 503 });
      throw firstErr;
    }

    const members = (mem.data || []).filter((m) => m.active || isKindleAdmin(k));
    /* each member's tally, from the attendance rows — never typed */
    const tally: Record<string, { present: number; absent: number; zoom: number; late: number; late_min: number; out_of: number; year_absent: number }> = {};
    for (const m of members) tally[String(m.id)] = { present: 0, absent: 0, zoom: 0, late: 0, late_min: 0, out_of: 0, year_absent: 0 };
    const yr = String(today.getFullYear());
    const mById = new Map((mtg.data || []).map((x) => [String(x.id), x]));
    for (const a of att.data || []) {
      const t = tally[String(a.member_id)]; if (!t) continue;
      t.out_of += 1;
      if (a.status === "present") t.present += 1;
      else if (a.status === "zoom") { t.zoom += 1; t.present += 1; }
      else if (a.status === "absent" || a.status === "excused") {
        t.absent += 1;
        const d = String(mById.get(String(a.meeting_id))?.meeting_on || "");
        if (d.startsWith(yr) && a.status === "absent") t.year_absent += 1;
      }
      if (Number(a.late_min) > 0) { t.late += 1; t.late_min += Number(a.late_min); }
    }
    const fines = fine.data || [];
    const due: Record<string, number> = {};
    for (const f of fines) if (!f.waived) due[String(f.member_id)] = (due[String(f.member_id)] || 0) + Number(f.amount) - Number(f.paid_amount || 0);

    const next = (mtg.data || []).find((x) => String(x.meeting_on) >= iso && x.status !== "cancelled") || null;
    const last = [...(mtg.data || [])].reverse().find((x) => String(x.meeting_on) < iso) || null;

    /* ---------------------------------------------- participation this year
       (Kindle 1.5.0). Five things the constitution asks of a member, each
       as done-of-due for the calendar year so far, folded into one score.
       Computed from the record on every read; nothing is typed or stored.
         meetings  attended / held this year (a meeting counts as held once
                   attendance is marked on it, so today's is not a miss yet)
         checkins  months with a check-in / months a meeting was held
         one21     1-2-1s done / 1-2-1s planned up to this month (extra ones count)
         feedback  meetings with feedback written / meetings held
         ontime    attended with no late minutes / attended                      */
    const thisMonth = iso.slice(0, 7);
    const marked = new Set((att.data || []).map((a) => String(a.meeting_id)));
    const held = (mtg.data || []).filter((m) => String(m.meeting_on).startsWith(yr) && String(m.meeting_on) <= iso && m.status !== "cancelled" && marked.has(String(m.id)));
    const heldIds = new Set(held.map((m) => String(m.id)));
    const heldMonths = new Set(held.filter((m) => m.kind === "monthly").map((m) => String(m.meeting_on).slice(0, 7)));
    type Part = { meetings: [number, number]; checkins: [number, number]; one21: [number, number]; feedback: [number, number]; ontime: [number, number]; score: number | null };
    const participation: Record<string, Part> = {};
    for (const m of members) {
      const id = String(m.id);
      const mine = (att.data || []).filter((a) => String(a.member_id) === id && heldIds.has(String(a.meeting_id)));
      const attended = mine.filter((a) => a.status === "present" || a.status === "zoom");
      const months = new Set((ck.data || []).filter((c) => String(c.member_id) === id).map((c) => String(c.period).slice(0, 7)).filter((p) => heldMonths.has(p)));
      const pairs = (o21.data || []).filter((o) => (String(o.member_a) === id || String(o.member_b) === id) && String(o.period).slice(0, 7) <= thisMonth);
      const fbMine = new Set((fb.data || []).filter((f) => String(f.member_id) === id && heldIds.has(String(f.meeting_id))).map((f) => String(f.meeting_id)));
      const p: Part = {
        meetings: [attended.length, held.length],
        checkins: [months.size, heldMonths.size],
        one21: [pairs.filter((o) => o.done_on).length, pairs.filter((o) => o.planned).length],
        feedback: [fbMine.size, fb.error ? 0 : held.length],
        ontime: [attended.filter((a) => !(Number(a.late_min) > 0)).length, attended.length],
        score: null,
      };
      const W: [keyof Omit<Part, "score">, number][] = [["meetings", 0.35], ["checkins", 0.25], ["one21", 0.2], ["feedback", 0.1], ["ontime", 0.1]];
      let sum = 0, wsum = 0;
      for (const [key, w] of W) { const [a, b] = p[key]; if (b > 0) { sum += w * Math.min(1, a / b); wsum += w; } }
      p.score = wsum > 0 ? Math.round((sum / wsum) * 100) : null;
      participation[id] = p;
    }

    /* birthdays this month — members and the legal family, by month-day */
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const bday: { who: string; of: string | null; on: string; relation: string }[] = [];
    for (const m of members) if (m.birthday && String(m.birthday).slice(5, 7) === mm) bday.push({ who: m.name, of: null, on: String(m.birthday).slice(5), relation: "member" });
    for (const f of fam.data || []) if (f.birthday && f.is_legal && String(f.birthday).slice(5, 7) === mm) {
      const of = members.find((m) => String(m.id) === String(f.member_id));
      bday.push({ who: f.name, of: of?.short_name || of?.name || null, on: String(f.birthday).slice(5), relation: f.relation });
    }
    bday.sort((a, b) => a.on.localeCompare(b.on));

    const settings: Record<string, string> = {};
    for (const s of set.data || []) settings[String(s.key)] = String(s.value ?? "");

    const admins = isKindleAdmin(k);
    return NextResponse.json({
      me: { ...k, must_change: !!meRow.data?.must_change, onboarded: !!meRow.data?.onboarded_at, admin: admins, treasurer: isKindleTreasurer(k) },
      members: members.map((m) => ({ ...m, last_login_at: admins ? m.last_login_at : undefined })),
      family: fam.data || [], /* every Kindler sees every family — the Directory shows them by design (1.0.0); the dead filter that said so twice is gone (audit S15) */
      settings, constitution: con.data || null,
      meetings: mtg.data || [], attendance: att.data || [], fines, tally, due, next, last, birthdays: bday, today: iso, participation,
    });
  } catch (e) { return errJson(e); }
}
