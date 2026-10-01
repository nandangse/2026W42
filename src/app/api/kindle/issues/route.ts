import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

import { THEMES } from "@/lib/kindle/themes";

/**
 * Burning issues — the sounding board.
 * GET → every entry (newest first).
 * POST add    { statement, efforts, why_important, accomplished, urgency, related_to }  — mine
 *      edit   { id, …same }                                                            — mine, while open
 *      triage { id, theme, status, discussed_in, outcome }                              — facilitator
 */
export async function GET() {
  try {
    await requireKindler();
    const { data, error } = await adminClient().from("kindle_issue").select("id,member_id,submitted_at,statement,efforts,why_important,accomplished,urgency,related_to,theme,status,discussed_in,outcome").order("submitted_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return NextResponse.json({ issues: data || [], themes: THEMES });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const txt = (key: string) => { const s = String(b[key] ?? "").trim(); return s || null; };
    if (action === "add" || action === "edit") {
      const statement = txt("statement");
      if (!statement || statement.length < 8) throw new HttpError(400, "Say the problem in a sentence at least.");
      const urg = Number(b.urgency); const fields = { statement, efforts: txt("efforts"), why_important: txt("why_important"), accomplished: txt("accomplished"), urgency: urg >= 1 && urg <= 10 ? urg : null, related_to: txt("related_to") };
      if (action === "add") {
        const { data, error } = await admin.from("kindle_issue").insert({ member_id: k.id, ...fields }).select("id").single();
        if (error) throw error;
        await kindleAudit(k, "issue_added", { id: data.id });
        return NextResponse.json({ ok: true, id: data.id });
      }
      const id = String(b.id || "");
      const { data: cur } = await admin.from("kindle_issue").select("member_id,status").eq("id", id).maybeSingle();
      if (!cur || (cur.member_id !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Your own entry only.");
      const { error } = await admin.from("kindle_issue").update(fields).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "triage") {
      if (!isKindleAdmin(k)) throw new HttpError(403, "The facilitator files and closes issues.");
      const id = String(b.id || "");
      const patch: Record<string, unknown> = {};
      if ("theme" in b) patch.theme = txt("theme");
      if ("status" in b && ["open", "discussed", "resolved", "parked"].includes(String(b.status))) patch.status = String(b.status);
      if ("discussed_in" in b) patch.discussed_in = b.discussed_in ? String(b.discussed_in) : null;
      if ("outcome" in b) patch.outcome = txt("outcome");
      const { error } = await admin.from("kindle_issue").update(patch).eq("id", id);
      if (error) throw error;
      await kindleAudit(k, "issue_triaged", { id, ...patch });
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
