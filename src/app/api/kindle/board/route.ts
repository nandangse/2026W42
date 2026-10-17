import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";
import { AI, anthropicClient } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";

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
 *      summarise { topic_id } — Genie reads the topic and its replies and writes where the
 *                               conversation stands (Kindle 1.5.0); kept on the topic (0242);
 *                               obeys the AI master switch.
 */
const TOPIC = "id,title,body,created_by,pinned,closed,created_at,last_post_at";

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
    const list = (cols: string) => admin.from("kindle_topic").select(cols).order("pinned", { ascending: false }).order("last_post_at", { ascending: false }).limit(300);
    let [t, { data: posts }] = await Promise.all([list(`${TOPIC},ai_summary,ai_summary_at`), admin.from("kindle_post").select("topic_id,member_id,created_at")]);
    /* before 0242 runs the summary columns are not there; read the older shape */
    if (t.error) t = await list(TOPIC);
    if (t.error) throw t.error;
    const topics = (t.data || []) as unknown as { id: string; created_by: string | null; [k: string]: unknown }[];
    const out = topics.map((x) => { const ps = (posts || []).filter((p) => p.topic_id === x.id); return { ...x, posts: ps.length, last_by: ps.length ? ps[ps.length - 1].member_id : x.created_by, voices: new Set(ps.map((p) => p.member_id)).size }; });
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
    if (action === "summarise") {
      await assertAiOn();
      const topic_id = String(b.topic_id || "");
      const [{ data: t }, { data: posts }, { data: mem }] = await Promise.all([
        admin.from("kindle_topic").select("id,title,body,created_by,created_at,closed").eq("id", topic_id).maybeSingle(),
        admin.from("kindle_post").select("member_id,body,reply_to,created_at").eq("topic_id", topic_id).order("created_at"),
        admin.from("kindle_member").select("id,name,short_name"),
      ]);
      if (!t) throw new HttpError(404, "No such topic.");
      if (!(posts || []).length) throw new HttpError(409, "Nothing to sum up yet — no replies.");
      const who = (id: string | null) => { const m = (mem || []).find((x) => String(x.id) === String(id)); return m?.short_name || m?.name?.split(" ")[0] || "someone"; };
      const lines = [`TOPIC by ${who(t.created_by)} on ${String(t.created_at).slice(0, 10)}: ${t.title}`, t.body ? String(t.body) : "", ...(posts || []).map((p) => `${String(p.created_at).slice(0, 10)} ${who(p.member_id)}: ${p.body}`)];
      const prompt = `You are Genie, the quiet secretary of Kindle, a trust group of ten entrepreneurs in Mumbai. Below is a topic from the group's message board and the replies in order.\n\nWrite a short reading for the room, in plain English, 80 to 140 words, no headings, no bullet points, no flattery: what the topic is about, where the conversation has reached, what has been agreed, what is still open and whom it waits on. Refer to people by first name. If a date or a decision is in the thread, keep it exact. Do not invent what is not there.${t.closed ? " The topic is closed; read it as a record." : ""}\n\n${lines.filter(Boolean).join("\n")}`;
      const ai = anthropicClient();
      const msg = await ai.messages.create({ model: AI.FRONT, max_tokens: 400, messages: [{ role: "user", content: prompt }] });
      const text = msg.content.map((c) => ("text" in c ? c.text : "")).join("").trim();
      if (!text) throw new HttpError(502, "Genie had nothing to say.");
      const { error } = await admin.from("kindle_topic").update({ ai_summary: text, ai_summary_at: now }).eq("id", topic_id);
      if (error) throw new HttpError(500, /does not exist|schema cache/i.test(error.message) ? "Migration 0242 has not been run in Supabase yet." : error.message);
      await kindleAudit(k, "topic_summarised", { topic_id });
      return NextResponse.json({ ok: true, summary: text });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
