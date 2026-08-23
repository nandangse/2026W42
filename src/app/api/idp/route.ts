import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, splitMulti, FIELD_GROUPS, fieldSpec } from "@/lib/hrms";
import { salaryTable, type SalaryRow } from "@/lib/salary";

/** sheet header -> field key, for reading a pay override by its header. */
const ALL_FIELDS_BY_HEADER = new Map(
  FIELD_GROUPS.flatMap((g) => g.fields)
    .filter((f) => f.sheetHeader)
    .map((f) => [f.sheetHeader as string, f.key]),
);
import { CONSENT_TEXT, WATCHED_TEXT, isComplete, IDP_RECORD_GROUPS, IDP_RECORD_HIDE } from "@/lib/idp";

export const dynamic = "force-dynamic";
/** Tidying ten minutes of speech takes longer than a default timeout allows. */
export const maxDuration = 60;

const CYCLE = "2026-27";
const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;

/**
 * The IDP is the ONE HRIS-adjacent thing everybody can reach, and the gate is
 * therefore different: requireUser, not requireHrms. Every query below is
 * scoped to the caller's own email — there is no parameter that could name
 * somebody else, so no request can be made that returns another person's IDP.
 */
async function mine(email: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("hrms_idp")
    .select("*")
    .eq("person_email", email)
    .eq("cycle", CYCLE)
    .order("started_at", { ascending: false })
    .limit(5);
  return data || [];
}

/** Their row on the employee master, and what their role expects of them. */
async function whoAreThey(email: string) {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  try {
    const { data: emps } = await admin
      .from(T.employees).select("id, name, designation, department").ilike("email", email).limit(1);
    let emp: { id: string; name: string; designation: string | null; department: string | null } | null =
      ((emps || [])[0] as { id: string; name: string; designation: string | null; department: string | null } | undefined) ?? null;
    if (!emp) {
      // they may be linked by the Genie user field on the record instead
      const { data: link } = await admin
        .from(T.edits).select("employee_id").eq("field", "user_email").ilike("value", email).limit(1);
      if (link?.length) {
        const { data: e2 } = await admin
          .from(T.employees).select("id, name, designation, department").eq("id", link[0].employee_id).maybeSingle();
        emp = (e2 as typeof emp) ?? null;
      }
    }
    if (!emp) return { employee: null, role: null, roleSummary: null, roleDocs: [], isLeader: false };

    const { data: roleEdit } = await admin
      .from(T.edits).select("value").eq("employee_id", emp.id).eq("field", "role").maybeSingle();
    /**
     * SEVERAL ROLES. Somebody who is a supervisor AND the safety officer is
     * accountable for both, so the IDP briefs them on both — every job
     * description, every deliverable, every metric, and every recording. One
     * role's worth of expectation would be half a brief.
     */
    const roleNames = splitMulti(roleEdit?.value as string | null);
    if (!roleNames.length && emp.designation) roleNames.push(String(emp.designation));
    const roleName = roleNames[0] || null;
    let roleSummary: string | null = null;
    /**
     * The role AS WRITTEN, and the note AS SPOKEN — both put in front of the
     * person before they answer a word (Dr Raghu, 23 Aug 2026). It is read
     * live rather than copied, so somebody filling this in today sees the
     * definition as it stands today; what is FROZEN onto their record is the
     * summary they were answering against.
     */
    const roleDocs: Record<string, unknown>[] = [];
    for (const name of roleNames) {
      const { data: r } = await admin
        .from("hrms_role")
        .select("role, department, grade, reports_to, location, job_description, deliverable, metric, stage, summary, transcript, voice_path, voice_seconds")
        .eq("role", name).maybeSingle();
      if (!r) continue;
      let url: string | null = null;
      if (r.voice_path) {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(String(r.voice_path), LINK_TTL);
        url = sgn?.signedUrl ?? null;
      }
      roleDocs.push({ ...r, url });
    }
    // what is frozen onto the record: every role's expectation, together
    roleSummary =
      roleDocs.map((d) => (roleDocs.length > 1 ? `${d.role}:\n${d.summary || "—"}` : String(d.summary || ""))) 
        .filter((x) => x && !x.endsWith("—")).join("\n\n") || null;
    // the Leaders Council, from the master's own "In LC" column
    const { data: full } = await admin.from(T.employees).select("extra").eq("id", emp.id).maybeSingle();
    const lc = String(((full?.extra || {}) as Record<string, string>)["In LC"] || "").toLowerCase();
    const isLeader = lc.includes("leader") || lc === "yes" || lc === "y";
    return { employee: emp, role: roleNames.join(" · ") || roleName, roleSummary, roleDocs, isLeader };
  } catch {
    return { employee: null, role: null, roleSummary: null, roleDocs: [], isLeader: false };
  }
}

// GET /api/idp — am I part-way through one, and have I finished one?
export async function GET(req: Request) {
  try {
    const u = await requireUser();

    /**
     * ?diag=1 — the transcription self-test, owner only.
     *
     * "The recording attached but no words came" has three possible causes
     * that all look identical from a phone: no key on the deploy, a wrong
     * key, or a key with no billing. This asks OpenAI directly and names
     * which one it is, so the diagnosis is one URL instead of a guessing
     * conversation.
     */
    if (new URL(req.url).searchParams.get("diag") === "1") {
      if (u.email.toLowerCase() !== RAGHU_EMAIL) throw new HttpError(403, "The diagnostic is the owner's.");
      const oa = process.env.OPENAI_API_KEY;
      const out: Record<string, string> = {
        OPENAI_API_KEY: oa ? `present (${oa.slice(0, 7)}…${oa.slice(-4)}, ${oa.length} chars)` : "NOT SET on this deploy — set it in Vercel and redeploy",
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "present" : "NOT SET — summaries and polishing fall back to raw text",
      };
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const r = await fetch("https://api.anthropic.com/v1/models", {
            headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          });
          out.claude =
            r.status === 200 ? "OK — the key reaches Claude; summaries and polishing should work"
            : r.status === 401 ? "401 — the key is WRONG (copied incompletely, or revoked)"
            : r.status === 429 ? "429 — rate limited or out of credits"
            : `unexpected ${r.status}`;
        } catch (e) {
          out.claude = `network error reaching Anthropic: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      if (oa) {
        try {
          const r = await fetch("https://api.openai.com/v1/models/whisper-1", {
            headers: { authorization: `Bearer ${oa}` },
          });
          out.whisper =
            r.status === 200 ? "OK — the key reaches Whisper; phone transcription should work"
            : r.status === 401 ? "401 — the key is WRONG (copied incompletely, or revoked)"
            : r.status === 429 ? "429 — the key has NO CREDITS/BILLING; add billing at platform.openai.com"
            : `unexpected ${r.status}`;
        } catch (e) {
          out.whisper = `network error reaching OpenAI: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      return NextResponse.json(out);
    }
    const who = await whoAreThey(u.email);
    let rows: Record<string, unknown>[] = [];
    try { rows = await mine(u.email) as Record<string, unknown>[]; }
    catch { return NextResponse.json({ needsMigration: true, ...who, open: null, done: [] }); }

    /**
     * THEIR OWN HRIS RECORD, for the first step of the IDP.
     *
     * The IDP begins by showing somebody what the company has on file for
     * them and letting them correct it — "any changes, please make them
     * here." Every edit lands in the same overlay HR uses, UNAPPROVED, so it
     * appears in RJ Approval - Records like any other change. The one field
     * never shown is HR notes, which are not theirs to read, and Role is
     * shown but not editable — what somebody is accountable for is not
     * self-service.
     */
    let myRecord: { value: Record<string, string | null>; pending: Record<string, boolean> } | null = null;
    let salary: {
      rows: SalaryRow[]; ctcLakhs: string; exempt: boolean;
      info: { name: string | null; department: string | null; designation: string | null; type: string | null; years: string | null; age: string | null };
    } | null = null;
    const options: Record<string, string[]> = {};
    if (who.employee) {
      const admin = adminClient();
      try {
        const T2 = await hrmsTables(admin);
        const { data: emp } = await admin
          .from(T2.employees)
          .select("id, name, email, dob, doj, department, designation, location, active, extra")
          .eq("id", who.employee.id).maybeSingle();
        const { data: eds } = await admin
          .from(T2.edits).select("field, value, approved_at").eq("employee_id", who.employee.id);
        const ov = new Map<string, { value: unknown; approved_at: unknown }>(
          (eds || []).map((e) => [String(e.field), e as { value: unknown; approved_at: unknown }]),
        );
        const value: Record<string, string | null> = {};
        const pending: Record<string, boolean> = {};
        // Only the identity side of the record. Pay, bank, benefits and the
        // rest are filtered HERE, not merely hidden on the page — what the
        // browser never receives, no view can leak.
        const shown = FIELD_GROUPS
          .filter((g) => IDP_RECORD_GROUPS.includes(g.key))
          .flatMap((g) => g.fields)
          .filter((f) => !IDP_RECORD_HIDE.has(f.key));
        for (const f of shown) {
          let v: string | null = null;
          if (f.column) {
            if (f.column === "active") v = emp?.active ? "yes" : "no";
            else v = ((emp as Record<string, unknown> | null)?.[f.column] as string | null) ?? null;
          } else if (f.sheetHeader) {
            v = (((emp?.extra || {}) as Record<string, string>)[f.sheetHeader] ?? null) as string | null;
          }
          const o = ov.get(f.key);
          if (o) { v = o.value == null ? null : String(o.value); pending[f.key] = o.approved_at == null; }
          value[f.key] = v === "" ? null : v;
        }
        myRecord = { value, pending };
        const ovVal = (k: string) => {
          // the pay fields live in extra; an approved-or-not override wins
          const f = ALL_FIELDS_BY_HEADER.get(k);
          const o = f ? ov.get(f) : undefined;
          if (o && o.value != null && String(o.value).trim() !== "") return o.value;
          return ((emp?.extra || {}) as Record<string, string>)[k];
        };
        const yearsSince = (iso: string | null) => {
          if (!iso) return null;
          const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
          if (Number.isNaN(d.getTime())) return null;
          return ((Date.now() - d.getTime()) / (365.25 * 864e5)).toFixed(1);
        };
        const base = salaryTable(ovVal, value["type"] ?? null);
        salary = base
          ? {
              ...base,
              info: {
                name: value["name"] ?? null,
                department: value["department"] ?? null,
                designation: value["designation"] ?? null,
                type: value["type"] ?? null,
                years: yearsSince(value["doj"] ?? null),
                age: yearsSince(value["dob"] ?? null),
              },
            }
          : null;
        const { data: m } = await admin.from("hrms_master").select("kind, value").order("sort_order");
        for (const r of m || []) (options[String(r.kind)] ||= []).push(String(r.value));
      } catch { /* the step simply shows nothing editable */ }
    }

    const open = rows.find((r) => !r.submitted_at) ?? null;
    if (open) {
      // signed per read; a stored URL either expires in the row or never does
      const audio = (open.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
      const withUrls: Record<string, { url: string | null; seconds: number | null; at: string; transcript: string | null }[]> = {};
      for (const [qid, list] of Object.entries(audio)) {
        withUrls[qid] = await Promise.all(list.map(async (a) => {
          const { data: sgn } = await adminClient().storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
          return { url: sgn?.signedUrl ?? null, seconds: a.seconds, at: a.at, transcript: a.transcript ?? null };
        }));
      }
      (open as Record<string, unknown>).audioUrls = withUrls;
      const att = ((open.attachments || []) as { path: string; name: string; size: number; at: string }[]);
      (open as Record<string, unknown>).attachmentUrls = await Promise.all(att.map(async (a) => {
        const { data: sgn } = await adminClient().storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
        return { ...a, url: sgn?.signedUrl ?? null };
      }));
    }
    const done = rows.filter((r) => r.submitted_at);
    return NextResponse.json({
      name: u.displayName || u.email,
      email: u.email,
      cycle: CYCLE,
      serverStt: !!process.env.OPENAI_API_KEY,
      ...who,
      myRecord,
      salary,
      options,
      open,
      done: done.map((d) => ({
        id: d.id, submitted_at: d.submitted_at,
        answers: d.answers, ratings: d.ratings, role_at_time: d.role_at_time, role_summary: d.role_summary,
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * Spoken thinking → the written answer, in one place, so the browser path and
 * the server path produce the same kind of text.
 */
async function polishSpoken(email: string, text: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return text;
  const who = await whoAreThey(email);
  const roleLine = who.role ? `Their role: ${who.role}.` : "";
  const expectLine = who.roleSummary ? `What the company expects of that role:\n${who.roleSummary}` : "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        system:
          "Somebody at an Indian engineering company is speaking an answer for their own development plan (IDP). " +
          "The dictation is rough, often a MIX OF ENGLISH AND HINDI, and full of thinking-out-loud.\n\n" +
          (roleLine ? roleLine + "\n" + expectLine + "\n\n" : "") +
          "Write out THE ANSWER THEY WERE GIVING, properly:\n" +
          "1. FIRST PERSON, as 'I' — these are their words about themselves.\n" +
          "2. SIMPLE, CORRECT ENGLISH. Short sentences. A person who finished class 10 must understand it.\n" +
          "3. Translate anything said in Hindi.\n" +
          "4. KEEP EVERY DISTINCT POINT they made — but say each ONCE, cleanly. Drop the repetitions, the " +
          "false starts, the asides about the recording itself, and anything that is plainly testing the " +
          "microphone rather than answering.\n" +
          "5. Where their role is given above, phrase the points so they read against that role — the same " +
          "facts, aimed at what the role is for. INVENT NOTHING they did not say.\n" +
          "6. One point per line, starting with '- '. No blank lines between lines.\n" +
          "7. Answer with the text only. No preamble, no heading, no closing comment.",
        messages: [{ role: "user", content: text.slice(0, 60000) }],
      }),
    });
    if (!r.ok) return text;
    const j = await r.json();
    const out = j?.content?.[0]?.text;
    if (typeof out !== "string" || !out.trim()) return text;
    return out.trim().replace(/\r/g, "").replace(/\n{2,}/g, "\n");
  } catch {
    return text;
  }
}

/**
 * POST /api/idp
 *   { action: "start", consent: true }
 *   { action: "save",  id, answers, ratings }   — as they type, so a closed
 *                                                 laptop costs nothing
 *   { action: "submit", id, answers, ratings }
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const admin = adminClient();

    /**
     * A RECORDING. Stored, added to that question's list, and handed back with
     * a link so it can be played immediately.
     *
     * ADDED, never replaced: a question is not answered in one breath, and
     * somebody who thinks of a second thing should be able to say it without
     * losing the first.
     */
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const id = String(form.get("id") || "");
      const qid = String(form.get("qid") || "");

      /** A document attached on the last page. Stored, listed, never parsed. */
      if (String(form.get("kind") || "") === "attach") {
        const file = form.get("file");
        if (!id) throw new HttpError(400, "id required");
        if (!(file instanceof File) || !file.size) throw new HttpError(400, "Nothing was chosen.");
        if (file.size > 15 * 1024 * 1024) throw new HttpError(400, "Keep an attachment under 15 MB.");
        const { data: row } = await admin
          .from("hrms_idp").select("id, attachments, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
        if (!row) throw new HttpError(404, "That is not your IDP.");
        if (row.submitted_at) throw new HttpError(409, "This IDP has already been completed.");
        const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
        const path = `idp/${id}/files/${Date.now()}-${safe}`;
        const { error: up } = await admin.storage
          .from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
        if (up) throw new Error(`Could not store the file: ${up.message}`);
        const list = [...((row.attachments || []) as { path: string }[]), { path, name: safe, size: file.size, at: new Date().toISOString() }];
        const { error } = await admin.from("hrms_idp").update({ attachments: list, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw new Error(error.message);
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_TTL);
        return NextResponse.json({ ok: true, path, name: safe, url: sgn?.signedUrl ?? null });
      }
      const seconds = Number(form.get("seconds") || 0) || null;
      const file = form.get("file");
      if (!id || !qid) throw new HttpError(400, "id and qid are required");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "Nothing was recorded.");

      const { data: row } = await admin
        .from("hrms_idp").select("id, audio, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      if (row.submitted_at) throw new HttpError(409, "This IDP has already been completed.");

      const ext = (file.type.split("/")[1] || "webm").split(";")[0];
      const path = `idp/${id}/${qid}/${Date.now()}.${ext}`;
      const buf = await file.arrayBuffer();
      const { error: up } = await admin.storage
        .from(BUCKET).upload(path, buf, { contentType: file.type || "audio/webm" });
      if (up) throw new Error(`Could not store the recording: ${up.message}`);

      const audio = (row.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
      // the words as heard travel WITH the recording, so each can sit beside
      // its own audio rather than all of them blurring into one box
      let transcript = String(form.get("transcript") || "").trim() || undefined;
      let polished: string | null = null;

      /**
       * THE SERVER'S SECOND CHANCE AT THE WORDS.
       *
       * iPhones and some browsers record perfectly and transcribe nothing —
       * dictation off, or no speech engine at all. The audio still arrived,
       * so if a Whisper key is configured the server transcribes it here and
       * hands back the written answer, and the phone behaves exactly like a
       * laptop. Without the key, the recording is kept and the page says
       * plainly that no words were caught.
       */
      const oa = process.env.OPENAI_API_KEY;
      let stt = transcript ? "browser" : "no-key";
      if (!transcript && oa) {
        try {
          const fd2 = new FormData();
          fd2.append("file", new File([buf], `note.${ext}`, { type: file.type || "audio/webm" }));
          fd2.append("model", "whisper-1");
          const w = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST", headers: { authorization: `Bearer ${oa}` }, body: fd2,
          });
          if (w.ok) {
            const wj = await w.json();
            const heard = String(wj?.text || "").trim();
            if (heard) {
              transcript = heard;
              polished = await polishSpoken(u.email, heard);
              stt = "ok";
            } else stt = "empty";
          } else {
            stt = `failed:${w.status}`;
          }
        } catch { stt = "failed:network"; }
      }
      audio[qid] = [
        ...(audio[qid] || []),
        // stt written onto the entry: when a phone says "no words came", the
        // row itself now says what the server actually did
        { path, seconds, at: new Date().toISOString(), transcript, stt, polished: !!polished } as never,
      ];
      const { error } = await admin
        .from("hrms_idp").update({ audio, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);

      const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_TTL);
      return NextResponse.json({ ok: true, url: sgn?.signedUrl ?? null, seconds });
    }

    const body = await req.json();
    const action = String(body.action || "");

    /**
     * { action: "polish", text } — dictated speech into plain English.
     *
     * NOT SAVED HERE. The tidied text goes back to the browser and into the
     * box, where the person reads it, changes it and decides whether it is
     * what they meant. What is stored later is what THEY left in the box.
     * A machine writing straight into somebody's development plan without
     * their eyes on it is not something to build.
     */
    if (action === "polish") {
      const text = String(body.text || "").trim();
      if (!text) throw new HttpError(400, "Nothing was said.");
      return NextResponse.json({ text: await polishSpoken(u.email, text) });
    }

    /**
     * { action: "myrecord", field, value } — correct their own record.
     *
     * Scoped to the caller: the employee id comes from THEIR login, never
     * from the request. The write is the same overlay HR uses, left
     * UNAPPROVED so it queues for Dr Raghu with everything else.
     */
    if (action === "myrecord") {
      const who = await whoAreThey(u.email);
      if (!who.employee) throw new HttpError(403, "This login is not linked to an employee record.");
      const field = String(body.field || "");
      const spec = fieldSpec(field);
      if (!spec) throw new HttpError(400, "That is not a field on the record.");
      if (spec.derived) throw new HttpError(400, `${spec.label} is worked out from another field.`);
      if (field === "role") throw new HttpError(403, "Your role is set by HR, not from here.");
      const grp = FIELD_GROUPS.find((g) => g.fields.some((f) => f.key === field));
      if (!grp || !IDP_RECORD_GROUPS.includes(grp.key) || IDP_RECORD_HIDE.has(field))
        throw new HttpError(403, "That part of the record is not edited from the IDP.");
      const T2 = await hrmsTables(admin);
      let v: string | null = String(body.value ?? "").trim() || null;
      if (spec.kind === "bool") v = body.value === "no" || body.value === false ? "no" : "yes";
      if (spec.kind === "email" && v) v = v.toLowerCase();
      if (spec.kind === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v))
        throw new HttpError(400, "A date must be YYYY-MM-DD");
      const stamp = `${u.initials ? u.initials + " · " : ""}${u.email} (self, via the IDP)`;
      const { error } = await admin.from(T2.edits).upsert(
        { employee_id: who.employee.id, field, value: v, edited_by: stamp, edited_at: new Date().toISOString(), approved_at: null, approved_by: null },
        { onConflict: "employee_id,field" },
      );
      if (error) throw new Error(error.message);
      try {
        await admin.from(T2.log).insert({
          employee_id: who.employee.id, field, old_value: null, new_value: v, edited_by: stamp,
        });
      } catch { /* the correction matters more than the line about it */ }
      return NextResponse.json({ ok: true, value: v });
    }

    /**
     * ATTACHMENTS GO STRAIGHT TO STORAGE, NOT THROUGH THIS SERVER.
     *
     * The old path posted the file through the API, and the platform caps a
     * request body at ~4.5 MB — so a 6 MB presentation came back as an HTML
     * error page the client tried to read as JSON: "Unexpected token ... is
     * not valid JSON". Now the server hands out a one-time signed upload URL,
     * the browser sends the file directly to the bucket, and the API only
     * records that it arrived. 25 MB is the new ceiling.
     */
    if (action === "attach-url") {
      const id = String(body.id || "");
      const name = String(body.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
      const size = Number(body.size || 0);
      if (size > 25 * 1024 * 1024) throw new HttpError(400, "Keep an attachment under 25 MB.");
      const { data: row } = await admin
        .from("hrms_idp").select("id, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      if (row.submitted_at) throw new HttpError(409, "This IDP has already been completed.");
      const path = `idp/${id}/files/${Date.now()}-${name}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, path, token: data.token, name });
    }

    if (action === "attach-commit") {
      const id = String(body.id || "");
      const path = String(body.path || "");
      if (!path.startsWith(`idp/${id}/files/`)) throw new HttpError(400, "That path is not yours.");
      const { data: row } = await admin
        .from("hrms_idp").select("id, attachments, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      if (row.submitted_at) throw new HttpError(409, "This IDP has already been completed.");
      const entry = { path, name: String(body.name || "file"), size: Number(body.size || 0), at: new Date().toISOString() };
      const list = [...((row.attachments || []) as { path: string }[]).filter((a) => a.path !== path), entry];
      const { error } = await admin.from("hrms_idp").update({ attachments: list, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_TTL);
      return NextResponse.json({ ok: true, url: sgn?.signedUrl ?? null, ...entry });
    }

    if (action === "start") {
      if (body.consent !== true)
        throw new HttpError(400, "The IDP cannot be started without consent.");
      // watching the video and reading the role are the preparation the rest
      // of the document assumes — the tick is required, and kept with its words
      if (body.watched !== true)
        throw new HttpError(400, "Watch the video and read your role first — then tick the box that says so.");
      const who = await whoAreThey(u.email);
      /**
       * NO EMPLOYEE RECORD, NO IDP (Dr Raghu, 23 Aug 2026). A development
       * plan belongs ON somebody's file; one filled in by a login that
       * matches no employee has nowhere to be filed and nobody to review it.
       * The login is the key — the email address and password they already
       * use — and HRIS holds the join.
       */
      if (!who.employee)
        throw new HttpError(
          403,
          "This login is not linked to an employee record yet, so there is nowhere to file an IDP. " +
            "Ask HR to set the Genie user on your record in HRIS.",
        );
      // an abandoned attempt is not resumed — starting over is the rule
      await admin.from("hrms_idp").delete().eq("person_email", u.email).eq("cycle", CYCLE).is("submitted_at", null);
      const { data, error } = await admin.from("hrms_idp").insert({
        employee_id: who.employee?.id ?? null,
        person_email: u.email,
        person_name: u.displayName || null,
        cycle: CYCLE,
        consent_at: new Date().toISOString(),
        consent_text: `${CONSENT_TEXT} | ${WATCHED_TEXT}`,
        role_at_time: who.role,
        role_summary: who.roleSummary,
      }).select("id").maybeSingle();
      if (error) {
        if (/hrms_idp|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0053 first — the IDP has nowhere to save yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, id: data?.id });
    }

    /**
     * { action: "reopen", id } — put a completed one back into edit.
     *
     * The rule is that Complete is final. Dr Raghu has asked for reopening
     * WHILE THIS IS NEW (23 Aug 2026), because the first people through it
     * will find things they want to say better, and losing that to a rule
     * would cost more than the rule is worth in its first month. Their own
     * only: the query is scoped to their email like every other one here.
     */
    if (action === "reopen") {
      const id = String(body.id || "");
      const { data: row } = await admin
        .from("hrms_idp").select("id").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      const { error } = await admin
        .from("hrms_idp").update({ submitted_at: null, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "save" || action === "submit") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "id required");
      // scoped to the caller: somebody else's id simply matches nothing
      const { data: row } = await admin
        .from("hrms_idp").select("id, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      if (row.submitted_at) throw new HttpError(409, "This IDP has already been submitted.");

      const answers = (body.answers || {}) as Record<string, string>;
      const ratings = (body.ratings || {}) as Record<string, number>;
      const patch: Record<string, unknown> = { answers, ratings, updated_at: new Date().toISOString() };

      if (action === "submit") {
        const who = await whoAreThey(u.email);
        const check = isComplete(answers, ratings, who.isLeader);
        if (!check.ok)
          throw new HttpError(400,
            `Not finished yet — ${check.missing.length} question${check.missing.length === 1 ? "" : "s"} and ` +
            `${check.unrated.length} rating${check.unrated.length === 1 ? "" : "s"} still to do.`);
        /**
         * THE CLOSING VOICE NOTE IS COMPULSORY (Dr Raghu, 23 Aug 2026). The
         * questions about cost and value are answered in the person's own
         * voice, to him — a typed line is not a substitute, so the check is
         * for a RECORDING, enforced here where the page cannot talk it away.
         */
        const { data: row2 } = await admin.from("hrms_idp").select("audio").eq("id", id).maybeSingle();
        const finalVoice = (((row2?.audio || {}) as Record<string, unknown[]>)["final_voice"] || []).length;
        if (!finalVoice)
          throw new HttpError(400, "The closing voice note to Dr Raghu is compulsory — record it on the last page before submitting.");
        patch.submitted_at = new Date().toISOString();
      }

      const { error } = await admin.from("hrms_idp").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, submitted: action === "submit" });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
