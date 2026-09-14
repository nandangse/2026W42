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

      /**
       * THE RESULT, AS HE ASKED FOR IT (Dr Raghu, 14 Sep 2026): the list,
       * queued, sent, delivered, opened, clicked, bounced, unsubscribed —
       * each with its percentage.
       *
       * TWO OF THOSE WE CANNOT HONESTLY CLAIM YET, and they are reported as
       * unknown rather than as zero:
       *
       *   DELIVERED. Resend knows; Genie only knows it handed the message
       *   over. It becomes real when the webhook carries email.delivered.
       *
       *   CLICKED. Nothing rewrites the links, so no click can be counted.
       *   A zero here would read as "nobody clicked", which is a different
       *   fact from "we are not measuring".
       *
       * Every percentage is OF THE AUDIENCE, not of each other, so the
       * numbers can be compared down the column.
       */
      const n = (k: string) => counts[k] || 0;
      const total = (sends || []).length;
      const sent = n("sent") + n("opened") + n("bounced") + n("unsubscribed");
      const listNames = (async () => {
        const ids = (c.list_ids as string[]) || [];
        if (!ids.length) return [];
        const { data } = await db.from("mk_list").select("name").in("id", ids);
        return (data || []).map((l) => String(l.name));
      })();
      const pc = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
      const result = {
        lists: await listNames,
        audience: total,
        queued: n("queued"),
        sent, sentPc: pc(sent),
        delivered: null as number | null,
        opened: n("opened"), openedPc: pc(n("opened")),
        clicked: null as number | null,
        bounced: n("bounced"), bouncedPc: pc(n("bounced")),
        unsubscribed: n("unsubscribed"), unsubscribedPc: pc(n("unsubscribed")),
        failed: n("failed"), failedPc: pc(n("failed")),
        skipped: n("skipped"),
        notMeasured: ["delivered", "clicked"],
      };
      /**
       * IS THE CRON ACTUALLY RUNNING? (Dr Raghu, 14 Sep 2026: "can u also
       * let me know how many crons completed and how much time to the next
       * cron?")
       *
       * Every pass writes a heartbeat, so the answer is a query rather than
       * a belief. It matters more than it sounds: a campaign can sit at
       * "sending" for ever if the cron is not picking it up, and until now
       * the only way to notice was to watch the number stop moving.
       *
       * vercel.json schedules it every ten minutes, so the next pass is the
       * next ten-minute boundary plus the ~35 seconds Vercel takes to fire.
       */
      const { data: beats } = await db.from("crm_audit")
        .select("action, after, at").eq("entity", "cron").eq("entity_id", "marketing-drain")
        .eq("action", "done").order("at", { ascending: false }).limit(12);
      const since = c.started_at ? new Date(c.started_at).getTime() : 0;
      const passes = (beats || []).map((x) => ({
        at: x.at as string,
        sent: Number((x.after as Record<string, number> | null)?.sent || 0),
        failed: Number((x.after as Record<string, number> | null)?.failed || 0),
        retrying: Number((x.after as Record<string, number> | null)?.retrying || 0),
      }));
      const now = Date.now();
      const nextAt = new Date(Math.ceil(now / 600_000) * 600_000 + 35_000).toISOString();
      const cron = {
        passesSinceStart: passes.filter((p) => new Date(p.at).getTime() >= since).length,
        lastPassAt: passes[0]?.at ?? null,
        sentByCron: passes.filter((p) => new Date(p.at).getTime() >= since).reduce((a, p) => a + p.sent, 0),
        nextAt,
        secondsToNext: Math.max(0, Math.round((new Date(nextAt).getTime() - now) / 1000)),
        recent: passes.slice(0, 6),
      };
      return NextResponse.json({ campaign: c, counts, total, recent: recent ?? [], result, cron });
    }
    /**
     * body_html RIDES WITH THE LIST (Dr Raghu, 14 Sep 2026: "the message is
     * not saved!").
     *
     * It WAS saved — 2,338 characters of it, untouched in the database. The
     * list query simply did not fetch it, so the wizard opened on a campaign
     * whose editor started empty, and the message looked lost. Worse than
     * looking lost: one press of Save on that blank box would have made it
     * true, and the remaining 162 people would have received nothing.
     *
     * A few kilobytes on a list of a dozen campaigns is a cheap price for a
     * screen that cannot lie about its own contents.
     */
    let q = db.from("mk_campaign").select("id, name, status, subject, body_html, list_ids, person_ids, channel_ids, speed_per_hour, created_by_email, created_at, started_at, done_at, counts").order("created_at", { ascending: false });
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
    /**
     * A RUNNING CAMPAIGN IS FROZEN (Dr Raghu, 14 Sep 2026: "this should be
     * as run!").
     *
     * Thirty-four people have already received a particular subject and a
     * particular message. Editing either one now would mean two different
     * mails went out under one campaign name, and the report afterwards
     * would describe neither. Pause it, change it, resume it — that is what
     * Pause is for, and it is one click away.
     */
    if (b.action === "save" && b.id) {
      const now = await own(String(b.id));
      if (now.status === "sending" || now.status === "done")
        throw new HttpError(409, now.status === "done"
          ? "This campaign has finished. Copy it into a new one rather than editing what was already sent."
          : "This campaign is sending — press Pause first. The message that reached the first people must be the one that reaches the rest.");
    }

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
