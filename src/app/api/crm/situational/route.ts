import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/crm/situational { quotation_id }
 *
 * Situational Details on a quote (Dr Raghu, 30 Aug 2026): six bold headings —
 * Situational Analysis / Situation / Current Reality / Solution We discussed /
 * Result / Why nandan. Genie writes or IMPROVES the text from what the CRM
 * knows — at most THREE runs per quote, then the pen is the hand's alone.
 */
const HEADINGS = ["Situational Analysis", "Situation", "Current Reality", "Solution We discussed", "Result", "Why nandan"];

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY)
      throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY — add it in the Vercel env vars.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const qid = String((await readBody(req, {})).quotation_id ?? "");
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: qt } = await db.from("quotation")
      .select("id, quote_no, opportunity_id, company_id, contact_id, situational_details, situational_runs, grand_total, currency")
      .eq("id", qid).maybeSingle();
    if (!qt) throw new HttpError(404, "That quotation no longer exists.");
    const runs = Number(qt.situational_runs) || 0;
    if (runs >= 3)
      throw new HttpError(429, "Genie has already improved this three times — the pen is yours now.");

    // what the CRM knows: the enquiry, the company, the contact, the items,
    // and the team's own notes on the opportunity
    let enquiry = "", oppName = "";
    if (qt.opportunity_id) {
      const { data: o } = await db.from("opportunity").select("name, enquiry_info, product_family")
        .eq("id", String(qt.opportunity_id)).maybeSingle();
      if (o) { oppName = String(o.name || ""); enquiry = `${o.product_family ? `Product family: ${o.product_family}\n` : ""}${String(o.enquiry_info || "").replace(/<[^>]+>/g, " ").slice(0, 3000)}`; }
    }
    let companyLine = "unknown company";
    if (qt.company_id) {
      const { data: co } = await db.from("company").select("name, is_customer, industry:industry_id(name)").eq("id", String(qt.company_id)).maybeSingle();
      if (co) companyLine = `${co.name}${(co.industry as { name?: string } | null)?.name ? ` · ${(co.industry as { name?: string }).name}` : ""}${co.is_customer ? " · EXISTING CUSTOMER" : " · new prospect"}`;
    }
    let contactLine = "none on record";
    if (qt.contact_id) {
      const { data: p } = await db.from("person").select("full_name, job_title").eq("id", String(qt.contact_id)).maybeSingle();
      if (p) contactLine = `${p.full_name}${p.job_title ? ` (${p.job_title})` : ""}`;
    }
    const { data: items } = await db.from("quotation_line").select("description, quantity, unit_price")
      .eq("quotation_id", qid).order("line_no").limit(30);
    const itemsTxt = (items ?? []).map((l) => `- ${l.description} × ${l.quantity} @ ₹${Number(l.unit_price).toLocaleString("en-IN")}`).join("\n") || "- no items yet";
    let notesTxt = "none";
    if (qt.opportunity_id) {
      const { data: links } = await db.from("record_link").select("source_id")
        .eq("source_type", "note").eq("target_type", "opportunity").eq("target_id", String(qt.opportunity_id)).limit(15);
      const nids = (links ?? []).map((l) => String(l.source_id));
      if (nids.length) {
        const { data: notes } = await db.from("note").select("body").in("id", nids).order("created_at", { ascending: false }).limit(15);
        notesTxt = (notes ?? []).map((n) => `- ${String(n.body || "").replace(/<[^>]+>/g, " ").slice(0, 300)}`).join("\n") || "none";
      }
    }
    const current = String(qt.situational_details || "").trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: AI.FRONT,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: `You write the Situational Details section of a NANDAN GSE sales quotation — the one-page story that makes the customer feel understood. About Nandan:\n${NANDAN.slice(0, 2000)}\n\nRespond with HTML only (no markdown, no preamble): exactly these six sections. Each section is EXACTLY this shape — the heading alone on its own line in bold, the text starting on the NEXT line, and one empty line before the next section: <p><b>Heading:</b></p><p>the text, 2-4 sentences</p><p><br></p>. Never run the text on the same line as the heading. Headings, in order: ${HEADINGS.map((h) => h + ":").join(" · ")}. Write in confident, plain business English — specific to THIS customer and THIS quote, never generic filler. If the CRM knows too little for a section, write one honest sentence rather than inventing facts.`,
      messages: [{
        role: "user",
        content: `Quote ${qt.quote_no} for ${companyLine}. Contact: ${contactLine}. Opportunity: ${oppName}.\n\nEnquiry:\n${enquiry || "nothing recorded"}\n\nQuote items:\n${itemsTxt}\n\nTeam notes:\n${notesTxt}\n\n${current ? `CURRENT DRAFT (improve it — sharpen, keep what is good, fill gaps):\n${current.slice(0, 6000)}` : "There is no draft yet — write the first one."}`,
      }],
    });
    const html = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!html) throw new HttpError(502, "Genie returned nothing — try once more.");

    await db.from("quotation").update({ situational_details: html, situational_runs: runs + 1 }).eq("id", qid);
    await db.from("crm_audit").insert({
      entity: "quotation", entity_id: qid, action: "situational_run",
      after: { run: runs + 1 }, by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ html, runs: runs + 1, left: 3 - (runs + 1) });
  } catch (e) {
    return errJson(e);
  }
}
