import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";
import { drain } from "@/lib/marketing-send";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SPAM = ["free", "guarantee", "act now", "limited time", "click here", "buy now", "100%", "no obligation", "risk-free", "winner", "urgent", "cash", "$$$", "!!!", "dear friend", "make money", "cheap"];

/** The message check, without Claude: what a filter looks at first. */
export function deliverability(subject: string, html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  const s = subject.trim();
  if (!s) issues.push("No subject.");
  if (s.length > 70) issues.push(`Subject is ${s.length} characters — keep it under 60.`);
  if (s === s.toUpperCase() && s.length > 8) issues.push("Subject is all capitals.");
  if (/!{2,}/.test(s + text)) issues.push("Repeated exclamation marks.");
  const hits = SPAM.filter((w) => (s + " " + text).toLowerCase().includes(w));
  if (hits.length) issues.push(`Spam-trigger words: ${hits.join(", ")}.`);
  const links = (html.match(/https?:\/\//g) || []).length;
  if (links > 3) issues.push(`${links} links — one or two reads better and filters agree.`);
  const imgs = (html.match(/<img/gi) || []).length;
  if (imgs > 2) issues.push(`${imgs} images — heavy image mail is scored down.`);
  if (text.length < 120) issues.push("Very short body — a line or two reads like a blast.");
  if (text.length > 2500) issues.push("Long body — over 2,500 characters; say it shorter.");
  if (!/\{\{\s*(first_name|name)\s*\}\}/i.test(subject + html)) issues.push("No {{first_name}} anywhere — a name in the mail helps.");
  const score = Math.max(0, 100 - issues.length * 12 - hits.length * 8);
  return { score, issues, words: text.split(/\s+/).length, links, images: imgs, length: text.length };
}

/** GET — every campaign (mine for members); ?id= gives one with its send counts. */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const db = crmDb();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data: c, error } = await db.from("mk_campaign").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!c) throw new HttpError(404, "no such campaign");
      const { data: sends } = await db.from("mk_send").select("status").eq("campaign_id", id).limit(50000);
      const counts: Record<string, number> = {};
      for (const s of sends || []) counts[String(s.status)] = (counts[String(s.status)] || 0) + 1;
      const { data: recent } = await db.from("mk_send").select("email, status, sent_at, opened_at, open_count, error").eq("campaign_id", id).order("sent_at", { ascending: false, nullsFirst: false }).limit(200);
      return NextResponse.json({ campaign: c, counts, total: (sends || []).length, recent: recent ?? [] });
    }
    let q = db.from("mk_campaign").select("id, name, status, subject, list_ids, person_ids, channel_ids, speed_per_hour, created_by_email, created_at, started_at, done_at, counts").order("created_at", { ascending: false });
    if (u.scope === "mine") q = q.eq("created_by_email", u.email.toLowerCase());
    const { data, error } = await q;
    if (error) {
      if (/mk_campaign|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, campaigns: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, campaigns: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

/** The recipients a campaign would reach: its lists' people plus the people added by hand, de-duplicated by e-mail, minus the unsubscribed. */
async function audience(db: ReturnType<typeof crmDb>, c: { list_ids: string[]; person_ids: string[] }) {
  const ids = new Set<string>((c.person_ids || []).map(String));
  if ((c.list_ids || []).length) {
    const { data } = await db.from("mk_list_member").select("person_id").in("list_id", c.list_ids).limit(50000);
    for (const r of data || []) ids.add(String(r.person_id));
  }
  const people: { id: string; primary_email: string | null; full_name: string | null }[] = [];
  const arr = [...ids];
  for (let i = 0; i < arr.length; i += 500) {
    const { data } = await db.from("person").select("id, primary_email, full_name").in("id", arr.slice(i, i + 500)).is("deleted_at", null);
    people.push(...((data || []) as typeof people));
  }
  const { data: unsub } = await db.from("mk_unsubscribe").select("email");
  const U = new Set((unsub || []).map((r) => String(r.email).toLowerCase()));
  const seen = new Set<string>();
  const ok: { id: string; email: string }[] = [];
  let noEmail = 0, duplicates = 0, unsubscribed = 0;
  for (const p of people) {
    const e = String(p.primary_email || "").trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { noEmail++; continue; }
    if (seen.has(e)) { duplicates++; continue; }
    seen.add(e);
    if (U.has(e)) { unsubscribed++; continue; }
    ok.push({ id: p.id, email: e });
  }
  return { ok, people: people.length, noEmail, duplicates, unsubscribed };
}

/**
 * POST — { action: "save", id?, ...fields } · { action: "check_list", id } · { action: "check_message", id }
 *      · { action: "queue", id } (ready → sending) · { action: "pause"|"resume"|"delete", id } · { action: "send_now", id }
 */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const db = crmDb();
    const me = u.email.toLowerCase();
    const own = async (id: string) => {
      const { data } = await db.from("mk_campaign").select("*").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "no such campaign");
      if (u.scope !== "all" && data.created_by_email !== me) throw new HttpError(403, "not your campaign");
      return data;
    };
    if (b.action === "save") {
      const fields = {
        name: String(b.name || "Untitled campaign").trim(), subject: b.subject ?? null, body_html: b.body_html ?? null,
        list_ids: Array.isArray(b.list_ids) ? b.list_ids : [], person_ids: Array.isArray(b.person_ids) ? b.person_ids : [],
        channel_ids: Array.isArray(b.channel_ids) ? b.channel_ids : [], speed_per_hour: Math.max(1, Math.min(2000, Number(b.speed_per_hour) || 50)),
      };
      if (b.id) {
        const c = await own(b.id);
        if (c.status === "sending") throw new HttpError(400, "Pause the campaign before changing it.");
        const { error } = await db.from("mk_campaign").update({ ...fields, status: "draft" }).eq("id", b.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: b.id });
      }
      const { data, error } = await db.from("mk_campaign").insert({ ...fields, created_by_email: me }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (!b.id) throw new HttpError(400, "id required");
    const c = await own(b.id);
    if (b.action === "check_list") {
      const a = await audience(db, c);
      const checklist = { reach: a.ok.length, people: a.people, noEmail: a.noEmail, duplicates: a.duplicates, unsubscribed: a.unsubscribed, at: new Date().toISOString() };
      await db.from("mk_campaign").update({ checklist }).eq("id", b.id);
      return NextResponse.json({ ok: true, checklist });
    }
    if (b.action === "check_message") {
      const d = { ...deliverability(String(c.subject || ""), String(c.body_html || "")), at: new Date().toISOString() };
      await db.from("mk_campaign").update({ deliverability: d, status: d.score >= 60 && c.checklist ? "ready" : c.status }).eq("id", b.id);
      return NextResponse.json({ ok: true, deliverability: d });
    }
    if (b.action === "queue" || b.action === "send_now") {
      if (!(c.channel_ids || []).length) throw new HttpError(400, "Tick at least one from-address under Channels.");
      if (!c.subject || !c.body_html) throw new HttpError(400, "The message needs a subject and a body.");
      const a = await audience(db, c);
      if (!a.ok.length) throw new HttpError(400, "Nobody to send to after unsubscribes and missing e-mails.");
      const rows = a.ok.map((p) => ({ campaign_id: b.id, person_id: p.id, email: p.email }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from("mk_send").upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,email", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await db.from("mk_campaign").update({ status: "sending", started_at: c.started_at || new Date().toISOString(), counts: { queued: a.ok.length } }).eq("id", b.id);
      const r = b.action === "send_now" ? await drain(db, { campaignId: b.id, max: 100 }) : null;
      return NextResponse.json({ ok: true, queued: a.ok.length, pass: r });
    }
    if (b.action === "pause") { await db.from("mk_campaign").update({ status: "paused" }).eq("id", b.id); return NextResponse.json({ ok: true }); }
    if (b.action === "resume") { await db.from("mk_campaign").update({ status: "sending" }).eq("id", b.id); return NextResponse.json({ ok: true }); }
    if (b.action === "delete") {
      if (c.status === "sending") throw new HttpError(400, "Pause it first.");
      await db.from("mk_campaign").delete().eq("id", b.id); return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
