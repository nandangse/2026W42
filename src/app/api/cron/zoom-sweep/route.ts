import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { zoomConfig, zoomGet, ingestMeeting, attachRecording, attachSummary, uuidPath } from "@/lib/zoom";

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
    return NextResponse.json({ ok: true, users: users.length, seen, made, filled });
  } catch (e) {
    return errJson(e);
  }
}
