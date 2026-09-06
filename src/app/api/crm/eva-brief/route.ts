import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // web research takes minutes

/**
 * POST /api/crm/eva-brief { company_id }
 *
 * The company's EVA BRIEF (Dr Raghu, 26 Aug 2026): who they are from the
 * internet, their LinkedIn, an industry brief, dated news — woven together
 * with what the CRM already knows: our correspondence and its warmth, our
 * history with them, and the similar-industry work that gives us
 * credibility. Saved onto the company row; regenerate any time.
 */
export async function POST(req: Request) {
  try {
    await assertAiOn();
    const user = await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY)
      throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY — add it in the Vercel env vars.");
    const b = await readBody(req, {});
    const companyId = String(b.company_id ?? "");
    if (!companyId) throw new HttpError(400, "Which company? eva-brief needs company_id.");

    const db = crmDb();

    // THE WEEK HAS A BUDGET (Dr Raghu, 29 Aug 2026): each brief is ~₹60-100
    // of live research, so 10 per salesperson per week, 100 for Raghu —
    // editable in Settings → Integrations → EVA Brief quota. Counted from
    // the audit trail, Monday to Sunday on the IST calendar.
    const { data: qRow } = await db.from("integration_setting").select("config").eq("key", "eva_quota").maybeSingle();
    const qc = (qRow?.config || {}) as Record<string, string>;
    const isOwner = !!user.isOwner;
    const limit = isOwner ? (Number(qc.raghu_per_week) || 100) : (Number(qc.per_week) || 10);
    const nowIst = Date.now() + 330 * 60000;
    const dIst = new Date(nowIst);
    const dow = (dIst.getUTCDay() + 6) % 7;
    const mondayIstMidnightUtc = Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth(), dIst.getUTCDate() - dow) - 330 * 60000;
    const weekStart = new Date(mondayIstMidnightUtc).toISOString();
    let used = 0;
    if (user.profileId) {
      const { count } = await db.from("crm_audit")
        .select("id", { count: "exact", head: true })
        .eq("action", "eva_brief").eq("by_user", user.profileId).gte("at", weekStart);
      used = count ?? 0;
    }
    if (used >= limit)
      throw new HttpError(429,
        `Your EVA week is spent — ${used} of ${limit} briefs used since Monday. The counter resets Monday; each brief is real research money. ${isOwner ? "Raise your own number in Settings → Integrations." : "Ask Raghu or the Sales Head if a company truly cannot wait."}`);

    const { data: co } = await db.from("company")
      .select("id, name, website, city, country, is_customer, industry_id, industry:industry_id(name, sector_id)")
      .eq("id", companyId).maybeSingle();
    if (!co) throw new HttpError(404, "That company no longer exists.");
    const industry = (co.industry as { name?: string } | null)?.name ?? null;

    // ---- what the CRM already knows ------------------------------------
    const [contactsRes, oppsRes, intsRes, msgsRes] = await Promise.all([
      db.from("person").select("full_name, job_title, primary_email")
        .eq("company_id", companyId).is("deleted_at", null).limit(6),
      db.from("opportunity").select("name, amount, opportunity_on, stage:stage_id(name), lost_reason")
        .eq("company_id", companyId).is("deleted_at", null)
        .order("opportunity_on", { ascending: false, nullsFirst: false }).limit(8),
      db.from("interaction").select("kind, happened_at, remark")
        .eq("company_id", companyId).order("happened_at", { ascending: false }).limit(5),
      db.from("message").select("direction, subject, occurred_at")
        .eq("company_id", companyId).order("occurred_at", { ascending: false }).limit(5),
    ]);

    // warmth: how recently anyone actually spoke with them
    const touches = [
      ...(intsRes.data ?? []).map((r) => String(r.happened_at ?? "")),
      ...(msgsRes.data ?? []).map((r) => String(r.occurred_at ?? "")),
    ].filter(Boolean).sort().reverse();
    const lastTouch = touches[0] ?? null;
    const daysSince = lastTouch ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000) : null;
    const warmth = daysSince === null ? "COLD — no correspondence on record"
      : daysSince <= 30 ? `HOT — last touch ${daysSince} day(s) ago`
      : daysSince <= 90 ? `WARM — last touch ${daysSince} days ago`
      : `COLD — last touch ${daysSince} days ago`;

    // credibility: what we have actually done in their industry
    let credibility = "No industry recorded on this company.";
    if (co.industry_id) {
      const [wonRes, invRes] = await Promise.all([
        db.from("opportunity").select("name, company:company_id!inner(name, industry_id)")
          .eq("company.industry_id", co.industry_id).eq("stage_id", 12).limit(6),
        db.from("sales_invoice").select("amount, company:company_id!inner(name, industry_id)")
          .eq("company.industry_id", co.industry_id).limit(1000),
      ]);
      const invoices = invRes.data ?? [];
      const invSum = invoices.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      const invCustomers = [...new Set(invoices.map((r) => (r.company as { name?: string } | null)?.name).filter(Boolean))];
      const wonNames = (wonRes.data ?? []).map((r) => (r.company as { name?: string } | null)?.name).filter(Boolean);
      credibility = `In the ${industry} industry Nandan has invoiced ₹${(invSum / 1e7).toFixed(2)} Cr across ${invoices.length} invoices to ${invCustomers.length} customers`
        + (invCustomers.length ? ` (e.g. ${invCustomers.slice(0, 4).join(", ")})` : "")
        + (wonNames.length ? `; orders won from ${[...new Set(wonNames)].slice(0, 4).join(", ")}` : "") + ".";
    }

    const opps = (oppsRes.data ?? []).map((o) =>
      `- ${o.name} · ${(o.stage as { name?: string } | null)?.name ?? "?"} · ${o.opportunity_on ?? "undated"}${o.amount ? ` · ₹${Number(o.amount).toLocaleString("en-IN")}` : ""}${o.lost_reason ? ` · lost: ${o.lost_reason}` : ""}`).join("\n");
    const comms = [
      ...(intsRes.data ?? []).map((r) => `- ${String(r.happened_at).slice(0, 10)} ${r.kind ?? "interaction"}: ${String(r.remark ?? "").slice(0, 120)}`),
      ...(msgsRes.data ?? []).map((r) => `- ${String(r.occurred_at).slice(0, 10)} email ${r.direction}: ${String(r.subject ?? "").slice(0, 120)}`),
    ].join("\n");

    const ask = `Research this company on the web and write its EVA BRIEF for Nandan GSE.

COMPANY: ${co.name}
Industry in our CRM: ${industry ?? "not set"} · Customer already: ${co.is_customer ? "yes" : "no"}
Website we know: ${co.website ?? "not recorded"} · Location: ${[co.city, co.country].filter(Boolean).join(", ") || "not recorded"}
Contacts we hold: ${(contactsRes.data ?? []).map((p) => `${p.full_name}${p.job_title ? ` (${p.job_title})` : ""}`).join(", ") || "none"}

OUR HISTORY WITH THEM (from the CRM — treat as fact):
Warmth: ${warmth}
Recent correspondence:
${comms || "- none on record"}
Opportunities:
${opps || "- none on record"}

OUR CREDIBILITY IN THEIR INDUSTRY (from the CRM — treat as fact):
${credibility}

Search the web for what is publicly known and current, then write the brief in
Markdown with exactly these sections and nothing else:

**Who they are** — what they actually do, size, ownership, footprint. 3–5 sentences.
**LinkedIn** — their LinkedIn company page (URL if found), headcount range, what they post about, notable people. If not found, say so.
**Industry brief** — 3–4 sentences on the state of their industry in India right now and what it means for capex on equipment like ours.
**What's happening right now** — dated news that creates or kills an opportunity. Bullets with date and source name.
**Our standing** — weave the CRM history above into 3–4 sentences: the warmth marking, what the correspondence says, where past opportunities went and why.
**Our credibility** — turn the industry track record above into the 2–3 sentences a salesperson would actually say to this customer.
**Where Nandan fits** — the specific equipment and the specific operation it would serve. If the fit is weak, say so plainly.
**Watch-outs** — competitors, lock-in, tender processes, financial risk.

Rules: every factual claim gets a source name and date where you have one; write
"unverified" rather than guessing; if the company is barely covered online, say so and
keep it short. No preamble. Start at "**Who they are**".`;

    const anthropic = new Anthropic();
    const params: Anthropic.MessageCreateParams = {
      model: AI.FRONT,
      max_tokens: 8000,
      system: NANDAN,
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: ask }],
    };
    let response = await anthropic.messages.create(params);
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
      throw new HttpError(422, "The research was declined by safety classifiers — try again, or write the brief by hand.");

    let brief = response.content.filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
    // despite "no preamble", a research turn sometimes opens with chatter —
    // the brief starts where its first section starts
    const start = brief.indexOf("**Who they are**");
    if (start > 0) brief = brief.slice(start);
    if (!brief) throw new HttpError(502, "The research came back empty — try again.");

    const at = new Date().toISOString();
    const { error: ue } = await db.from("company")
      .update({ eva_brief: brief, eva_brief_at: at }).eq("id", companyId);
    if (ue) throw new HttpError(500, /eva_brief/.test(ue.message)
      ? "The eva_brief column is missing — run migration 0016 first."
      : ue.message);

    await db.from("crm_audit").insert({
      entity: "company", entity_id: companyId, action: "eva_brief",
      after: { eva_brief_at: at }, by_user: user.profileId,
    });
    return NextResponse.json({ brief, at, allotment: { used: used + 1, limit } });
  } catch (e) {
    return errJson(e);
  }
}
