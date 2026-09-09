import { NextResponse } from "next/server";
import { errJson, HttpError, currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { idpSession } from "@/lib/idp-session";
import { hrmsTables } from "@/lib/hrms";
import { driveConfig, uploadToFolder } from "@/lib/drive";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/present — ATTENDANCE FROM A PHONE, IN THE FIELD (Dr Raghu, 8 Sep 2026).
 *
 * "The guy would login from his IDP then do attendance ... the photo he will
 * click which will have the GPS record and the time stamp ... this will allow
 * him to put in the attendance when it's Outdoor duty. Especially for service
 * and sales ... they can also set the attendance for up to 3 days back
 * without the photo stamp 3 times a month ... then he will sign out too."
 *
 * WHOSE ATTENDANCE IT IS, IS NEVER SENT BY THE BROWSER. It is read from the
 * IDP cookie, which is signed. A screen that posted its own employee number
 * would let any man mark any other man present, and attendance is the one
 * record where that matters most.
 *
 * THE PHOTO IS THE EVIDENCE, so a punch that claims one and has not got one
 * is refused rather than saved bare. The exception is the backdating road,
 * which by his rule carries no photo at all — and is therefore rationed:
 * three days a calendar month, none older than three days, counted off the
 * punches themselves so the count cannot drift from what happened.
 *
 * A FIX IS ASKED FOR BUT NOT DEMANDED. A phone indoors, or one whose owner
 * has refused location to every app on it, will not give one — and refusing
 * the punch would mean a man who came to work is marked absent by a browser
 * permission. It is recorded as missing, which is a fact somebody can act on.
 */
const S = (v: unknown) => String(v ?? "").trim();
const IST = "Asia/Kolkata";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: IST });   // YYYY-MM-DD
const BUCKET = "voice-notes";           // the private HRMS bucket, already shut to the browser

/** The man, from his signed cookie — or the Genie login if he has one. */
async function whoIsMarking(): Promise<{ id: string; name: string }> {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const eid = await idpSession();
  if (eid) {
    const { data } = await admin.from(T.employees).select("id, name").eq("id", eid).maybeSingle();
    return { id: String(eid), name: S(data?.name) || String(eid) };
  }
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in on /idp first.");
  const { data } = await admin.from(T.employees).select("id, name").ilike("email", u.email).maybeSingle();
  if (!data) throw new HttpError(403, "No employee record answers to your Genie login — ask HR to put your work e-mail on it.");
  return { id: String(data.id), name: S(data.name) };
}

const missing = (m: string) => /hrms_attendance_punch|does not exist|schema cache/i.test(m);

export async function GET() {
  try {
    const me = await whoIsMarking();
    const admin = adminClient();
    const from = new Date(Date.now() - 30 * 86400000).toLocaleDateString("en-CA", { timeZone: IST });

    const { data, error } = await admin.from("hrms_attendance_punch")
      .select("id, for_date, at, kind, source, lat, lng, accuracy_m, photo_link, photo_path, note")
      .eq("employee_id", me.id).gte("for_date", from)
      .order("at", { ascending: false }).limit(400);
    if (error) {
      if (missing(error.message)) return NextResponse.json({ needsMigration: true, me, days: [], backdatedLeft: 3 });
      throw new Error(error.message);
    }

    /* one line a day: first in, last out, and what it adds up to. The SUM is
       shown because he asked for it to be mapped — not because any rule has
       been agreed about what a short day means. */
    const byDay = new Map<string, { date: string; in: string | null; out: string | null; marks: unknown[] }>();
    for (const p of (data ?? []).slice().reverse()) {
      const d = String(p.for_date);
      const row = byDay.get(d) ?? { date: d, in: null, out: null, marks: [] };
      if (p.kind === "in" && !row.in) row.in = String(p.at);
      if (p.kind === "out") row.out = String(p.at);
      row.marks.push(p);
      byDay.set(d, row);
    }
    const days = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({
      ...d,
      minutes: d.in && d.out ? Math.max(0, Math.round((Date.parse(d.out) - Date.parse(d.in)) / 60000)) : null,
    }));

    /* the allowance, counted rather than remembered */
    const month = today().slice(0, 7);
    const { data: bd } = await admin.from("hrms_attendance_punch")
      .select("for_date").eq("employee_id", me.id).eq("source", "backdated").gte("for_date", `${month}-01`);
    const claimed = new Set((bd ?? []).map((r) => String(r.for_date))).size;

    const open = days.find((d) => d.date === today() && d.in && !d.out) ?? null;
    return NextResponse.json({ me, today: today(), days, backdatedLeft: Math.max(0, 3 - claimed), openNow: !!open });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await whoIsMarking();
    const admin = adminClient();
    const body = await req.json() as Record<string, unknown>;
    const kind = S(body.kind) === "out" ? "out" : "in";
    const backdate = S(body.for_date);
    const now = new Date();

    /* ── the backdating road: his rule, enforced ── */
    if (backdate && backdate !== today()) {
      const days = Math.round((Date.parse(today()) - Date.parse(backdate)) / 86400000);
      if (days < 0) throw new HttpError(400, "That day has not happened yet.");
      if (days > 3) throw new HttpError(400, `${backdate} is ${days} days back. Three is the limit — raise a ticket for anything older and HR will put it right.`);
      const month = today().slice(0, 7);
      const { data: bd } = await admin.from("hrms_attendance_punch")
        .select("for_date").eq("employee_id", me.id).eq("source", "backdated").gte("for_date", `${month}-01`);
      const claimed = new Set((bd ?? []).map((r) => String(r.for_date)));
      if (!claimed.has(backdate) && claimed.size >= 3)
        throw new HttpError(400, `Three days a month is the allowance and you have used all three (${[...claimed].sort().join(", ")}). Raise a ticket for this one.`);

      const { error } = await admin.from("hrms_attendance_punch").insert({
        employee_id: me.id, for_date: backdate, at: `${backdate}T${kind === "in" ? "09:30" : "18:30"}:00+05:30`,
        kind, source: "backdated", note: S(body.note) || null,
        device: S(req.headers.get("user-agent")).slice(0, 200), created_by: me.id,
      });
      if (error) {
        if (missing(error.message)) throw new HttpError(503, "Run migration 0163 first — attendance has nowhere to live yet.");
        if (/duplicate|unique/i.test(error.message)) throw new HttpError(409, `${backdate} is already marked.`);
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, backdated: backdate });
    }

    /* ── the ordinary road: a photo, a fix, and the moment ── */
    const dataUrl = S(body.photo);
    if (!dataUrl.startsWith("data:image/"))
      throw new HttpError(400, "The photo did not arrive. Allow the camera and try again — the picture is what makes the mark evidence.");
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > 3_000_000) throw new HttpError(400, "That photo is too large — try again, the camera should shrink it.");

    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const filename = `${me.id}-${today()}-${kind}-${stamp}.jpg`;

    /* DRIVE IS WHERE IT BELONGS; STORAGE IS WHERE IT CANNOT BE LOST. If the
       service account is not configured, or Drive refuses, the punch still
       stands and the photo is still kept — a man who came to work must not be
       unmarked because a folder was not shared. */
    let driveId: string | null = null, link: string | null = null, path: string | null = null;
    const cfg = driveConfig();
    if (cfg) {
      try {
        const up = await uploadToFolder(cfg, cfg.folderId, "Attendance photos",
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, filename, "image/jpeg");
        driveId = up.id; link = up.link;
      } catch (e) { swallow("present/drive", e); }
    }
    if (!driveId) {
      const p = `attendance/${me.id}/${filename}`;
      const { error: se } = await admin.storage.from(BUCKET).upload(p, bytes, { contentType: "image/jpeg", upsert: false });
      if (!se) path = p; else swallow("present/storage", se);
    }

    /* A DOUBLE PRESS IS ONE PUNCH. The database can only refuse an identical
       timestamp, and two taps a second apart are not identical — so the guard
       lives here, where a minute is allowed to mean a minute. (The index that
       tried to do this in SQL was refused: date_trunc over a timestamptz is
       not IMMUTABLE, and an index that reads differently per session is worse
       than none.) */
    const since = new Date(now.getTime() - 60_000).toISOString();
    const { data: recent } = await admin.from("hrms_attendance_punch")
      .select("at").eq("employee_id", me.id).eq("kind", kind).gte("at", since).limit(1);
    if (recent?.length)
      throw new HttpError(409, `You already signed ${kind} a moment ago — that press went through.`);

    const lat = Number(body.lat), lng = Number(body.lng), acc = Number(body.accuracy);
    const { error } = await admin.from("hrms_attendance_punch").insert({
      employee_id: me.id, for_date: today(), at: now.toISOString(), kind, source: "present",
      lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
      accuracy_m: Number.isFinite(acc) ? acc : null, place: S(body.place) || null,
      photo_drive_id: driveId, photo_link: link, photo_path: path,
      note: S(body.note) || null, device: S(req.headers.get("user-agent")).slice(0, 200), created_by: me.id,
    });
    if (error) {
      if (missing(error.message)) throw new HttpError(503, "Run migration 0163 first — attendance has nowhere to live yet.");
      if (/duplicate|unique/i.test(error.message)) throw new HttpError(409, "That is already marked — the press went through the first time.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, kind, at: now.toISOString(), photo: driveId ? "drive" : path ? "storage" : "none" });
  } catch (e) { return errJson(e); }
}
