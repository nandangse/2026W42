import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { driveConfig, uploadToFolder } from "@/lib/drive";
import { mayEdit, requireCouncilOwner, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Council files — every room's pictures, decks and documents.
 *
 *   GET  ?path=…                  → a signed, short-lived link into the private 'lc' bucket
 *   POST multipart ref_kind, ref_id, file(s)   → bucket, then the Drive push
 *   POST JSON { action: "retry", id } · { action: "remove", id }
 *
 * THE DRIVE PUSH (Dr Raghu, 10 Oct 2026: "The files are listed and shown
 * that they are there. Once the pass-through is done, it is pushed to the
 * Google Drive folder where it is safely kept."). The bucket copy is what
 * Genie serves; the Drive copy is the keeping. The folder is the owner's
 * setting on Knowledge (lc_setting.drive_folder), falling back to
 * LC_DRIVE_FOLDER_ID in the environment; inside it one subfolder per room.
 * No folder set → the file stays in the bucket, marked "skipped", and is
 * pushed the first time a folder is set and somebody presses retry.
 *
 * WHO MAY ADD: Knowledge, Philosophy and Principles are the owner's; the
 * rest take files from the author of the thing, or the owner.
 */
const OWNER_ROOMS = new Set(["knowledge"]); // sections: the author or the owner, like the rest (10 Oct 2026)
const SUBFOLDER: Record<string, string> = { knowledge: "Knowledge", meeting: "Meetings", presentation: "Presentations", section: "Philosophy & Principles", problem: "Solution Board", ssc: "Start Stop Continue" };
const MAX = 50 * 1024 * 1024;

async function lcFolder(admin: ReturnType<typeof adminClient>): Promise<string | null> {
  const { data } = await admin.from("lc_setting").select("value").eq("key", "drive_folder").maybeSingle();
  return (data?.value || process.env.LC_DRIVE_FOLDER_ID || "").trim() || null;
}

/** Push one bucket file to Drive and record the outcome. Never throws. */
async function pushToDrive(admin: ReturnType<typeof adminClient>, file: { id: string; path: string; name: string; mime: string | null; ref_kind: string }) {
  const cfg = driveConfig();
  const folder = await lcFolder(admin);
  if (!cfg || !folder) {
    await admin.from("lc_file").update({ drive_status: "skipped", drive_error: !cfg ? "Drive is not configured on the server." : "No Drive folder set — Knowledge → Drive folder." }).eq("id", file.id);
    return;
  }
  try {
    const { data } = await admin.storage.from("lc").download(file.path);
    if (!data) throw new Error("The bucket copy could not be read.");
    const r = await uploadToFolder(cfg, folder, SUBFOLDER[file.ref_kind] || "Leaders Council", await data.arrayBuffer(), file.name, file.mime || "application/octet-stream");
    await admin.from("lc_file").update({ drive_id: r.id, drive_url: r.link, drive_status: "done", drive_error: null }).eq("id", file.id);
  } catch (e) {
    await admin.from("lc_file").update({ drive_status: "failed", drive_error: String((e as Error).message || e).slice(0, 300) }).eq("id", file.id);
  }
}

async function mayAttach(u: Awaited<ReturnType<typeof requireLeader>>, admin: ReturnType<typeof adminClient>, kind: string, id: string) {
  if (OWNER_ROOMS.has(kind)) { if (!u.isOwner) throw new HttpError(403, "Only Dr Raghu adds here."); return; }
  const table = kind === "meeting" ? "lc_meeting" : kind === "presentation" ? "lc_presentation" : kind === "problem" ? "lc_problem" : kind === "ssc" ? "lc_ssc" : kind === "section" ? "lc_section" : null;
  if (!table) throw new HttpError(400, "Which room?");
  const col = kind === "meeting" || kind === "section" ? "created_by" : "added_by";
  const { data } = await admin.from(table).select(col).eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Nothing to attach to.");
  if (!mayEdit(u, (data as Record<string, string | null>)[col])) throw new HttpError(403, "The author, or Dr Raghu.");
}

export async function GET(req: Request) {
  try {
    await requireLeader();
    const path = new URL(req.url).searchParams.get("path") || "";
    if (!path || path.includes("..")) throw new HttpError(400, "Which file?");
    const { data, error } = await adminClient().storage.from("lc").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new HttpError(404, "No such file.");
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const ref_kind = String(form.get("ref_kind") || ""); const ref_id = String(form.get("ref_id") || "");
      if (!SUBFOLDER[ref_kind] || !ref_id) throw new HttpError(400, "Which room, which record?");
      await mayAttach(u, admin, ref_kind, ref_id);
      const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) throw new HttpError(400, "No file.");
      const saved: { id: string; name: string }[] = [];
      for (const file of files) {
        if (file.size > MAX) throw new HttpError(400, `${file.name} is over 50 MB.`);
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${ref_kind}/${ref_id}/${Date.now()}-${safe}`;
        const { error } = await admin.storage.from("lc").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
        if (error) throw new HttpError(500, `Could not store ${file.name}: ${error.message}`);
        const { data, error: iErr } = await admin.from("lc_file").insert({ ref_kind, ref_id, path, name: file.name, mime: file.type || null, bytes: file.size, uploaded_by: u.email }).select("id").single();
        if (iErr) throw iErr;
        saved.push({ id: data.id, name: file.name });
        await pushToDrive(admin, { id: data.id, path, name: file.name, mime: file.type || null, ref_kind });
      }
      return NextResponse.json({ ok: true, saved });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(b.id || "");
    const { data: f } = await admin.from("lc_file").select("id,path,name,mime,ref_kind,ref_id,uploaded_by").eq("id", id).maybeSingle();
    if (!f) throw new HttpError(404, "No such file.");
    if (b.action === "retry") {
      await pushToDrive(admin, f);
      const { data: after } = await admin.from("lc_file").select("drive_status,drive_url,drive_error").eq("id", id).maybeSingle();
      return NextResponse.json({ ok: true, ...after });
    }
    if (b.action === "retry_all") {
      await requireCouncilOwner();
      const { data: todo } = await admin.from("lc_file").select("id,path,name,mime,ref_kind").in("drive_status", ["pending", "failed", "skipped"]).limit(40);
      for (const t of todo || []) await pushToDrive(admin, t);
      return NextResponse.json({ ok: true, pushed: (todo || []).length });
    }
    if (b.action === "remove") {
      if (OWNER_ROOMS.has(f.ref_kind)) { if (!u.isOwner) throw new HttpError(403, "Only Dr Raghu."); }
      else if (!mayEdit(u, f.uploaded_by)) await mayAttach(u, admin, f.ref_kind, String(f.ref_id));
      /* the bucket copy goes; the Drive copy stays — "safely kept" */
      await admin.storage.from("lc").remove([f.path]);
      await admin.from("lc_file").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
