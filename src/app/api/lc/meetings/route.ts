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
    if (id) {
      const { data: m, error } = await admin.from("lc_meeting").select("*").eq("id", id).maybeSingle();
      if (error) throw error; if (!m) throw new HttpError(404, "No such meeting.");
      await recordView(admin, "meeting", id, u.email);
      const viewed = (await viewsOf(admin, "meeting", [id])).map((v) => v.email);
      const [{ data: files }, { data: comments }] = await Promise.all([
        admin.from("lc_file").select("id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "meeting").eq("ref_id", id).order("created_at"),
        admin.from("lc_comment").select("id,body,added_by,created_at").eq("ref_kind", "meeting").eq("ref_id", id).order("created_at"),
      ]);
      return NextResponse.json({ meeting: { ...m, hours: hours(m.from_time, m.to_time), viewed }, files: files || [], comments: comments || [] });
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
      return { held_on, from_time: time(b.from_time), to_time: time(b.to_time), location: txt(b.location), attendees: names(b.attendees), guests: names(b.guests), minutes: txt(b.minutes) };
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
