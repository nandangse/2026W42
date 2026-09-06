import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // web research can take a few minutes

// POST /api/eva/research — internet-driven EVA research for one company,
// called by My Sales Plan's "🌐 Research" button. Ported from the standalone
// app's api/eva/research.js; auth swapped from bearer-token/profiles.active to
// Genie's cookie session + the sales_access grant. The research itself (web
// search via Claude, framed around what Nandan GSE can sell) is unchanged.
//
// Requires ANTHROPIC_API_KEY in the server env vars — degrades to a clear
// error message when unset.

// The Nandan framing lives in one place — src/lib/eva-nandan.ts.

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const user = await requireUser();
    if (!(await resolveSalesAccess(adminClient(), user.id, user.isOwner, user.role)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json(
        { error: "Server is missing ANTHROPIC_API_KEY — add it in the Vercel project env vars" },
        { status: 503 },
      );

    const body = await readBody(req, {});
    const c = body.company;
    if (!c?.name) return NextResponse.json({ error: "company.name is required" }, { status: 400 });

    const anthropic = new Anthropic();

    const ask = `Research this company on the web and write its EVA brief for Nandan GSE.

COMPANY: ${c.name}
Type in our plan: ${c.type || "Prospect"}
Industry in our plan: ${c.industry || "not set"}
Locations we know: ${(c.locations || []).join(", ") || "none recorded"}
Contacts we know: ${(c.people || []).map((p: { name: string; designation?: string }) => `${p.name}${p.designation ? " (" + p.designation + ")" : ""}`).join(", ") || "none recorded"}
Products we have linked: ${(c.products || []).join(", ") || "none linked"}
${c.industryIntel ? `Our own industry intelligence (${c.industry}): sector ${c.industryIntel.sector || "—"}, priority ${c.industryIntel.priority || "—"}, goal ${c.industryIntel.goal || "—"}.
${c.industryIntel.strategy ? "Growth strategy: " + c.industryIntel.strategy : ""}
${c.industryIntel.potentials ? "Named potentials: " + c.industryIntel.potentials : ""}
${c.industryIntel.projects ? "Projects we have already done in this industry: " + c.industryIntel.projects : ""}` : ""}

Search for what is publicly known and current about this company, then write the brief.
Write it in Markdown with exactly these sections and nothing else:

**Who they are** — what the company actually does, size, ownership, footprint in India
and globally. 3–5 sentences.

**What's happening right now** — recent and dated news that creates or kills an
opportunity: expansion, new plants or hangars, fleet orders, capex, funding, contracts
won, leadership changes, layoffs, trouble. Bullet points, each with the date and the
source name.

**Where Nandan fits** — the specific equipment Nandan could sell them and the specific
operation it would serve. Be concrete about the product and the use case; do not list
Nandan's whole catalogue. If the honest answer is that the fit is weak, say so plainly.

**Who to approach** — the roles and, where public, the named people who would own this
buying decision. Say where the name came from.

**How to open the conversation** — 3 bullets a salesperson can use on a first call:
what to lead with, what evidence to cite, and what to ask.

**Watch-outs** — competitors already supplying them, existing vendor lock-in, tender or
approval processes, financial risk, anything that would waste the team's time.

Rules:
- Every factual claim gets a source name and, where you have it, a date. If you could not
  verify something, write "unverified" rather than guessing.
- If the company is small, private, or barely covered online, say exactly that and keep
  the brief short. Do not pad it with generic industry filler.
- No preamble, no closing summary, no offer to help further. Start at "**Who they are**".`;

    const params: Anthropic.MessageCreateParams = {
      model: AI.FRONT,
      max_tokens: 8000,
      system: NANDAN,
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: ask }],
    };

    let response = await anthropic.messages.create(params);

    // Server-side tools pause after their iteration cap; re-send to continue.
    let resumes = 0;
    while (response.stop_reason === "pause_turn" && resumes < 4) {
      resumes++;
      params.messages = [
        { role: "user", content: ask },
        { role: "assistant", content: response.content },
      ];
      response = await anthropic.messages.create(params);
    }

    if (response.stop_reason === "refusal")
      return NextResponse.json(
        { error: "The research request was declined by safety classifiers. Try again with a different company, or write the brief by hand." },
        { status: 422 },
      );

    const research = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!research)
      return NextResponse.json({ error: "The research came back empty — try again." }, { status: 502 });

    return NextResponse.json({
      research,
      researchedAt: new Date().toISOString(),
      usage: response.usage,
    });
  } catch (e) {
    if (e instanceof HttpError) return errJson(e);
    console.error("EVA research failed", e);
    const err = e as { error?: { error?: { message?: string } }; message?: string };
    const msg = err?.error?.error?.message || err?.message || "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
