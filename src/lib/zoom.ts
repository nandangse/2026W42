import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ZOOM → GENIE (Dr Raghu, 4 Sep 2026).
 *
 * Zoom tells Genie; Genie does not poll. A Server-to-Server OAuth app minted
 * from the credentials in CRM → Integrations, webhooks at /api/zoom/webhook
 * signed with the app's Secret Token, and an hourly sweep for anything a
 * webhook missed. Every meeting becomes a row in `meeting` AND an
 * interaction of kind "Zoom Meeting" -- because the deal tag, the timeline
 * and the Warmer/Colder pulse all live on interactions already, and a
 * meeting is one.
 *
 * WHO WAS IN THE ROOM decides the deal. Attendee emails are matched to CRM
 * people, people to their company, and the company to its one open
 * opportunity when it has exactly one. Where Genie cannot tell, the meeting
 * stays NEW for a person to tag -- a guess written into a deal's timeline
 * is worse than a blank, because it gets believed.
 */
export interface ZoomCfg { account_id: string; client_id: string; client_secret: string; secret_token?: string }
type Doc = Record<string, unknown>;
const API = "https://api.zoom.us/v2";

export async function zoomConfig(crm: SupabaseClient): Promise<ZoomCfg | null> {
  const { data } = await crm.from("integration_setting").select("config").eq("key", "zoom").maybeSingle();
  const c = (data?.config || {}) as Record<string, string>;
  if (!c.account_id || !c.client_id || !c.client_secret) return null;
  return { account_id: c.account_id.trim(), client_id: c.client_id.trim(), client_secret: c.client_secret.trim(), secret_token: (c.secret_token || "").trim() || undefined };
}

/** Access tokens last an hour; one per request would be a token per webhook. */
let cached: { key: string; token: string; expires: number } | null = null;
export async function zoomToken(cfg: ZoomCfg): Promise<string> {
  if (cached && cached.key === cfg.client_id && cached.expires > Date.now() + 60_000) return cached.token;
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.account_id)}`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString("base64")}` },
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; reason?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Zoom refused the credentials: ${j.reason || j.error || r.status}`);
  cached = { key: cfg.client_id, token: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return j.access_token;
}

export async function zoomGet(cfg: ZoomCfg, path: string): Promise<Doc | null> {
  const token = await zoomToken(cfg);
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Zoom ${path} answered ${r.status}`);
  return (await r.json()) as Doc;
}

/** A meeting UUID with / or // in it must be double-encoded on the path — Zoom's rule. */
export const uuidPath = (uuid: string) => (/^\//.test(uuid) || uuid.includes("//")) ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid);

/** The webhook's proof: v0=HMAC_SHA256(secret, "v0:{timestamp}:{body}"). */
export function verifySignature(secret: string, ts: string, body: string, given: string): boolean {
  const want = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(given || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Zoom's URL validation: hand back the plainToken and its HMAC. */
export const validationReply = (secret: string, plain: string) =>
  ({ plainToken: plain, encryptedToken: createHmac("sha256", secret).update(plain).digest("hex") });

const S = (v: unknown) => (v == null ? "" : String(v));

/**
 * Bring one meeting occurrence into Genie, whole. Idempotent on zoom_uuid:
 * the webhook that fires three times, or the sweep that finds it again,
 * lands on the same row. Returns the meeting id.
 */
export async function ingestMeeting(crm: SupabaseClient, cfg: ZoomCfg, obj: Doc, opts: { source: string }): Promise<string | null> {
  const uuid = S(obj.uuid || obj.meeting_uuid);
  const mid = S(obj.id || obj.meeting_id);
  if (!uuid && !mid) return null;

  // 1. the shell
  const row: Doc = {
    zoom_meeting_id: mid || null,
    zoom_uuid: uuid || null,
    topic: S(obj.topic || obj.summary_title) || null,
    host_email: S(obj.host_email) || null,
    started_at: obj.start_time ? new Date(S(obj.start_time)).toISOString() : null,
    ended_at: obj.end_time ? new Date(S(obj.end_time)).toISOString() : null,
    duration_min: obj.duration != null ? Number(obj.duration) || null : null,
    updated_at: new Date().toISOString(),
  };

  // 2. who was in the room -- from Zoom's own report
  let attendees: Doc[] = [];
  try {
    if (uuid) {
      const p = await zoomGet(cfg, `/past_meetings/${uuidPath(uuid)}/participants?page_size=300`);
      const seen = new Map<string, Doc>();
      for (const x of ((p?.participants ?? []) as Doc[])) {
        const email = S(x.user_email || x.email).toLowerCase();
        const key = email || S(x.name);
        const cur = seen.get(key) ?? { name: S(x.name), email: email || null, join: S(x.join_time) || null, leave: null };
        cur.leave = S(x.leave_time) || cur.leave;
        seen.set(key, cur);
      }
      attendees = [...seen.values()];
    }
  } catch { /* the meeting still lands without its roll-call */ }

  // 3. the deal -- attendee emails → people → company → its one open opportunity
  let company_id: string | null = null, opportunity_id: string | null = null;
  const emails = attendees.map((a) => S(a.email)).filter((e) => e && !/@nandan\.co\.in$/i.test(e));
  if (emails.length) {
    const { data: people } = await crm.from("person").select("id, primary_email, company_id").in("primary_email", emails);
    for (const a of attendees) { const p = (people ?? []).find((x) => S(x.primary_email).toLowerCase() === S(a.email)); if (p) a.person_id = p.id; }
    const companies = (people ?? []).map((p) => S(p.company_id)).filter(Boolean);
    const top = [...new Set(companies)].sort((a, b) => companies.filter((c) => c === b).length - companies.filter((c) => c === a).length)[0];
    if (top) {
      company_id = top;
      const { data: opps } = await crm.from("opportunity").select("id").eq("company_id", top).is("deleted_at", null).limit(3);
      if ((opps ?? []).length === 1) opportunity_id = S(opps![0].id);
    }
  }
  row.attendees = attendees;
  row.attendee_names = attendees.map((a) => S(a.name)).filter(Boolean).join(", ") || null;

  // 4. the host, as a CRM profile
  if (row.host_email) {
    const { data: prof } = await crm.from("profile").select("id").eq("email", S(row.host_email).toLowerCase()).maybeSingle();
    if (prof) row.host_id = prof.id;
  }

  // 5. upsert the meeting -- existing tags are never overwritten by a re-run
  const { data: existing } = uuid
    ? await crm.from("meeting").select("id, company_id, opportunity_id, interaction_id, status, raw").eq("zoom_uuid", uuid).maybeSingle()
    : { data: null };
  if (existing) {
    delete row.zoom_uuid;
    if (existing.company_id) delete row.company_id; else if (company_id) row.company_id = company_id;
    if (existing.opportunity_id) delete row.opportunity_id; else if (opportunity_id) row.opportunity_id = opportunity_id;
    row.raw = { ...((existing.raw as Doc) || {}), [opts.source]: obj };
    const { error } = await crm.from("meeting").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    await syncInteraction(crm, S(existing.id));
    return S(existing.id);
  }
  row.company_id = company_id; row.opportunity_id = opportunity_id;
  row.status = company_id ? "tagged" : "new";
  row.raw = { [opts.source]: obj };
  const { data: made, error } = await crm.from("meeting").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  await syncInteraction(crm, S(made.id));
  return S(made.id);
}

/** Zoom's AI Companion summary onto the row. */
export async function attachSummary(crm: SupabaseClient, uuid: string, mid: string, sum: Doc): Promise<void> {
  const parts: string[] = [];
  if (sum.summary_overview) parts.push(S(sum.summary_overview));
  for (const d of ((sum.summary_details ?? []) as Doc[])) parts.push(`${S(d.label)}\n${S(d.summary)}`);
  const next = ((sum.next_steps ?? []) as unknown[]).map((x) => S(x)).filter(Boolean);
  const patch: Doc = { summary: parts.join("\n\n") || null, next_steps: next, updated_at: new Date().toISOString() };
  if (sum.summary_title && !sum.topic) patch.topic = S(sum.summary_title);
  let q = crm.from("meeting").update(patch);
  q = uuid ? q.eq("zoom_uuid", uuid) : q.eq("zoom_meeting_id", mid);
  const { data } = await q.select("id");
  for (const r of data ?? []) await syncInteraction(crm, S(r.id));
}

/** Zoom's cloud recording onto the row: the play link and the download link. */
export async function attachRecording(crm: SupabaseClient, uuid: string, mid: string, rec: Doc): Promise<void> {
  const files = ((rec.recording_files ?? []) as Doc[]);
  const video = files.find((f) => S(f.file_type).toUpperCase() === "MP4") ?? files[0];
  const patch: Doc = {
    recording_url: S(rec.share_url || video?.play_url) || null,
    recording_download: S(video?.download_url) || null,
    updated_at: new Date().toISOString(),
  };
  let q = crm.from("meeting").update(patch);
  q = uuid ? q.eq("zoom_uuid", uuid) : q.eq("zoom_meeting_id", mid);
  await q;
}

/**
 * THE MEETING AS AN INTERACTION. One row per meeting, kind "Zoom Meeting",
 * carrying the deal links -- so it sits on the company's and the
 * opportunity's timeline beside every call and visit, and the Warmer/Colder
 * result can be set on it like any other.
 */
export async function syncInteraction(crm: SupabaseClient, meetingId: string): Promise<void> {
  const { data: m } = await crm.from("meeting").select("*").eq("id", meetingId).maybeSingle();
  if (!m) return;
  const remark = [S(m.topic), S(m.summary).split("\n")[0]].filter(Boolean).join(" — ").slice(0, 2000) || "Zoom meeting";
  const body: Doc = {
    kind: "Zoom Meeting",
    happened_at: m.started_at || m.created_at,
    by_id: m.host_id || null,
    person_name: S(m.attendee_names).slice(0, 400) || null,
    remark,
    company_id: m.company_id || null,
    opportunity_id: m.opportunity_id || null,
    quotation_id: m.quotation_id || null,
    updated_at: new Date().toISOString(),
  };
  if (m.interaction_id) { await crm.from("interaction").update(body).eq("id", m.interaction_id); return; }
  const { data: made } = await crm.from("interaction").insert({ ...body, created_by: m.host_id || null }).select("id").single();
  if (made) await crm.from("meeting").update({ interaction_id: made.id }).eq("id", meetingId);
}
