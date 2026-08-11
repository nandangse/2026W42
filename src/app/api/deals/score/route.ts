import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/deals/score — AI win-probability for one deal, called by My Sales
// Plan's "✨ Calculate with AI" button. Ported from the standalone app's
// api/deals/score.js; auth swapped to Genie's cookie session + sales grant.
// The client always has a deterministic baseline (deals.js → localChance);
// this endpoint refines it. Requires ANTHROPIC_API_KEY.

const SYSTEM = `You score sales deals for NANDAN GSE, an Indian manufacturer of ground
support equipment (aviation), material handling equipment, and defence/aerospace ground
equipment. Deals are capital equipment sales to airlines, MRO, aerospace, defence and
industrial customers: long cycles, tender and approval processes, and a real risk of a
deal going quiet for months and then dying.

Their pipeline stages, weakest to strongest:
Suspecting → Prospecting → Opportunity → Quotation Submitted → Bucket B → Bucket A →
Bucket 0 → Order Received. "Lost Opportunity" is dead. Bucket 0 means it is expected to
convert imminently; Bucket B is the softest of the three buckets.

Score the probability that this specific deal converts to a purchase order. Be a
sceptical sales manager, not an optimistic rep:
- Silence is the strongest negative signal. A deal that has not moved in months is
  usually dead regardless of the stage it is parked in.
- Few or no logged interactions on a large deal means it is not really being worked.
- Vague status notes ("following up", "will check") are weaker than concrete ones
  ("PO expected this month, awaiting their board approval").
- A due date already in the past that nobody reset is a bad sign.
- Do not exceed the stage's realistic ceiling just because the note sounds hopeful.

Answer with a probability and one sentence of reasoning naming the factors that
actually drove it. No hedging, no preamble.`;

const SCHEMA = {
  type: "object",
  properties: {
    chance: { type: "integer", description: "Win probability 0-100" },
    why: { type: "string", description: "One sentence naming the deciding factors." },
  },
  required: ["chance", "why"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!(await resolveSalesAccess(adminClient(), user.id, user.isOwner)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json(
        { error: "Server is missing ANTHROPIC_API_KEY — add it in the Vercel project env vars" },
        { status: 503 },
      );

    const body = await req.json();
    const d = body.deal;
    if (!d?.name) return NextResponse.json({ error: "deal.name is required" }, { status: 400 });

    const daysStale = d.lastMovedAt
      ? Math.round((Date.now() - new Date(d.lastMovedAt).getTime()) / 86400000)
      : null;

    const ask = `Score this deal.

Deal: ${d.name}
Segment: ${d.segment || "—"}
Stage: ${d.stage}
Amount: ₹${Number(d.amount || 0).toLocaleString("en-IN")}
Due date: ${d.due || "not set"} (today is ${new Date().toISOString().slice(0, 10)})
Interactions logged: ${d.interactions || 0}
Days since it last moved stage: ${daysStale === null ? "unknown" : daysStale}
Opportunity No: ${d.oppNo || "—"} · Quotation No: ${d.quoteNo || "—"} · Sales Order No: ${d.soNo || "—"}

Status now, in the salesperson's words:
${d.statusNow ? d.statusNow : "(nothing written — treat this as a bad sign)"}

Customer: ${d.customer ? `${d.customer.name} — ${d.customer.type || "Prospect"} in ${d.customer.industry || "unknown industry"}` : "not linked to a company"}
${d.customer?.comments?.length ? `Recent team comments on the customer:\n${d.customer.comments.join("\n")}` : ""}

Stage history:
${(d.history || []).map((h: { at?: string; from?: string; to?: string }) => `${(h.at || "").slice(0, 10)} — ${h.from ? h.from + " → " + h.to : "created at " + h.to}`).join("\n") || "none recorded"}

A mechanical baseline scored this ${d.baseline?.chance ?? "—"}% (${d.baseline?.why || "no baseline"}).
Use it as a reference point, and depart from it where the status note and history justify it.`;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: ask }],
    });

    if (response.stop_reason === "refusal")
      return NextResponse.json({ error: "The scoring request was declined. Set the % by hand." }, { status: 422 });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    let out: { chance?: unknown; why?: unknown };
    try {
      out = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Could not read the score that came back — try again." }, { status: 502 });
    }
    if (typeof out.chance !== "number")
      return NextResponse.json({ error: "No probability came back — try again." }, { status: 502 });

    return NextResponse.json({
      chance: Math.max(0, Math.min(100, Math.round(out.chance))),
      why: String(out.why || "").trim(),
      scoredAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof HttpError) return errJson(e);
    console.error("Deal scoring failed", e);
    const err = e as { error?: { error?: { message?: string } }; message?: string };
    return NextResponse.json({ error: err?.error?.error?.message || err?.message || "Server error" }, { status: 500 });
  }
}
