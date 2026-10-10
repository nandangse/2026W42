import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * Presentations (Dr Raghu, 10 Oct 2026): "Who's adding it, who's presenting,
 * the link to the file, upload the file, Genie summarise, Topic. Genie will
 * also automatically put in the topic."
 *
 *   GET            → the list with files
 *   POST create { topic, presenter, file_url, notes, presented_on }  — any leader
 *        edit { id, … } · remove { id }  — the one who added it, or the owner
 *   The summary (and the topic Genie names) is written by /api/lc/genie.
 */
export async function GET() {
  try {
    await requireLeader();
    const admin = adminClient();
    const [{ data: ps, error }, { data: files }] = await Promise.all([
      admin.from("lc_presentation").select("*").order("presented_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      admin.from("lc_file").select("id,ref_id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "presentation").order("created_at"),
    ]);
    if (error) throw error;
    return NextResponse.json({ presentations: (ps || []).map((p) => ({ ...p, files: (files || []).filter((f) => f.ref_id === p.id) })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    const date = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
    const fields = () => ({ topic: txt(b.topic), presenter: txt(b.presenter), file_url: txt(b.file_url), notes: txt(b.notes), presented_on: date(b.presented_on) });
    const own = async (id: string) => {
      const { data: p } = await admin.from("lc_presentation").select("added_by").eq("id", id).maybeSingle();
      if (!p) throw new HttpError(404, "No such presentation.");
      if (!mayEdit(u, p.added_by)) throw new HttpError(403, "The one who added it, or Dr Raghu.");
    };
    if (b.action === "create") {
      const f = fields();
      if (!f.topic && !f.file_url && !f.notes) throw new HttpError(400, "A topic, a link or a note — something to go on.");
      const { data, error } = await admin.from("lc_presentation").insert({ ...f, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || ""); await own(id);
      const { error } = await admin.from("lc_presentation").update({ ...fields(), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || ""); await own(id);
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "presentation").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "presentation").eq("ref_id", id);
      const { error } = await admin.from("lc_presentation").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
