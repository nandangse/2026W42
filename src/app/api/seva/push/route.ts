import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSeva } from "@/lib/seva";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Seva's 1:1 push (Dr Raghu, 30 Aug 2026: "build a 1:1 push system here").
 *
 * ONE SENDER, ONE RECIPIENT. Every route here reads the signed-in email and
 * refuses to act on anybody else's behalf: you may push as yourself, mark
 * seen and reply on what was pushed TO you, and close what stands at either
 * end of your own name. Nothing addressed to two other people is visible.
 */

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const missing = (m: string) => /does not exist|schema cache/i.test(m);

/** GET — my inbox, my sent, and the people I can push to. */
export async function GET(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const url = new URL(req.url);
    const refKind = String(url.searchParams.get("ref_kind") || "");
    const refId = String(url.searchParams.get("ref_id") || "");
    const mine = me.email.toLowerCase();

    // Everyone with an account is a possible recipient — a push crosses
    // module doors on purpose: service asks design, design asks accounts.
    let people: { email: string; name: string }[] = [];
    try {
      const { data } = await admin
        .from("profiles").select("email, display_name, initials")
        .eq("disabled", false).order("display_name");
      people = (data || [])
        .filter((p) => String(p.email || "").toLowerCase() !== mine)
        .map((p) => ({
          email: String(p.email),
          name: String(p.display_name || p.email).concat(p.initials ? ` (${p.initials})` : ""),
        }));
    } catch { /* the picker falls back to a typed address */ }

    let q = admin.from("seva_push").select("*").order("at", { ascending: false }).limit(500);
    // A push about one record shows only that record's thread.
    if (refKind && refId) q = q.eq("ref_kind", refKind).eq("ref_id", refId);
    const { data, error } = await q;
    if (error) {
      if (missing(error.message)) return NextResponse.json({ installed: false, inbox: [], sent: [], people });
      throw new Error(error.message);
    }

    // The filter that makes it 1:1 — a row is yours only at one of its ends.
    const rows = (data || []).filter(
      (r) => String(r.to_email || "").toLowerCase() === mine || String(r.from_email || "").toLowerCase() === mine,
    );
    return NextResponse.json({
      installed: true,
      inbox: rows.filter((r) => String(r.to_email || "").toLowerCase() === mine),
      sent: rows.filter((r) => String(r.from_email || "").toLowerCase() === mine),
      people,
      me: mine,
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — one of four verbs:
 *   { action: "send",  to, subject, body?, priority?, ref_kind?, ref_id? }
 *   { action: "seen",  id }    — the recipient only
 *   { action: "reply", id, reply }  — the recipient only
 *   { action: "close", id }    — either end of the row
 */
export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const body = await req.json();
    const mine = me.email.toLowerCase();
    const now = new Date().toISOString();

    if (body.action === "send") {
      const to = String(body.to || "").trim().toLowerCase();
      const subject = String(body.subject || "").trim();
      if (!isEmail(to)) throw new HttpError(400, "A push needs one real email address to go to.");
      if (to === mine) throw new HttpError(400, "A push goes to somebody else — write it down for yourself instead.");
      if (!subject) throw new HttpError(400, "A push needs its one line.");

      // The bell wants an account id; a push to somebody without one still
      // stands — they see it the day they sign in.
      let toId: string | null = null;
      try {
        const { data: p } = await admin.from("profiles").select("id").eq("email", to).maybeSingle();
        toId = p?.id ?? null;
      } catch { /* the row is the record either way */ }

      const row = {
        from_email: mine,
        to_email: to,
        to_person_id: toId,
        subject: subject.slice(0, 200),
        body: String(body.body || "").slice(0, 4000),
        ref_kind: /^(issue|amc)$/.test(String(body.ref_kind || "")) ? String(body.ref_kind) : "",
        ref_id: body.ref_id || null,
        priority: body.priority === "urgent" ? "urgent" : "normal",
      };
      const { data: made, error } = await admin.from("seva_push").insert(row).select("id").maybeSingle();
      if (error) {
        if (missing(error.message)) throw new HttpError(503, "Run migration 0107 first — Seva's tables don't exist yet.");
        throw new Error(error.message);
      }
      if (toId) {
        await notify(admin, {
          person_id: toId,
          kind: "seva_push",
          title: `${row.priority === "urgent" ? "URGENT · " : ""}Seva push: ${row.subject}`,
          body: `From ${mine}. Open Seva → Push to answer.`,
          ref_kind: "seva_push",
          ref_id: made?.id ? String(made.id) : undefined,
          created_by: mine,
        });
      }
      return NextResponse.json({ ok: true, id: made?.id ?? null, delivered_to_account: !!toId });
    }

    if (!body.id) throw new HttpError(400, "id required");
    const { data: row, error: readErr } = await admin
      .from("seva_push").select("*").eq("id", body.id).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new HttpError(404, "No such push.");
    const toMe = String(row.to_email || "").toLowerCase() === mine;
    const fromMe = String(row.from_email || "").toLowerCase() === mine;
    if (!toMe && !fromMe) throw new HttpError(403, "That push is between two other people.");

    if (body.action === "seen") {
      if (!toMe) throw new HttpError(403, "Only the person it went to can mark it seen.");
      if (row.status === "sent") {
        const { error } = await admin.from("seva_push").update({ status: "seen", seen_at: now }).eq("id", row.id);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reply") {
      if (!toMe) throw new HttpError(403, "Only the person it went to can answer it.");
      const reply = String(body.reply || "").trim();
      if (!reply) throw new HttpError(400, "An empty reply is not an answer.");
      const { error } = await admin.from("seva_push").update({
        reply: reply.slice(0, 4000),
        status: "replied",
        replied_at: now,
        seen_at: row.seen_at ?? now,
      }).eq("id", row.id);
      if (error) throw new Error(error.message);
      // The answer rings the sender's bell, so a push closes its own loop.
      try {
        const { data: p } = await admin.from("profiles").select("id").eq("email", row.from_email).maybeSingle();
        if (p?.id) {
          await notify(admin, {
            person_id: p.id,
            kind: "seva_push",
            title: `Answered: ${String(row.subject).slice(0, 150)}`,
            body: `${mine} replied. Open Seva → Push to read it.`,
            ref_kind: "seva_push",
            ref_id: String(row.id),
            created_by: mine,
          });
        }
      } catch { /* the reply stands whether or not the bell rings */ }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "close") {
      const { error } = await admin.from("seva_push")
        .update({ status: "closed", closed_at: now }).eq("id", row.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
