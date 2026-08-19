import { NextResponse } from "next/server";
import { requireReader, requireOwner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/principles — how the company is run, in order.
 *
 * Readable by everyone signed in. That is the point of writing them down: a
 * principle only the people who wrote it can see is a private note.
 */
export async function GET() {
  try {
    await requireReader();
    const { data, error } = await adminClient()
      .from("principles")
      .select("id, ord, title, body, active, updated_at")
      .eq("active", true)
      .order("ord", { ascending: true })
      .order("updated_at", { ascending: true });
    if (error) {
      if (/principles|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, items: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, items: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/principles — owner only.
 *
 *   { action: "save",   id?, title, body, ord? }
 *   { action: "remove", id }
 *   { action: "order",  ids: [...] }
 *
 * Removing sets active=false rather than deleting. A principle that was in
 * force last year is part of how decisions were made last year, and deleting
 * it rewrites that.
 */
export async function POST(req: Request) {
  try {
    const user = await requireOwner();
    const admin = adminClient();
    const b = await req.json();

    if (b.action === "save") {
      const title = String(b.title || "").trim();
      const body = String(b.body || "").trim();
      if (title.length < 3) throw new HttpError(400, "A principle needs a title.");
      const row = { title, body, ord: Number(b.ord) || 0, updated_at: new Date().toISOString(), updated_by: user.id };
      const { error } = b.id
        ? await admin.from("principles").update(row).eq("id", b.id)
        : await admin.from("principles").insert(row);
      if (error) {
        if (/principles|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0038 first — principles have nowhere to save yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "remove") {
      if (!b.id) throw new HttpError(400, "id required");
      const { error } = await admin.from("principles").update({ active: false }).eq("id", b.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "order" && Array.isArray(b.ids)) {
      for (let i = 0; i < b.ids.length; i++)
        await admin.from("principles").update({ ord: i }).eq("id", b.ids[i]);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action");
  } catch (e) {
    return errJson(e);
  }
}
