import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError, requireOwner } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { runBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * BACKUPS — Raghu only, as asked ("ONLY raghu").
 *
 * requireOwner is the single account above the admin tier. Backups carry
 * every row of every table out of the building; that is not an admin
 * permission, it is his.
 *
 * A DRIVE LINK IS PASTED, NOT A FOLDER ID. Nobody has a folder id to hand —
 * they have the address bar. The id is taken out of whatever is pasted.
 */
const S = (v: unknown) => String(v ?? "").trim();

/** .../folders/<id>, ?id=<id>, or the bare id. */
function folderId(raw: string): string | null {
  const s = S(raw);
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export async function GET() {
  try {
    await requireOwner();
    const db = adminClient();
    const { data: st } = await db.from("app_settings").select("backup_code_folder, backup_db_folder").eq("id", true).maybeSingle();
    const { data: runs, error } = await db.from("genie_backup").select("*").order("at", { ascending: false }).limit(20);
    if (error && /genie_backup/i.test(error.message)) return NextResponse.json({ ok: true, installed: false });
    return NextResponse.json({
      ok: true, installed: true,
      codeFolder: S(st?.backup_code_folder) || null,
      dbFolder: S(st?.backup_db_folder) || null,
      driveReady: !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY),
      githubReady: !!process.env.GITHUB_TOKEN,
      runs: runs ?? [],
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireOwner();
    const db = adminClient();
    const b = await readBody(req, { action: "string" });

    if (b.action === "folder") {
      const kind = S(b.kind) === "code" ? "code" : "db";
      const id = folderId(S(b.url));
      if (S(b.url) && !id) throw new HttpError(400, "That does not look like a Drive folder link. Open the folder in Drive and copy the address.");
      const col = kind === "code" ? "backup_code_folder" : "backup_db_folder";
      const { error } = await db.from("app_settings").update({ [col]: id }).eq("id", true);
      if (error) throw new HttpError(/backup_.*_folder/i.test(error.message) ? 503 : 500,
        /backup_.*_folder/i.test(error.message) ? "Run Genie migration 0169 first." : error.message);
      return NextResponse.json({ ok: true, kind, id });
    }

    if (b.action === "run") {
      const kind = S(b.kind) === "code" ? "code" : "db";
      const out = await runBackup(kind, u.email.toLowerCase());
      return NextResponse.json({ ok: !!out.ok, run: out });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
