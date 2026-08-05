import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// A rotating default palette so a new category isn't grey until someone
// picks a colour for it.
const DEFAULT_PALETTE = ["#0D7A3F", "#1B3A5C", "#7C3AED", "#0D9488", "#D97706", "#B3261E", "#5A6672"];

// GET /api/admin/swimlanes — every goal category (any admin), plus how many
// goal nodes use each one, so deleting an in-use category is caught early.
export async function GET() {
  try {
    await requireAdmin();
    const admin = adminClient();
    const [lanesRes, nodesRes] = await Promise.all([
      admin.from("swimlanes").select("id,name,color,sort_order").order("sort_order"),
      admin.from("goal_node").select("swimlane_id"),
    ]);
    if (lanesRes.error) throw new Error(lanesRes.error.message);
    if (nodesRes.error) throw new Error(nodesRes.error.message);

    const counts = new Map<string, number>();
    for (const n of nodesRes.data || [])
      if (n.swimlane_id) counts.set(n.swimlane_id, (counts.get(n.swimlane_id) || 0) + 1);

    return NextResponse.json({
      swimlanes: (lanesRes.data || []).map((l) => ({ ...l, nodeCount: counts.get(l.id) || 0 })),
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/admin/swimlanes — any admin (spec: "only the admin to edit it").
//   { action: "create", name, color? }
//   { action: "update", id, name?, color?, sort_order? }
//   { action: "delete", id }  — refused while any goal node still uses it
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const admin = adminClient();
    const body = await req.json();

    if (body.action === "create") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
      const { count } = await admin.from("swimlanes").select("id", { count: "exact", head: true });
      const { data, error } = await admin
        .from("swimlanes")
        .insert({
          name,
          color: body.color || DEFAULT_PALETTE[(count ?? 0) % DEFAULT_PALETTE.length],
          sort_order: count ?? 0,
        })
        .select("id")
        .single();
      if (error) {
        if (/duplicate|unique/i.test(error.message))
          return NextResponse.json({ error: `"${name}" already exists` }, { status: 409 });
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if ("name" in body) patch.name = String(body.name || "").trim();
      if ("color" in body) patch.color = body.color;
      if ("sort_order" in body) patch.sort_order = body.sort_order;
      if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
      const { error } = await admin.from("swimlanes").update(patch).eq("id", body.id);
      if (error) {
        if (/duplicate|unique/i.test(error.message))
          return NextResponse.json({ error: "That name is already used" }, { status: 409 });
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { count } = await admin
        .from("goal_node")
        .select("id", { count: "exact", head: true })
        .eq("swimlane_id", body.id);
      if (count)
        return NextResponse.json(
          { error: `${count} goal item(s) still use this category — move them first` },
          { status: 400 },
        );
      const { error } = await admin.from("swimlanes").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
