import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "bill-scans";
const LINK_TTL = 60 * 30;

/**
 * THE SCAN OF THE BILL — "the single source of truth" (Dr Raghu, 30 Sep 2026).
 *
 * One file per invoice, keyed on the invoice number, kept private. Nobody is
 * handed the bucket: a signed link is minted for thirty minutes when somebody
 * with Kuber asks for one, and it dies on its own. A customer invoice is not
 * a public document.
 *
 * GET  ?bill=INV/…   a signed link to look at it
 * POST multipart     upload or replace it
 */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const bill = (new URL(req.url).searchParams.get("bill") || "").trim();
    if (!bill) throw new HttpError(400, "Which invoice?");
    const admin = adminClient();
    const { data: row } = await admin.from("sales_invoice_meta").select("scan_path, scan_name").eq("bill", bill).maybeSingle();
    const path = (row as { scan_path?: string } | null)?.scan_path;
    if (!path) return NextResponse.json({ url: null });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_TTL);
    if (error) throw new Error(error.message);
    return NextResponse.json({ url: data?.signedUrl || null, name: (row as { scan_name?: string }).scan_name || "" });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const form = await req.formData();
    const bill = String(form.get("bill") || "").trim();
    const file = form.get("file");
    if (!bill) throw new HttpError(400, "Which invoice?");
    if (!(file instanceof File)) throw new HttpError(400, "No file came through.");
    if (file.size > 15 * 1024 * 1024) throw new HttpError(413, "That scan is over 15 MB.");
    const ok = /^(image\/|application\/pdf)/.test(file.type);
    if (!ok) throw new HttpError(415, "A scan is an image or a PDF.");

    const admin = adminClient();
    const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "jpg").split("+")[0];
    /* the invoice number carries slashes — they would make folders */
    const safe = bill.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${safe}-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: ue } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type });
    if (ue) {
      if (/bucket|not found/i.test(ue.message))
        throw new HttpError(503, "Run migration 0184 first — the bill-scans bucket does not exist yet.");
      throw new Error(ue.message);
    }

    /* the old one goes only once the new one is safely up */
    const { data: prev } = await admin.from("sales_invoice_meta").select("scan_path").eq("bill", bill).maybeSingle();
    const { error } = await admin.from("sales_invoice_meta").upsert(
      { bill, scan_path: path, scan_name: file.name.slice(0, 200), scan_at: new Date().toISOString(), by_email: user.email },
      { onConflict: "bill" },
    );
    if (error) throw new Error(error.message);
    const old = (prev as { scan_path?: string } | null)?.scan_path;
    if (old && old !== path) await admin.storage.from(BUCKET).remove([old]);

    return NextResponse.json({ ok: true, path, name: file.name });
  } catch (e) { return errJson(e); }
}
