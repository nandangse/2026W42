import { NextResponse } from "next/server";
import { requireHrms, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";

export const dynamic = "force-dynamic";

const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;

/**
 * GET /api/hrms/idp — the management side of the IDP.
 *
 * The person writes at /idp and sees only their own; HR and the owner read
 * them HERE, behind the same gate as every other people record. The consent
 * each person ticked named exactly this readership — Management, HR and
 * their HoD — and this route is two-thirds of that promise. (The HoD third
 * needs its own gate and does not exist yet; nothing here pretends it does.)
 *
 *   GET /api/hrms/idp          — every attempt, newest first
 *   GET /api/hrms/idp?id=<id>  — one, in full: answers, ratings, recordings
 *                                with their transcripts, attachments, the
 *                                consent, and the salary they asked for
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data: r, error } = await admin.from("hrms_idp").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!r) return NextResponse.json({ error: "No such IDP" }, { status: 404 });

      const audio = (r.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
      const audioUrls: Record<string, { url: string | null; seconds: number | null; at: string; transcript: string | null }[]> = {};
      for (const [qid, list] of Object.entries(audio)) {
        audioUrls[qid] = await Promise.all(list.map(async (a) => {
          const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
          return { url: sgn?.signedUrl ?? null, seconds: a.seconds, at: a.at, transcript: a.transcript ?? null };
        }));
      }
      const attachments = await Promise.all(((r.attachments || []) as { path: string; name: string; size: number; at: string }[]).map(async (a) => {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
        return { ...a, url: sgn?.signedUrl ?? null };
      }));
      return NextResponse.json({ idp: { ...r, audioUrls, attachments } });
    }

    const { data, error } = await admin
      .from("hrms_idp")
      .select("id, employee_id, person_email, person_name, cycle, started_at, submitted_at, consent_at, answers, ratings, audio, attachments, role_at_time")
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) {
      if (/hrms_idp|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ idps: [], needsMigration: true });
      throw new Error(error.message);
    }

    // names off the master, so the list reads as people rather than emails
    const T = await hrmsTables(admin);
    const ids = [...new Set((data || []).map((r) => r.employee_id).filter(Boolean))] as string[];
    const nameOf = new Map<string, string>();
    if (ids.length) {
      const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
      for (const e of emps || []) nameOf.set(String(e.id), String(e.name));
    }

    return NextResponse.json({
      idps: (data || []).map((r) => {
        const answers = (r.answers || {}) as Record<string, string>;
        const audio = (r.audio || {}) as Record<string, unknown[]>;
        return {
          id: r.id,
          employee_id: r.employee_id,
          name: r.employee_id ? nameOf.get(String(r.employee_id)) || r.person_name || r.person_email : r.person_name || r.person_email,
          email: r.person_email,
          cycle: r.cycle,
          role: r.role_at_time,
          started_at: r.started_at,
          submitted_at: r.submitted_at,
          answered: Object.values(answers).filter((v) => String(v).trim()).length,
          rated: Object.keys((r.ratings || {}) as object).length,
          recordings: Object.values(audio).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0),
          attachments: ((r.attachments || []) as unknown[]).length,
          askGross: String(answers["ask_gross"] || "").trim() || null,
        };
      }),
    });
  } catch (e) {
    return errJson(e);
  }
}
