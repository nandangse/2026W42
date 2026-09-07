import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { people, type Person } from "@/lib/hrms-wa";
import { employeeVars, renderTemplate } from "@/lib/hrms-template";
import { ALL_FIELDS, hrmsTables } from "@/lib/hrms";
import { crmDb } from "@/crm/db";
import { myMailbox, mailboxByAddress, accessTokenFor, gmailSend, gmailSendMixed, gmailGet } from "@/crm/gmail";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * MASS EMAIL FROM HRMS (Dr Raghu, 7 Sep 2026): "here make a button — Send
 * mass email, template choice, from mail id hr@nandan.co.in /
 * raghu@nandan.co.in, choose the OAuth of that for sending, variables to add
 * on right side, attachment, send."
 *
 * The mail goes from the chosen address's own connected Gmail, so it lands
 * in that mailbox's Sent and answers come back to it. Every one is written
 * into the communications ledger, so the same lines appear on the person's
 * record and on this page.
 */
const FROM_ALLOWED = ["hr@nandan.co.in", "raghu@nandan.co.in"];
/**
 * HOW MANY IN ONE CALL. Forty was too many (Dr Raghu, 7 Sep 2026: a send to
 * 62 sat at "0 of 62"). Each mail is a Gmail round trip and a ledger write,
 * and forty of them ran past the function's patience before the screen heard
 * anything back. Twelve returns in about twenty seconds, so the count moves
 * while it works and a stall is visible rather than silent.
 */
const MAX_PER_CALL = 12;
/** Gmail itself refuses over 25 MB; leave room for the base64 swell. */
const MAX_ATTACH = 18 * 1024 * 1024;
/**
 * ATTACHMENTS GO ROUND THE API, NOT THROUGH IT (Dr Raghu, 7 Sep 2026, on a
 * 12 MB deck: "Request Entity Too Large FUNCTION_PAYLOAD_TOO_LARGE").
 *
 * Vercel refuses a request body over 4.5 MB, so a file can never be posted
 * to this route at all. The browser uploads it straight into storage with a
 * signed URL — the same path the IDP's own attachments take — and the send
 * carries only its name. The bytes are fetched here, server-side, where no
 * such limit applies.
 */
const BUCKET = "voice-notes";
const ATT_PREFIX = "mass-mail/";

const ok = (x: unknown) => { const s2 = String(x || "").trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s2) ? s2.toLowerCase() : ""; };

/**
 * WHICH ADDRESS IT GOES TO (Dr Raghu, 7 Sep 2026: "also give choice of
 * personal mail id / company mail id"). Work e-mail and personal e-mail are
 * two different fields on the record; "either" prefers the company one and
 * falls back, which is how it behaved before the choice existed.
 */
const addressOf = (p: Person, pref: string) => {
  const v = p.value || {};
  const company = ok(v.email) || ok(v.user_email);
  const personal = ok(v.personal_email);
  if (pref === "company") return company;
  if (pref === "personal") return personal;
  if (pref === "personal_first") return personal || company;
  return company || personal;
};

/**
 * LC AND STRATCOM (Dr Raghu, 7 Sep 2026: "here also give option to send to
 * stratcom and LC seperately too"). The two rooms are ticks on the Genie
 * profile, not on the HR record, so the rooms are read from there and matched
 * to the roll by any address the person holds. Stratcom sits inside the LC,
 * which is why a Stratcom member answers to the LC chip as well.
 */
type Rooms = { lc: Set<string>; stratcom: Set<string> };
async function rooms(admin: ReturnType<typeof adminClient>): Promise<Rooms> {
  const out: Rooms = { lc: new Set(), stratcom: new Set() };
  try {
    const { data } = await admin.from("profiles").select("email, lc, stratcom").eq("disabled", false);
    for (const r of (data || []) as { email: string; lc: boolean; stratcom: boolean }[]) {
      const e = ok(r.email); if (!e) continue;
      if (r.stratcom) { out.stratcom.add(e); out.lc.add(e); }
      else if (r.lc) out.lc.add(e);
    }
  } catch (e) { swallow("hrms/mass-mail rooms", e); }
  out.lc.add("raghu@nandan.co.in"); out.stratcom.add("raghu@nandan.co.in");   // the owner is in both, unstored
  return out;
}
/** Every address a person answers to, for matching against a room. */
const addressesOf = (p: Person) => [p.value?.user_email, p.value?.email, p.value?.personal_email].map(ok).filter(Boolean);
const inRoom = (p: Person, set: Set<string>, alsoRecord?: boolean) =>
  addressesOf(p).some((a) => set.has(a))
  || (!!alsoRecord && /^(yes|y|true|1)$/i.test(String(p.value?.in_lc || "").trim()));

/** The Gmail that will actually carry the mail — found by address first, so
 *  a mailbox connected from somebody else's account still counts. */
async function boxFor(email: string) {
  const e = email.toLowerCase();
  const direct = await mailboxByAddress(e);
  if (direct) return direct;
  const { data: rp } = await crmDb().from("profile").select("id").eq("email", e).maybeSingle();
  return rp?.id ? await myMailbox(String(rp.id)) : null;
}

/**
 * WHOSE NAME MAY GO ON A MAIL (Dr Raghu, 7 Sep 2026: "vinay cant send as
 * me!").
 *
 * Sending THROUGH a mailbox and being SEEN AS an address are different
 * powers. Anybody in HRMS may send through hr@nandan.co.in — that is HR's
 * mailbox and the mail honestly says so. Nobody may put another person's
 * address on the From line: a mail from Vinay's hands that reads as though
 * Dr Raghu wrote it is not a convenience, it is a forgery, and the person
 * answering it would never know.
 *
 * So an address may be shown only when it is the mailbox actually carrying
 * the mail, or the signed-in person's own address. The owner is excepted
 * because it is his company and his own instruction — he asked to send as HR.
 */
const showAsFor = (me: { email: string; isOwner?: boolean }) =>
  me.isOwner ? [...FROM_ALLOWED] : FROM_ALLOWED.filter((a) => a === me.email.toLowerCase());

async function senderFor(email: string) {
  const e = email.toLowerCase();
  if (!FROM_ALLOWED.includes(e)) throw new HttpError(400, `Mail can go from ${FROM_ALLOWED.join(" or ")} — not ${e}.`);
  const box = await boxFor(e);
  if (!box) throw new HttpError(503, `${e} has no Gmail connected in Genie yet — open that account and use Connect Gmail.`);
  return { token: await accessTokenFor(String(box.id)), fromEmail: String(box.email_address) };
}

/**
 * THE CAMPAIGN LIST (Dr Raghu, 7 Sep 2026: "make a tab called Mass
 * Communication ... show the drafted and sent ones"). Each row carries what
 * went out and what has come back since — replies are counted per campaign by
 * looking for anything inbound from the same people after it left, which is
 * the only honest rule for WhatsApp, where an answer arrives on its own
 * thread and not on the mail's.
 */
async function campaigns(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from("hrms_mass_mail")
    .select("id, title, status, channel, from_email, from_as, reply_to, to_pref, subject, body, template_key, audience, attachments, counts, created_by, created_at, updated_at, sent_at")
    .order("updated_at", { ascending: false }).limit(200);
  if (error) {
    if (/hrms_mass_mail|schema cache|does not exist/i.test(error.message)) return { rows: [], needsMigration: true };
    throw new Error(error.message);
  }
  const rows = (data || []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  const lines: Record<string, { sent: number; failed: number; replies: number }> = {};
  if (ids.length) {
    try {
      const { data: cs } = await admin.from("hrms_communication").select("mass_id, direction, status").in("mass_id", ids);
      for (const c of (cs || []) as { mass_id: string; direction: string; status: string }[]) {
        const k = String(c.mass_id); lines[k] = lines[k] || { sent: 0, failed: 0, replies: 0 };
        if (c.direction === "in") lines[k].replies++;
        else if (c.status === "failed") lines[k].failed++;
        else lines[k].sent++;
      }
    } catch (e) { swallow("hrms/mass-mail counts", e); }
  }
  return { rows: rows.map((r) => ({ ...r, lines: lines[String(r.id)] || { sent: 0, failed: 0, replies: 0 } })) };
}

/** One campaign opened: every line it sent, and everything that came back. */
async function campaignLines(admin: ReturnType<typeof adminClient>, id: string) {
  const { data: camp } = await admin.from("hrms_mass_mail").select("*").eq("id", id).maybeSingle();
  const { data: sent } = await admin.from("hrms_communication")
    .select("id, employee_id, channel, direction, to_address, subject, body, status, error, sent_by, sent_at, thread_id")
    .eq("mass_id", id).order("sent_at", { ascending: false }).limit(1000);
  const out = (sent || []) as Record<string, unknown>[];
  // Replies that never carried the campaign id — WhatsApp, and any mail
  // answered outside the thread. Matched by person and by clock.
  let inbound: Record<string, unknown>[] = [];
  const since = camp?.sent_at as string | undefined;
  const who = [...new Set(out.map((r) => String(r.employee_id)))];
  if (since && who.length) {
    try {
      const { data } = await admin.from("hrms_communication")
        .select("id, employee_id, channel, direction, to_address, subject, body, status, sent_by, sent_at")
        .eq("direction", "in").in("employee_id", who).gte("sent_at", since)
        .order("sent_at", { ascending: false }).limit(500);
      const have = new Set(out.map((r) => String(r.id)));
      inbound = ((data || []) as Record<string, unknown>[]).filter((r) => !have.has(String(r.id)));
    } catch (e) { swallow("hrms/mass-mail inbound", e); }
  }
  const names = new Map<string, string>();
  try {
    const T = await hrmsTables(admin);
    const { data } = await admin.from(T.employees).select("id, name").in("id", who.length ? who : ["-"]);
    for (const r of (data || []) as { id: string; name: string }[]) names.set(String(r.id), r.name);
  } catch (e) { swallow("hrms/mass-mail names", e); }
  const stamp = (r: Record<string, unknown>) => ({ ...r, name: names.get(String(r.employee_id)) || String(r.employee_id) });
  return { campaign: camp || null, rows: out.map(stamp), replies: inbound.map(stamp) };
}

/** GET — who it can go from, what templates exist, which variables fill, the
 *  audience, and (?list=1) the campaigns drafted and sent. */
export async function GET(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    if (sp.get("list")) return NextResponse.json(await campaigns(admin));
    if (sp.get("campaign")) return NextResponse.json(await campaignLines(admin, String(sp.get("campaign"))));
    const all = await people(admin);
    const rm = await rooms(admin);
    const froms: { email: string; connected: boolean }[] = [];
    for (const e of FROM_ALLOWED) {
      let connected = false;
      try { connected = !!(await boxFor(e)); }
      catch (err) { swallow("hrms/mass-mail", err); }
      froms.push({ email: e, connected });
    }
    let templates: { key: string; title: string; body: string }[] = [];
    try {
      const { data } = await admin.from("hrms_text_master").select("key, title, body").order("title");
      templates = (data || []) as typeof templates;
    } catch (e) { swallow("hrms/mass-mail", e); }
    const variables = [
      { key: "first_name", label: "First name" }, { key: "name", label: "Full name" },
      /**
       * THE TEMPORARY PASSWORD, for the one mail that carries it (Dr Raghu,
       * 7 Sep 2026: "keep the password as a variable with PERS_PAS so that we
       * can use that in the mailing and it can go as a mail-merged
       * document"). It resolves only while the password is still unused —
       * once the person signs in it is wiped, and this comes out blank
       * rather than posting a live password into a second mail.
       */
      { key: "PERS_PAS", label: "Their temporary /idp password" },
      { key: "employee_id", label: "Employee ID" }, { key: "today", label: "Today's date" }, { key: "cycle", label: "Appraisal cycle" },
      ...ALL_FIELDS.filter((f) => !f.derived).map((f) => ({ key: f.key, label: f.label })),
    ];
    const seen = new Set<string>();
    const vars = variables.filter((v) => (seen.has(v.key) ? false : (seen.add(v.key), true)));
    return NextResponse.json({
      froms, templates, variables: vars, mayShowAs: showAsFor(me),
      types: [...new Set(all.map((p) => p.type).filter(Boolean))].sort(),
      departments: [...new Set(all.map((p) => p.department).filter(Boolean))].sort(),
      total: all.length,
      withEmail: all.filter((p) => addressOf(p, "either")).length,
      withCompany: all.filter((p) => addressOf(p, "company")).length,
      withPersonal: all.filter((p) => addressOf(p, "personal")).length,
      groups: [
        { key: "lc", label: "LC", count: all.filter((p) => inRoom(p, rm.lc, true)).length, title: "Leadership Circle" },
        { key: "stratcom", label: "Stratcom", count: all.filter((p) => inRoom(p, rm.stratcom)).length, title: "Strategy Committee" },
      ],
    });
  } catch (e) {
    return errJson(e);
  }
}

type Audience = { types?: string[]; departments?: string[]; groups?: string[]; ids?: string[] };
const pick = (all: Person[], b: Audience, rm: Rooms) => {
  let out = all;
  if (b.ids?.length) return all.filter((p) => b.ids!.includes(p.id));
  // A room is a whole audience on its own — ticking LC means the LC, not the
  // LC narrowed by a department nobody remembered was still ticked.
  if (b.groups?.length) {
    out = out.filter((p) => b.groups!.some((g) => g === "stratcom" ? inRoom(p, rm.stratcom) : g === "lc" ? inRoom(p, rm.lc, true) : false));
    return out;
  }
  if (b.types?.length) out = out.filter((p) => b.types!.includes(p.type));
  if (b.departments?.length) out = out.filter((p) => p.department && b.departments!.includes(p.department));
  return out;
};

/**
 * POST { action: "preview" | "send", from, subject, body, types?, departments?, ids?,
 *        attachments?: [{ name, mime, base64 }], offset? }
 */
export async function POST(req: Request) {
  try {
    const u = await requireHrms();
    const b = await readBody(req, { action: "string", from: "string?", subject: "string?", body: "string?" });
    const admin = adminClient();
    const all = await people(admin);
    const rm = await rooms(admin);
    const chosen = pick(all, b as Audience, rm);
    const subject = String(b.subject || "").trim();
    const body = String(b.body || "");
    const toPref = String(b.to_pref || "either");
    const replyTo = ok(b.reply_to) || null;
    const showAs = ok(b.from_as) || null;

    /** The unused temporary passwords, for {{PERS_PAS}}. */
    const tempPw = new Map<string, string>();
    if (/PERS_PAS/i.test(`${subject} ${body}`)) {
      try {
        const { data: lg } = await admin.from("hrms_idp_login").select("employee_id, pw_temp").not("pw_temp", "is", null);
        for (const r of (lg || []) as { employee_id: string; pw_temp: string }[]) tempPw.set(String(r.employee_id), r.pw_temp);
      } catch (e) { swallow("hrms/mass-mail passwords", e); }
    }

    const rendered = chosen.map((p) => {
      const vars = employeeVars(p.value, { employee_id: p.id, PERS_PAS: tempPw.get(p.id) || "" });
      const to = addressOf(p, toPref);
      const s = renderTemplate(subject, vars);
      const h = renderTemplate(body, vars);
      const missing = [...new Set([...`${subject} ${body}`.matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)].map((m) => m[1])
        .filter((k) => { const lk = k.toLowerCase().replace(/[^a-z0-9]/g, ""); const hit = Object.entries(vars).find(([vk]) => vk.toLowerCase().replace(/[^a-z0-9]/g, "") === lk); return !hit || !hit[1]; }))];
      return { id: p.id, name: p.name, type: p.type, department: p.department, to, subject: s, html: h, missing };
    });
    const sendable = rendered.filter((r) => r.to);
    const noEmail = rendered.filter((r) => !r.to).map((r) => ({ id: r.id, name: r.name }));

    const audience = { types: b.types, departments: b.departments, groups: b.groups, ids: b.ids };
    const sheet = {
      title: String(b.title || subject || "Untitled").slice(0, 200),
      from_email: String(b.from || "") || null, from_as: showAs, reply_to: replyTo, to_pref: toPref,
      subject, body, template_key: b.template_key || null,
      audience, attachments: (Array.isArray(b.attachments) ? b.attachments : []).map((a) => ({ name: (a as { name?: string }).name || "", size: Math.round(((a as { base64?: string }).base64 || "").length * 0.75) })),
    };

    /**
     * SAVE DRAFT (Dr Raghu, 7 Sep 2026: "keep this as Save draft"). Nothing
     * leaves. The draft holds the words, the audience and the settings — not
     * the attachment bytes, only their names, because a draft is a plan and
     * the files are picked again when it actually goes.
     */
    if (b.action === "save-draft") {
      const id = String(b.campaign_id || "");
      const row = { ...sheet, status: "draft", updated_at: new Date().toISOString() };
      const q = id
        ? await admin.from("hrms_mass_mail").update(row).eq("id", id).select("id").maybeSingle()
        : await admin.from("hrms_mass_mail").insert({ ...row, created_by: u.email }).select("id").maybeSingle();
      if (q.error) {
        if (/hrms_mass_mail|schema cache|does not exist/i.test(q.error.message)) throw new HttpError(503, "Migration 0151 has not been run yet — drafts have nowhere to sit.");
        throw new Error(q.error.message);
      }
      return NextResponse.json({ ok: true, campaign_id: q.data?.id || id, saved: true });
    }

    if (b.action === "delete-draft") {
      const id = String(b.campaign_id || "");
      if (!id) throw new HttpError(400, "which draft?");
      const { error } = await admin.from("hrms_mass_mail").delete().eq("id", id).eq("status", "draft");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * PULL REPLIES (Dr Raghu, 7 Sep 2026: "any replies recieved also to be
     * plonked here both for whatsapp and email"). WhatsApp answers already
     * arrive through the queue's own puller. Mail answers sit in the sending
     * Gmail's threads, so each thread this campaign opened is read back and
     * anything not written by us is filed against that person.
     */
    if (b.action === "pull-replies") {
      const id = String(b.campaign_id || "");
      if (!id) throw new HttpError(400, "which campaign?");
      const { data: camp } = await admin.from("hrms_mass_mail").select("from_email, sent_at").eq("id", id).maybeSingle();
      if (!camp) throw new HttpError(404, "no such campaign");
      const { token, fromEmail } = await senderFor(String(camp.from_email || ""));
      const { data: sentRows } = await admin.from("hrms_communication")
        .select("employee_id, thread_id, external_id").eq("mass_id", id).eq("direction", "out").not("thread_id", "is", null);
      const threads = [...new Map(((sentRows || []) as { employee_id: string; thread_id: string }[]).map((r) => [r.thread_id, r.employee_id])).entries()];
      const { data: had } = await admin.from("hrms_communication").select("external_id").eq("mass_id", id).eq("direction", "in");
      const seen = new Set(((had || []) as { external_id: string }[]).map((r) => String(r.external_id)));
      const start = Math.max(0, Number(b.offset) || 0);
      const batch = threads.slice(start, start + 60);
      let found = 0;
      for (const [tid, empId] of batch) {
        try {
          const t = await gmailGet(token, `threads/${tid}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`) as { messages?: { id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }[] };
          for (const m of t.messages || []) {
            const hs = m.payload?.headers || [];
            const fromH = String(hs.find((h) => h.name.toLowerCase() === "from")?.value || "");
            const addr = ok((fromH.match(/<([^>]+)>/)?.[1]) || fromH);
            if (!addr || addr === fromEmail.toLowerCase()) continue;      // ours, not theirs
            if (seen.has(String(m.id))) continue;
            const when = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
            await admin.from("hrms_communication").insert({
              employee_id: empId, channel: "email", direction: "in", to_address: addr,
              subject: String(hs.find((h) => h.name.toLowerCase() === "subject")?.value || "").slice(0, 300),
              body: String(m.snippet || ""), status: "received", sent_by: addr, sent_at: when,
              external_id: String(m.id), thread_id: tid, mass_id: id, meta: { mass: true, reply: true },
            }).then(() => { found++; seen.add(String(m.id)); }, (e2) => swallow("hrms/mass-mail reply", e2));
          }
        } catch (e) { swallow("hrms/mass-mail thread", e); }
      }
      const done = start + batch.length;
      return NextResponse.json({ ok: true, found, done, of: threads.length, more: done < threads.length });
    }

    /** A signed URL the browser can push one file into, direct to storage. */
    if (b.action === "attach-url") {
      const name = String(b.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 90);
      if (Number(b.size || 0) > MAX_ATTACH) throw new HttpError(400, `${name} is larger than 18 MB — Gmail will not carry it.`);
      const path = `${ATT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, bucket: BUCKET, path, token: data.token, name });
    }

    if (b.action === "preview") {
      return NextResponse.json({
        ok: true, count: sendable.length, noEmail,
        toPref, replyTo, showAs,
        missing: [...new Set(sendable.flatMap((r) => r.missing))],
        // Three at random, not the first three — the first three are always
        // the same three, and they never catch a template that breaks on
        // somebody in the middle of the roll (Dr Raghu, 7 Sep 2026).
        sample: [...sendable].sort(() => Math.random() - 0.5).slice(0, 3).map((r) => ({ name: r.name, to: r.to, subject: r.subject, html: r.html })),
        list: sendable.map((r) => ({ id: r.id, name: r.name, type: r.type, department: r.department, to: r.to, missing: r.missing.length })),
      });
    }

    if (b.action === "send") {
      if (!u.isOwner && u.email.toLowerCase() !== "vinaym@nandan.co.in" && u.email.toLowerCase() !== "hr@nandan.co.in")
        throw new HttpError(403, "Mass mail goes out from Dr Raghu or HR.");
      if (!subject) throw new HttpError(400, "The mail needs a subject.");
      if (!body.trim()) throw new HttpError(400, "The mail is empty.");
      const { token, fromEmail } = await senderFor(String(b.from || ""));
      /**
       * SHOWING A DIFFERENT FROM (Dr Raghu, 7 Sep 2026: "send the mail as
       * From: hr@nandan.co.in even though its from my mail id"). Gmail only
       * lets an account send as another address when that address is a
       * verified "Send mail as" alias in it; otherwise it refuses the send
       * or quietly rewrites the header. So the answer is checked and said
       * plainly rather than assumed.
       */
      if (showAs && showAs !== fromEmail && !showAsFor(u).includes(showAs))
        throw new HttpError(403, `A mail may not go out reading as ${showAs} — that is not your address, and not the mailbox carrying it. Send it through ${showAs} instead, or leave the From line as ${fromEmail}.`);
      const headerFrom = showAs && FROM_ALLOWED.includes(showAs) ? showAs : fromEmail;
      const fromName = headerFrom === "hr@nandan.co.in" ? "Nandan GSE HR" : "Nandan GSE";
      /** Named here, fetched from storage — see ATTACHMENTS above. */
      const asked = (Array.isArray(b.attachments) ? b.attachments : []) as { name: string; mime: string; base64?: string; path?: string }[];
      const atts: { name: string; mime: string; base64: string }[] = [];
      for (const a of asked) {
        if (a.base64) { atts.push({ name: a.name, mime: a.mime, base64: a.base64 }); continue; }
        if (!a.path || !a.path.startsWith(ATT_PREFIX)) throw new HttpError(400, `${a.name} was not uploaded — attach it again.`);
        const { data, error } = await admin.storage.from(BUCKET).download(a.path);
        if (error || !data) throw new HttpError(400, `${a.name} could not be read back from storage — attach it again.`);
        atts.push({ name: a.name, mime: a.mime || data.type || "application/octet-stream", base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
      }
      if (atts.reduce((a, x) => a + (x.base64 || "").length * 0.75, 0) > MAX_ATTACH) throw new HttpError(400, "The attachments come to more than 18 MB together — Gmail will not carry that.");

      const offset = Math.max(0, Number(b.offset) || 0);
      const slice = sendable.slice(offset, offset + MAX_PER_CALL);

      /**
       * THE CAMPAIGN THIS BELONGS TO. Opened on the first batch and carried
       * on every line, so the Mass Communication tab can show what went and
       * what came back, and the person's own record shows the same mail
       * under Communication without knowing a campaign exists.
       */
      let massId = String(b.campaign_id || "") || null;
      if (!massId) {
        const { data: made } = await admin.from("hrms_mass_mail")
          .insert({ ...sheet, status: "sent", created_by: u.email, sent_at: new Date().toISOString() })
          .select("id").maybeSingle();
        massId = made?.id ? String(made.id) : null;
      } else {
        await admin.from("hrms_mass_mail").update({ ...sheet, status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", massId)
          .then(() => null, (e2) => swallow("hrms/mass-mail campaign", e2));
      }
      let sent = 0; const failed: { id: string; name: string; why: string }[] = [];
      for (const r of slice) {
        // The conversation Gmail put it in comes back with the send itself —
        // a reply finds the right record through this, and it costs nothing.
        const box: { threadId?: string } = {};
        try {
          const id = atts.length
            ? await gmailSendMixed(token, headerFrom, r.to, r.subject, r.html, atts, undefined, undefined, fromName, replyTo, box)
            : await gmailSend(token, headerFrom, r.to, r.subject, r.html, undefined, undefined, fromName, undefined, null, replyTo, box);
          sent++;
          const thread = box.threadId || null;
          await admin.from("hrms_communication").insert({
            employee_id: r.id, channel: "email", direction: "out", to_address: r.to,
            mass_id: massId, thread_id: thread,
            subject: r.subject, body: r.html, template_key: b.template_key || null,
            status: "sent", sent_by: `${u.email} · from ${headerFrom}${headerFrom !== fromEmail ? ` (through ${fromEmail})` : ""}`, sent_at: new Date().toISOString(),
            external_id: id, meta: { mass: true, attachments: atts.map((a) => a.name), reply_to: replyTo, through: fromEmail },
          }).then(() => null, (e2) => swallow("hrms/mass-mail ledger", e2));
        } catch (e) {
          let why = e instanceof Error ? e.message : String(e);
          if (headerFrom !== fromEmail && /from|alias|permission|invalid/i.test(why))
            why = `Gmail would not send as ${headerFrom} through ${fromEmail} — add it as a "Send mail as" address in that Gmail's settings first. (${why})`;
          failed.push({ id: r.id, name: r.name, why: why.slice(0, 200) });
          await admin.from("hrms_communication").insert({
            employee_id: r.id, channel: "email", direction: "out", to_address: r.to,
            subject: r.subject, body: r.html, status: "failed", error: why.slice(0, 400),
            mass_id: massId,
            sent_by: `${u.email} · from ${headerFrom}`, sent_at: new Date().toISOString(), meta: { mass: true, through: fromEmail },
          }).then(() => null, (e2) => swallow("hrms/mass-mail ledger", e2));
        }
      }
      const done = offset + slice.length;
      if (massId && done >= sendable.length) {
        // Counted from the ledger, not from this call — a send of 131 comes
        // in four batches and only the ledger knows all four.
        let tot = { sent, failed: failed.length, of: sendable.length };
        try {
          const { data: cs } = await admin.from("hrms_communication").select("status").eq("mass_id", massId).eq("direction", "out");
          const rows2 = (cs || []) as { status: string }[];
          tot = { sent: rows2.filter((r) => r.status !== "failed").length, failed: rows2.filter((r) => r.status === "failed").length, of: sendable.length };
        } catch (e2) { swallow("hrms/mass-mail counts", e2); }
        await admin.from("hrms_mass_mail").update({ counts: tot, updated_at: new Date().toISOString() }).eq("id", massId)
          .then(() => null, (e2) => swallow("hrms/mass-mail counts", e2));
      }
      return NextResponse.json({ ok: true, sent, failed, done, of: sendable.length, more: done < sendable.length, campaign_id: massId });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
