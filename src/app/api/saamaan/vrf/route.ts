import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { SUPPLIER_HANDS } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** VENDOR REGISTRATIONS, FOR THE PURCHASE TEAM (8 Oct 2026): the list, a file, a status. */
async function guard() {
  const me = await requireSaamaan();
  if (!me.isOwner && !SUPPLIER_HANDS.has(me.email.toLowerCase())) throw new HttpError(403, "Vendor registrations are the purchase team's.");
  return me;
}
export async function GET(req: Request) {
  try {
    await guard();
    const admin = adminClient();
    const file = new URL(req.url).searchParams.get("file");
    if (file) {
      if (!/^vrf\/[0-9a-f-]{36}\/[^/]+$/.test(file)) throw new HttpError(400, "Not a registration file.");
      const { data, error } = await admin.storage.from("portal").createSignedUrl(file, 600);
      if (error || !data?.signedUrl) throw new HttpError(404, "No such file.");
      return NextResponse.redirect(data.signedUrl);
    }
    const { data, error } = await admin.from("portal_vrf").select("*").order("at", { ascending: false }).limit(1000);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, installed: false, rows: [] }); throw new Error(error.message); }
    return NextResponse.json({ ok: true, installed: true, rows: data ?? [] });
  } catch (e) { return errJson(e); }
}
export async function POST(req: Request) {
  try {
    const me = await guard();
    const b = await req.json().catch(() => ({})) as { id?: string; status?: string; review_note?: string };
    if (!b.id) throw new HttpError(400, "Which registration?");
    const status = String(b.status || "");
    if (!["new", "reviewed", "approved", "rejected"].includes(status)) throw new HttpError(400, "Status: new, reviewed, approved or rejected.");
    const { error } = await adminClient().from("portal_vrf").update({ status, review_note: String(b.review_note || "").slice(0, 1000), reviewed_by: me.email, reviewed_at: new Date().toISOString() }).eq("id", b.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
