import { NextResponse } from "next/server";
import { assertAiOn } from "@/lib/ai-gate";
import { requireReader, requireOwner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-5-20250929";

/**
 * The shape Genie must return.
 *
 * Spelled out in the prompt rather than left to the model's judgement, because
 * the page renders it directly — a group without a name or a principle without
 * a one-liner would render as an empty card, and an empty card on the
 * principles page is worse than no page.
 */
const SHAPE = `{
  "title": "a short name for this set of principles",
  "intro": "two or three sentences: what these are and who they are for",
  "groups": [
    {
      "name": "the theme these principles share",
      "icon": "one emoji",
      "summary": "one line — what this group is about",
      "principles": [
        {
          "title": "the principle, as a short imperative",
          "one_liner": "one sentence a person can repeat from memory",
          "why": "why it matters here, in two or three sentences",
          "looks_like": ["what following it looks like in practice", "another"],
          "not_this": ["the common way it gets broken"],
          "ask_yourself": "a question somebody can ask themselves in the moment"
        }
      ]
    }
  ]
}`;

/** GET — the live principles, for everybody. */
export async function GET() {
  try {
    await requireReader();
    const admin = adminClient();
    const { data, error } = await admin
      .from("principle_doc")
      .select("id, version, raw, structured, created_at, model")
      .eq("active", true)
      .maybeSingle();
    if (error) {
      if (/principle_doc|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, doc: null });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, doc: data ?? null });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — { raw } — organise what Dr Raghu wrote, and publish it.
 *
 * The raw text is saved WHATEVER happens to the organising. If Anthropic is
 * down or refuses, the thinking is still stored and can be organised again
 * later — losing what somebody typed because a third party had a bad minute is
 * the one outcome worth engineering against.
 */
export async function POST(req: Request) {
  try {
    await assertAiOn();
    const user = await requireOwner();
    const admin = adminClient();
    const body = await req.json();
    const raw = String(body.raw || "").trim();
    if (raw.length < 20) throw new HttpError(400, "Write a little more — a line or two at least.");

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set, so this cannot be organised yet.");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system:
          "You organise Dr Raghu Nandan's thinking into the principles page for Nandan GSE, a maker of ground support equipment in India. His team — planners, project owners, production, design — will read it.\n\n" +
          "He writes roughly, in whatever order the thoughts arrive. Your job is to give it a spine: group what belongs together, name each group, and turn each thought into a principle somebody can act on.\n\n" +
          "Rules:\n" +
          "- USE HIS WORDS. Keep his phrasing wherever it works. You are organising, not rewriting, and the team will know instantly if it stops sounding like him.\n" +
          "- ADD NOTHING HE DID NOT SAY. Do not invent principles to round a group out to three. A group of one is fine.\n" +
          "- If a thought is too vague to act on, still include it — sharpen the wording, never the meaning.\n" +
          "- 'looks_like' and 'not_this' must be concrete and about THIS business: jobs, deliveries, kitting, escalations, customers. Not generic management writing.\n" +
          "- Between three and six groups. More than that is a filing cabinet, not a set of principles.\n" +
          "- Plain English. Short sentences. No corporate register.\n\n" +
          "Return ONLY a JSON object of exactly this shape, with no prose around it:\n" + SHAPE,
        messages: [{ role: "user", content: raw }],
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `Anthropic returned ${res.status}`);

    const text = (j.content || [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("")
      .trim();
    // Models sometimes wrap JSON in a fence however firmly they are asked not to.
    const cut = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let structured: unknown;
    try {
      structured = JSON.parse(cut.slice(cut.indexOf("{"), cut.lastIndexOf("}") + 1));
    } catch {
      throw new Error("Genie did not return usable JSON. Your text is safe — press Organise again.");
    }

    // Publish: the new version becomes the live one, the old one steps down.
    // Stood down FIRST, because the unique index allows only one active row and
    // inserting before clearing would be rejected.
    await admin.from("principle_doc").update({ active: false }).eq("active", true);
    const { count } = await admin.from("principle_doc").select("id", { count: "exact", head: true });
    const { error: ie } = await admin.from("principle_doc").insert({
      version: (count ?? 0) + 1,
      raw,
      structured,
      model: MODEL,
      active: true,
      created_by: user.id,
    });
    if (ie) {
      if (/principle_doc|schema cache|does not exist/i.test(ie.message))
        throw new HttpError(503, "Run migration 0039 first — principles have nowhere to save yet.");
      throw new Error(ie.message);
    }
    return NextResponse.json({ ok: true, structured });
  } catch (e) {
    return errJson(e);
  }
}
