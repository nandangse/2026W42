import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { compilePlaybook } from "@/lib/playbook-compile";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/playbooks — midnight IST, from vercel.json (Dr Raghu,
 * 28 Aug 2026: "a cron job done at 12 midnight India time"). Each book
 * holding NEW intelligence is recompiled; books with nothing new are left
 * untouched, so a quiet night makes no model call at all.
 *
 * Vercel signs its cron calls with CRON_SECRET; a signed-in hand may also
 * fire it by hand.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The midnight cron, or a signed-in hand.");
    }
    const admin = adminClient();
    const { data: books, error } = await admin.from("playbook").select("kind");
    if (error) return NextResponse.json({ ok: false, note: "Playbooks not installed yet (migration 0086)." });
    const out: Record<string, unknown> = {};
    for (const b of books || []) {
      try {
        out[String(b.kind)] = await compilePlaybook(admin, String(b.kind), "midnight cron");
      } catch (e) {
        out[String(b.kind)] = { compiled: false, reason: e instanceof Error ? e.message : String(e) };
      }
    }
    return NextResponse.json({ ok: true, books: out });
  } catch (e) {
    return errJson(e);
  }
}
