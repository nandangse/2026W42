import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/crm/letter-beautify { quotation_id }
 *
 * "Use Genie to beautify" on the Covering Letter (Dr Raghu, 30 Aug 2026) —
 * at most TWICE per quote. Genie polishes the letter with what the CRM
 * knows: the customer, the contact, and what the quote carries.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY)
      throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY — add it in the Vercel env vars.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const qid = String((await req.json()).quotation_id ?? "");
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: qt } = await db.from("quotation")
      .select("id, quote_no, company_id, contact_id, letter_text, letter_template, letter_genie_runs, grand_total, currency")
      .eq("id", qid).maybeSingle();
    if (!qt) throw new HttpError(404, "That quotation no longer exists.");
    const runs = Number(qt.letter_genie_runs) || 0;
    if (runs >= 2) throw new HttpError(429, "Genie has beautified this twice — the letter is yours now.");
    const current = String(qt.letter_text || "").trim();
    if (!current) throw new HttpError(400, "Pick a letter template first — Genie polishes, it does not start from nothing.");

    let companyLine = "the customer";
    if (qt.company_id) {
      const { data: co } = await db.from("company").select("name, industry:industry_id(name)").eq("id", String(qt.company_id)).maybeSingle();
      if (co) companyLine = `${co.name}${(co.industry as { name?: string } | null)?.name ? ` (${(co.industry as { name?: string }).name})` : ""}`;
    }
    let contactLine = "";
    if (qt.contact_id) {
      const { data: p } = await db.from("person").select("full_name, job_title").eq("id", String(qt.contact_id)).maybeSingle();
      if (p) contactLine = `${p.full_name}${p.job_title ? `, ${p.job_title}` : ""}`;
    }
    const { data: items } = await db.from("quotation_line").select("description, quantity").eq("quotation_id", qid).order("line_no").limit(20);
    const itemsTxt = (items ?? []).map((l) => `${l.description} × ${l.quantity}`).join("; ") || "no items yet";

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1200,
      output_config: { effort: "low" },
      system: `You polish the covering letter of a NANDAN GSE sales quotation. About Nandan:\n${NANDAN.slice(0, 1500)}\n\nRespond with HTML only (no markdown, no preamble): the improved letter, 3-5 short paragraphs in <p> tags. Keep the letter's flavour (${String(qt.letter_template || "Standard")}), make it specific to this customer and quote, warm and confident, never flowery. Do not invent facts, prices or dates. Keep the salutation and sign-off style of the draft.`,
      messages: [{
        role: "user",
        content: `Customer: ${companyLine}. ${contactLine ? `Addressed to: ${contactLine}. ` : ""}Quote ${qt.quote_no} carrying: ${itemsTxt}.\n\nTHE DRAFT TO BEAUTIFY:\n${current.slice(0, 5000)}`,
      }],
    });
    const html = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!html) throw new HttpError(502, "Genie returned nothing — try once more.");

    await db.from("quotation").update({ letter_text: html, letter_genie_runs: runs + 1 }).eq("id", qid);
    await db.from("crm_audit").insert({
      entity: "quotation", entity_id: qid, action: "letter_beautify",
      after: { run: runs + 1 }, by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ html, runs: runs + 1, left: 2 - (runs + 1) });
  } catch (e) {
    return errJson(e);
  }
}
