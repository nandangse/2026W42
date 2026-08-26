import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The person's own profile card.
 *
 *   GET  — whatsapp_no + whether the admin has marked Gmail OAuth available
 *   POST — { whatsapp_no } — the one field a person keeps current themselves.
 *          Name, initials, role and ERP owner remain admin-set.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const { data, error } = await adminClient()
      .from("profiles")
      .select("whatsapp_no, oauth_available, oauth_connected_at")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      if (/whatsapp_no|oauth_available|column|schema cache/i.test(error.message))
        return NextResponse.json({ whatsapp_no: null, oauth_available: false, needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({
      whatsapp_no: data?.whatsapp_no ?? null,
      oauth_available: !!data?.oauth_available,
      oauth_connected_at: data?.oauth_connected_at ?? null,
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const raw = String(body.whatsapp_no ?? "").trim();
    // E.164, or empty to clear. A number typed four ways is four numbers.
    const digits = raw.replace(/[^\d+]/g, "");
    let e164: string | null = null;
    if (digits) {
      let d = digits.startsWith("+") ? digits.slice(1) : digits;
      d = d.replace(/^0+/, "");
      if (d.length === 10) e164 = "+91" + d;
      else if (d.length >= 11 && d.length <= 15) e164 = "+" + d;
      else throw new HttpError(400, `${raw} does not look like a phone number.`);
    }
    const { error } = await adminClient()
      .from("profiles").update({ whatsapp_no: e164 }).eq("id", user.id);
    if (error) {
      if (/whatsapp_no|column|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0073 first — the profile has nowhere to save yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, whatsapp_no: e164 });
  } catch (e) {
    return errJson(e);
  }
}
