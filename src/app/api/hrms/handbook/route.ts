import { NextResponse } from "next/server";
import { assertAiOn } from "@/lib/ai-gate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess, hrmsTables } from "@/lib/hrms";
import { HANDBOOK_SEED, HANDBOOK_EDITION } from "@/lib/handbook-seed";

export const dynamic = "force-dynamic";

/**
 * The Employee Handbook (Dr Raghu, 4 Sep 2026): readable, publishable, and
 * a place to ask.
 *
 * GET   every published section (all sections for HRMS), the published
 *       questions under each, the reader's own questions, and whether they
 *       have acknowledged this edition
 * POST  ask (anyone signed in) · answer, publish, unpublish, save, reorder
 *       (HRMS) · acknowledge (anyone)
 *
 * The words are seeded once from src/lib/handbook-seed.ts when the table is
 * empty; after that they are the screen's and a redeploy never touches them.
 */
const scrub = (html: string) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(iframe|object|embed|form|input|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "")
    .slice(0, 200000);

async function seedIfEmpty(admin: ReturnType<typeof adminClient>) {
  const { count, error } = await admin.from("hrms_handbook").select("slug", { count: "exact", head: true });
  if (error) return error;
  if ((count || 0) > 0) return null;
  const { error: ie } = await admin.from("hrms_handbook").insert(HANDBOOK_SEED.map((s) => ({ slug: s.slug, ord: s.ord, title: s.title, summary: s.summary, body: s.body.trim(), audience: s.audience || "all", published: true, version: 1, updated_by: "system" })));
  return ie;
}

export const maxDuration = 300;

const LANGS: Record<string, string> = { hi: "Hindi (Devanagari)", mr: "Marathi (Devanagari)" };

export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const admin = adminClient();
    const hr = await resolveHrmsAccess(admin, me.email, me.isOwner);
    const se = await seedIfEmpty(admin);
    if (se && /hrms_handbook|schema cache|does not exist/i.test(se.message)) return NextResponse.json({ sections: [], needsMigration: true, hr, edition: HANDBOOK_EDITION });
    if (se) throw new Error(se.message);
    let q = admin.from("hrms_handbook").select("*").order("ord");
    if (!hr) q = q.eq("published", true);
    const { data: rawSections, error } = await q;
    if (error) throw new Error(error.message);

    // THE LANGUAGE (0141): Hindi or Marathi swaps in the translated words
    // where a translation exists for this version of the English; the rest
    // stay English and are counted as pending, so HR can see what to run.
    const lang = String(new URL(req.url).searchParams.get("lang") || "en");
    let sections = (rawSections || []) as Record<string, unknown>[];
    let pending = 0;
    if (LANGS[lang]) {
      const { data: tr } = await admin.from("hrms_handbook_translation").select("slug, title, summary, body, source_version, translated_at").eq("lang", lang);
      const by = new Map((tr || []).map((t) => [String(t.slug), t]));
      sections = sections.map((sec) => {
        const t = by.get(String(sec.slug));
        const fresh = !!t && Number(t.source_version) >= Number(sec.version);
        if (!fresh && sec.published) pending++;
        return fresh ? { ...sec, title: t!.title, summary: t!.summary, body: t!.body, translated: true, translated_at: t!.translated_at, en_title: sec.title } : { ...sec, translated: false, en_title: sec.title };
      });
    }

    // questions: published ones for everyone, plus the reader's own; HR sees all
    let qq = admin.from("hrms_query").select("id, subject, question, answer, status, published, raised_by, raised_email, raised_at, answered_by, answered_at, form").eq("topic", "Handbook").order("raised_at", { ascending: false }).limit(500);
    if (!hr) qq = qq.or(`published.eq.true,raised_email.eq.${me.email.toLowerCase()}`);
    const { data: qs, error: qe } = await qq;
    const questions = qe ? [] : (qs || []).map((r) => ({ ...r, section: (r.form as { section?: string } | null)?.section || null, mine: String(r.raised_email || "").toLowerCase() === me.email.toLowerCase() }));

    let acknowledged: string | null = null;
    try { const { data: a } = await admin.from("hrms_handbook_ack").select("acknowledged_at").eq("email", me.email.toLowerCase()).eq("edition", HANDBOOK_EDITION).maybeSingle(); acknowledged = a?.acknowledged_at || null; } catch { /* pre-0134 */ }
    let ackCount = 0;
    if (hr) { try { const { count } = await admin.from("hrms_handbook_ack").select("id", { count: "exact", head: true }).eq("edition", HANDBOOK_EDITION); ackCount = count || 0; } catch { /* */ } }

    return NextResponse.json({ sections, questions, hr, edition: HANDBOOK_EDITION, acknowledged, ackCount, lang: LANGS[lang] ? lang : "en", pending, me: { email: me.email, name: me.displayName } });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const admin = adminClient();
    const hr = await resolveHrmsAccess(admin, me.email, me.isOwner);
    const body = await req.json();
    const action = String(body.action || "");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();

    /**
     * TRANSLATE (0141) — Genie renders up to `limit` pending sections into
     * Hindi or Marathi; the screen calls again until nothing is pending. HTML
     * in, HTML out; names, numbers and [CHECK] marks stay as they are.
     */
    if (action === "translate") {
      if (!hr) throw new HttpError(403, "HRMS only.");
      const lang = String(body.lang || "");
      if (!LANGS[lang]) throw new HttpError(400, "Which language — hi or mr?");
      await assertAiOn();
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set.");
      const limit = Math.max(1, Math.min(6, Number(body.limit) || 3));
      const { data: secs } = await admin.from("hrms_handbook").select("slug, title, summary, body, version, published").eq("published", true).order("ord");
      const { data: tr, error: te } = await admin.from("hrms_handbook_translation").select("slug, source_version").eq("lang", lang);
      if (te && /hrms_handbook_translation|schema cache|does not exist/i.test(te.message)) throw new HttpError(503, "Run migration 0141 first — the translations have nowhere to be kept yet.");
      const have = new Map((tr || []).map((t) => [String(t.slug), Number(t.source_version)]));
      const todo = (secs || []).filter((x) => (have.get(String(x.slug)) ?? -1) < Number(x.version));
      const wanted = body.slug ? todo.filter((x) => x.slug === body.slug) : todo;
      let done = 0;
      for (const sec of wanted.slice(0, limit)) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 8000,
            system: `You translate Nandan GSE's Employee Handbook from English into ${LANGS[lang]} for factory staff and workers in Maharashtra. Natural, respectful, plain ${lang === "hi" ? "Hindi" : "Marathi"} of the kind used at work — not literary, not machine-stiff. Keep every HTML tag and its structure exactly; translate only the text inside. Keep numbers, amounts, dates, e-mail addresses, URLs, and the marker [CHECK] exactly. Keep proper nouns as they are: Nandan GSE, Genie, IDP, HR, PF, ESI, PT, MLWF, Khalapur, Turbhe, names of people. Where an English term is what people say on the floor (leave, comp off, muster, salary slip), give the ${lang === "hi" ? "Hindi" : "Marathi"} word and the English in brackets the first time. Reply with JSON only: {"title": "...", "summary": "...", "body": "<html...>"}.`,
            messages: [{ role: "user", content: JSON.stringify({ title: sec.title, summary: sec.summary || "", body: sec.body }) }],
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new HttpError(502, j?.error?.message || `Anthropic returned ${res.status}`);
        const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
        let out: { title?: string; summary?: string; body?: string } = {};
        try { out = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { throw new HttpError(502, `Genie's translation of "${sec.title}" did not come back as JSON — try again.`); }
        if (!out.body || !out.title) throw new HttpError(502, `Genie's translation of "${sec.title}" came back incomplete — try again.`);
        const { error } = await admin.from("hrms_handbook_translation").upsert({ slug: sec.slug, lang, title: out.title, summary: out.summary || "", body: out.body, source_version: sec.version, translated_at: now, translated_by: stamp }, { onConflict: "slug,lang" });
        if (error) throw new Error(error.message);
        done++;
      }
      return NextResponse.json({ ok: true, done, pending: Math.max(0, wanted.length - done) });
    }

    if (action === "ask") {
      const section = String(body.section || "").trim();
      const question = String(body.question || "").trim();
      if (!question) throw new HttpError(400, "The question is empty.");
      const { data: s } = await admin.from("hrms_handbook").select("title").eq("slug", section).maybeSingle();
      // the person's record, if any, so the question hangs on the right employee
      let employeeId: string | null = null;
      try { const T = await hrmsTables(admin); const { data: e } = await admin.from(T.employees).select("id").ilike("email", me.email).limit(1); employeeId = e && e[0] ? String(e[0].id) : null; } catch { /* fine */ }
      const { error } = await admin.from("hrms_query").insert({
        employee_id: employeeId, subject: `Handbook · ${s?.title || section || "general"}: ${question.slice(0, 120)}`, question, topic: "Handbook", status: "Open",
        raised_by: stamp, raised_email: me.email.toLowerCase(), for_self: true, form: { section, section_title: s?.title || null }, updated_at: now,
      });
      if (error) {
        if (/raised_email|for_self|form/i.test(error.message)) throw new HttpError(503, "Run migration 0131 first.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "acknowledge") {
      const T = await hrmsTables(admin);
      let employeeId: string | null = null;
      try { const { data: e } = await admin.from(T.employees).select("id").ilike("email", me.email).limit(1); employeeId = e && e[0] ? String(e[0].id) : null; } catch { /* fine */ }
      const { error } = await admin.from("hrms_handbook_ack").upsert({ email: me.email.toLowerCase(), employee_id: employeeId, edition: HANDBOOK_EDITION, acknowledged_at: now }, { onConflict: "email,edition" });
      if (error) { if (/hrms_handbook_ack|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0134 first."); throw new Error(error.message); }
      return NextResponse.json({ ok: true });
    }

    if (!hr) throw new HttpError(403, "HRMS only.");

    if (action === "answer") {
      const id = String(body.id || ""), answer = String(body.answer || "").trim();
      if (!id || !answer) throw new HttpError(400, "The answer is empty.");
      const { error } = await admin.from("hrms_query").update({ answer, status: "Answered", answered_by: stamp, answered_at: now, published: !!body.publish, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "publish" || action === "unpublish") {
      const { error } = await admin.from("hrms_query").update({ published: action === "publish", updated_at: now }).eq("id", String(body.id || ""));
      if (error) { if (/published/i.test(error.message)) throw new HttpError(503, "Run migration 0134 first."); throw new Error(error.message); }
      return NextResponse.json({ ok: true });
    }
    if (action === "save") {
      const slug = String(body.slug || "").trim();
      if (!slug) throw new HttpError(400, "Which section?");
      const { data: prev } = await admin.from("hrms_handbook").select("version").eq("slug", slug).maybeSingle();
      const patch: Record<string, unknown> = { updated_by: stamp, updated_at: now, version: (prev?.version || 0) + 1 };
      if ("title" in body) patch.title = String(body.title || "").slice(0, 200);
      if ("summary" in body) patch.summary = String(body.summary || "").slice(0, 600);
      if ("body" in body) patch.body = scrub(String(body.body || ""));
      if ("published" in body) patch.published = !!body.published;
      if ("audience" in body) patch.audience = ["all", "staff", "workers"].includes(String(body.audience)) ? String(body.audience) : "all";
      if ("ord" in body) patch.ord = Number(body.ord) || 0;
      const { error } = prev
        ? await admin.from("hrms_handbook").update(patch).eq("slug", slug)
        : await admin.from("hrms_handbook").insert({ slug, title: String(body.title || slug), summary: String(body.summary || ""), body: scrub(String(body.body || "")), ord: Number(body.ord) || 99, published: false, version: 1, updated_by: stamp });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      const { error } = await admin.from("hrms_handbook").delete().eq("slug", String(body.slug || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
