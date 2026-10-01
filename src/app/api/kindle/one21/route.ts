import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * 1-2-1s (constitution 4.24: one a month, mandatory; Dr Raghu, 1 Oct 2026:
 * "the one-to-ones that each one is doing and the details thereof").
 * GET → every row (the year's plan plus what was done).
 * POST done   { id | (period, other_id), done_on, mode, note }  — either member marks it, with his own note
 *      plan   { period, member_a, member_b }                     — facilitator adds a planned pair
 *      remove { id }                                             — facilitator
 */
export async function GET() {
  try {
    await requireKindler();
    const { data, error } = await adminClient().from("kindle_one_to_one").select("id,period,member_a,member_b,planned,done_on,mode,note_a,note_b,created_at").order("period", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ rows: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "done") {
      let id = b.id ? String(b.id) : null;
      type R = { id: string; member_a: string; member_b: string };
      let row: R | null = null;
      if (id) { const { data } = await admin.from("kindle_one_to_one").select("id,member_a,member_b").eq("id", id).maybeSingle(); row = data as R; }
      else {
        const period = String(b.period || ""), other = String(b.other_id || "");
        if (!/^\d{4}-\d{2}-01$/.test(period) || !other) throw new HttpError(400, "Month and whom.");
        const [a, c] = [k.id, other].sort();
        const { data: ex } = await admin.from("kindle_one_to_one").select("id,member_a,member_b").eq("period", period).eq("member_a", a).eq("member_b", c).maybeSingle();
        if (ex) row = ex as R; else { const { data, error } = await admin.from("kindle_one_to_one").insert({ period, member_a: a, member_b: c, planned: false }).select("id,member_a,member_b").single(); if (error) throw error; row = data as R; }
        id = row!.id;
      }
      if (!row || (row.member_a !== k.id && row.member_b !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Only the two who met mark it.");
      const noteKey = row.member_a === k.id ? "note_a" : row.member_b === k.id ? "note_b" : "note_a";
      const patch: Record<string, unknown> = { done_on: b.done_on ? String(b.done_on) : new Date().toISOString().slice(0, 10) };
      if (["in_person", "call", "video"].includes(String(b.mode))) patch.mode = String(b.mode);
      if ("note" in b) patch[noteKey] = String(b.note || "").trim() || null;
      if (b.undo === true) patch.done_on = null;
      const { error } = await admin.from("kindle_one_to_one").update(patch).eq("id", id!);
      if (error) throw error;
      await kindleAudit(k, "one21_marked", { id });
      return NextResponse.json({ ok: true, id });
    }
    if (!isKindleAdmin(k)) throw new HttpError(403, "The facilitator plans the pairs.");
    if (action === "plan") {
      const period = String(b.period || ""); const [a, c] = [String(b.member_a || ""), String(b.member_b || "")].sort();
      if (!/^\d{4}-\d{2}-01$/.test(period) || !a || !c || a === c) throw new HttpError(400, "Month and two members.");
      const { error } = await admin.from("kindle_one_to_one").upsert({ period, member_a: a, member_b: c, planned: true }, { onConflict: "period,member_a,member_b" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") { await admin.from("kindle_one_to_one").delete().eq("id", String(b.id)); return NextResponse.json({ ok: true }); }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
