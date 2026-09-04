import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { zoomConfig, zoomGet, ingestMeeting, attachRecording, attachSummary, uuidPath } from "@/lib/zoom";
import { beat } from "@/lib/cron-beat";
import { driveConfig, uploadToFolder } from "@/lib/drive";
import { zoomToken } from "@/lib/zoom";

/**
 * THE RECORDING, KEPT SAFELY (Dr Raghu, 4 Sep 2026: "the zoom recording
 * link is to be taken, the file downloaded and then uploaded into the
 * Uploaded files as Zoom meetings ... inside this save it to keep it
 * safely"). His folder; a "Zoom meetings" subfolder inside it; one MP4 per
 * meeting, named by date and topic. Two a run, under 300 MB each -- a
 * function has a memory ceiling, and a recording that will not fit is
 * reported rather than half-uploaded.
 */
const ZOOM_DRIVE_FOLDER = "1_Ozi1VkCmi51Yraywksq7RagbRLWOyuA";
const MAX_BYTES = 300 * 1024 * 1024;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/zoom-sweep — hourly, from vercel.json. The webhook is the
 * front door; this is the walk round the back for anything it missed: a
 * deploy in progress when Zoom called, a signature that did not verify, a
 * summary that finished after its meeting was filed. Every user's meetings
 * of the last two days are read from Zoom's report and any not yet in
 * Genie are brought in; rows missing a recording or summary are filled.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled || !u.isOwner) throw new HttpError(401, "The hourly cron, or Raghu.");
    }
    await beat("zoom-sweep", "fired", { fromCron });
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured." });
    const crm = crmDb();
    const cfg = await zoomConfig(crm);
    if (!cfg) return NextResponse.json({ ok: false, note: "Zoom is not set up in CRM → Integrations." });

    const to = new Date(), from = new Date(Date.now() - 2 * 86400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const users = ((await zoomGet(cfg, "/users?page_size=300&status=active"))?.users ?? []) as Record<string, unknown>[];
    let seen = 0, made = 0, filled = 0;
    for (const u of users) {
      const rep = await zoomGet(cfg, `/report/users/${encodeURIComponent(String(u.id))}/meetings?from=${d(from)}&to=${d(to)}&page_size=300&type=past`).catch(() => null);
      for (const m of ((rep?.meetings ?? []) as Record<string, unknown>[])) {
        seen++;
        const uuid = String(m.uuid || "");
        const { data: have } = await crm.from("meeting").select("id, recording_url, summary").eq("zoom_uuid", uuid).maybeSingle();
        if (!have) {
          await ingestMeeting(crm, cfg, { ...m, host_email: m.user_email ?? m.host_email }, { source: "sweep" });
          made++;
        }
        const mid = String(m.id || "");
        if (!have?.recording_url) {
          const rec = await zoomGet(cfg, `/meetings/${uuidPath(uuid)}/recordings`).catch(() => null);
          if (rec) { await attachRecording(crm, uuid, mid, rec); filled++; }
        }
        if (!have?.summary) {
          const sum = await zoomGet(cfg, `/meetings/${uuidPath(uuid)}/meeting_summary`).catch(() => null);
          if (sum && (sum.summary_overview || sum.summary_details)) { await attachSummary(crm, uuid, mid, sum); filled++; }
        }
      }
    }
    // the recordings not yet in Drive -- two a run
    let archived = 0; const archiveNotes: string[] = [];
    const dcfg = driveConfig();
    if (dcfg) {
      const { data: todo } = await crm.from("meeting").select("id, topic, started_at, recording_download")
        .not("recording_download", "is", null).is("recording_drive_url", null).order("started_at", { ascending: false }).limit(2);
      for (const m of todo ?? []) {
        try {
          const token = await zoomToken(cfg);
          const r = await fetch(`${m.recording_download}${String(m.recording_download).includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { redirect: "follow", signal: AbortSignal.timeout(240000) });
          if (!r.ok) throw new Error(`Zoom would not hand over the file (${r.status})`);
          const len = Number(r.headers.get("content-length") || 0);
          if (len > MAX_BYTES) throw new Error(`recording is ${(len / 1048576).toFixed(0)} MB — over the 300 MB ceiling`);
          const bytes = await r.arrayBuffer();
          if (bytes.byteLength > MAX_BYTES) throw new Error(`recording is ${(bytes.byteLength / 1048576).toFixed(0)} MB — over the 300 MB ceiling`);
          const day = String(m.started_at || "").slice(0, 10) || "undated";
          const name = `${day} ${String(m.topic || "Zoom meeting").replace(/[^A-Za-z0-9 ._-]+/g, " ").trim().slice(0, 80)}.mp4`;
          const up = await uploadToFolder(dcfg, ZOOM_DRIVE_FOLDER, "Zoom meetings", bytes, name, "video/mp4");
          await crm.from("meeting").update({ recording_drive_url: up.link || `https://drive.google.com/file/d/${up.id}/view`, updated_at: new Date().toISOString() }).eq("id", m.id);
          archived++;
        } catch (e) { archiveNotes.push(`${m.topic}: ${e instanceof Error ? e.message : e}`); }
      }
    }
    await beat("zoom-sweep", "done", { users: users.length, seen, made, filled, archived, archiveNotes });
    return NextResponse.json({ ok: true, users: users.length, seen, made, filled, archived, archiveNotes });
  } catch (e) {
    return errJson(e);
  }
}
