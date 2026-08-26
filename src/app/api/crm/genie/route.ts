import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/genie { type, id } — the Genie tab: Claude's read on a CRM
 * record, in the same voice as the Job Plan's brief. Genie assembles the
 * facts — the record, its funnel position, its communication trail — and the
 * model turns them into a read. It is never asked to invent a number.
 *
 * Same ANTHROPIC_API_KEY as the Job Plan brief and Eva.
 */
const SYSTEM = `You brief the sales team at NANDAN GSE, an Indian manufacturer of aviation
ground support equipment, material handling equipment and defence ground equipment. They
sell capital equipment with a long aftermarket tail.

You are the panel a salesperson reads when they open a record in the CRM. Write for someone
who knows the record exists and wants to know where it stands and what to do next.

Rules:
- Use ONLY the facts given. Never invent dates, values, names or causes. If something is not
  in the data, say it is not recorded rather than guessing.
- Lead with where the deal actually stands. If it is dead, say so plainly and what the
  recorded reason was.
- "What to do next" must be specific to THIS record's data — the quote sitting unanswered,
  the interaction that went colder, the contact with no phone number. Never generic advice.
- Indian business English. Plain, direct, no filler, no flattery, no headings, no bullet
  points. At most 150 words, in 2–3 short paragraphs.
- Amounts in rupees; lakh and crore are fine. Dates as DD-MMM, e.g. 31-Aug — never 2026-08-31.`;

type Row = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (!process.env.ANTHROPIC_API_KEY)
      return NextResponse.json({ read: null, missing: "ANTHROPIC_API_KEY is not set on the server." });
    const db = crmDb();
    const body = await req.json();
    const type = String(body.type || "");
    const id = String(body.id || "");
    const TABLES: Record<string, string> = {
      company: "company", person: "person", opportunity: "opportunity",
      quotation: "quotation", sales_order: "sales_order",
    };
    if (!TABLES[type] || !id) throw new HttpError(400, "Which record?");

    // ---- assemble the facts --------------------------------------------
    const { data: rec } = await db.from(TABLES[type]).select("*").eq("id", id).maybeSingle();
    if (!rec) throw new HttpError(404, "That record no longer exists.");
    const r = rec as Row;

    const facts: Row = { type, record: r };

    const companyId = type === "company" ? id : (r.company_id as string | null);
    if (companyId) {
      const { data: co } = await db.from("company")
        .select("name, city, country, is_customer, industry:industry_id(name)").eq("id", companyId).maybeSingle();
      facts.company = co;
    }
    if (r.stage_id) {
      const { data: st } = await db.from("stage").select("name, is_terminal, is_won").eq("id", r.stage_id).maybeSingle();
      facts.stage = st;
    }
    if (type === "company") {
      const { count: opps } = await db.from("opportunity").select("*", { count: "exact", head: true }).eq("company_id", id);
      const { count: sos } = await db.from("sales_order").select("*", { count: "exact", head: true }).eq("company_id", id);
      facts.counts = { opportunities: opps ?? 0, sales_orders: sos ?? 0 };
    }
    if (type === "opportunity") {
      const { data: quotes } = await db.from("quotation")
        .select("quote_no, status, created_at, grand_total, stage:stage_id(name)").eq("opportunity_id", id).limit(10);
      facts.quotations = quotes;
    }
    const fkCol = type === "company" ? "company_id" : type === "person" ? "person_id"
      : type === "opportunity" ? "opportunity_id" : type === "quotation" ? "quotation_id" : "sales_order_id";
    const { data: ints } = await db.from("interaction")
      .select("kind, result, happened_at, person_name, remark, next_action, next_action_on")
      .eq(fkCol, id).order("happened_at", { ascending: false }).limit(8);
    facts.recent_interactions = (ints ?? []).map((i) => ({
      ...i, remark: String(i.remark ?? "").slice(0, 240),
    }));
    if (typeof r.enquiry_info === "string") facts.record = { ...r, enquiry_info: r.enquiry_info.slice(0, 800) };

    // ---- the read -------------------------------------------------------
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `The record, as JSON. Write the read.\n\n${JSON.stringify(facts)}`,
      }],
    });
    const read = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("\n").trim();

    return NextResponse.json({ read });
  } catch (e) {
    return errJson(e);
  }
}
