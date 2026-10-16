import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { importMusters, saEmail, HR_SHEET_ID } from "@/lib/muster-import";
import { resolveCaller } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET — what has been pulled, and which account the sheet must be shared with. */
export async function GET() {
  try {
    await requireHrms();
    const { data } = await adminClient().from("hrms_muster_import").select("year, month, tab, people, days, imported_at, imported_by").order("year", { ascending: false }).order("month", { ascending: false });
    return NextResponse.json({ sa_email: saEmail(), sheet_id: HR_SHEET_ID, imports: data || [] });
  } catch (e) { return errJson(e); }
}

/** POST — pull every Muster tab not yet in Genie (owner / admin). { force?: boolean } */
export async function POST(req: Request) {
  try {
    // the owner's browser, or the owner's Genie key (so Genie can be told to pull from a chat)
    let email = "", may = false;
    try { const u = await requireHrms(); email = u.email; may = u.isOwner || u.role === "admin"; }
    catch (e) { const c = await resolveCaller(adminClient(), req); if (!c) throw e; email = c.email; may = c.isOwner || c.role === "admin"; }
    if (!may) throw new HttpError(403, "Pulling the musters is for Dr Raghu or an admin.");
    const b = await req.json().catch(() => ({})) as { force?: boolean };
    const r = await importMusters(adminClient(), email, { force: !!b.force });
    return NextResponse.json(r, { status: r.error ? 409 : 200 });
  } catch (e) { return errJson(e); }
}
