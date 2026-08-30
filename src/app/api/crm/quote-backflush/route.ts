import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * BACKFLUSH THE OPPORTUNITY (Dr Raghu, 31 Aug 2026: "when Opportunity is
 * empty, can you create one to backflush it? make it the same day!").
 *
 * A quotation may stand alone — 16,764 of them do. But a quote that never had
 * an enquiry behind it is invisible to the funnel: it cannot be counted in a
 * stage, weighed in a forecast, or found by anybody reading the pipeline. This
 * writes the missing enquiry FROM the quote's own facts and links the two.
 *
 * SAME DAY, as he asked, and the reason matters: the enquiry is being recorded
 * late, not happening late. Dating it today would put a lie in the funnel —
 * an August quote answering a January enquiry would read as a deal that closed
 * before it opened. The opportunity therefore takes the quotation's own date.
 *
 * Nothing is invented. Company, contact, salesperson, value and date all come
 * off the quote; the name is its subject, or the company's name where the
 * quote carries no subject. Where the quote already has an opportunity this
 * refuses rather than making a second one.
 *
 *   POST { quotation_id }                — one quote
 *   POST { action: "count" }             — how many quotes stand without one
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json().catch(() => ({}));

    if (body.action === "count") {
      const { count } = await db.from("quotation")
        .select("*", { count: "exact", head: true }).is("opportunity_id", null);
      return NextResponse.json({ ok: true, without: count ?? 0 });
    }

    const qid = String(body.quotation_id || "");
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: q } = await db.from("quotation")
      .select("id, quote_no, quoted_on, subject, company_id, contact_id, owner_id, opportunity_id, grand_total, quoted_value, pipeline")
      .eq("id", qid).maybeSingle();
    if (!q) throw new HttpError(404, "That quotation no longer exists.");
    if (q.opportunity_id) throw new HttpError(400, "That quote already stands on an opportunity.");
    if (!q.company_id) throw new HttpError(400, "The quote has no company, and an enquiry with no customer is not an enquiry. Set the company first.");

    // The stage a backflushed enquiry belongs at: it did not arrive today and
    // it did not stall — it went all the way to a quotation. Where the ladder
    // names such a rung it is used; otherwise the first rung stands.
    const { data: stages } = await db.from("stage")
      .select("id, name, sort_order").eq("entity", "opportunity").order("sort_order");
    const list = stages ?? [];
    const stage = list.find((s) => /quot|present|consultative/i.test(String(s.name))) ?? list[0];
    if (!stage) throw new HttpError(503, "The opportunity stage ladder is empty — set the stages first.");

    const { data: co } = await db.from("company").select("name").eq("id", String(q.company_id)).maybeSingle();
    const title = String(q.subject || "").trim()
      || `${String(co?.name || "Enquiry")} — from quotation ${String(q.quote_no || "")}`.trim();

    const row: Record<string, unknown> = {
      name: title.slice(0, 300),
      company_id: q.company_id,
      contact_id: q.contact_id ?? null,
      owner_id: q.owner_id ?? null,
      // HIS INSTRUCTION, and the honest date: the quote's own day.
      opportunity_on: String(q.quoted_on || "").slice(0, 10) || null,
      stage_id: stage.id,
      pipeline: q.pipeline || "capital",
      amount: Number(q.grand_total) || Number(q.quoted_value) || null,
      source: "Existing Customer",
      enquiry_info: `Recorded from quotation ${String(q.quote_no || "")} on ${new Date().toLocaleDateString("en-IN")} — the quote stood without an enquiry, so this was written back from it and dated the quote's own day.`,
    };

    const { data: made, error } = await db.from("opportunity").insert(row).select("id, opportunity_no, name").maybeSingle();
    if (error) {
      if (/source/i.test(error.message)) {
        // The source list is a master; if "Existing Customer" is not on it,
        // the enquiry still deserves to exist.
        delete row.source;
        const { data: retry, error: e2 } = await db.from("opportunity").insert(row).select("id, opportunity_no, name").maybeSingle();
        if (e2) throw new HttpError(500, e2.message);
        if (retry) return await finish(db, me.profileId, qid, retry, q.quote_no);
      }
      throw new HttpError(500, error.message);
    }
    if (!made) throw new HttpError(500, "The opportunity did not come back from the database.");
    return await finish(db, me.profileId, qid, made, q.quote_no);
  } catch (e) {
    return errJson(e);
  }
}

/** Link the quote to its new enquiry, and leave a trail saying why it exists. */
async function finish(
  db: ReturnType<typeof crmDb>,
  who: string | null,
  qid: string,
  opp: { id: string; opportunity_no?: string | null; name?: string | null },
  quoteNo: unknown,
) {
  const { error } = await db.from("quotation").update({ opportunity_id: opp.id }).eq("id", qid);
  if (error) throw new HttpError(500, `The enquiry was created but the quote would not take it: ${error.message}`);
  await db.from("crm_audit").insert({
    entity: "quotation", entity_id: qid, action: "backflush_opportunity",
    after: { opportunity_id: opp.id, opportunity_no: opp.opportunity_no ?? null, quote_no: quoteNo ?? null },
    by_user: who,
  }).then(() => null, () => null);
  return NextResponse.json({
    ok: true, opportunity_id: opp.id,
    opportunity_no: opp.opportunity_no ?? null,
    name: opp.name ?? null,
  });
}
