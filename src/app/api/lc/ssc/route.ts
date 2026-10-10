import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireLeader } from "@/lib/lc/auth";
import { recordView, viewsOf } from "@/lib/lc/views";

export const dynamic = "force-dynamic";

/**
 * Start · Stop · Continue (Dr Raghu, 10 Oct 2026): three columns, a plus on
 * each, a lightbox asking "What do you want to start?", the detail and how
 * it touches the company as rich text, added by, date, liked by; view by
 * default, Edit for the author and the owner; thumbs up and down that tally.
 *
 *   GET                       → every card with its tally and my own reaction
 *   POST create { kind, title, details }      — any leader
 *        edit { id, title, details } · remove { id }   — author or owner
 *        react { id, value: up|down|none }     — one per person per card
 */
export async function GET() {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const [{ data: cards, error }, { data: reactions }] = await Promise.all([
      admin.from("lc_ssc").select("*").order("created_at", { ascending: false }),
      admin.from("lc_reaction").select("ref_id,email,value").eq("ref_kind", "ssc"),
    ]);
    if (error) throw error;
    const me = u.email.toLowerCase();
    const views = await viewsOf(admin, "ssc", (cards || []).map((c) => c.id));
    return NextResponse.json({
      cards: (cards || []).map((c) => {
        const rs = (reactions || []).filter((r) => r.ref_id === c.id);
        return { ...c, up: rs.filter((r) => r.value === "up").map((r) => r.email), down: rs.filter((r) => r.value === "down").map((r) => r.email), mine: rs.find((r) => r.email === me)?.value || null, viewed: views.filter((v) => v.ref_id === c.id).map((v) => v.email) };
      }),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const kindOf = (v: unknown) => { const s = String(v || ""); if (!["start", "stop", "continue"].includes(s)) throw new HttpError(400, "Start, stop or continue."); return s; };
    const own = async (id: string) => {
      const { data: c } = await admin.from("lc_ssc").select("added_by").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "No such card.");
      if (!mayEdit(u, c.added_by)) throw new HttpError(403, "The one who wrote it, or Dr Raghu.");
    };
    if (b.action === "create") {
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "Say what, in a sentence or three.");
      const { data, error } = await admin.from("lc_ssc").insert({ kind: kindOf(b.kind), title, details: String(b.details || "") || null, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || ""); await own(id);
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "Say what, in a sentence or three.");
      const patch: Record<string, unknown> = { title, details: String(b.details || "") || null, updated_at: new Date().toISOString() };
      if (b.kind) patch.kind = kindOf(b.kind);
      const { error } = await admin.from("lc_ssc").update(patch).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || ""); await own(id);
      await admin.from("lc_reaction").delete().eq("ref_kind", "ssc").eq("ref_id", id);
      const { error } = await admin.from("lc_ssc").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "view") { await recordView(admin, "ssc", String(b.id || ""), u.email); return NextResponse.json({ ok: true }); }
    if (b.action === "react") {
      const id = String(b.id || ""); const value = String(b.value || "none");
      if (value === "none") await admin.from("lc_reaction").delete().eq("ref_kind", "ssc").eq("ref_id", id).eq("email", u.email);
      else {
        if (!["up", "down"].includes(value)) throw new HttpError(400, "Up or down.");
        const { error } = await admin.from("lc_reaction").upsert({ ref_kind: "ssc", ref_id: id, email: u.email, value }, { onConflict: "ref_kind,ref_id,email" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
