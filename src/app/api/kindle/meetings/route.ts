import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { kindleAudit, requireKindleAdmin, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/kindle/meetings
 *   save   { id?, meeting_on, kind, title, venue, starts_at, ends_at, agenda, minutes, minutes_url, guru, status }  (facilitator)
 *   mark   { meeting_id, member_id, status, late_min, early_min, note }  (facilitator, or the scribe)
 *          — the late fine is struck from the constitution's slabs the moment the minutes are typed
 *   remove { id }  (facilitator; only a meeting nobody attended)
 */
const LATE_SLABS: [number, string][] = [[5, "late_5"], [15, "late_15"], [Infinity, "late_more"]];

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");
    const mayMark = k.is_admin || k.roles.some((r) => ["facilitator", "co_facilitator", "scribe"].includes(r));

    if (action === "mark") {
      if (!mayMark) throw new HttpError(403, "Attendance is marked by the facilitator or the scribe.");
      const meeting_id = String(body.meeting_id || ""), member_id = String(body.member_id || "");
      const status = String(body.status || "present");
      if (!["present", "absent", "zoom", "excused"].includes(status)) throw new HttpError(400, "Status?");
      const late_min = Math.max(0, Number(body.late_min || 0) | 0), early_min = Math.max(0, Number(body.early_min || 0) | 0);
      const row = { meeting_id, member_id, status, late_min, early_min, note: body.note ? String(body.note) : null, marked_by: k.email, marked_at: new Date().toISOString() };
      const { error } = await admin.from("kindle_attendance").upsert(row, { onConflict: "meeting_id,member_id" });
      if (error) throw error;
      /* the computed fine: one row per meeting+member for lateness, replaced each time */
      await admin.from("kindle_fine").delete().eq("meeting_id", meeting_id).eq("member_id", member_id).in("rule_code", ["late_5", "late_15", "late_more"]).is("paid_on", null);
      const worst = Math.max(late_min, early_min);
      if (status !== "absent" && status !== "excused" && worst > 0) {
        const code = LATE_SLABS.find(([max]) => worst <= max)![1];
        const { data: rule } = await admin.from("kindle_fine_rule").select("amount,label").eq("code", code).maybeSingle();
        const { data: mt } = await admin.from("kindle_meeting").select("meeting_on").eq("id", meeting_id).maybeSingle();
        if (rule) await admin.from("kindle_fine").insert({ member_id, meeting_id, rule_code: code, amount: rule.amount, reason: `${late_min ? `${late_min} min late` : ""}${late_min && early_min ? ", " : ""}${early_min ? `left ${early_min} min early` : ""}`, levied_on: mt?.meeting_on || new Date().toISOString().slice(0, 10), created_by: k.email });
      }
      await kindleAudit(k, "attendance_marked", { meeting_id, member_id, status, late_min, early_min });
      return NextResponse.json({ ok: true });
    }

    await requireKindleAdmin();

    if (action === "save") {
      const f: Record<string, unknown> = {};
      for (const key of ["meeting_on", "kind", "title", "venue", "starts_at", "ends_at", "agenda", "minutes", "minutes_url", "guru", "status"]) if (key in body) f[key] = body[key] === "" ? null : body[key];
      if (Array.isArray(body.presenters)) f.presenters = body.presenters;
      f.updated_at = new Date().toISOString();
      if (body.id) {
        const { error } = await admin.from("kindle_meeting").update(f).eq("id", String(body.id));
        if (error) throw error;
        await kindleAudit(k, "meeting_saved", { id: body.id, keys: Object.keys(f) });
        return NextResponse.json({ ok: true, id: body.id });
      }
      if (!f.meeting_on) throw new HttpError(400, "A date, please.");
      const { data, error } = await admin.from("kindle_meeting").insert({ ...f, kind: f.kind || "monthly", status: f.status || "planned", created_by: k.email }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "meeting_added", { id: data.id, on: f.meeting_on });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "remove") {
      const id = String(body.id || "");
      const { count } = await admin.from("kindle_attendance").select("member_id", { count: "exact", head: true }).eq("meeting_id", id);
      if (count) throw new HttpError(409, "Attendance has been marked for this meeting; cancel it instead.");
      const { error } = await admin.from("kindle_meeting").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
