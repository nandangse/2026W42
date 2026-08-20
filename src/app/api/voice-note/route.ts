import { NextResponse } from "next/server";
import { requireReader, requireTasker, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * How many notes Genie reads to write the summary, and how many the page shows
 * before it offers the rest.
 *
 * NOTHING IS DELETED. An earlier version dropped everything past the newest
 * three, which is wrong for a record of what was said about a customer's job:
 * the whole point of keeping the audio is that somebody can go back to it.
 * They are all kept and all auditable; three is simply what is in front of you.
 */
const RECENT = 3;
const BUCKET = "voice-notes";
/** Signed links, not public URLs — these are people talking about customers. */
const LINK_TTL = 60 * 60;

/**
 * GET /api/voice-note?job_id=… — the notes on a job, newest first.
 * Omit job_id for every job's notes, which is what the On Floor table reads.
 */
export async function GET(req: Request) {
  try {
    await requireReader();
    const admin = adminClient();
    const jobId = new URL(req.url).searchParams.get("job_id");

    let q = admin
      .from("job_voice_note")
      .select("id, job_id, audio_path, seconds, transcript, summary, by, at")
      .order("at", { ascending: false });
    if (jobId) q = q.eq("job_id", jobId);

    const { data, error } = await q.limit(600);
    if (error) {
      if (/job_voice_note|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, notes: [] });
      throw new Error(error.message);
    }

    // Signed links, minted per read. A stored URL would either expire in the
    // row or never expire at all; neither is what a private bucket is for.
    const notes = await Promise.all(
      (data || []).map(async (n) => {
        let url: string | null = null;
        if (n.audio_path) {
          const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(n.audio_path, LINK_TTL);
          url = s?.signedUrl ?? null;
        }
        return { ...n, url };
      }),
    );
    return NextResponse.json({ installed: true, notes });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/voice-note (multipart) — file?, job_id, transcript?, seconds?
 *
 * The audio is optional and so is the transcript, but not both. A note with
 * neither is an empty row; a note with only text is still worth keeping (the
 * browser heard it and the microphone did not save), and a note with only
 * audio is worth keeping too (dictation was off, somebody can still listen).
 */
export async function POST(req: Request) {
  try {
    const user = await requireTasker();
    const admin = adminClient();
    const form = await req.formData();
    const jobId = String(form.get("job_id") || "");
    if (!jobId) throw new HttpError(400, "job_id required");

    const transcript = String(form.get("transcript") || "").trim();
    const seconds = Number(form.get("seconds") || 0) || null;
    const file = form.get("file");
    const hasAudio = file instanceof File && file.size > 0;
    if (!hasAudio && !transcript) throw new HttpError(400, "Nothing was recorded.");
    if (hasAudio && file.size > 8 * 1024 * 1024)
      throw new HttpError(413, "That recording is too long — keep a note under about two minutes.");

    let audio_path: string | null = null;
    if (hasAudio) {
      const ext = (file.type.split("/")[1] || "webm").split(";")[0];
      audio_path = `${jobId}/${Date.now()}.${ext}`;
      const { error: ue } = await admin.storage
        .from(BUCKET)
        .upload(audio_path, await file.arrayBuffer(), { contentType: file.type || "audio/webm" });
      if (ue) {
        if (/bucket|not found/i.test(ue.message))
          throw new HttpError(503, "Run migration 0040 first — the voice-notes bucket does not exist yet.");
        throw new Error(ue.message);
      }
    }

    /**
     * One line somebody can read in the table without playing anything.
     *
     * Falls back to the transcript's own first sentence if Genie is not
     * available. A missing summary must never mean a missing note.
     */
    let summary = transcript.slice(0, 160);
    const key = process.env.ANTHROPIC_API_KEY;
    if (key && transcript.length > 60) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 120,
            system:
              "Summarise a shop-floor voice note in ONE line, under 140 characters. " +
              "Keep what was actually said — the part, the date, the person, the blocker. " +
              "No preamble, no 'the speaker says'. If it names a problem, lead with the problem.",
            messages: [{ role: "user", content: transcript.slice(0, 4000) }],
          }),
        });
        const j = await r.json();
        const t = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
        if (t) summary = t.slice(0, 200);
      } catch { /* the note matters more than its summary */ }
    }

    const { error } = await admin.from("job_voice_note").insert({
      job_id: jobId, audio_path, seconds, transcript, summary, by: user.email,
    });
    if (error) {
      if (/job_voice_note|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0040 first — voice notes have nowhere to save yet.");
      throw new Error(error.message);
    }

    /**
     * Genie's read of the last three, written now rather than on every page
     * load — one call when something changes, instead of one per job per
     * reader per visit.
     *
     * Three separate accounts of one job is not a position. This is.
     */
    let floor: string | null = null;
    if (key) {
      try {
        const { data: recent } = await admin
          .from("job_voice_note")
          .select("transcript, summary, by, at")
          .eq("job_id", jobId)
          .order("at", { ascending: false })
          .limit(RECENT);
        const said = (recent || [])
          .reverse()
          .map((n, i) => `(${i + 1}) ${String(n.at).slice(0, 16).replace("T", " ")} — ${n.transcript || n.summary}`)
          .join("\n");
        if (said.trim()) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 300,
              system:
                "You are Genie, reading voice notes left at the machine on a shop floor at Nandan GSE.\n\n" +
                "Write the CURRENT POSITION on this job in two or three sentences, from the notes below in time order.\n\n" +
                "- The latest note wins where they disagree — say what changed rather than reporting both.\n" +
                "- Lead with the blocker if there is one, and name what is needed and from whom.\n" +
                "- Only what was said. No advice, no encouragement, nothing invented.\n" +
                "- Plain English, short sentences. No 'the speaker states'.",
              messages: [{ role: "user", content: said }],
            }),
          });
          const jr = await r.json();
          const t = (jr.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
          if (t) floor = t.slice(0, 1200);
        }
      } catch { /* the notes matter more than the paragraph over them */ }
    }
    if (floor) {
      // A missing column means 0043 has not run. The notes are already saved.
      await admin.from("jobs")
        .update({ floor_summary: floor, floor_summary_at: new Date().toISOString() })
        .eq("id", jobId)
        .then(undefined, () => undefined);
    }

    return NextResponse.json({ ok: true, summary, floor });
  } catch (e) {
    return errJson(e);
  }
}
