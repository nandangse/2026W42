import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireVishwakarma } from "@/lib/vishwakarma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The design team's two counsellors (Dr Raghu, 28 Aug 2026: "use me
 * [Genie] for solutions, and Consult Raghu for reviews"). Click-only,
 * like every Genie since the pause — a model call happens because a
 * named hand pressed a button, never on its own.
 *
 * POST { mode: "solve", id }   — Genie the design engineer works a PROBLEM:
 *   root-cause hypotheses against the Five Whys, solutions, checks.
 * POST { mode: "develop", id } — Genie grows an IDEA: worth, risks, the
 *   cheapest next experiment.
 * POST { mode: "review", kind, id, question } — CONSULT RAGHU reviews the
 *   item in Dr Raghu's own house style and files it on the review bench.
 */
const MODEL = "claude-sonnet-4-5-20250929";

async function ask(key: string, system: string, content: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1100, system, messages: [{ role: "user", content }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `Anthropic returned ${res.status}`);
  return (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
}

const ENGINEER =
  "You are Genie, the design-engineering counsel at Nandan GSE — a maker of ground support equipment (scissor lifts, ambulifts, loaders) in India. " +
  "You think like a senior mechanical design engineer: hydraulics, structures, drives, controls, DFM, IS/EN standards.\n\n" +
  "House rules:\n" +
  "- Work from what is given. Where the facts run out, say what measurement or check would settle it — never invent a finding.\n" +
  "- Prefer the specific to the general: name the component, the failure mode, the standard clause when you rely on one.\n" +
  "- Keep it usable on a shop floor: numbered points, short sentences.\n";

const RAGHU =
  "You are Consult Raghu — reviewing on behalf of Dr Raghu Nandan, MD of Nandan GSE, for his design team. His review style:\n" +
  "- First sentence: the verdict in plain words — proceed, fix first, or rethink.\n" +
  "- Then the TWO OR THREE things that actually matter: safety and compliance first, then cost and manufacturability, then elegance.\n" +
  "- Ask the one question the team has not answered, if there is one.\n" +
  "- Never rubber-stamp: if the work is thin, say what is missing and send it back. If it is good, say so in one line and stop.\n" +
  "- Short. This is a review, not an essay.\n";

export async function POST(req: Request) {
  try {
    const user = await requireVishwakarma();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set — Genie cannot answer yet.");
    const admin = adminClient();
    const body = await req.json();
    const mode = String(body.mode || "");
    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "id required");

    if (mode === "solve") {
      const { data: p } = await admin.from("vishwa_problem").select("*").eq("id", id).maybeSingle();
      if (!p) throw new HttpError(404, "No such problem.");
      const whys = Array.isArray(p.whys) ? (p.whys as string[]).filter(Boolean) : [];
      const text = await ask(key, ENGINEER,
        `A design problem from the team:\n\nTITLE: ${p.title}\nJOB/MACHINE: ${p.job || "—"} ${p.machine || ""}\n` +
        `DESCRIPTION: ${p.description || "—"}\n` +
        (whys.length ? `FIVE WHYS SO FAR:\n${whys.map((w, i) => `Why ${i + 1}: ${w}`).join("\n")}\n` : "") +
        (p.root_cause ? `ROOT CAUSE AS STATED: ${p.root_cause}\n` : "") +
        `\nGive: (1) the most likely root causes ranked, with how to CONFIRM each by measurement or inspection; ` +
        `(2) solutions for the top cause — immediate containment and permanent fix; (3) what would prevent recurrence across other machines.`);
      await admin.from("vishwa_problem").update({ genie: text }).eq("id", id);
      return NextResponse.json({ text });
    }

    if (mode === "develop") {
      const { data: p } = await admin.from("vishwa_idea").select("*").eq("id", id).maybeSingle();
      if (!p) throw new HttpError(404, "No such idea.");
      const text = await ask(key, ENGINEER,
        `An idea from the design team:\n\nTITLE: ${p.title}\nDETAIL: ${p.detail || "—"}\nCLAIMED VALUE: ${p.value_note || "—"}\n\n` +
        `Develop it: (1) what it is worth if it works, in engineering and money terms; (2) the two biggest risks or reasons it fails; ` +
        `(3) the CHEAPEST experiment that would prove or kill it within a week; (4) what already exists in industry that we should study first.`);
      await admin.from("vishwa_idea").update({ genie: text }).eq("id", id);
      return NextResponse.json({ text });
    }

    if (mode === "review") {
      const kind = String(body.kind || "");
      const TABLES: Record<string, string> = { problem: "vishwa_problem", idea: "vishwa_idea", plan: "vishwa_plan" };
      const table = TABLES[kind];
      if (!table) throw new HttpError(400, "kind must be problem, idea or plan");
      const { data: p } = await admin.from(table).select("*").eq("id", id).maybeSingle();
      if (!p) throw new HttpError(404, "Nothing to review.");
      const question = String(body.question || "").trim();
      const summary = Object.entries(p)
        .filter(([k2, v]) => !["id", "by", "at", "genie"].includes(k2) && v !== "" && v !== null)
        .map(([k2, v]) => `${k2.toUpperCase()}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join("\n");
      const text = await ask(key, RAGHU,
        `The design team sends this ${kind} up for review:\n\n${summary}\n\n` +
        (question ? `Their question to you: ${question}\n\n` : "") +
        `Review it as Dr Raghu would.`);
      const { error } = await admin.from("vishwa_review").insert({
        source_kind: kind, source_id: id,
        title: String(p.title ?? p.deliverable ?? "untitled"),
        question, ai_review: text, status: "waiting", by: user.email,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ text });
    }

    throw new HttpError(400, "mode must be solve, develop or review");
  } catch (e) {
    return errJson(e);
  }
}
