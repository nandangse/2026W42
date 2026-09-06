import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET ?entity=&id= — MY notes and MY sends on a lead; nobody else's (Dr Raghu: "communication is ONLY of self"). */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity") === "company" ? "company" : "person";
    const id = url.searchParams.get("id") || "";
    if (!id) throw new HttpError(400, "id");
    const db = crmDb();
    const me = u.email.toLowerCase();
    const { data: notes } = await db.from("mk_note").select("id, body, created_at").eq("entity", entity).eq("entity_id", id).eq("created_by_email", me).order("created_at", { ascending: false });
    let sends: unknown[] = [];
    if (entity === "person") {
      const { data } = await db.from("mk_send").select("status, sent_at, opened_at, open_count, campaign:campaign_id(name, created_by_email)").eq("person_id", id).order("sent_at", { ascending: false }).limit(50);
      sends = (data || []).filter((s) => (s.campaign as { created_by_email?: string } | null)?.created_by_email === me || u.scope === "all");
    }
    return NextResponse.json({ notes: notes ?? [], sends });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { entity: "string", entity_id: "uuid", body: "string" });
    const { error } = await crmDb().from("mk_note").insert({ entity: b.entity === "company" ? "company" : "person", entity_id: b.entity_id, body: b.body.trim(), created_by_email: u.email.toLowerCase() });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
