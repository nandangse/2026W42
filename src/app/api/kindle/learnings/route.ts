import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Learnings (Kindle 1.5.0, 17 Oct 2026). Every "inspiration and learning"
 * written in a check-in since 2023 lands in kindle_learning (the check-in
 * route keeps them in step); a learning noted between meetings goes in the
 * same table with no check-in behind it.
 * GET → every learning, newest first, with the month of the check-in it came from.
 * POST add    { body, noted_on? }  — mine
 *      edit   { id, body }         — mine, and only one noted here (a check-in's learning is edited in the check-in)
 *      remove { id }               — mine, or the facilitator
 */
export async function GET() {
  try {
    await requireKindler();
    const admin = adminClient();
    const [l, ck] = await Promise.all([
      admin.from("kindle_learning").select("id,member_id,noted_on,body,checkin_id,created_at").order("noted_on", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
      admin.from("kindle_checkin").select("id,period"),
    ]);
    if (l.error) throw l.error;
    const period = new Map((ck.data || []).map((c) => [String(c.id), String(c.period).slice(0, 10)]));
    const rows = (l.data || []).map((r) => ({ ...r, period: r.checkin_id ? period.get(String(r.checkin_id)) || null : null }));
    return NextResponse.json({ learnings: rows });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "add") {
      const body = String(b.body || "").trim();
      if (body.length < 3) throw new HttpError(400, "Write the learning.");
      const on = /^\d{4}-\d{2}-\d{2}$/.test(String(b.noted_on || "")) ? String(b.noted_on) : new Date().toISOString().slice(0, 10);
      const { data, error } = await admin.from("kindle_learning").insert({ member_id: k.id, noted_on: on, body, checkin_id: null }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "learning_added", { id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "edit" || action === "remove") {
      const id = String(b.id || "");
      const { data: row } = await admin.from("kindle_learning").select("member_id,checkin_id").eq("id", id).maybeSingle();
      if (!row) throw new HttpError(404, "No such learning.");
      const mine = row.member_id === k.id;
      if (action === "edit") {
        if (!mine) throw new HttpError(403, "Your own words only.");
        if (row.checkin_id) throw new HttpError(409, "This one came from a check-in; edit it there.");
        const body = String(b.body || "").trim(); if (body.length < 3) throw new HttpError(400, "Write the learning.");
        const { error } = await admin.from("kindle_learning").update({ body }).eq("id", id); if (error) throw error;
      } else {
        if (!mine && !isKindleAdmin(k)) throw new HttpError(403, "Your own learning, or the facilitator.");
        const { error } = await admin.from("kindle_learning").delete().eq("id", id); if (error) throw error;
        await kindleAudit(k, "learning_removed", { id });
      }
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
