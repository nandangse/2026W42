import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireMarketing();
    const db = crmDb();
    const { data, error } = await db.from("mk_template").select("id, name, subject, body_html, created_by_email, updated_at").order("name");
    if (error) {
      if (/mk_template|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, templates: [], variables: [] });
      throw new Error(error.message);
    }
    const { data: vars } = await db.from("message_variable").select("key, kind, description").order("key");
    const variables = [
      { key: "first_name", description: "the person's first name" }, { key: "name", description: "full name" }, { key: "title", description: "job title" },
      { key: "company", description: "company name" }, { key: "city", description: "city" }, { key: "country", description: "country" }, { key: "email", description: "their e-mail" },
      ...(vars || []).map((v) => ({ key: String(v.key), description: String(v.description || v.kind) })),
    ];
    return NextResponse.json({ installed: true, templates: data ?? [], variables });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const db = crmDb();
    if (b.action === "save") {
      const row = { name: String(b.name || "Untitled").trim(), subject: b.subject ?? null, body_html: b.body_html ?? null, updated_at: new Date().toISOString() };
      if (b.id) { const { error } = await db.from("mk_template").update(row).eq("id", b.id); if (error) throw new Error(error.message); return NextResponse.json({ ok: true, id: b.id }); }
      const { data, error } = await db.from("mk_template").insert({ ...row, created_by_email: u.email.toLowerCase() }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "delete") { if (!b.id) throw new HttpError(400, "id"); await db.from("mk_template").delete().eq("id", b.id); return NextResponse.json({ ok: true }); }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
