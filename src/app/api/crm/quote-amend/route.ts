import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { QUOTE_COPY_FIELDS } from "@/crm/quote-copy";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/quote-amend { quotation_id }
 *
 * AMEND (Dr Raghu, 30 Aug 2026): "the old quote is fully status cancelled
 * and all the items of it MOVE to the new one, called QTN no -1."
 * The revision wears the same number with -1 / -2 / … appended, carries
 * every field, and the LINES MOVE (not copy) — the cancelled original keeps
 * its place in the record, its PDF trail in Communication, and nothing else.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const qid = String((await req.json()).quotation_id ?? "");
    if (!qid) throw new HttpError(400, "Which quotation?");

    const { data: src } = await db.from("quotation").select("*").eq("id", qid).maybeSingle();
    if (!src) throw new HttpError(404, "That quotation no longer exists.");

    const baseNo = String(src.quote_no).replace(/-\d+$/, "");
    const rev = (Number(src.revision) || 0) + 1;
    const newNo = `${baseNo}-${rev}`;

    const { data: stage } = await db.from("stage").select("id").eq("code", "q_draft").maybeSingle();
    const fresh: Record<string, unknown> = {
      quote_no: newNo, revision: rev, parent_quote_id: qid, status: "draft",
      quoted_on: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
    };
    for (const k of QUOTE_COPY_FIELDS) if (src[k] !== undefined) fresh[k] = src[k];
    if (stage) fresh.stage_id = stage.id;
    fresh.owner_id = fresh.owner_id ?? me.profileId;

    const { data: made, error } = await db.from("quotation").insert(fresh).select().single();
    if (error) throw new HttpError(500, error.message);

    // the lines MOVE — the amendment owns them now
    const { error: mvErr } = await db.from("quotation_line").update({ quotation_id: made.id }).eq("quotation_id", qid);
    if (mvErr) throw new HttpError(500, `Revision made, lines did not move: ${mvErr.message}`);

    // the original retires CANCELLED
    const { error: cxErr } = await db.from("quotation")
      .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", qid);
    if (cxErr && !/invalid input value/i.test(cxErr.message)) throw new HttpError(500, cxErr.message);

    await db.from("crm_audit").insert({
      entity: "quotation", entity_id: qid, action: "amend",
      after: { revision: newNo, new_id: made.id }, by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, id: made.id, quote_no: newNo });
  } catch (e) {
    return errJson(e);
  }
}
