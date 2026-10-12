import { relatedTo } from "@/lib/lc/related";
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireLeader } from "@/lib/lc/auth";
import { recordView, viewsOf } from "@/lib/lc/views";

export const dynamic = "force-dynamic";

/**
 * Meetings (Dr Raghu, 10 Oct 2026): "all the Leaders Council meeting minutes
 * … Date, Time (from and to, which will also calculate the number of hours),
 * Location, Attendees, Minutes … put pictures, documents, and everything
 * else." Genie formats the minutes through /api/lc/genie.
 *
 *   GET            → the list, newest first, with file counts
 *   GET ?id=…      → one, with files and comments
 *   POST create { held_on, from_time, to_time, location, attendees[], minutes }  — any leader
 *        edit { id, … }                — the author or the owner
 *        remove { id }                 — the author or the owner
 *        comment { id, body } · uncomment { comment_id }
 */
const hours = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const m = (t: string) => { const [h, mi] = t.split(":").map(Number); return h * 60 + (mi || 0); };
  const d = m(b) - m(a);
  return d > 0 ? Math.round((d / 60) * 100) / 100 : null;
};

export async function GET(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    /* THE CHECK-IN LIGHTBOX: my check-in on this meeting (or the leader's, when Dr Raghu fills it for them) and the goals from the one before */
    const ck = new URL(req.url).searchParams.get("checkin");
    if (ck) {
      const who = u.isOwner && new URL(req.url).searchParams.get("for") ? String(new URL(req.url).searchParams.get("for")).toLowerCase() : u.email;
      const [{ data: mine }, { data: earlier }] = await Promise.all([
        admin.from("lc_checkin").select("*").eq("meeting_id", ck).eq("email", who).maybeSingle(),
        admin.from("lc_checkin").select("goals,plan_99,on_date,meeting_id").eq("email", who).neq("meeting_id", ck).order("on_date", { ascending: false }).limit(1),
      ]);
      return NextResponse.json({ mine: mine || null, previous: earlier?.[0] || null });
    }
    if (id) {
      const { data: m, error } = await admin.from("lc_meeting").select("*").eq("id", id).maybeSingle();
      if (error) throw error; if (!m) throw new HttpError(404, "No such meeting.");
      await recordView(admin, "meeting", id, u.email);
      const viewed = (await viewsOf(admin, "meeting", [id])).map((v) => v.email);
      const [{ data: files }, { data: comments }, { data: checkins }] = await Promise.all([
        admin.from("lc_file").select("id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "meeting").eq("ref_id", id).order("created_at"),
        admin.from("lc_comment").select("id,body,added_by,created_at").eq("ref_kind", "meeting").eq("ref_id", id).order("created_at"),
        admin.from("lc_checkin").select("*").eq("meeting_id", id).order("created_at"),
      ]);
      /* the thumbs up, the heart and the talk on each check-in (Dr Raghu, 12 Oct 2026) */
      const ckIds = (checkins || []).map((c) => String(c.id));
      const [{ data: ckReacts }, { data: ckTalk }] = ckIds.length ? await Promise.all([
        admin.from("lc_reaction").select("ref_id,email,value").eq("ref_kind", "checkin").in("ref_id", ckIds),
        admin.from("lc_comment").select("id,ref_id,body,added_by,created_at").eq("ref_kind", "checkin").in("ref_id", ckIds).order("created_at"),
      ]) : [{ data: [] }, { data: [] }];
      const withTalk = (checkins || []).map((c) => {
        const rs = (ckReacts || []).filter((r) => r.ref_id === c.id);
        return { ...c, up: rs.filter((r) => r.value === "up").map((r) => r.email), heart: rs.filter((r) => r.value === "heart").map((r) => r.email), mine: rs.find((r) => r.email === u.email)?.value || null, comments: (ckTalk || []).filter((x) => x.ref_id === c.id).map(({ ref_id: _r, ...x }) => x) };
      });
      return NextResponse.json({ meeting: { ...m, hours: hours(m.from_time, m.to_time), viewed }, files: files || [], comments: comments || [], checkins: withTalk });
    }
    const [{ data: ms, error }, { data: files }] = await Promise.all([
      admin.from("lc_meeting").select("id,held_on,from_time,to_time,location,attendees,guests,created_by,created_at,updated_at").order("held_on", { ascending: false }).order("created_at", { ascending: false }),
      admin.from("lc_file").select("ref_id").eq("ref_kind", "meeting"),
    ]);
    if (error) throw error;
    return NextResponse.json({ meetings: (ms || []).map((m) => ({ ...m, hours: hours(m.from_time, m.to_time), files: (files || []).filter((f) => f.ref_id === m.id).length })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    const time = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : null; };
    const fields = () => {
      const held_on = String(b.held_on || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(held_on)) throw new HttpError(400, "The date.");
      const names = (v: unknown) => (Array.isArray(v) ? v : String(v || "").split(/[,\n]/)).map((x: unknown) => String(x).trim()).filter(Boolean);
      return { held_on, from_time: time(b.from_time), to_time: time(b.to_time), location: txt(b.location), attendees: names(b.attendees), guests: names(b.guests), agenda: txt(b.agenda), reading: txt(b.reading), minutes: txt(b.minutes) };
    };
    const own = async (id: string) => {
      const { data: m } = await admin.from("lc_meeting").select("created_by").eq("id", id).maybeSingle();
      if (!m) throw new HttpError(404, "No such meeting.");
      if (!mayEdit(u, m.created_by)) throw new HttpError(403, "The one who wrote these minutes, or Dr Raghu.");
    };
    if (b.action === "create") {
      const { data, error } = await admin.from("lc_meeting").insert({ ...fields(), created_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || ""); await own(id);
      const { error } = await admin.from("lc_meeting").update({ ...fields(), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || ""); await own(id);
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "meeting").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "meeting").eq("ref_id", id);
      await admin.from("lc_comment").delete().eq("ref_kind", "meeting").eq("ref_id", id);
      const { error } = await admin.from("lc_meeting").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    /**
     * THE LEADERS CHECK-IN (Dr Raghu, 10 Oct 2026): one per leader per meeting —
     * T1, T2, B1, the burning issue, goals and results, the 99-day plan, the
     * learning. The burning issue goes to the Solution Board as a problem the
     * first time; after that the words follow it.
     */
    if (b.action === "checkin_save") {
      const meeting_id = String(b.id || "");
      const { data: m } = await admin.from("lc_meeting").select("id,held_on").eq("id", meeting_id).maybeSingle();
      if (!m) throw new HttpError(404, "No such meeting.");
      const clean = (v: unknown) => { const s = String(v ?? "").replace(/\u0000/g, "").trim(); return s || null; };
      /* Dr Raghu may fill a leader's check-in for them (read out in the room); everyone else writes their own */
      const email = u.isOwner && b.for_email ? String(b.for_email).toLowerCase() : u.email;
      const goals = (Array.isArray(b.goals) ? b.goals : []).map((g: { goal?: unknown; result?: unknown }) => ({ goal: String(g?.goal || "").trim(), result: String(g?.result || "").trim() })).filter((g: { goal: string; result: string }) => g.goal || g.result);
      const { data: prev } = await admin.from("lc_checkin").select("id,burning_problem_id").eq("meeting_id", meeting_id).eq("email", email).maybeSingle();
      const burning = clean(b.burning);
      let burning_problem_id: string | null = prev?.burning_problem_id ? String(prev.burning_problem_id) : null;
      if (burning) {
        const firstLine = burning.split(/\n/)[0].replace(/<[^>]+>/g, "").trim().slice(0, 160) || "Burning issue";
        const related_to = relatedTo(b.burning_related_to);
        if (burning_problem_id) await admin.from("lc_problem").update({ title: firstLine, related_to, description: `<p>${burning.replace(/\n/g, "<br>")}</p><p><i>Raised as the burning issue at the Leaders Council of ${m.held_on}.</i></p>`, updated_at: new Date().toISOString() }).eq("id", burning_problem_id).eq("added_by", email);
        else {
          const d = new Date(); d.setUTCDate(d.getUTCDate() + 7);
          const { data: p } = await admin.from("lc_problem").insert({ title: firstLine, related_to, description: `<p>${burning.replace(/\n/g, "<br>")}</p><p><i>Raised as the burning issue at the Leaders Council of ${m.held_on}.</i></p>`, tentative_on: d.toISOString().slice(0, 10), added_by: email }).select("id").single();
          burning_problem_id = p ? String(p.id) : null;
        }
      }
      const row = { meeting_id, email, burning_related_to: relatedTo(b.burning_related_to), on_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.on_date || "")) ? String(b.on_date) : m.held_on, t1: clean(b.t1), t2: clean(b.t2), b1: clean(b.b1), burning, burning_problem_id, goals, plan_99: clean(b.plan_99), learning: clean(b.learning), updated_at: new Date().toISOString() };
      const { error } = await admin.from("lc_checkin").upsert(row, { onConflict: "meeting_id,email" });
      if (error) throw error;
      return NextResponse.json({ ok: true, burning_problem_id });
    }
    /* A THUMBS UP OR A HEART ON A CHECK-IN — one per leader; the same again takes it back */
    if (b.action === "checkin_react") {
      const id = String(b.id || ""); const value = String(b.value || "");
      if (!["up", "heart"].includes(value)) throw new HttpError(400, "A thumbs up or a heart.");
      const { data: had } = await admin.from("lc_reaction").select("value").eq("ref_kind", "checkin").eq("ref_id", id).eq("email", u.email).maybeSingle();
      if (had?.value === value) await admin.from("lc_reaction").delete().eq("ref_kind", "checkin").eq("ref_id", id).eq("email", u.email);
      else {
        const { error } = await admin.from("lc_reaction").upsert({ ref_kind: "checkin", ref_id: id, email: u.email, value }, { onConflict: "ref_kind,ref_id,email" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "checkin_comment") {
      const id = String(b.id || ""); const body = String(b.body || "").replace(/\u0000/g, "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data: ck } = await admin.from("lc_checkin").select("id").eq("id", id).maybeSingle();
      if (!ck) throw new HttpError(404, "No such check-in.");
      const { data, error } = await admin.from("lc_comment").insert({ ref_kind: "checkin", ref_id: id, body, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "comment") {
      const id = String(b.id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data, error } = await admin.from("lc_comment").insert({ ref_kind: "meeting", ref_id: id, body, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "uncomment") {
      const { data: c } = await admin.from("lc_comment").select("added_by").eq("id", String(b.comment_id)).maybeSingle();
      if (!c || !mayEdit(u, c.added_by)) throw new HttpError(403, "Your own comment.");
      await admin.from("lc_comment").delete().eq("id", String(b.comment_id));
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
