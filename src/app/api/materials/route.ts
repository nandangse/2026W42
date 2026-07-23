import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/materials — planner/admin. Materials checklist per job.
//   { action: "add", job_id, item, qty?, custom? }
//   { action: "status", id, status: "Pending"|"Received" }
//   { action: "delete", id }
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();

    if (body.action === "add") {
      if (!body.job_id || !body.item)
        return NextResponse.json({ error: "job_id and item required" }, { status: 400 });
      const { data, error } = await supabase
        .from("materials")
        .insert({
          job_id: body.job_id,
          item: body.item,
          qty: body.qty || "",
          status: body.status === "Received" ? "Received" : "Pending",
          custom: !!body.custom,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "status") {
      const { error } = await supabase
        .from("materials")
        .update({ status: body.status === "Received" ? "Received" : "Pending" })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const { error } = await supabase.from("materials").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return errJson(e);
  }
}
