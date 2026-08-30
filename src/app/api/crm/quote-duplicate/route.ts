import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { QUOTE_COPY_FIELDS as COPY_FIELDS, QUOTE_LINE_COPY_FIELDS as LINE_FIELDS } from "@/crm/quote-copy";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/quote-duplicate { quotation_id }
 *
 * "Allow to duplicate quote" (Dr Raghu, 30 Aug 2026): a fresh quote number,
 * every commercial field and every line copied, born back at Draft with
 * today's date — the fastest road to a revision or a sister offer.
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

    const { data: num, error: nerr } = await db.rpc("next_number", { p_code: "quotation" });
    if (nerr) throw new HttpError(500, `Could not issue a number: ${nerr.message}`);
    const { data: stage } = await db.from("stage").select("id").eq("code", "q_draft").maybeSingle();

    const fresh: Record<string, unknown> = { quote_no: num, status: "draft" };
    for (const k of COPY_FIELDS) if (src[k] !== undefined) fresh[k] = src[k];
    if (stage) fresh.stage_id = stage.id;
    fresh.quoted_on = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    fresh.owner_id = fresh.owner_id ?? me.profileId;
    // the situational and letter Genie counters start fresh on the copy
    fresh.situational_runs = 0;
    fresh.letter_genie_runs = 0;

    const { data: made, error } = await db.from("quotation").insert(fresh).select().single();
    if (error) throw new HttpError(500, error.message);

    const { data: lines } = await db.from("quotation_line").select("*").eq("quotation_id", qid).order("line_no");
    if (lines?.length) {
      const copies = lines.map((l) => {
        const c: Record<string, unknown> = { quotation_id: made.id };
        for (const k of LINE_FIELDS) if (l[k] !== undefined) c[k] = l[k];
        return c;
      });
      const { error: lerr } = await db.from("quotation_line").insert(copies);
      if (lerr) throw new HttpError(500, `Quote made, lines failed: ${lerr.message}`);
    }

    await db.from("crm_audit").insert({
      entity: "quotation", entity_id: String(made.id), action: "duplicate",
      after: { from: qid, quote_no: num }, by_user: me.profileId,
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true, id: made.id, quote_no: num });
  } catch (e) {
    return errJson(e);
  }
}
