import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Presentations (Dr Raghu, 4 Oct 2026): the deck a member gave the TG —
 * a video link, the PPT/PDF, the presenter's notes, the room's comments, and
 * who has watched it.
 * GET            → list with files, comment counts, view counts, whether I have seen it
 * GET ?id=…      → one, with files, comments, views; records my view
 * POST JSON  create { title, presenter_id, meeting_id, presented_on, video_url, notes }  — any member
 *            edit   { id, …same }                — presenter, creator or facilitator
 *            comment { id, body } · uncomment { comment_id }
 *            remove { id } · remove_file { file_id }
 * POST multipart id + file(s)  — PPT, PPTX, PDF, Keynote up to 50 MB each
 */
export async function GET(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data: p, error } = await admin.from("kindle_presentation").select("*").eq("id", id).maybeSingle();
      if (error) throw error; if (!p) throw new HttpError(404, "No such presentation.");
      const [{ data: files }, { data: comments }, { data: views }] = await Promise.all([
        admin.from("kindle_presentation_file").select("id,path,name,mime,bytes,uploaded_by,created_at").eq("presentation_id", id).order("created_at"),
        admin.from("kindle_presentation_comment").select("id,member_id,body,created_at").eq("presentation_id", id).order("created_at"),
        admin.from("kindle_presentation_view").select("member_id,first_at,last_at,opens").eq("presentation_id", id),
      ]);
      const mine = (views || []).find((v) => v.member_id === k.id);
      if (mine) await admin.from("kindle_presentation_view").update({ last_at: new Date().toISOString(), opens: Number(mine.opens) + 1 }).eq("presentation_id", id).eq("member_id", k.id);
      else await admin.from("kindle_presentation_view").insert({ presentation_id: id, member_id: k.id });
      return NextResponse.json({ presentation: p, files: files || [], comments: comments || [], views: views || [] });
    }
    const [{ data: ps, error }, { data: files }, { data: comments }, { data: views }] = await Promise.all([
      admin.from("kindle_presentation").select("id,title,presenter_id,meeting_id,presented_on,video_url,created_by,created_at").order("presented_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      admin.from("kindle_presentation_file").select("presentation_id,name,mime"),
      admin.from("kindle_presentation_comment").select("presentation_id"),
      admin.from("kindle_presentation_view").select("presentation_id,member_id"),
    ]);
    if (error) throw error;
    return NextResponse.json({ presentations: (ps || []).map((p) => ({ ...p, files: (files || []).filter((f) => f.presentation_id === p.id).map((f) => ({ name: f.name, mime: f.mime })), comments: (comments || []).filter((c) => c.presentation_id === p.id).length, watched: (views || []).filter((v) => v.presentation_id === p.id).length, seen: (views || []).some((v) => v.presentation_id === p.id && v.member_id === k.id) })) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const ct = req.headers.get("content-type") || "";
    const mayEdit = async (id: string) => { const { data: p } = await admin.from("kindle_presentation").select("presenter_id,created_by").eq("id", id).maybeSingle(); if (!p) throw new HttpError(404, "No such presentation."); if (p.presenter_id !== k.id && p.created_by !== k.id && !isKindleAdmin(k)) throw new HttpError(403, "The presenter, the one who added it, or the facilitator."); };
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const id = String(form.get("id") || ""); await mayEdit(id);
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      if (!files.length) throw new HttpError(400, "No file.");
      let n = 0;
      for (const file of files) {
        const ok = /\.(pdf|pptx?|key|docx?|xlsx?)$/i.test(file.name) || /pdf|presentation|powerpoint|keynote|msword|officedocument/i.test(file.type);
        if (!ok) continue; if (file.size > 50 * 1024 * 1024) continue;
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `presentations/${id}/${Date.now()}-${safe}`;
        const { error } = await admin.storage.from("kindle").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
        if (error) throw new HttpError(500, `Could not store ${file.name}: ${error.message}`);
        await admin.from("kindle_presentation_file").insert({ presentation_id: id, path, name: file.name, mime: file.type || null, bytes: file.size, uploaded_by: k.id });
        n++;
      }
      await kindleAudit(k, "presentation_files", { id, n });
      return NextResponse.json({ ok: true, saved: n });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    const fields = () => ({ title: String(b.title || "").trim(), presenter_id: txt(b.presenter_id), meeting_id: txt(b.meeting_id), presented_on: txt(b.presented_on), video_url: txt(b.video_url), notes: txt(b.notes) });
    if (action === "create") {
      const f = fields(); if (!f.title) throw new HttpError(400, "A title.");
      const { data, error } = await admin.from("kindle_presentation").insert({ ...f, created_by: k.id }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "presentation_created", { id: data.id });
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "edit") {
      const id = String(b.id || ""); await mayEdit(id);
      const f = fields(); if (!f.title) throw new HttpError(400, "A title.");
      const { error } = await admin.from("kindle_presentation").update({ ...f, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "comment") {
      const id = String(b.id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data, error } = await admin.from("kindle_presentation_comment").insert({ presentation_id: id, member_id: k.id, body }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "uncomment") {
      const { data: c } = await admin.from("kindle_presentation_comment").select("member_id").eq("id", String(b.comment_id)).maybeSingle();
      if (!c || (c.member_id !== k.id && !isKindleAdmin(k))) throw new HttpError(403, "Your own comment.");
      await admin.from("kindle_presentation_comment").delete().eq("id", String(b.comment_id));
      return NextResponse.json({ ok: true });
    }
    if (action === "remove_file") {
      const { data: f } = await admin.from("kindle_presentation_file").select("presentation_id,path").eq("id", String(b.file_id)).maybeSingle();
      if (!f) throw new HttpError(404, "No such file."); await mayEdit(String(f.presentation_id));
      await admin.storage.from("kindle").remove([String(f.path)]);
      await admin.from("kindle_presentation_file").delete().eq("id", String(b.file_id));
      return NextResponse.json({ ok: true });
    }
    if (action === "remove") {
      const id = String(b.id || ""); await mayEdit(id);
      const { data: fs } = await admin.from("kindle_presentation_file").select("path").eq("presentation_id", id);
      if (fs?.length) await admin.storage.from("kindle").remove(fs.map((f) => String(f.path)));
      await admin.from("kindle_presentation").delete().eq("id", id);
      await kindleAudit(k, "presentation_removed", { id });
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
