import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { readBody } from "@/lib/validate";
import { AI, anthropicClient } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { deliverability } from "../campaigns/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/marketing/magic — ✨ Genie on the message (Dr Raghu, 6 Sep
 * 2026: "show genie magic on the message to improve the deliverability, on
 * subject as well as on the message"). Returns a better subject, a better
 * body (variables kept), and what changed and why.
 */
export async function POST(req: Request) {
  try {
    await requireMarketing();
    await assertAiOn();
    const b = await readBody(req, { subject: "string?", body_html: "string?", audience: "string?" });
    const before = deliverability(String(b.subject || ""), String(b.body_html || ""));
    const client = anthropicClient();
    const msg = await client.messages.create({
      model: AI.FRONT,
      max_tokens: 4000,
      system: [
        "You are Nandan GSE's marketing editor. Nandan GSE makes ground support equipment for aircraft (loaders, lifts, dollies) in Mumbai. Rewrite outbound marketing e-mail so it lands in the inbox and reads like one person writing to another.",
        "Rules: keep every {{variable}} exactly as written; no spam-trigger words (free, guarantee, act now, click here, urgent, 100%); no all-caps, no repeated exclamation marks; subject under 60 characters and specific; one clear ask; plain, warm, short paragraphs; keep the sender's meaning; HTML body stays HTML with the same tags style.",
        "Answer in JSON only: {\"subject\": \"...\", \"body_html\": \"...\", \"why\": [\"...\"]}",
      ].join("\n"),
      messages: [{ role: "user", content: `Audience: ${b.audience || "prospects who have not heard from us"}\n\nSUBJECT:\n${b.subject || ""}\n\nBODY (HTML):\n${b.body_html || ""}` }],
    });
    const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Genie did not answer in the expected shape.");
    const j = JSON.parse(m[0]) as { subject: string; body_html: string; why: string[] };
    const after = deliverability(String(j.subject || ""), String(j.body_html || ""));
    return NextResponse.json({ subject: j.subject, body_html: j.body_html, why: j.why || [], before, after });
  } catch (e) {
    return errJson(e);
  }
}
