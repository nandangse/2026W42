import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * The message board (Dr Raghu, 1 Oct 2026: "a topic can be put in, and we
 * can use it for conversation with each other").
 * GET            → topics, newest activity first, with post counts
 * GET ?topic=id  → that topic's posts
 * POST topic  { title, body }            — any member
 *      post   { topic_id, body, reply_to? } — any member
 *      edit   { post_id, body }           — mine
 *      remove { post_id } | { topic_id }  — mine, or the facilitator
 *      pin    { topic_id, pinned } · close { topic_id, closed }  — facilitator
 */
export async function GET(req: Request) {
  try {
    await requireKindler();
    const admin = adminClient();
    const topic = new URL(req.url).searchParams.get("topic");
    if (topic) {
      const { data, error } = await admin.from("kindle_post").select("id,topic_id,member_id,body,reply_to,created_at,edited_at").eq("topic_id", topic).order("created_at");
      if (error) throw error;
      return NextResponse.json({ posts: data || [] });
    }
    const [{ data: topics, error }, { data: posts }] = await Promise.all([
      admin.from("kindle_topic").select("id,title,body,created_by,pinned,closed,created_at,last_post_at").order("pinned", { ascending: false }).order("last_post_at", { ascending: false }).limit(300),
      admin.from("kindle_post").select("topic_id,member_id,created_at"),
    ]);
    if (error) throw error;
    const out = (topics || []).map((t) => { const ps = (posts || []).filter((p) => p.topic_id === t.id); return { ...t, posts: ps.length, last_by: ps.length ? ps[ps.length - 1].member_id : t.created_by, voices: new Set(ps.map((p) => p.member_id)).size }; });
    return NextResponse.json({ topics: out });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const now = new Date().toISOString();
    if (action === "topic") {
      const title = String(b.title || "").trim(); const body = String(b.body || "").trim();
      if (title.length < 3) throw new HttpError(400, "A title, please.");
      const { data, error } = await admin.from("kindle_topic").insert({ title, body: body || null, created_by: k.id }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "topic_created", { id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "post") {
      const topic_id = String(b.topic_id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data: t } = await admin.from("kindle_topic").select("closed").eq("id", topic_id).maybeSingle();
      if (!t) throw new HttpError(404, "No such topic."); if (t.closed) throw new HttpError(409, "This topic is closed.");
      const { data, error } = await admin.from("kindle_post").insert({ topic_id, member_id: k.id, body, reply_to: b.reply_to ? String(b.reply_to) : null }).select("id").single();
      if (error) throw error;
      await admin.from("kindle_topic").update({ last_post_at: now }).eq("id", topic_id);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "edit") {
      const post_id = String(b.post_id || ""); const body = String(b.body || "").trim();
      const { data: p } = await admin.from("kindle_post").select("member_id").eq("id", post_id).maybeSingle();
      if (!p || p.member_id !== k.id) throw new HttpError(403, "Your own words only.");
      if (!body) throw new HttpError(400, "Say something.");
      await admin.from("kindle_post").update({ body, edited_at: now }).eq("id", post_id);
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      if (b.post_id) {
        const { data: p } = await admin.from("kindle_post").select("member_id").eq("id", String(b.post_id)).maybeSingle();
        if (!p || (p.member_id !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Your own post, or the facilitator.");
        await admin.from("kindle_post").delete().eq("id", String(b.post_id));
      } else {
        const { data: t } = await admin.from("kindle_topic").select("created_by").eq("id", String(b.topic_id)).maybeSingle();
        if (!t || (t.created_by !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Your own topic, or the facilitator.");
        await admin.from("kindle_topic").delete().eq("id", String(b.topic_id));
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "pin" || action === "close") {
      if (!isKindleAdmin(k)) throw new HttpError(403, "The facilitator pins and closes.");
      await admin.from("kindle_topic").update(action === "pin" ? { pinned: !!b.pinned } : { closed: !!b.closed }).eq("id", String(b.topic_id));
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
