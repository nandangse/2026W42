import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fieldPerson, isFieldTeam } from "@/lib/field-person";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/idp/attendance — THE OUTDOOR SERVICE TEAM'S CHECK IN AND CHECK OUT
 * (Dr Raghu, 12 Oct 2026: "Automated Attendance system for Outdoor service
 * Team — in genie.nandan.co.in/idp show attendance. Keep it such that they
 * can go there and show a button check in - check out with gps coordinate
 * captured and also photo.")
 *
 *   GET                       → who I am, may I punch, today's punches, the last 30 days
 *   POST multipart { kind: in|out, lat, lng, accuracy, photo }
 *
 * Only the person's own punches — there is no parameter that names another.
 * A punch needs BOTH the GPS fix and the photo; in and out alternate.
 */
const BUCKET = "field-attendance";
const istDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET() {
  try {
    const admin = adminClient();
    const me = await fieldPerson(admin);
    if (!me) throw new HttpError(401, "Sign in first.");
    const since = new Date(Date.now() - 31 * 864e5).toISOString();
    const { data, error } = await admin.from("seva_attendance").select("id, kind, at, day, lat, lng, accuracy_m, photo_path").eq("employee_id", me.id).gte("at", since).order("at", { ascending: false });
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, me, mayPunch: false, punches: [] }); throw error; }
    const today = istDay();
    const todays = (data || []).filter((p) => p.day === today);
    const signed = await Promise.all(todays.map(async (p) => {
      const { data: s } = p.photo_path ? await admin.storage.from(BUCKET).createSignedUrl(String(p.photo_path), 3600) : { data: null };
      return { ...p, photo_url: s?.signedUrl ?? null };
    }));
    const owner = !!(await currentUser().catch(() => null))?.isOwner;
    return NextResponse.json({ installed: true, me: { id: me.id, name: me.name, designation: me.designation }, mayPunch: isFieldTeam(me) || owner, today, todays: signed, punches: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const admin = adminClient();
    const me = await fieldPerson(admin);
    if (!me) throw new HttpError(401, "Sign in first.");
    const owner = !!(await currentUser().catch(() => null))?.isOwner;
    if (!isFieldTeam(me) && !owner) throw new HttpError(403, "Attendance here is for the outdoor service team — HR puts you in the Service department.");
    const fd = await req.formData();
    const kind = String(fd.get("kind") || "");
    if (kind !== "in" && kind !== "out") throw new HttpError(400, "Check in or check out?");
    const lat = Number(fd.get("lat")), lng = Number(fd.get("lng")), acc = Number(fd.get("accuracy"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) throw new HttpError(400, "No GPS position came with it — allow location on the phone and try again.");
    const photo = fd.get("photo");
    if (!(photo instanceof Blob) || photo.size < 2000) throw new HttpError(400, "Take the photo first.");
    if (photo.size > 8 * 1024 * 1024) throw new HttpError(400, "The photo is too large — over 8 MB.");

    const day = istDay();
    const { data: last } = await admin.from("seva_attendance").select("kind, day").eq("employee_id", me.id).order("at", { ascending: false }).limit(1).maybeSingle();
    const openToday = last && last.day === day && last.kind === "in";
    if (kind === "in" && openToday) throw new HttpError(409, "You are already checked in — check out first.");
    if (kind === "out" && !openToday) throw new HttpError(409, "Check in first — there is no check-in today to close.");

    const path = `${me.id}/${day}/${Date.now()}-${kind}.jpg`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: photo.type || "image/jpeg", upsert: false });
    if (upErr) throw new Error(`The photo did not save: ${upErr.message}`);
    const { data, error } = await admin.from("seva_attendance").insert({
      employee_id: me.id, employee_name: me.name, email: me.email, kind, day,
      lat, lng, accuracy_m: Number.isFinite(acc) ? Math.round(acc) : null, photo_path: path,
      device: String(req.headers.get("user-agent") || "").slice(0, 200),
    }).select("id, at").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id, at: data.at });
  } catch (e) { return errJson(e); }
}
