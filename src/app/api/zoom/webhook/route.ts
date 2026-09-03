import { NextResponse } from "next/server";
import { crmDb, crmConfigured } from "@/crm/db";
import { zoomConfig, verifySignature, validationReply, ingestMeeting, attachSummary, attachRecording, zoomGet, uuidPath } from "@/lib/zoom";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/zoom/webhook — Zoom's door into Genie (Dr Raghu, 4 Sep 2026).
 *
 * No login: the caller is Zoom, and the proof is the signature on every
 * call, made with the Secret Token saved in CRM → Integrations. A call that
 * does not verify is answered 401 and dropped -- never processed "just in
 * case". The first call Zoom ever makes is a URL validation, answered with
 * the token's HMAC; that is what makes the subscription go green.
 *
 * Three events matter, and each is idempotent on the meeting's uuid:
 *   meeting.ended              → the meeting, its people, the deal it fits
 *   recording.completed        → the recording links onto that row
 *   meeting.summary_completed  → Zoom's AI Companion summary onto that row
 * Anything else is acknowledged and ignored.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "not json" }, { status: 400 }); }
  if (!crmConfigured()) return NextResponse.json({ error: "CRM not configured" }, { status: 503 });
  const crm = crmDb();
  const cfg = await zoomConfig(crm);
  const secret = cfg?.secret_token;
  if (!secret) return NextResponse.json({ error: "Zoom is not set up in CRM → Integrations (secret_token missing)" }, { status: 503 });

  const event = String(body.event || "");
  const payload = (body.payload || {}) as Record<string, unknown>;

  // Zoom's handshake, before anything is signed
  if (event === "endpoint.url_validation") {
    const plain = String(payload.plainToken || "");
    return NextResponse.json(validationReply(secret, plain));
  }

  const ts = req.headers.get("x-zm-request-timestamp") || "";
  const sig = req.headers.get("x-zm-signature") || "";
  if (!verifySignature(secret, ts, raw, sig)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  // a replay older than five minutes is refused too
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return NextResponse.json({ error: "stale" }, { status: 401 });

  const obj = (payload.object || {}) as Record<string, unknown>;
  const uuid = String(obj.uuid || obj.meeting_uuid || "");
  const mid = String(obj.id || obj.meeting_id || "");
  try {
    if (!cfg) throw new Error("credentials incomplete");
    if (event === "meeting.ended") {
      await ingestMeeting(crm, cfg, obj, { source: "meeting.ended" });
    } else if (event === "recording.completed") {
      // the meeting may not have been seen yet (webhooks arrive in any order)
      await ingestMeeting(crm, cfg, obj, { source: "recording.completed" });
      await attachRecording(crm, uuid, mid, obj);
    } else if (event === "meeting.summary_completed") {
      await ingestMeeting(crm, cfg, { ...obj, uuid, id: mid }, { source: "meeting.summary_completed" });
      // the event carries a stub; the full summary is a read away
      const full = mid ? await zoomGet(cfg, `/meetings/${uuid ? uuidPath(uuid) : mid}/meeting_summary`).catch(() => null) : null;
      await attachSummary(crm, uuid, mid, full ?? obj);
    }
    return NextResponse.json({ ok: true, event });
  } catch (e) {
    // Zoom retries on non-2xx; a broken credential should not be retried
    // every minute, so the fault is logged and 200 returned.
    console.error("zoom webhook", event, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, event, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, door: "Zoom → Genie. POST only; Zoom signs every call." });
}
