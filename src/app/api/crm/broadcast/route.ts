import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { HttpError, errJson } from "@/lib/auth";
import { variableValues, renderTemplate } from "@/crm/variables";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const missing = (m: string) => /broadcast|outbound_queue|wa_queue|schema cache|does not exist/i.test(m);
/** More than this in one act is a campaign, and campaigns belong in Marketing. */
const MOST = 500;

/**
 * /api/crm/broadcast — one send to many contacts, kept as ONE document.
 *
 * Dr Raghu, 9 Sep 2026: "in the contacts we will apply filter etc, then
 * after choosing make the select of the contacts, then click the button on
 * top which is Send Email / Send WA ... this will go in a queue in a
 * separate document related to Communication ... can it also put it into
 * the particular contacts as well as deals communication?"
 *
 * THE DOCUMENT AND THE ROWS ARE DIFFERENT THINGS. Forty messages sent
 * together are ONE act — one template, one attachment, one decision, one
 * person answering for it — and forty separate queue rows leave nothing to
 * open afterwards. So `broadcast` holds what was decided once, and the
 * messages themselves stay in the queues that already know how to send,
 * throttle and report. It adds a column to those queues, not a third road.
 *
 * VARIABLES ARE RESOLVED PER PERSON, AT QUEUE TIME. What is reviewed in the
 * queue is exactly what goes out — not a template that might render
 * differently an hour later when somebody edits a company name.
 *
 * AND THE DEAL, WHICH IS THE PART WORTH READING TWICE. A message lands on
 * the CONTACT always. It lands on a DEAL only when that contact has exactly
 * ONE open opportunity. With two open deals there is no honest way to pick,
 * and a mail filed under the wrong deal is worse than a mail filed under
 * none — it makes a deal's history say something that did not happen. Those
 * are recorded against the person alone, and the count is reported so the
 * silence is visible.
 */
export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    /**
     * ?people=id,id,… — who was selected, with the one fact that decides
     * whether they can be written to.
     *
     * The composer asks for this rather than being handed it, because the
     * contact list only carries the columns a person has chosen to see:
     * somebody whose view hides the e-mail column would otherwise be told
     * that none of his forty contacts have one.
     */
    const who = url.searchParams.get("people");
    if (who) {
      const ids = who.split(",").map((x) => x.trim()).filter(Boolean).slice(0, MOST);
      if (!ids.length) return NextResponse.json({ people: [] });
      const { data } = await db.from("person")
        .select("id, full_name, first_name, primary_email, primary_phone, whatsapp_number")
        .in("id", ids);
      return NextResponse.json({
        people: (data || []).map((p) => ({
          id: String(p.id),
          name: String(p.full_name || p.first_name || "").trim() || "(no name)",
          email: p.primary_email ? String(p.primary_email) : null,
          phone: String(p.whatsapp_number || p.primary_phone || "") || null,
        })),
      });
    }

    if (id) {
      const { data: doc } = await db.from("broadcast").select("*").eq("id", id).maybeSingle();
      if (!doc) throw new HttpError(404, "No such broadcast.");
      const table = doc.channel === "email" ? "outbound_queue" : "wa_queue";
      const cols = doc.channel === "email"
        ? "id, to_email, subject, body, status, person_id, opportunity_id, sent_at"
        : "id, phone, body, status, error, person_id, opportunity_id, sent_at, delivered_at, read_at";
      const { data: rows } = await db.from(table).select(cols).eq("broadcast_id", id).limit(MOST);
      return NextResponse.json({ broadcast: doc, rows: rows || [] });
    }

    const { data, error } = await db.from("broadcast")
      .select("*").order("created_at", { ascending: false }).limit(100);
    if (error) {
      if (missing(error.message)) return NextResponse.json({ installed: false, broadcasts: [] });
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ installed: true, broadcasts: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});

    const channel = String(body.channel || "");
    if (channel !== "email" && channel !== "whatsapp") throw new HttpError(400, "Email or WhatsApp?");

    const ids = (Array.isArray(body.person_ids) ? body.person_ids : []).map(String).filter(Boolean);
    if (!ids.length) throw new HttpError(400, "Nobody is selected.");
    if (ids.length > MOST) throw new HttpError(400, `${MOST} at a time is the most this will take in one act. More than that is a campaign, and campaigns belong in Marketing.`);

    const text = String(body.body || "").trim();
    const campaign = String(body.campaign || "").trim();
    /* On the AiSensy road a body is not what is sent — a Live campaign is.
       So either a message or a campaign will do, and which one is required
       depends on the road, not on this route's opinion. */
    if (!text && !campaign) throw new HttpError(400, "A message, or the name of a Live campaign.");
    if (channel === "email" && !String(body.subject || "").trim()) throw new HttpError(400, "A subject, please — a bulk mail without one is a bulk mail nobody opens.");

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    /** The template's positional variables, as typed — {{name}} and the rest still in them. */
    const paramsRaw = (Array.isArray(body.params) ? body.params : []).map(String);

    // ---- who they are -----------------------------------------------------
    const { data: people, error: pe } = await db.from("person")
      .select("id, full_name, first_name, primary_email, primary_phone, whatsapp_number, company_id")
      .in("id", ids);
    if (pe) throw new HttpError(500, pe.message);
    const found = people || [];

    // ---- which deal, if any, each one is unambiguously on -----------------
    const { data: opps } = await db.from("opportunity")
      .select("id, point_of_contact_id, contact_id")
      .is("won_at", null).is("lost_at", null).is("deleted_at", null)
      .or(`point_of_contact_id.in.(${ids.join(",")}),contact_id.in.(${ids.join(",")})`);
    const dealsFor = new Map<string, string[]>();
    for (const o of opps || []) {
      for (const k of [o.point_of_contact_id, o.contact_id]) {
        if (!k) continue;
        const key = String(k);
        if (!ids.includes(key)) continue;
        const list = dealsFor.get(key) || [];
        if (!list.includes(String(o.id))) list.push(String(o.id));
        dealsFor.set(key, list);
      }
    }

    // ---- the document -----------------------------------------------------
    const title = String(body.title || "").trim()
      || `${channel === "email" ? "Mail" : "WhatsApp"} to ${ids.length} contact${ids.length === 1 ? "" : "s"}`;
    const { data: doc, error: de } = await db.from("broadcast").insert({
      channel, title,
      subject: channel === "email" ? String(body.subject || "") : null,
      body: text,
      template_name: String(body.template || "").slice(0, 120) || null,
      campaign: campaign || null,
      params: Array.isArray(body.params) && body.params.length ? body.params.map(String) : null,
      attachments,
      picked: ids.length,
      created_by: me.email.toLowerCase(),
    }).select("id").single();
    if (de) {
      if (missing(de.message)) throw new HttpError(503, "Run CRM migration 0064 first — a broadcast has nowhere to live yet.");
      throw new HttpError(500, de.message);
    }
    const bid = String(doc.id);

    // ---- the rows ---------------------------------------------------------
    const rows: Record<string, unknown>[] = [];
    const skips: { who: string; why: string }[] = [];
    let noDeal = 0, manyDeals = 0;

    for (const id of ids) {
      const p = found.find((x) => String(x.id) === id);
      const who = String(p?.full_name || p?.first_name || id);
      if (!p) { skips.push({ who, why: "no longer in the CRM" }); continue; }

      const deals = dealsFor.get(id) || [];
      // Exactly one open deal, or none at all. Never a guess between two.
      const opportunity_id = deals.length === 1 ? deals[0] : null;
      if (deals.length === 0) noDeal++;
      if (deals.length > 1) manyDeals++;

      /**
       * VARIABLES ARE RESOLVED PER PERSON — AND SO ARE THE TEMPLATE'S
       * PARAMS (9 Sep 2026).
       *
       * A Meta template is positional: "Dear {{1}}, {{2}}". If {{1}} is the
       * contact's name then a single list shared by forty recipients would
       * greet all forty by the same name — the worst possible failure for a
       * bulk WhatsApp, and a silent one. So each param is put through the
       * same renderer as the body, per person, and each queue row keeps its
       * own finished list.
       */
      let rendered = text;
      let rowParams = paramsRaw;
      if (text || paramsRaw.length) {
        try {
          const vals = await variableValues({
            personId: id, companyId: p.company_id ? String(p.company_id) : null,
            opportunityId: opportunity_id, quotationId: null,
          });
          if (text) rendered = renderTemplate(text, vals);
          if (paramsRaw.length) rowParams = paramsRaw.map((x) => renderTemplate(x, vals));
        } catch (e) { swallow("crm/broadcast", e); /* an unresolvable variable must not lose the message */ }
      }

      if (channel === "email") {
        const to = String(p.primary_email || "").trim();
        if (!to || !to.includes("@")) { skips.push({ who, why: "no e-mail address on the record" }); continue; }
        rows.push({
          channel: "email", to_email: to, subject: String(body.subject || ""),
          body: rendered, template_name: String(body.template || "").slice(0, 120),
          person_id: id, company_id: p.company_id ?? null, opportunity_id,
          attachments, broadcast_id: bid, send_mode: "manual",
          added_by: me.email.toLowerCase(), status: "queued",
        });
      } else {
        const phone = String(p.whatsapp_number || p.primary_phone || "").replace(/\D/g, "");
        if (phone.length < 8) { skips.push({ who, why: "no usable phone number" }); continue; }
        rows.push({
          phone, body: rendered,
          template_name: campaign || String(body.template || "").slice(0, 120),
          params: rowParams.length ? rowParams : null,
          media: body.media && (body.media as { url?: string }).url ? body.media : null,
          person_id: id, company_id: p.company_id ?? null, opportunity_id,
          broadcast_id: bid, batch_id: bid,
          queued_by: me.profileId, status: "queued", source: "crm",
          ref: who.slice(0, 60),
        });
      }
    }

    if (!rows.length) {
      await db.from("broadcast").update({
        status: "cancelled", queued: 0, skipped: skips.length, skip_note: skips,
      }).eq("id", bid);
      throw new HttpError(400, channel === "email"
        ? "Not one of them has an e-mail address."
        : "Not one of them has a usable phone number.");
    }

    const { error: ie } = await db.from(channel === "email" ? "outbound_queue" : "wa_queue").insert(rows);
    if (ie) {
      await db.from("broadcast").update({ status: "cancelled" }).eq("id", bid);
      if (missing(ie.message)) throw new HttpError(503, "Run CRM migration 0064 first.");
      throw new HttpError(500, ie.message);
    }

    await db.from("broadcast").update({
      queued: rows.length, skipped: skips.length, skip_note: skips,
    }).eq("id", bid);

    return NextResponse.json({
      ok: true, id: bid, queued: rows.length, skipped: skips,
      onDeal: rows.filter((r) => r.opportunity_id).length,
      noDeal, manyDeals,
      note: [
        `${rows.length} queued.`,
        skips.length ? `${skips.length} could not be written to.` : "",
        manyDeals ? `${manyDeals} have more than one open deal, so those are filed against the contact only — there is no honest way to pick between two.` : "",
      ].filter(Boolean).join(" "),
    });
  } catch (e) { return errJson(e); }
}
