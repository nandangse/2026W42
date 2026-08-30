import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/crm/opp-brief { opportunity_id }
 *
 * ASK GENIE on the enquiry tab (Dr Raghu, 30 Aug 2026): "check the customer,
 * the contact, the enquiry info — have we done this before, what is the
 * relation with the customer, what is the scope in the industry."
 *
 * A QUICK run on Opus — no web research, only what the CRM already knows —
 * so it answers in seconds, not minutes, and costs a fraction of an EVA
 * brief. The answer is SAVED on the opportunity (Dr Raghu, 30 Aug 2026:
 * "show that here, without running this again and again") — the quote reads
 * the stored brief; Ask again refreshes it.
 */
export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY)
      throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY — add it in the Vercel env vars.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const oppId = String((await req.json()).opportunity_id ?? "");
    if (!oppId) throw new HttpError(400, "Which opportunity?");

    const { data: opp } = await db.from("opportunity")
      .select("id, name, opportunity_no, enquiry_info, product_family, company_id, contact_id")
      .eq("id", oppId).maybeSingle();
    if (!opp) throw new HttpError(404, "That opportunity no longer exists.");

    type Co = { id: string; name: string; is_customer: boolean | null; industry_id: number | null; industry?: { name?: string } | null };
    let company: Co | null = null;
    if (opp.company_id) {
      const { data: co } = await db.from("company")
        .select("id, name, is_customer, industry_id, industry:industry_id(name)")
        .eq("id", String(opp.company_id)).maybeSingle();
      company = (co as unknown as Co) ?? null;
    }
    let contact = "none on record";
    if (opp.contact_id) {
      const { data: p } = await db.from("person").select("full_name, job_title, primary_email, primary_phone")
        .eq("id", String(opp.contact_id)).maybeSingle();
      if (p) contact = `${p.full_name}${p.job_title ? ` (${p.job_title})` : ""}${p.primary_email ? ` · ${p.primary_email}` : ""}${p.primary_phone ? ` · ${p.primary_phone}` : ""}`;
    }

    // our history with THIS customer
    let history = "No company on the opportunity, so no history to read.";
    let invoiced = "";
    if (company) {
      const [oppsRes, invRes, intsRes] = await Promise.all([
        db.from("opportunity").select("name, opportunity_on, stage:stage_id(name), amount")
          .eq("company_id", company.id).neq("id", oppId).is("deleted_at", null)
          .order("opportunity_on", { ascending: false, nullsFirst: false }).limit(10),
        db.from("sales_invoice").select("amount").eq("company_id", company.id).limit(1000),
        db.from("interaction").select("kind, happened_at, remark").eq("company_id", company.id)
          .order("happened_at", { ascending: false }).limit(5),
      ]);
      const opps = oppsRes.data ?? [];
      history = opps.length
        ? opps.map((o) => `- ${o.name} · ${(o.stage as { name?: string } | null)?.name ?? "?"} · ${o.opportunity_on ?? "undated"}${o.amount ? ` · ₹${Number(o.amount).toLocaleString("en-IN")}` : ""}`).join("\n")
        : "- no other opportunities on this company";
      const invSum = (invRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      invoiced = invSum ? `Invoiced to them so far: ₹${(invSum / 1e7).toFixed(2)} Cr across ${(invRes.data ?? []).length} invoices.` : "Never invoiced them.";
      const ints = (intsRes.data ?? []).map((r) => `- ${String(r.happened_at).slice(0, 10)} ${r.kind}: ${String(r.remark ?? "").slice(0, 100)}`).join("\n");
      if (ints) history += "\nRecent interactions:\n" + ints;
    }

    // the team's own comments on the record — Genie reads these too
    // (Dr Raghu, 30 Aug 2026: "the genie should also read this!")
    let teamNotes = "none on record";
    try {
      const { data: links } = await db.from("record_link").select("source_id")
        .eq("source_type", "note").eq("target_type", "opportunity").eq("target_id", oppId).limit(20);
      const nids = (links || []).map((l) => String(l.source_id));
      if (nids.length) {
        const { data: ns } = await db.from("note").select("body, created_at").in("id", nids)
          .order("created_at", { ascending: false }).limit(10);
        const lines = (ns || []).map((n) => `- ${String(n.created_at).slice(0, 10)}: ${String(n.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)}`);
        if (lines.length) teamNotes = lines.join("\n");
      }
    } catch { /* notes are optional context */ }

    // industry credibility — what we have made for this industry before
    let industryScope = "The company carries no industry in the CRM.";
    if (company?.industry_id) {
      const { data: won } = await db.from("opportunity")
        .select("name, company:company_id!inner(name, industry_id)")
        .eq("company.industry_id", company.industry_id).eq("stage_id", 12).limit(8);
      const names = [...new Set((won ?? []).map((r) => (r.company as { name?: string } | null)?.name).filter(Boolean))];
      const ind = (company.industry as { name?: string } | null)?.name ?? "their industry";
      industryScope = names.length
        ? `In ${ind}, Nandan has WON orders from: ${names.join(", ")}.`
        : `No won orders on record yet in ${ind}.`;
    }

    const ask = `A salesperson opened this enquiry and pressed Ask Genie. Answer from the CRM facts below ONLY — no web, no guessing; write "not on record" where the CRM is silent. Be brief and useful: a salesperson reads this in one minute before a call.

THE ENQUIRY
Number: ${opp.opportunity_no ?? "—"} · Title: ${opp.name}
Product family: ${opp.product_family ?? "not set"}
Enquiry text: ${String(opp.enquiry_info ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000) || "(empty)"}
Customer: ${company ? `${company.name} · customer already: ${company.is_customer ? "yes" : "no"}` : "not set"}
Contact: ${contact}

OUR HISTORY WITH THIS CUSTOMER
${history}
${invoiced}

THE TEAM'S NOTES ON THIS ENQUIRY (comments, newest first — weigh them)
${teamNotes}

INDUSTRY
${industryScope}

Write in Markdown, exactly these sections:
**Done before?** — have we made/quoted this kind of thing for them or others (from the history and product family)? 2-3 sentences.
**Relation with the customer** — how deep is the relationship, per the record. 2-3 sentences.
**Scope in the industry** — what the industry track record says about our credibility and the wider play here. 2-3 sentences.
**Worth asking** — 2 pointed questions for the call.`;

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      system: NANDAN,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: ask }],
    });
    if (response.stop_reason === "refusal")
      throw new HttpError(422, "The classifiers declined this one — try again.");
    const brief = response.content.filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
    if (!brief) throw new HttpError(502, "Genie came back empty — try again.");
    const at = new Date().toISOString();
    await db.from("opportunity").update({ genie_brief: brief, genie_brief_at: at }).eq("id", oppId)
      .then(() => null, () => null);
    return NextResponse.json({ brief, at });
  } catch (e) {
    return errJson(e);
  }
}
