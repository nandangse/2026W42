import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveAccountsAccess } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kuber's Tally XML uploads (Dr Raghu, 28 Aug 2026).
 *
 * Two exports walk in from Tally — Masters and Transactions. Each lands in
 * the kuber-uploads bucket and a kuber_upload row carrying the date, the
 * uploader and their initials; the Drive sync then files it on Google Drive
 * under "date - initials", which is the audit trail he asked for.
 *
 * The door is the Kuber grant itself — whoever may open /kuber may upload.
 */
const BUCKET = "kuber-uploads";
const LINK_TTL = 60 * 60 * 4;
const MAX_BYTES = 50 * 1024 * 1024; // Tally transaction exports run big

async function requireKuber() {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  if (!(await resolveAccountsAccess(adminClient(), u.email, u.isOwner)))
    throw new HttpError(403, "Kuber is granted per person — the tick on Admin → module access.");
  return u;
}

/** GET — the ledger, newest first. */
export async function GET() {
  try {
    await requireKuber();
    const admin = adminClient();
    const { data, error } = await admin
      .from("kuber_upload")
      .select("id, kind, for_date, name, bytes, by, initials, at, drive_synced_at, path")
      .order("at", { ascending: false })
      .limit(200);
    if (error) {
      if (/kuber_upload|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, uploads: [] });
      throw new Error(error.message);
    }
    const uploads = await Promise.all(
      (data || []).map(async (u) => {
        const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(u.path, LINK_TTL);
        const { path: _drop, ...rest } = u;
        return { ...rest, url: s?.signedUrl ?? null };
      }),
    );
    return NextResponse.json({ installed: true, uploads });
  } catch (e) {
    return errJson(e);
  }
}

/** POST (multipart) — file, kind (masters|transactions), for_date. */
export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const admin = adminClient();
    const form = await req.formData();

    const kind = String(form.get("kind") || "");
    if (!["masters", "transactions"].includes(kind)) throw new HttpError(400, "kind must be masters or transactions");
    const forDate = String(form.get("for_date") || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) throw new HttpError(400, "Pick the date the export is of.");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "No file was chosen.");
    if (!/\.xml$/i.test(file.name || "") && !/xml/i.test(file.type || ""))
      throw new HttpError(400, "Tally exports are XML — that file is not one.");
    if (file.size > MAX_BYTES)
      throw new HttpError(413, "That export is over 50 MB — export a narrower period from Tally.");

    const initials = (user.initials || user.email.split("@")[0].slice(0, 3)).toUpperCase();
    const clean = (file.name || "tally.xml").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
    const path = `${forDate}/${initials}/${kind}-${Date.now()}-${clean}`;
    const { error: ue } = await admin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: "application/xml" });
    if (ue) {
      if (/bucket|not found/i.test(ue.message))
        throw new HttpError(503, "Run migration 0075 first — the kuber-uploads bucket does not exist yet.");
      throw new Error(ue.message);
    }

    const { error } = await admin.from("kuber_upload").insert({
      kind, for_date: forDate, name: clean, path,
      bytes: file.size, by: user.email, initials,
    });
    if (error) {
      // The row failed, so the object is an orphan nothing will ever list.
      await admin.storage.from(BUCKET).remove([path]);
      if (/kuber_upload|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0075 first — uploads have nowhere to be recorded yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
