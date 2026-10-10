import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { requireCouncilOwner, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * Knowledge (Dr Raghu, 10 Oct 2026): "a submodule called Knowledge, which
 * only I can add … I'll also put in a lot of Google Drive folders … The
 * files are listed and shown that they are there. Once the pass-through is
 * done, it is pushed to the Google Drive folder where it is safely kept."
 *
 *   GET                                  → every entry with its files; everyone in the council reads
 *   POST { action: create|edit|remove }  — the owner alone
 *   Files arrive through /api/lc/file (ref_kind "knowledge"); the Drive push
 *   happens there.
 */
export async function GET() {
  try {
    await requireLeader();
    const admin = adminClient();
    const [{ data: items, error }, { data: files }] = await Promise.all([
      admin.from("lc_knowledge").select("*").order("created_at", { ascending: false }),
      admin.from("lc_file").select("id,ref_id,name,mime,bytes,path,drive_url,drive_status,drive_error,uploaded_by,created_at").eq("ref_kind", "knowledge").order("created_at"),
    ]);
    if (error) throw error;
    return NextResponse.json({ items: (items || []).map((k) => ({ ...k, files: (files || []).filter((f) => f.ref_id === k.id) })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireCouncilOwner();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    if (b.action === "create") {
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "A title.");
      const { data, error } = await admin.from("lc_knowledge").insert({ title, note: txt(b.note), url: txt(b.url), created_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || "");
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "A title.");
      const { error } = await admin.from("lc_knowledge").update({ title, note: txt(b.note), url: txt(b.url), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || "");
      /* the bucket copy goes; the Drive copy stays — "safely kept" */
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "knowledge").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "knowledge").eq("ref_id", id);
      const { error } = await admin.from("lc_knowledge").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
