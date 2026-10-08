import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { pageAll } from "@/lib/page-all";
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
    const url0 = new URL(req.url);
    /* THE RESULTS OF THE MAILING (Dr Raghu, 8 Oct 2026: "show filter on top as campaign — all,
       date from and to, sent from — all or choose the channels; Delivered, Opened, Read,
       Unsubscribed, Bounced (nos, %)"). Counted in the database, never paged into memory. */
    if (url0.searchParams.get("results") === "1") {
      const camp = url0.searchParams.get("campaign") || "", ch = url0.searchParams.get("channel") || "";
      const from = url0.searchParams.get("from") || "", to = url0.searchParams.get("to") || "";
      const base = () => {
        let q = db.from("mk_send").select("id", { count: "exact", head: true });
        if (camp) q = q.eq("campaign_id", camp);
        if (ch) q = q.eq("channel_id", ch);
        if (from) q = q.gte("sent_at", `${from}T00:00:00+05:30`);
        if (to) q = q.lte("sent_at", `${to}T23:59:59+05:30`);
        return q;
      };
      const cnt = async (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => { const r = await f(base()); if (r.error) throw new Error(r.error.message); return r.count || 0; };
      const WENT = ["sent", "opened", "bounced", "unsubscribed"];
      const [sent, opened, read, unsub, bounced, failed] = await Promise.all([
        cnt((q) => q.in("status", WENT)), cnt((q) => q.in("status", WENT).not("opened_at", "is", null)), cnt((q) => q.in("status", WENT).gte("open_count", 2)),
        cnt((q) => q.eq("status", "unsubscribed")), cnt((q) => q.eq("status", "bounced")), cnt((q) => q.eq("status", "failed")),
      ]);
      // queued has no sent_at — counted without the date window
      let qq = db.from("mk_send").select("id", { count: "exact", head: true }).eq("status", "queued");
      if (camp) qq = qq.eq("campaign_id", camp); if (ch) qq = qq.eq("channel_id", ch);
      const queued = (await qq).count || 0;
      const delivered = Math.max(0, sent - bounced);
      const pc = (v: number, of: number) => (of ? Math.round((v / of) * 1000) / 10 : 0);
      return NextResponse.json({ ok: true, filters: { campaign: camp, channel: ch, from, to },
        queued, sent, delivered, deliveredPc: pc(delivered, sent), opened, openedPc: pc(opened, delivered), read, readPc: pc(read, delivered),
        unsubscribed: unsub, unsubscribedPc: pc(unsub, delivered), bounced, bouncedPc: pc(bounced, sent), failed });
    }
    const id = url0.searchParams.get("id");
    if (id) {
      const { data: c, error } = await db.from("mk_campaign").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!c) throw new HttpError(404, "no such campaign");
      /**
       * `.limit(50000)` did NOT read fifty thousand rows — PostgREST caps at
       * a thousand and says nothing, so every campaign over a thousand people
       * was being tallied from its first thousand. Ask the view, which counts
       * in the database; page the rows only where the view is not there yet.
       */
      const counts: Record<string, number> = {};
      const stat = await db.from("mk_campaign_stat").select("*").eq("campaign_id", id).maybeSingle();
      if (!stat.error && stat.data) {
        const x = stat.data as unknown as Record<string, number>;
        for (const k of ["queued", "sent", "opened", "bounced", "unsubscribed", "failed", "skipped"]) if (x[k]) counts[k] = x[k];
      } else {
        const sends = await pageAll<{ status: string }>((f, t) => db.from("mk_send").select("status").eq("campaign_id", id).range(f, t), "this campaign's sends");
        for (const sn of sends) counts[String(sn.status)] = (counts[String(sn.status)] || 0) + 1;
      }
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
       * WHAT EACH PERCENTAGE IS OF (Dr Raghu, 14 Sep 2026: "the % is on the
       * delivered ... or sent, not on the audience. Only the delivered is %
       * of the audience list size.")
       *
       * He is right, and the old way flattered us. Queued, sent, delivered,
       * failed and skipped are shares of the AUDIENCE — they answer "how far
       * through the list are we". Opened, clicked, bounced and unsubscribed
       * are shares of what actually went out, because an open rate against
       * a list you have only half-sent to is a number that means nothing.
       *
       * The honest base for those is DELIVERED; we do not have it yet, so
       * they are computed against SENT and the panel says which. The moment
       * the email.delivered webhook is on, `reach` becomes delivered and
       * every engagement rate corrects itself with no other change.
       */
      const n = (k: string) => counts[k] || 0;
      /* The audience is the sum of every state, whichever way it was counted. */
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const sent = n("sent") + n("opened") + n("bounced") + n("unsubscribed");
      const listNames = (async () => {
        const ids = (c.list_ids as string[]) || [];
        if (!ids.length) return [];
        const { data } = await db.from("mk_list").select("name").in("id", ids);
        return (data || []).map((l) => String(l.name));
      })();
      const share = (v: number, of: number) => (of ? Math.round((v / of) * 1000) / 10 : 0);
      const pc = (v: number) => share(v, total);            // of the audience
      /* DELIVERED = handed over and not bounced (8 Oct 2026: he wants a number, not "not measured";
         Resend's webhook will refine it, Gmail gives no better word than this). READ = opened twice
         or more — a second open is a person reading, a first may be a mail client's preview. */
      const delivered: number | null = Math.max(0, sent - n("bounced"));
      const reach = delivered || sent;                       // what engagement is measured against
      const rp = (v: number) => share(v, reach);
      const { count: readN } = await db.from("mk_send").select("id", { count: "exact", head: true }).eq("campaign_id", id).gte("open_count", 2);
      const read = readN || 0;
      const result = {
        lists: await listNames,
        audience: total,
        queued: n("queued"), queuedPc: pc(n("queued")),
        sent, sentPc: pc(sent),
        delivered, deliveredPc: delivered === null ? null : pc(delivered),
        opened: n("opened"), openedPc: rp(n("opened")),
        read, readPc: rp(read),
        clicked: null as number | null,
        bounced: n("bounced"), bouncedPc: rp(n("bounced")),
        unsubscribed: n("unsubscribed"), unsubscribedPc: rp(n("unsubscribed")),
        failed: n("failed"), failedPc: pc(n("failed")),
        skipped: n("skipped"), skippedPc: pc(n("skipped")),
        reach, reachLabel: "delivered",
        notMeasured: ["clicked"],
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
        .eq("action", "done").gte("at", c.started_at || "1970-01-01").order("at", { ascending: false }).limit(2000);   // every pass since the start, not the last twelve (8 Oct 2026: "0 sent by them" while 171 had gone)
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
    /* The newest column is asked for separately: before 0068 has run, naming
       it would fail the whole query and the screen would show no campaigns at
       all — the same way the channels came to look deleted. */
    const COLS = "id, name, status, subject, body_html, list_ids, person_ids, channel_ids, speed_per_hour, created_by_email, created_at, started_at, done_at, counts";
    const CACHE = ", stat_cache, stat_at";
    const ask = async (cols: string) => {
      let q = db.from("mk_campaign").select(cols).order("created_at", { ascending: false });
      if (u.scope === "mine") q = q.eq("created_by_email", u.email.toLowerCase());
      const r = await q;
      return { data: r.data as unknown as Record<string, unknown>[] | null, error: r.error };
    };
    let unsubChoiceReady = true, cacheReady = true;
    let { data, error } = await ask(COLS + ", show_unsub_link" + CACHE);
    if (error && /stat_cache|stat_at/i.test(error.message)) {
      cacheReady = false;
      ({ data, error } = await ask(COLS + ", show_unsub_link"));
    }
    if (error && /show_unsub_link/i.test(error.message)) {
      unsubChoiceReady = false;
      ({ data, error } = await ask(cacheReady ? COLS + CACHE : COLS));
    }
    if (error) {
      if (/relation|does not exist|could not find the table/i.test(error.message)) return NextResponse.json({ installed: false, campaigns: [] });
      throw new Error(error.message);
    }

    /**
     * THE FILTERS, APPLIED HERE RATHER THAN IN THE BROWSER (15 Sep 2026:
     * "Have filter — sent by, date from - to, some more search").
     *
     * A campaign's date is the day it STARTED where it has started, and the
     * day it was made where it has not, because a draft has no send date and
     * would otherwise vanish from every date range.
     */
    const url = new URL(req.url);
    const by = (url.searchParams.get("by") || "").trim().toLowerCase();
    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const st = (url.searchParams.get("status") || "").trim();
    const when = (c: Record<string, unknown>) => String(c.started_at || c.created_at || "").slice(0, 10);
    let rows = (data ?? []).filter((c) => {
      if (by && String(c.created_by_email || "").toLowerCase() !== by) return false;
      if (st && String(c.status) !== st) return false;
      const d = when(c);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && !`${c.name ?? ""} ${c.subject ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    /**
     * THE TALLIES COME FROM THE DATABASE, NOT FROM COUNTING ROWS HERE.
     *
     * At 240,000 sends a month, reading mk_send into this route to print a
     * dozen numbers would be absurd. The view does it in one query — and
     * before migration 0069 exists there is simply no stat block, and the
     * screen says "not counted yet" rather than showing a made-up nought.
     */
    /**
     * THE FIGURES COME FROM THE SNAPSHOT, NOT FROM COUNTING AGAIN.
     *
     * Dr Raghu, 15 Sep 2026: "in a cron so we can get the data without it
     * calculating everytime." The cron writes stat_cache on the curve the
     * numbers actually move on — every half hour for two days, hourly for a
     * week, daily after. This screen reads what it wrote.
     *
     * A campaign the cron has not reached yet is counted live, once, so a
     * brand-new send is never blank while it waits for the next pass. And the
     * campaign's own page always counts live: that is the screen somebody
     * watches while a send is running, where a figure half an hour old would
     * be its own kind of lie.
     */
    type Stat = { campaign_id?: string; contacts: number; queued: number; sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number; failed: number; skipped: number };
    let statsReady = true;
    const uncached = rows.filter((c) => !c.stat_cache).map((c) => String(c.id));
    const live = new Map<string, Stat>();
    if (uncached.length) {
      const r = await db.from("mk_campaign_stat").select("*").in("campaign_id", uncached);
      if (r.error) statsReady = false;
      else for (const x of (r.data as unknown as Stat[]) || []) live.set(String(x.campaign_id), x);
    }
    rows = rows.map((c) => ({ ...c, stat: (c.stat_cache as Stat | null) ?? live.get(String(c.id)) ?? null }));
    /* The oldest snapshot on screen is the one the reader should be told about. */
    const stamps = rows.map((c) => String(c.stat_at || "")).filter(Boolean).sort();
    const statAt = stamps.length ? stamps[0] : null;

    /* Whether anything has ever been delivered decides whether the column can
       speak at all — nought deliveries across every campaign means the
       webhook is not wired, not that nothing arrived. */
    type Totals = { campaigns: number; lists: number; contacts: number; sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number; queued: number; failed: number };
    const totals = rows.reduce<Totals>((a, c) => {
      const x = (c as { stat: Stat | null }).stat;
      a.campaigns += 1;
      a.lists += Array.isArray(c.list_ids) ? (c.list_ids as string[]).length : 0;
      if (x) { a.contacts += x.contacts; a.sent += x.sent; a.delivered += x.delivered; a.opened += x.opened; a.bounced += x.bounced; a.unsubscribed += x.unsubscribed; a.queued += x.queued; a.failed += x.failed; }
      return a;
    }, { campaigns: 0, lists: 0, contacts: 0, sent: 0, delivered: 0, opened: 0, bounced: 0, unsubscribed: 0, queued: 0, failed: 0 });

    const senders = [...new Set((data ?? []).map((c) => String(c.created_by_email || "")).filter(Boolean))].sort();

    /* Has anything ever reported a delivery, a bounce or a complaint? */
    const heard = async (t: string) => { const r = await db.from(t.split("|")[0]).select("*", { count: "exact", head: true }); return r; };
    void heard;
    const [dlv, bnc] = await Promise.all([
      db.from("mk_send").select("id", { count: "exact", head: true }).not("delivered_at", "is", null),
      db.from("mk_unsubscribe").select("email", { count: "exact", head: true }).in("reason", ["bounce", "complaint"]),
    ]);
    const webhookHeard = {
      delivered: !dlv.error && (dlv.count ?? 0) > 0,
      bounce: !bnc.error && (bnc.count ?? 0) > 0,
    };

    return NextResponse.json({
      installed: true, unsubChoiceReady, statsReady, cacheReady, statAt,
      campaigns: rows,
      totals,
      senders,
      /* Said plainly, so the screen never has to guess why a column is blank. */
      /**
       * BOUNCED WAS SHOWING A CONFIDENT NOUGHT (Dr Raghu, 15 Sep 2026: "how
       * is delivered and bounced blank?"). Delivered said "not measured" and
       * bounced said "0 · 0%", and both were nought for the very same reason:
       * the Resend webhook has never fired once. A nought there reads as "no
       * bounces", which is a claim, not an absence.
       *
       * So the webhook has to have SPOKEN before either column speaks. Any
       * delivery recorded, any bounce, any complaint — one is enough to know
       * somebody is listening.
       */
      measured: {
        delivered: statsReady && webhookHeard.delivered,
        replied: false,
        bounced: statsReady && webhookHeard.bounce,
      },
      notMeasured: {
        delivered: "Add the email.delivered event to the Resend webhook — nothing has been recorded yet.",
        bounced: "The Resend webhook has never reported a bounce or a complaint — add email.bounced and email.complained to it. Nought here would mean nobody is listening, not that nothing bounced.",
        replied: "Genie does not see replies. They go to the Reply-To mailbox, and matching them back to a campaign is inbound-mail work that has not been built.",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}

/** The recipients a campaign would reach: its lists' people plus the people added by hand, de-duplicated by e-mail, minus the unsubscribed. */
async function audience(db: ReturnType<typeof crmDb>, c: { list_ids: string[]; person_ids: string[] }) {
  const ids = new Set<string>((c.person_ids || []).map(String));
  if ((c.list_ids || []).length) {
    /* PAGED. The aviation list holds 10,137 people; read as one call this
       returned 1,000, and a send to it would have dropped 9,137 of them
       without a word. */
    const mem = await pageAll<{ person_id: string }>((f, t) => db.from("mk_list_member").select("person_id").in("list_id", c.list_ids).range(f, t), "the list's members");
    for (const r of mem) ids.add(String(r.person_id));
  }
  const people: { id: string; primary_email: string | null; full_name: string | null }[] = [];
  const arr = [...ids];
  for (let i = 0; i < arr.length; i += 500) {
    const { data } = await db.from("person").select("id, primary_email, full_name").in("id", arr.slice(i, i + 500)).is("deleted_at", null);
    people.push(...((data || []) as typeof people));
  }
  const unsub = await pageAll<{ email: string }>((f, t) => db.from("mk_unsubscribe").select("email").range(f, t), "the unsubscribe list");
  const U = new Set(unsub.map((r) => String(r.email).toLowerCase()));
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
      } as Record<string, unknown>;
      /* Only written once 0068 exists; saving must work either way. */
      { const probe = await db.from("mk_campaign").select("show_unsub_link").limit(1);
        if (!probe.error) fields.show_unsub_link = b.show_unsub_link !== false; }
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
      /* THE QUEUE FOLLOWS THE LIST (Dr Raghu, 8 Oct 2026: "once the list is paused and changed the
         queue should drop. whatever is sent should be shown anyways"). A queued row for somebody no
         longer in the audience is removed; anything already sent, opened, bounced or unsubscribed stays
         exactly as it is — it happened. */
      const keep = new Set(a.ok.map((p) => p.id));
      const queuedRows = await pageAll<{ id: string; person_id: string }>((f, t) => db.from("mk_send").select("id, person_id").eq("campaign_id", b.id).eq("status", "queued").range(f, t), "the queue");
      const dropIds = queuedRows.filter((r) => !keep.has(String(r.person_id))).map((r) => r.id);
      for (let i = 0; i < dropIds.length; i += 300) { const { error } = await db.from("mk_send").delete().in("id", dropIds.slice(i, i + 300)); if (error) throw new Error(error.message); }
      await db.from("mk_campaign").update({ status: "sending", started_at: c.started_at || new Date().toISOString(), counts: { queued: a.ok.length, dropped: dropIds.length } }).eq("id", b.id);
      const r = b.action === "send_now" ? await drain(db, { campaignId: b.id, max: 100 }) : null;
      return NextResponse.json({ ok: true, queued: a.ok.length, dropped: dropIds.length, pass: r });
    }
    if (b.action === "pause") { await db.from("mk_campaign").update({ status: "paused" }).eq("id", b.id); return NextResponse.json({ ok: true }); }
    if (b.action === "resume") { await db.from("mk_campaign").update({ status: "sending" }).eq("id", b.id); return NextResponse.json({ ok: true }); }
    /**
     * DUPLICATE — the quickest honest way to send the same thing again.
     * It copies the message and the audience and nothing that happened: the
     * copy is a draft with no history, no counts and no send log.
     */
    if (b.action === "duplicate") {
      const copy: Record<string, unknown> = {
        name: `${c.name} (copy)`, subject: c.subject, body_html: c.body_html,
        list_ids: c.list_ids, person_ids: c.person_ids, channel_ids: c.channel_ids,
        speed_per_hour: c.speed_per_hour, status: "draft", created_by_email: me,
      };
      { const probe = await db.from("mk_campaign").select("show_unsub_link").limit(1);
        if (!probe.error) copy.show_unsub_link = (c as { show_unsub_link?: boolean }).show_unsub_link !== false; }
      const { data: made, error } = await db.from("mk_campaign").insert(copy).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: made.id });
    }

    if (b.action === "delete") {
      /* Dr Raghu, 15 Sep 2026: "Delete will work only if in draft. After send
         it can't." A campaign that has gone out is a record of what people
         were sent, and that is not ours to tidy away. */
      if (c.status !== "draft") throw new HttpError(400, `This campaign is ${c.status} — only a draft can be deleted. What went out is a record of what people were sent.`);
      await db.from("mk_campaign").delete().eq("id", b.id); return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
