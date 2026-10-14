import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { requireUser, errJson, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { driveConfig, folderPath, uploadToFolderId } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE PROJECT'S DOCUMENTS — the PCD tab (Dr Raghu, 14 Oct 2026: "a Type drop
 * down … in alphabetical order, a button to add type, a place to upload, show
 * what was uploaded by who and when, save all this in the drive, keep this in
 * project memory").
 *
 *   GET  ?id=NGSE-PROJ-1087            the types, the project's files, may I write
 *   GET  ?file=<uuid>                   open one: its Drive page, or the bucket copy until it has one
 *   POST { action: "sign", project_id, name }                 a signed upload to the bucket
 *   POST { action: "register", project_id, title, path, name, mime, bytes, doc_type, note }
 *                                        the row, then the Drive copy (the bucket copy dropped once made)
 *   POST { action: "type_add", name }   a new type for every project
 *   POST { action: "retry", id }        push one to the Drive again
 *   POST { action: "remove", id }       off the project book; the Drive copy stays
 *
 * The bytes never pass through Vercel on the way in: browser -> bucket by a
 * signed URL, bucket -> Drive here. Writers are the project room's writers.
 */
const BUCKET = "project-docs";
const MAX = 200 * 1024 * 1024;
const mayEdit = (u: AuthedUser) => u.isOwner || u.stratcom || ["admin", "planner", "project_owner"].includes(String(u.role));
const projectId = (raw: string) => {
  const s = decodeURIComponent(String(raw || "")).trim();
  if (!s) return "";
  return /^NGSE-PROJ-/i.test(s) ? s.toUpperCase() : `NGSE-PROJ-${s.replace(/^0+/, "")}`;
};
const missing = (m: string) => /project_file|project_doc_type|does not exist|schema cache/i.test(m);
const clean = (s: string, n = 120) => s.replace(/[\u0000-\u001f/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

type Admin = ReturnType<typeof adminClient>;
type FileRow = { id: string; project_id: string; doc_type: string; name: string; mime: string | null; path: string | null; drive_folder: string | null; uploaded_at: string };

/** Bucket -> Drive for one file; records the outcome, never throws. */
async function pushToDrive(admin: Admin, f: FileRow, title: string) {
  const cfg = driveConfig();
  const root = (process.env.PROJECT_DRIVE_FOLDER_ID || "").trim() || cfg?.folderId || "";
  if (!cfg || !root) { await admin.from("project_file").update({ drive_status: "skipped", drive_error: "Drive is not configured on the server." }).eq("id", f.id); return; }
  if (!f.path) return;
  try {
    const { data } = await admin.storage.from(BUCKET).download(f.path);
    if (!data) throw new Error("The uploaded copy could not be read.");
    /* the project's folder once found is reused, so a renamed project keeps one folder */
    const { data: prior } = await admin.from("project_file").select("drive_folder").eq("project_id", f.project_id).not("drive_folder", "is", null).limit(1).maybeSingle();
    const projectFolder = prior?.drive_folder || await folderPath(cfg, root, ["Projects", clean(`${f.project_id}${title ? ` · ${title}` : ""}`)]);
    const typeFolder = await folderPath(cfg, projectFolder, ["PCD", clean(f.doc_type)]);
    const ist = new Date(Date.parse(f.uploaded_at) + 330 * 60000).toISOString().slice(0, 10);
    const r = await uploadToFolderId(cfg, typeFolder, await data.arrayBuffer(), `${ist} · ${clean(f.doc_type, 60)} · ${f.name}`, f.mime || "application/octet-stream");
    await admin.from("project_file").update({ drive_id: r.id, drive_url: r.link, drive_folder: projectFolder, drive_status: "done", drive_error: null, path: null }).eq("id", f.id);
    await admin.storage.from(BUCKET).remove([f.path]);
  } catch (e) {
    await admin.from("project_file").update({ drive_status: "failed", drive_error: String((e as Error).message || e).slice(0, 300) }).eq("id", f.id);
  }
}

export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const q = new URL(req.url).searchParams;
    const admin = adminClient();
    const fileId = q.get("file");
    if (fileId) {
      const { data: f } = await admin.from("project_file").select("drive_url, path").eq("id", fileId).maybeSingle();
      if (!f) throw new HttpError(404, "No such document.");
      if (f.drive_url) return NextResponse.redirect(f.drive_url);
      if (!f.path) throw new HttpError(404, "The document has no copy to open.");
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(f.path, 600);
      if (!data?.signedUrl) throw new HttpError(404, "The document could not be opened.");
      return NextResponse.redirect(data.signedUrl);
    }
    const id = projectId(q.get("id") || "");
    if (!id) throw new HttpError(400, "Which project?");
    const [{ data: types, error: te }, { data: files, error: fe }] = await Promise.all([
      admin.from("project_doc_type").select("name").order("name"),
      admin.from("project_file").select("id, section, doc_type, name, mime, bytes, note, drive_url, drive_status, drive_error, uploaded_by, uploaded_name, uploaded_at").eq("project_id", id).order("uploaded_at", { ascending: false }),
    ]);
    const err = te?.message || fe?.message;
    if (err && missing(err)) return NextResponse.json({ installed: false, types: [], files: [], mayEdit: mayEdit(u) });
    if (err) throw new Error(err);
    const names = (types ?? []).map((t) => String(t.name)).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    return NextResponse.json({ installed: true, types: names, files: files ?? [], mayEdit: mayEdit(u) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (!mayEdit(u)) throw new HttpError(403, "The project's documents are filed by planning and the project owners.");
    const b = await readBody(req, {}).catch((): AnyBody => ({}));
    const admin = adminClient();

    if (b.action === "type_add") {
      const name = clean(String(b.name || ""), 80);
      if (name.length < 2) throw new HttpError(400, "Name the type.");
      const { data: all } = await admin.from("project_doc_type").select("name");
      const same = (all ?? []).find((t) => String(t.name).toLowerCase() === name.toLowerCase());
      if (same) return NextResponse.json({ ok: true, name: same.name, existed: true });
      const { error } = await admin.from("project_doc_type").insert({ name, added_by: u.email });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, name });
    }

    if (b.action === "sign") {
      const id = projectId(String(b.project_id || "")); if (!id) throw new HttpError(400, "Which project?");
      if (Number(b.bytes || 0) > MAX) throw new HttpError(400, "That file is over 200 MB.");
      const safe = String(b.name || "file").replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(missing(error.message) || /bucket/i.test(error.message) ? "Run migration 0233 first — the documents have nowhere to go yet." : error.message);
      return NextResponse.json({ ok: true, bucket: BUCKET, path, token: data.token });
    }

    if (b.action === "register") {
      const id = projectId(String(b.project_id || "")); if (!id) throw new HttpError(400, "Which project?");
      const path = String(b.path || ""); if (!path.startsWith(`${id}/`)) throw new HttpError(400, "That upload is not this project's.");
      const doc_type = clean(String(b.doc_type || ""), 80); if (!doc_type) throw new HttpError(400, "Choose the type of document.");
      const { data: t } = await admin.from("project_doc_type").select("name").eq("name", doc_type).maybeSingle();
      if (!t) throw new HttpError(400, `Not a document type: ${doc_type}`);
      const { data: row, error } = await admin.from("project_file").insert({
        project_id: id, section: "pcd", doc_type, name: clean(String(b.name || "file"), 200), mime: String(b.mime || "") || null,
        bytes: Number(b.bytes || 0) || null, path, note: String(b.note || "").trim().slice(0, 500) || null,
        uploaded_by: u.email, uploaded_name: u.displayName || u.initials || u.email,
      }).select("id, project_id, doc_type, name, mime, path, drive_folder, uploaded_at").single();
      if (error) throw new Error(missing(error.message) ? "Run migration 0233 first." : error.message);
      await pushToDrive(admin, row as FileRow, clean(String(b.title || ""), 90));
      const { data: after } = await admin.from("project_file").select("drive_status, drive_url, drive_error").eq("id", row.id).maybeSingle();
      return NextResponse.json({ ok: true, id: row.id, ...after });
    }

    const fid = String(b.id || "");
    const { data: f } = await admin.from("project_file").select("id, project_id, doc_type, name, mime, path, drive_folder, uploaded_at, uploaded_by").eq("id", fid).maybeSingle();
    if (!f) throw new HttpError(404, "No such document.");
    if (b.action === "retry") {
      await pushToDrive(admin, f as FileRow, clean(String(b.title || ""), 90));
      const { data: after } = await admin.from("project_file").select("drive_status, drive_url, drive_error").eq("id", fid).maybeSingle();
      return NextResponse.json({ ok: true, ...after });
    }
    if (b.action === "remove") {
      /* off the project book; the Drive copy stays where it was filed */
      if (f.path) await admin.storage.from(BUCKET).remove([f.path]);
      await admin.from("project_file").delete().eq("id", fid);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
