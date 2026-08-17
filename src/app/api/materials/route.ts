import { NextResponse } from "next/server";
import { requirePlanner, errJson } from "@/lib/auth";
import { assertJobEditable } from "@/lib/job-state";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/materials — planner/admin. Materials checklist per job.
//   { action: "add", job_id, item, qty?, custom? }
//   { action: "seed", job_id, items: [{item, qty?, status?}] }  — one round trip
//   { action: "status", id, status: "Pending"|"Received" }
//   { action: "delete", id }
export async function POST(req: Request) {
  try {
    await requirePlanner();
    const supabase = supabaseServer();
    const body = await req.json();
    // add/seed carry job_id; status/delete identify a row instead, so resolve
    // the job from the material itself — otherwise the lock would be trivially
    // sidestepped by deleting a delivered job's material lines one by one.
    let guardJob: string | null = body.job_id ?? null;
    if (!guardJob && body.id) {
      const { data: mat } = await supabase
        .from("materials")
        .select("job_id")
        .eq("id", body.id)
        .maybeSingle();
      guardJob = mat?.job_id ?? null;
    }
    await assertJobEditable(supabase, guardJob);

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

    if (body.action === "seed") {
      // seed the default checklist in a single insert; no-op if lines already exist
      if (!body.job_id || !Array.isArray(body.items) || !body.items.length)
        return NextResponse.json({ error: "job_id and items required" }, { status: 400 });
      const { count } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("job_id", body.job_id);
      if (count) return NextResponse.json({ ok: true, seeded: 0 });
      const rows = body.items.slice(0, 100).map((m: any) => ({
        job_id: body.job_id,
        item: String(m.item || "").slice(0, 200),
        qty: String(m.qty ?? "as BOM"),
        status: m.status === "Received" ? "Received" : "Pending",
        custom: false,
      }));
      const { error } = await supabase.from("materials").insert(rows);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, seeded: rows.length });
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
