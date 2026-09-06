import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Add Visiting Card — a photograph becomes a Contact and a Company.
 *
 * POST multipart {file}          — store the image, read it with Claude,
 *                                  return what it said (never what it guessed).
 * POST json {action:"create"...} — write the records the human has checked.
 *
 * The model is told to return null rather than invent: a guessed digit in a
 * phone number is worse than a blank, because the blank gets fixed at the
 * desk and the guess gets dialled.
 */
const CARD_SCHEMA = {
  type: "object",
  properties: {
    person_name: { type: ["string", "null"], description: "The person's full name as printed" },
    salutation: { type: ["string", "null"], description: "Mr / Ms / Dr / a rank — only if printed" },
    designation: { type: ["string", "null"] },
    company: { type: ["string", "null"] },
    phones: { type: "array", items: { type: "string" }, description: "Every phone printed, digits as printed" },
    emails: { type: "array", items: { type: "string" } },
    website: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    notes: { type: ["string", "null"], description: "Anything else printed that matters — divisions, taglines with product hints. Nothing invented." },
    transcript: { type: ["string", "null"], description: "EVERY line printed on the card, verbatim, one per line, in reading order." },
  },
  required: ["person_name", "salutation", "designation", "company", "phones", "emails", "website", "address", "city", "notes", "transcript"],
  additionalProperties: false,
} as const;

async function readCard(buf: Buffer, mime: string): Promise<{ read: Record<string, unknown> | null; why: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { read: null, why: "ANTHROPIC_API_KEY is not set on this deploy — type the card in by hand." };
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI.FRONT,
        max_tokens: 900,
        system:
          "You read ONE visiting card from a photograph and return only what is printed on it. " +
          "This fills a CRM record, so a wrong detail becomes a wrong call to a real person.\n" +
          "1. Copy text verbatim; do not tidy or expand.\n" +
          "2. Return null (or an empty list) for anything not printed. NEVER guess.\n" +
          "3. Phones: every number printed, exactly as printed.\n" +
          "4. If the photograph is not a visiting card, return null for every field and say so in notes.",
        tools: [{ name: "card", description: "The card's printed details.", input_schema: CARD_SCHEMA }],
        tool_choice: { type: "tool", name: "card" },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
            { type: "text", text: "Read this visiting card." },
          ],
        }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return {
        read: null,
        why: r.status === 401 ? "the ANTHROPIC_API_KEY is wrong or revoked"
          : r.status === 429 || r.status === 529 ? "the model was busy — try again in a minute"
          : `the model answered ${r.status}: ${t.slice(0, 180)}`,
      };
    }
    const j = await r.json();
    const use = (j?.content || []).find((c: { type?: string }) => c?.type === "tool_use");
    return use?.input ? { read: use.input as Record<string, unknown>, why: null } : { read: null, why: "the model returned nothing usable" };
  } catch (e) {
    return { read: null, why: `could not reach the model: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** +91 and bare ten digits, the person doctype's own convention. */
function e164(raw: string): string {
  let d = String(raw || "").replace(/[^0-9]/g, "");
  if (d.length === 14 && d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? `+91${d}` : raw.trim();
}

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const personId = u.searchParams.get("person_id");

    let q = db.from("visiting_card").select("id, image_path, image_back_path, transcript, extracted, status, person_id, company_id, added_by, added_at")
      .order("added_at", { ascending: false }).limit(personId ? 20 : 100);
    q = personId ? q.eq("person_id", personId) : q.eq("added_by", me.email.toLowerCase());
    const { data, error } = await q;
    if (error) {
      if (/visiting_card|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ cards: [], needsMigration: true });
      throw new HttpError(500, error.message);
    }
    const cards = await Promise.all((data || []).map(async (c) => {
      const sign = async (path: unknown) => {
        if (!path) return null;
        const { data: sgn } = await db.storage.from("cards").createSignedUrl(String(path), 3600);
        return sgn?.signedUrl ?? null;
      };
      return { ...c, front_url: await sign(c.image_path), back_url: await sign(c.image_back_path) };
    }));
    return NextResponse.json({ cards });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const ct = req.headers.get("content-type") || "";

    /* ── the photograph ── */
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "No photograph was attached.");
      if (file.size > 10 * 1024 * 1024) throw new HttpError(400, "That image is over 10MB — a card photo should be far smaller.");
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}.${ext}`;
      const { error: up } = await db.storage.from("cards").upload(path, buf, { contentType: file.type || "image/jpeg" });
      if (up) {
        if (/bucket/i.test(up.message))
          throw new HttpError(503, "Run CRM migration 0018 first — the cards bucket does not exist yet.");
        throw new HttpError(502, `Could not store the card: ${up.message}`);
      }
      // the back is stored, not read — the front carries the identity, and a
      // second model call for a works list is money spent on decoration
      if (String(form.get("side") || "front") === "back")
        return NextResponse.json({ ok: true, path, side: "back" });
      const { read, why } = await readCard(buf, file.type || "");
      // matching companies, so the human decides "existing or new" with names in front of them
      let matches: { id: string; name: string }[] = [];
      const companyName = read && typeof read.company === "string" ? read.company.trim() : "";
      if (companyName) {
        const { data } = await db.from("company").select("id, name").ilike("name", `%${companyName.replace(/[%_]/g, "")}%`).limit(5);
        matches = (data || []).map((c) => ({ id: String(c.id), name: String(c.name) }));
      }
      return NextResponse.json({ ok: true, path, read, why, matches });
    }

    /* ── the records, as checked by the human ── */
    const body = await readBody(req, {});

    /** { action: "save" } — the scan on file, no CRM records yet. */
    if (String(body.action) === "save") {
      const { data: c, error } = await db.from("visiting_card").insert({
        image_path: String(body.path || ""),
        image_back_path: String(body.back_path || "").trim() || null,
        transcript: String(body.transcript || "").trim() || null,
        extracted: body.extracted ?? null,
        status: "saved",
        added_by: me.email.toLowerCase(),
      }).select("id").maybeSingle();
      if (error) {
        if (/visiting_card|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run CRM migrations 0018 and 0019 first.");
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ ok: true, card_id: c ? String(c.id) : null });
    }

    if (String(body.action) !== "create") throw new HttpError(400, "unknown action");
    const personName = String(body.person_name || "").trim();
    if (!personName) throw new HttpError(400, "The contact needs a name.");

    let companyId: string | null = String(body.company_id || "").trim() || null;
    const companyName = String(body.company || "").trim();
    if (!companyId && companyName) {
      const { data: c, error } = await db.from("company").insert({ name: companyName, website: String(body.website || "").trim() || null }).select("id").maybeSingle();
      if (error) throw new HttpError(500, `Could not create the company: ${error.message}`);
      companyId = c ? String(c.id) : null;
    }

    const { data: p, error: pe } = await db.from("person").insert({
      first_name: personName,
      salutation: String(body.salutation || "").trim() || null,
      job_title: String(body.designation || "").trim() || null,
      company_id: companyId,
      primary_email: String(body.email || "").trim().toLowerCase() || null,
      primary_phone: body.phone ? e164(String(body.phone)) : null,
      owner_id: me.profileId,
    }).select("id").maybeSingle();
    if (pe) throw new HttpError(500, `Could not create the contact: ${pe.message}`);

    const cardRow = {
      image_path: String(body.path || ""),
      image_back_path: String(body.back_path || "").trim() || null,
      transcript: String(body.transcript || "").trim() || null,
      extracted: body.extracted ?? null,
      company_id: companyId, person_id: p ? String(p.id) : null,
      status: "added",
      added_by: me.email.toLowerCase(),
    };
    const cardId = String(body.card_id || "").trim();
    const { error: ve } = cardId
      ? await db.from("visiting_card").update(cardRow).eq("id", cardId)
      : await db.from("visiting_card").insert(cardRow);
    if (ve && !/visiting_card|schema cache/i.test(ve.message)) throw new HttpError(500, ve.message);

    return NextResponse.json({ ok: true, person_id: p ? String(p.id) : null, company_id: companyId });
  } catch (e) {
    return errJson(e);
  }
}
