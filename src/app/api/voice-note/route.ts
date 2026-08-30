import { NextResponse } from "next/server";
import { assertAiOn } from "@/lib/ai-gate";
import { requireReader, requireTasker, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";

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
    await assertAiOn();
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

        /**
         * WHO said it, not just what was said.
         *
         * Three unattributed accounts read as one confused voice. With the
         * initials on each, a disagreement between the shop and purchasing is
         * visible as a disagreement rather than as Genie contradicting itself.
         */
        const initials = (v: unknown) => {
          const raw = String(v || "").trim();
          if (!raw) return "??";
          const local = raw.split("@")[0];
          const parts = local.split(/[._\s-]+/).filter(Boolean);
          return (parts.length > 1
            ? parts.map((x) => x[0]).join("")
            : local.slice(0, 3)
          ).toUpperCase().slice(0, 3);
        };
        const said = (recent || [])
          .reverse()
          .map((n) => `[${initials(n.by)} · ${new Date(String(n.at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} IST] ${n.transcript || n.summary}`)
          .join("\n");

        /**
         * The job itself, so the read is about THIS job and not just about
         * three sentences somebody spoke.
         *
         * Without it the summary can only paraphrase the notes, which is what
         * made the first version read like a transcript with the verbs
         * changed. A delivery date eleven days gone, 90% kitted and 10% built,
         * an escalation already on the record — that is the context somebody
         * running the works brings to the same three sentences, and it is what
         * turns a paraphrase into a read.
         */
        const { data: J } = await admin
          .from("jobs")
          .select("tag, cust, fam, tdd, val, tpv, kit, pct, stat, escalation, own, amt_needed, pay_on_delivery")
          .eq("id", jobId)
          .maybeSingle();
        const { data: openT } = await admin
          .from("manual_tasks")
          .select("title, who, due, esc")
          .eq("job_id", jobId)
          .eq("done", false)
          .limit(12);
        const cr = (n: unknown) => `${((Number(n) || 0) / 1e7).toFixed(2)} Cr`;
        const days = J?.tdd
          ? Math.round((new Date(J.tdd + "T00:00:00Z").getTime() - new Date(today() + "T00:00:00Z").getTime()) / 864e5)
          : null;
        const context = J
          ? [
              `JOB ${jobId.slice(-4)} — ${J.tag}`,
              `Customer ${J.cust} · ${J.fam}`,
              `Target delivery ${J.tdd || "none set"}${days == null ? "" : days < 0 ? ` — ${Math.abs(days)} DAYS OVERDUE` : ` — ${days} days away`}`,
              `Kitted ${J.kit || 0}% · built ${J.pct || 0}% · ERP status "${J.stat || "—"}"`,
              `Value ${cr(J.val)} · throughput ${cr(J.tpv)}`,
              J.escalation ? `Project escalation on record: ${String(J.escalation).slice(0, 400)}` : "",
              J.amt_needed ? `Amount needed next month: ${cr(J.amt_needed)}` : "",
              `Planning owner: ${J.own || "unassigned"}`,
              (openT || []).length
                ? `Open tasks:\n${(openT || []).map((t) => `  - ${t.title} (${t.who || "unassigned"}${t.due ? `, due ${t.due}` : ""}${t.esc && t.esc !== "None" ? `, ${t.esc}` : ""})`).join("\n")}`
                : "No open tasks on record.",
            ].filter(Boolean).join("\n")
          : "";
        if (said.trim()) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 700,
              system:
                "You are Genie, writing the standing read on a job at Nandan GSE — the way Dr Raghu Nandan would put it to the planning team.\n\n" +
                "You are given the JOB as it stands and the shop-floor voice notes, each tagged with the speaker's initials.\n\n" +
                "Write 3 to 5 sentences:\n" +
                "1. WHERE IT STANDS — the date, how far in, and whether that adds up. Lead with the thing that decides the delivery.\n" +
                "2. WHAT THE FLOOR IS SAYING — attribute it. 'MT says the fasteners are stuck on payment; PS has not confirmed the drawings.' Name the initials.\n" +
                "3. WHAT IT MEANS — where the notes and the board disagree, say so. A job 90% kitted and 10% built with nobody reporting a blocker is itself the finding.\n" +
                "4. WHAT IS NEEDED, from whom, by when — only where somebody actually said it or the board plainly shows it.\n\n" +
                "Rules that matter more than being helpful:\n" +
                "- Invent NOTHING. No date, quantity or name that is not in front of you.\n" +
                "- Never let a missing value read as zero. A job with no target date is undated, not overdue.\n" +
                "- The latest note wins where notes disagree — say what changed.\n" +
                "- Plain English, short sentences, no management register. No 'the speaker states'. Never open with 'This job'.",
              messages: [{ role: "user", content: `${context}\n\nSHOP-FLOOR NOTES, oldest first:\n${said}` }],
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

    /**
     * What needs doing, heard in what was just said.
     *
     * PROPOSED, never created. A task list is only worth opening if everything
     * on it was put there deliberately; things appearing in it that nobody
     * asked for is how people stop reading the list within a fortnight.
     *
     * Told to return nothing when nothing was asked for. Most notes are a
     * report, not a request, and a model that must find a task will invent
     * one -- which is worse than missing a real one, because the invented ones
     * are what teach people to ignore the whole feature.
     */
    let proposed = 0;
    if (key && transcript.length > 30) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 600,
            system:
              "You read shop-floor voice notes at Nandan GSE and pull out what somebody now has to DO.\n\n" +
              "Return JSON only: {\"tasks\":[{\"title\":\"...\",\"detail\":\"...\",\"cat\":\"Material|Production|Design|Projects|Quality\",\"due\":\"YYYY-MM-DD or null\"}]}\n\n" +
              "Rules:\n" +
              "- ONE action per task. 'Chase the gearbox and call Monopol' is two tasks.\n" +
              "- Return an EMPTY list when the note is only a report. Most are. Never invent work to fill the list.\n" +
              "- The title is the action, in the speaker's own words where they work: 'Chase Monopol for the fastener payment'.\n" +
              "- Only a date that was actually said. Otherwise null.\n" +
              `- Today is ${today()}.`,
            messages: [{ role: "user", content: transcript.slice(0, 4000) }],
          }),
        });
        const jr = await r.json();
        const txt = (jr.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
        const cut = txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
        const parsed = JSON.parse(cut) as { tasks?: { title?: string; detail?: string; cat?: string; due?: string | null }[] };
        const rows = (parsed.tasks || [])
          .filter((t) => String(t.title || "").trim().length >= 3)
          .slice(0, 5)
          .map((t) => ({
            job_id: jobId,
            source: "voice",
            title: String(t.title).trim().slice(0, 200),
            detail: String(t.detail || "").trim().slice(0, 600),
            cat: String(t.cat || "Production").slice(0, 40),
            due: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due || "")) ? t.due : null,
          }));
        if (rows.length) {
          const { error: pe } = await admin.from("task_proposal").insert(rows);
          if (!pe) proposed = rows.length;
        }
      } catch { /* a note is worth keeping even when nothing could be pulled from it */ }
    }

    return NextResponse.json({ ok: true, summary, floor, proposed });
  } catch (e) {
    return errJson(e);
  }
}
