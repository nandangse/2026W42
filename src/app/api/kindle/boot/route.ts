import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson } from "@/lib/auth";
import { currentKindler, isKindleAdmin, isKindleTreasurer, notInstalled } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/kindle/boot — everything the shell needs in one read: who I am,
 * the ten members (public fields), the group's settings, the constitution,
 * the meetings with attendance, each member's tally, fines due, birthdays
 * this month. One round trip, then the sections draw.
 */
export async function GET() {
  try {
    const k = await currentKindler();
    if (!k) return NextResponse.json({ error: "Sign in to Kindle first." }, { status: 401 });
    const admin = adminClient();
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);

    const [mem, set, con, mtg, att, fine, fam, meRow] = await Promise.all([
      admin.from("kindle_member").select("id,email,name,short_name,company,sector,designation,phone,linkedin,city,birthday,stay_at,office_at,about,photo_path,roles,is_admin,active,joined_on,left_on,sort_order,last_login_at,onboarded_at").order("sort_order"),
      admin.from("kindle_setting").select("key,value"),
      admin.from("kindle_constitution").select("id,version,revised_on,passed_by,body,created_at").eq("is_current", true).maybeSingle(),
      admin.from("kindle_meeting").select("id,meeting_on,date_exact,kind,title,venue,starts_at,ends_at,agenda,minutes,minutes_url,guru,presenters,status").order("meeting_on"),
      admin.from("kindle_attendance").select("meeting_id,member_id,status,late_min,early_min,note"),
      admin.from("kindle_fine").select("id,member_id,meeting_id,rule_code,amount,reason,levied_on,paid_on,paid_amount,waived"),
      admin.from("kindle_family").select("id,member_id,relation,name,birthday,is_legal,mail_wishes"),
      admin.from("kindle_member").select("must_change,onboarded_at").eq("id", k.id).maybeSingle(),
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
      family: (fam.data || []).filter((f) => admins || String(f.member_id) === k.id || true),
      settings, constitution: con.data || null,
      meetings: mtg.data || [], attendance: att.data || [], fines, tally, due, next, last, birthdays: bday, today: iso,
    });
  } catch (e) { return errJson(e); }
}
