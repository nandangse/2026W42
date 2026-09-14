import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET — every sending channel with today's counts and whether its Gmail is connected. */
export async function GET() {
  try {
    await requireMarketing();
    const db = crmDb();
    /**
     * A PENDING MIGRATION MUST NOT MAKE GENIE LIE ABOUT YOUR DATA.
     *
     * Dr Raghu, 14 Sep 2026: "the channel disappeared!" — and it had not.
     * Both channels sat in the database untouched, one of them with 196
     * sends against it that same afternoon. This route had asked for a
     * `reply_to` column that migration 0067 has not yet created, and the old
     * guard treated ANY mk_channel error as "the table is not installed" —
     * so a missing COLUMN was reported as an empty table and the screen said
     * "No channel yet." That is the worst kind of wrong: confident, tidy,
     * and about somebody else's data.
     *
     * The newest column is therefore asked for separately, and its absence
     * is a fact the page is told rather than an error that erases the rows.
     * The table genuinely being missing is a different question, asked on
     * its own terms.
     */
    const BASE = "id, email, label, kind, daily_limit, hourly_limit, active, sent_on, sent_today, sent_this_hour, hour_mark, api_key";
    type Row = { id: string; email: string; label: string | null; kind: string; api_key: string | null; reply_to?: string | null };
    const read = async (cols: string) => {
      const r = await db.from("mk_channel").select(cols).order("email");
      return { rows: (r.data as unknown as Row[] | null) || [], error: r.error };
    };
    let replyToReady = true;
    let { rows, error } = await read(BASE + ", reply_to");
    if (error && /reply_to/i.test(error.message)) {
      replyToReady = false;
      ({ rows, error } = await read(BASE));
    }
    if (error) {
      /* Only a missing TABLE means "not installed yet". */
      if (/relation|does not exist|could not find the table/i.test(error.message))
        return NextResponse.json({ installed: false, channels: [] });
      throw new Error(error.message);
    }
    const { data: boxes } = await db.from("mailbox").select("email_address, status");
    const B = new Map((boxes || []).map((m) => [String(m.email_address).toLowerCase(), String(m.status)]));
    return NextResponse.json({
      installed: true,
      replyToReady,
      replyToNote: replyToReady ? undefined : "Replies still go to the sending address — run CRM migration 0067 to set a Reply-To per channel.",
      channels: rows.map((c) => ({ ...c, api_key: c.api_key ? "•••" + String(c.api_key).slice(-4) : null, gmail: B.get(String(c.email).toLowerCase()) ?? null, resendKeyOnDeploy: !!process.env.RESEND_API_KEY })),
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST — { action: "save", id?, email, label, kind, reply_to?, api_key?, daily_limit, hourly_limit, active } · { action: "delete", id } — managers and sales only. */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    if (u.scope !== "all") throw new HttpError(403, "Channels are set by sales and managers.");
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const db = crmDb();
    if (b.action === "save") {
      const row: Record<string, unknown> = {
        email: String(b.email || "").trim().toLowerCase(), label: b.label || null, kind: b.kind === "resend" ? "resend" : b.kind === "mailercloud" ? "mailercloud" : "gmail",
        daily_limit: Math.max(1, Number(b.daily_limit) || 200), hourly_limit: Math.max(1, Number(b.hourly_limit) || 50), active: b.active !== false,
        /* Blank means "answer to sales@" (the column's default), never
           "answer to the sending address" — the sending domain is not
           always a mailbox anybody reads. */
      };
      /* Same rule on the way in: if 0067 has not run, saving a channel must
         still work — it simply cannot carry a Reply-To yet. */
      { const probe = await db.from("mk_channel").select("reply_to").limit(1);
        if (!probe.error) row.reply_to = String(b.reply_to || "").trim().toLowerCase() || "sales@nandan.co.in"; }
      if (typeof b.api_key === "string" && b.api_key && !b.api_key.startsWith("•••")) row.api_key = b.api_key;
      if (!row.email) throw new HttpError(400, "an e-mail address is required");
      if (b.id) { const { error } = await db.from("mk_channel").update(row).eq("id", b.id); if (error) throw new Error(error.message); return NextResponse.json({ ok: true, id: b.id }); }
      const { data, error } = await db.from("mk_channel").insert({ ...row, created_by_email: u.email.toLowerCase() }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "delete") { if (!b.id) throw new HttpError(400, "id"); await db.from("mk_channel").delete().eq("id", b.id); return NextResponse.json({ ok: true }); }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
