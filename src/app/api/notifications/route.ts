import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/notifications — the caller's latest notifications + unread count.
// Degrades to an empty, `installed:false` payload before migration 0012 runs,
// so the bell simply doesn't render rather than erroring.
export async function GET() {
  try {
    await requireUser();
    const db = supabaseServer(); // RLS scopes rows to the caller
    const [listRes, unreadRes] = await Promise.all([
      db
        .from("notifications")
        .select("id, kind, title, body, created_by, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (listRes.error) {
      if (/notifications|schema cache|does not exist/i.test(listRes.error.message))
        return NextResponse.json({ installed: false, items: [], unread: 0 });
      throw new Error(listRes.error.message);
    }
    return NextResponse.json({
      installed: true,
      items: listRes.data || [],
      unread: unreadRes.count ?? 0,
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/notifications — mark read.
//   { action: "read", ids: [...] }
//   { action: "read_all" }
export async function POST(req: Request) {
  try {
    await requireUser();
    const db = supabaseServer(); // RLS means you can only mark your own
    const body = await req.json();
    const now = new Date().toISOString();

    if (body.action === "read" && Array.isArray(body.ids) && body.ids.length) {
      const { error } = await db.from("notifications").update({ read_at: now }).in("id", body.ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "read_all") {
      const { error } = await db.from("notifications").update({ read_at: now }).is("read_at", null);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
