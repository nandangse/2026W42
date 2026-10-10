import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { requireCouncilOwner, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * Philosophy and Principles — the pages at the front of the council.
 *
 *   GET  ?kind=philosophy|principles          → the sections, in order, with files
 *   POST { action: create|edit|remove|move }  — the owner alone
 *
 * Philosophy (Dr Raghu, 10 Oct 2026): "values, OPSP, quarterly reports. Then
 * we can add whatever else we want." Principles: "the definitive one, which
 * will define what we do and what we don't do … this is how decision-making
 * is to be done."
 */
export async function GET(req: Request) {
  try {
    await requireLeader();
    const kind = new URL(req.url).searchParams.get("kind") === "principles" ? "principles" : "philosophy";
    const admin = adminClient();
    const [{ data: sections, error }, { data: files }] = await Promise.all([
      admin.from("lc_section").select("*").eq("kind", kind).order("sort").order("created_at"),
      admin.from("lc_file").select("id,ref_id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "section").order("created_at"),
    ]);
    if (error) throw error;
    return NextResponse.json({ sections: (sections || []).map((s) => ({ ...s, files: (files || []).filter((f) => f.ref_id === s.id) })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireCouncilOwner();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const kind = b.kind === "principles" ? "principles" : "philosophy";
    if (b.action === "create") {
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "A title.");
      const { data: last } = await admin.from("lc_section").select("sort").eq("kind", kind).order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("lc_section").insert({ kind, title, body: String(b.body || "") || null, sort: Number(last?.sort || 0) + 1, created_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || "");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.title !== undefined) { const t = String(b.title).trim(); if (!t) throw new HttpError(400, "A title."); patch.title = t; }
      if (b.body !== undefined) patch.body = String(b.body) || null;
      const { error } = await admin.from("lc_section").update(patch).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "move") {
      const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
      await Promise.all(ids.map((id, i) => admin.from("lc_section").update({ sort: i + 1 }).eq("id", id)));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || "");
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "section").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "section").eq("ref_id", id);
      const { error } = await admin.from("lc_section").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
