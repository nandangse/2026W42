import { NextResponse } from "next/server";
import { crmDb } from "@/crm/db";
import { requireCrm } from "@/crm/auth";
import { errJson, HttpError } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { assertAiOn } from "@/lib/ai-gate";
import { writeFollowUp, REASONS, type Reason } from "@/lib/met-writer";
import { pageAll } from "@/lib/page-all";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * PEOPLE I MET — the record, and the two messages it produces.
 *
 * GET                          everybody I met, newest first (?all=1 for the team's)
 * POST { action: "add" }       from a person, from a card, or typed from nothing
 * POST { action: "save" }      the context and the reason, which are the record
 * POST { action: "write" }     Claude writes the e-mail or the WhatsApp
 * POST { action: "queue" }     puts the written message in outbound_queue, manual
 * POST { action: "delete" }
 *
 * WHY THE MESSAGE IS NOT SENT FROM HERE. Dr Raghu, 16 Sep 2026: "the queue on
 * wa also should be made so it can be sent manually from my own wa. It makes
 * message and keeps." A WhatsApp that arrives from a business gateway reads
 * as a business gateway. The same words sent from his own phone, to somebody
 * who met him an hour ago, read as him. So Genie writes it, keeps it, and he
 * presses send — which is also why nothing here can go out by accident.
 */
const S = (v: unknown) => String(v ?? "").trim();


/**
 * EVERY PERSON MET IS ALSO AN INTERACTION (Dr Raghu, 16 Sep 2026: "add this
 * to interaction so it adds to my meeting quota").
 *
 * A meeting recorded here and nowhere else is a private note. The CRM counts
 * interactions, and that count is what a month is judged on — so the work
 * done at a show belongs where the work is counted, not in a side list
 * nobody totals.
 *
 * IT IS A LINK, NOT A COPY. The id of the row it made is kept, so editing
 * the context updates that same interaction instead of leaving a staler twin
 * behind. Forty people met at a show must be forty interactions, not eighty.
 *
 * It never throws. A CRM that cannot take the interaction must not cost
 * somebody the record of who they met — that is the more important half.
 */
async function alsoAnInteraction(
  db: ReturnType<typeof crmDb>, row: Record<string, unknown>, profileId: string | null,
): Promise<string | null> {
  try {
    const when = S(row.met_on) ? `${S(row.met_on)}T12:00:00+05:30` : new Date().toISOString();
    const where = S(row.event);
    const fields: Record<string, unknown> = {
      kind: "Meeting",
      call_type: "Meeting",
      happened_at: when,
      person_name: S(row.name) || null,
      remark: [where ? `Met at ${where}.` : "Met.", S(row.context)].filter(Boolean).join(" "),
      person_id: row.person_id ?? null,
      company_id: row.company_id ?? null,
      by_id: profileId,
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
    const existing = S(row.interaction_id);
    if (existing) {
      const { error } = await db.from("interaction").update(fields).eq("id", existing);
      if (!error) return existing;
      /* The row it pointed at is gone — make a fresh one rather than losing
         the meeting from the count. */
    }
    const { data, error } = await db.from("interaction").insert(fields).select("id").single();
    if (error) return null;
    return String(data.id);
  } catch { return null; }
}

export async function GET(req: Request) {
  try {
    const u = await requireCrm();
    const db = crmDb();
    /* A head of sales may look across the team; everybody else sees the
       people they themselves met, which is the only useful default anyway. */
    const seesAll = u.isOwner || /head|manager|admin/i.test(u.crmRole);
    const all = new URL(req.url).searchParams.get("all") === "1" && seesAll;
    const rows = await pageAll<Record<string, unknown>>(async (f, t) => {
      let q = db.from("met_person").select("*").order("met_on", { ascending: false }).order("added_at", { ascending: false }).range(f, t);
      if (!all) q = q.eq("added_by", u.email.toLowerCase());
      const r = await q;
      return { data: r.data as unknown as Record<string, unknown>[] | null, error: r.error };
    }, "the people you met");

    /* What is already written and waiting, so the screen can show a tick
       rather than offering to write the same message twice. */
    const ids = rows.map((r) => String(r.id));
    const queued: Record<string, { email?: string; whatsapp?: string }> = {};
    if (ids.length) {
      const { data } = await db.from("outbound_queue")
        .select("id, channel, status, met_id").in("met_id", ids).eq("status", "queued");
      for (const q of (data || []) as { id: string; channel: string; met_id: string }[]) {
        queued[q.met_id] = { ...(queued[q.met_id] || {}), [q.channel]: q.id };
      }
    }
    /* A private photograph, read back through a URL that expires. */
    for (const r of rows) {
      if (!r.selfie_path) continue;
      const { data: sgn } = await db.storage.from("cards").createSignedUrl(String(r.selfie_path), 3600);
      r.selfie = sgn?.signedUrl ?? null;
    }
    /* The labels already used, so the next one is picked rather than retyped
       and a show does not end up spelled three ways. */
    const seen = new Set<string>();
    for (const r of rows) for (const t of ((r.tags as string[]) || [])) if (t) seen.add(t);
    return NextResponse.json({ ok: true, people: rows, queued, reasons: REASONS, knownTags: [...seen].sort() });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireCrm();
    const db = crmDb();

    /**
     * THE SELFIE comes as a form, not as JSON. It rides in the same private
     * bucket as the visiting cards and is read back through a signed URL
     * that expires — a photograph of two people at a stand is nobody's to
     * publish, least of all ours.
     */
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const id = S(form.get("id"));
      const file = form.get("file");
      if (!id) throw new HttpError(400, "Which meeting is the photo for?");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "No photograph was attached.");
      if (file.size > 10 * 1024 * 1024) throw new HttpError(400, "That image is over 10MB — a phone photo should be far smaller.");
      const { data: own } = await db.from("met_person").select("added_by").eq("id", id).maybeSingle();
      if (!own) throw new HttpError(404, "No such meeting.");
      const seesAll0 = u.isOwner || /head|manager|admin/i.test(u.crmRole);
      if (!seesAll0 && String(own.added_by) !== u.email.toLowerCase()) throw new HttpError(403, "That is somebody else's.");

      const buf = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `selfie/${new Date().toISOString().slice(0, 7)}/${Date.now()}.${ext}`;
      const { error: up } = await db.storage.from("cards").upload(path, buf, { contentType: file.type || "image/jpeg" });
      if (up) throw new HttpError(502, `Could not store the photo: ${up.message}`);
      const { error } = await db.from("met_person").update({ selfie_path: path }).eq("id", id);
      if (error) throw new HttpError(/selfie_path/i.test(error.message) ? 503 : 500,
        /selfie_path/i.test(error.message) ? "Run CRM migration 0075 first." : error.message);
      const { data: sgn } = await db.storage.from("cards").createSignedUrl(path, 3600);
      return NextResponse.json({ ok: true, selfie: sgn?.signedUrl ?? null });
    }

    const b = await readBody(req, { action: "string" });
    const me = u.email.toLowerCase();
    const mine = async (id: string) => {
      const { data } = await db.from("met_person").select("*").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "No such person.");
      const seesAll = u.isOwner || /head|manager|admin/i.test(u.crmRole);
      if (!seesAll && String(data.added_by) !== me) throw new HttpError(403, "That is somebody else's.");
      return data as Record<string, unknown>;
    };

    if (b.action === "add") {
      /* THREE DOORS, ONE ROW. From a CRM person, from a scanned card, or
         typed from nothing — a stand with no card is still somebody met. */
      const row: Record<string, unknown> = {
        source: ["database", "card", "typed"].includes(S(b.source)) ? S(b.source) : "typed",
        person_id: S(b.person_id) || null,
        company_id: S(b.company_id) || null,
        card_id: S(b.card_id) || null,
        name: S(b.name), company_name: S(b.company_name) || null,
        job_title: S(b.job_title) || null,
        email: S(b.email).toLowerCase() || null, phone: S(b.phone) || null,
        context: S(b.context) || null,
        event: S(b.event) || null,
        reason: REASONS.some((r) => r.key === S(b.reason)) ? S(b.reason) : "keep_warm",
        tags: Array.isArray(b.tags) ? (b.tags as unknown[]).map(S).filter(Boolean).slice(0, 12) : [],
        added_by: me,
      };
      if (S(b.met_on)) row.met_on = S(b.met_on);

      /* Pulling from the database fills the blanks from the record itself,
         so nobody retypes a name that is already here. */
      if (row.person_id) {
        const { data: p } = await db.from("person")
          .select("full_name, job_title, primary_email, primary_phone, whatsapp_number, company_id").eq("id", row.person_id).maybeSingle();
        if (p) {
          row.name = row.name || S(p.full_name);
          row.job_title = row.job_title || S(p.job_title) || null;
          row.email = row.email || S(p.primary_email).toLowerCase() || null;
          row.phone = row.phone || S(p.whatsapp_number) || S(p.primary_phone) || null;
          row.company_id = row.company_id || p.company_id || null;
        }
      }
      if (row.company_id && !row.company_name) {
        const { data: c } = await db.from("company").select("name").eq("id", row.company_id).maybeSingle();
        if (c) row.company_name = S(c.name) || null;
      }
      if (!row.name) throw new HttpError(400, "Who did you meet? A name is the one thing needed.");

      const { data, error } = await db.from("met_person").insert(row).select("*").single();
      if (error) {
        if (/tags|interaction_id|selfie_path/i.test(error.message)) throw new HttpError(503, "Run CRM migration 0075 first.");
        if (/met_person|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run CRM migration 0074 first.");
        throw new Error(error.message);
      }
      const iid = await alsoAnInteraction(db, data as Record<string, unknown>, u.profileId);
      if (iid) await db.from("met_person").update({ interaction_id: iid }).eq("id", data.id).then(() => null, () => null);
      return NextResponse.json({ ok: true, person: { ...data, interaction_id: iid }, counted: !!iid });
    }

    if (b.action === "save") {
      const cur = await mine(S(b.id));
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["name", "company_name", "job_title", "email", "phone", "context", "event", "met_on"]) {
        if (b[k] !== undefined) patch[k] = S(b[k]) || null;
      }
      if (b.reason !== undefined && REASONS.some((r) => r.key === S(b.reason))) patch.reason = S(b.reason);
      if (Array.isArray(b.tags)) patch.tags = (b.tags as unknown[]).map(S).filter(Boolean).slice(0, 12);
      const { error } = await db.from("met_person").update(patch).eq("id", S(b.id));
      if (error) throw new HttpError(/tags|selfie_path|interaction_id/i.test(error.message) ? 503 : 500,
        /tags|selfie_path|interaction_id/i.test(error.message) ? "Run CRM migration 0075 first." : error.message);
      /* The interaction follows the record, so a corrected context corrects
         what the month is counted on too. */
      const after = { ...cur, ...patch };
      const iid = await alsoAnInteraction(db, after, u.profileId);
      if (iid && iid !== S(cur.interaction_id)) await db.from("met_person").update({ interaction_id: iid }).eq("id", S(b.id)).then(() => null, () => null);
      return NextResponse.json({ ok: true, counted: !!iid });
    }

    if (b.action === "write") {
      await assertAiOn();
      const p = await mine(S(b.id));
      const channel = S(b.channel) === "whatsapp" ? "whatsapp" : "email";
      if (channel === "email" && !S(p.email)) throw new HttpError(400, "No e-mail address for them yet — add one first.");
      if (channel === "whatsapp" && !S(p.phone)) throw new HttpError(400, "No phone number for them yet — add one first.");

      /* What the sender's company does, said once and reused. It decides what
         a message may honestly claim, and without it the message simply
         carries no claim — a shorter message, not a weaker one. */
      const { data: cfg } = await db.from("integration_setting").select("config").eq("key", "met_sender").maybeSingle();
      const senderDoes = S((cfg?.config as Record<string, unknown> | undefined)?.does) || null;
      const device = S((cfg?.config as Record<string, unknown> | undefined)?.device) || null;

      const wrote = await writeFollowUp({
        channel,
        name: S(p.name),
        company: S(p.company_name) || null,
        jobTitle: S(p.job_title) || null,
        context: S(p.context) || null,
        event: S(p.event) || null,
        reason: S(p.reason) as Reason,
        senderName: (u.displayName || u.email.split("@")[0]).split(" ")[0],
        senderDoes,
        device,
      });
      return NextResponse.json({ ok: true, channel, ...wrote });
    }

    if (b.action === "queue") {
      const p = await mine(S(b.id));
      const channel = S(b.channel) === "whatsapp" ? "whatsapp" : "email";
      const body = S(b.body);
      if (!body) throw new HttpError(400, "Nothing to queue.");

      /* Replace rather than stack: a second draft for the same person on the
         same channel is a correction, not another message to send. */
      await db.from("outbound_queue").update({ status: "cancelled", sent_note: "replaced by a newer draft" })
        .eq("met_id", S(b.id)).eq("channel", channel).eq("status", "queued");

      const row: Record<string, unknown> = {
        channel, met_id: S(b.id),
        person_id: p.person_id ?? null, company_id: p.company_id ?? null, card_id: p.card_id ?? null,
        to_email: channel === "email" ? S(p.email) || null : null,
        to_phone: channel === "whatsapp" ? S(p.phone) || null : null,
        subject: channel === "email" ? S(b.subject) || null : null,
        body,
        /* ALWAYS MANUAL. Nothing written here leaves on its own — an e-mail
           is sent by the hand that read it, and a WhatsApp goes from his own
           phone, which is the entire point of keeping it rather than sending. */
        send_mode: "manual",
        added_by: me,
      };
      const { data, error } = await db.from("outbound_queue").insert(row).select("id").single();
      if (error) {
        if (/met_id/i.test(error.message)) throw new HttpError(503, "Run CRM migration 0074 first.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, queue_id: data.id });
    }

    if (b.action === "delete") {
      const gone = await mine(S(b.id));
      /* The meeting leaves the count with the record. Leaving the
         interaction behind would flatter the month with a meeting whose
         evidence has been deleted. */
      if (S(gone.interaction_id)) await db.from("interaction").delete().eq("id", S(gone.interaction_id)).then(() => null, () => null);
      await db.from("outbound_queue").delete().eq("met_id", S(b.id)).eq("status", "queued");
      const { error } = await db.from("met_person").delete().eq("id", S(b.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
