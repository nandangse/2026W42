import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { putFile, fileUrl, isDriveRef } from "@/lib/genie-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "bill-scans";
const LINK_TTL = 60 * 30;
const KIND = (v: unknown) => (String(v || "sales") === "purchase" ? "purchase" : "sales");

/**
 * THE SCAN OF THE BILL — "the single source of truth" (Dr Raghu, 30 Sep 2026).
 *
 * DRIVE FIRST. "The saving of all my files will be in the drive. make the
 * relevant folders for it." Sales bills and purchase bills get a folder each
 * inside the same shared-drive root the job photos use, and what is stored is
 * "drive:<id>" in the very column a bucket path used — so nothing uploaded
 * before today has to move, and there is no day on which half the scans are
 * in one place and half in another with nothing to tell them apart.
 *
 * The bucket stays as the fallback. An accounts clerk attaching a bill at the
 * moment of entry must never be refused because a Drive setting is missing.
 *
 * NOBODY IS HANDED THE FOLDER. A Drive scan is served through Genie's own
 * /api/file/<id>; a bucket scan through a link that dies in half an hour.
 * A customer's invoice is not a public document.
 *
 * GET  ?bill=…&kind=…    where to look at it
 * POST multipart         upload or replace it
 */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const u = new URL(req.url);
    const bill = (u.searchParams.get("bill") || "").trim();
    const kind = KIND(u.searchParams.get("kind"));
    if (!bill) throw new HttpError(400, "Which bill?");
    const admin = adminClient();
    const { data: row } = await admin.from("sales_invoice_meta")
      .select("scan_path, scan_name").eq("kind", kind).eq("bill", bill).maybeSingle();
    const path = (row as { scan_path?: string } | null)?.scan_path;
    if (!path) return NextResponse.json({ url: null });
    const url = await fileUrl(path, async (p) => {
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(p, LINK_TTL);
      return data?.signedUrl || null;
    });
    return NextResponse.json({ url, name: (row as { scan_name?: string }).scan_name || "", drive: isDriveRef(path) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const form = await req.formData();
    const bill = String(form.get("bill") || "").trim();
    const kind = KIND(form.get("kind"));
    const file = form.get("file");
    if (!bill) throw new HttpError(400, "Which bill?");
    if (!(file instanceof File)) throw new HttpError(400, "No file came through.");
    if (file.size > 15 * 1024 * 1024) throw new HttpError(413, "That scan is over 15 MB.");
    if (!/^(image\/|application\/pdf)/.test(file.type)) throw new HttpError(415, "A scan is an image or a PDF.");

    const admin = adminClient();
    const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "jpg").split("+")[0];
    /* a bill number carries slashes — in a path they would become folders */
    const safe = bill.replace(/[^A-Za-z0-9._-]+/g, "_");
    const name = `${safe}-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    let path: string;
    const up = await putFile(kind === "purchase" ? "purchase_bill" : "sales_bill", name, buf, file.type);
    if (up.ok) path = up.ref;
    else {
      const { error: ue } = await admin.storage.from(BUCKET).upload(name, buf, { contentType: file.type });
      if (ue) {
        if (/bucket|not found/i.test(ue.message))
          throw new HttpError(503, `Drive refused it (${up.why}) and the bill-scans bucket does not exist — run migration 0184.`);
        throw new Error(ue.message);
      }
      path = name;
    }

    /* the old one goes only once the new one is safely up */
    const { data: prev } = await admin.from("sales_invoice_meta")
      .select("scan_path").eq("kind", kind).eq("bill", bill).maybeSingle();
    const { error } = await admin.from("sales_invoice_meta").upsert(
      { kind, bill, scan_path: path, scan_name: file.name.slice(0, 200), scan_at: new Date().toISOString(), by_email: user.email },
      { onConflict: "kind,bill" },
    );
    if (error) {
      if (/does not exist|schema cache|kind/i.test(error.message))
        throw new HttpError(503, "Run migrations 0184 and 0185 first — the register has nowhere to keep this yet.");
      throw new Error(error.message);
    }
    const old = (prev as { scan_path?: string } | null)?.scan_path;
    if (old && old !== path && !isDriveRef(old)) await admin.storage.from(BUCKET).remove([old]);

    return NextResponse.json({ ok: true, path, name: file.name, drive: up.ok });
  } catch (e) { return errJson(e); }
}
