import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Notes on any record, through the polymorphic record_link the schema has
 * carried since 0001 (Twenty's noteTarget pattern).
 *
 *   GET  /api/crm/notes?target_type=company&target_id=<uuid>
 *   POST /api/crm/notes { target_type, target_id, body, title? }
 */
const TARGETS = ["company", "person", "lead", "opportunity", "quotation", "installed_unit", "product", "sales_order", "industry"];

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const tt = u.searchParams.get("target_type") || "";
    const tid = u.searchParams.get("target_id") || "";
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");

    const { data: linkRows, error: lerr } = await db.from("record_link")
      .select("source_id").eq("source_type", "note").eq("target_type", tt).eq("target_id", tid);
    if (lerr) throw new HttpError(500, lerr.message);
    const ids = (linkRows ?? []).map((r) => String(r.source_id));
    if (!ids.length) return NextResponse.json({ notes: [] });

    const { data: notes, error: nerr } = await db.from("note")
      .select("id, title, body, created_by, created_at")
      .in("id", ids).order("created_at", { ascending: false });
    if (nerr) throw new HttpError(500, nerr.message);

    const by = [...new Set((notes ?? []).map((n) => n.created_by).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (by.length) {
      const { data: profs } = await db.from("profile").select("id, full_name").in("id", by);
      for (const p of profs ?? []) names.set(String(p.id), String(p.full_name));
    }
    return NextResponse.json({
      notes: (notes ?? []).map((n) => ({
        ...n, author: n.created_by ? names.get(String(n.created_by)) ?? null : null,
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const tt = String(body.target_type || "");
    const tid = String(body.target_id || "");
    const text = String(body.body || "").trim();
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");
    if (!text) throw new HttpError(400, "The note needs words.");

    const { data: note, error: nerr } = await db.from("note")
      .insert({ title: String(body.title || "").trim() || null, body: text.slice(0, 20000), created_by: user.profileId })
      .select().single();
    if (nerr) throw new HttpError(500, nerr.message);

    const { error: lerr } = await db.from("record_link").insert({
      source_type: "note", source_id: note.id, target_type: tt, target_id: tid,
    });
    if (lerr) throw new HttpError(500, lerr.message);

    return NextResponse.json({ note });
  } catch (e) {
    return errJson(e);
  }
}
