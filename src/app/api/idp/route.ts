import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, splitMulti, FIELD_GROUPS, fieldSpec } from "@/lib/hrms";
import { CONSENT_TEXT, isComplete, IDP_RECORD_GROUPS, IDP_RECORD_HIDE } from "@/lib/idp";

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
export async function GET() {
  try {
    const u = await requireUser();
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
    }
    const done = rows.filter((r) => r.submitted_at);
    return NextResponse.json({
      name: u.displayName || u.email,
      email: u.email,
      cycle: CYCLE,
      ...who,
      myRecord,
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
      const { error: up } = await admin.storage
        .from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type || "audio/webm" });
      if (up) throw new Error(`Could not store the recording: ${up.message}`);

      const audio = (row.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
      // the words as heard travel WITH the recording, so each can sit beside
      // its own audio rather than all of them blurring into one box
      const transcript = String(form.get("transcript") || "").trim() || undefined;
      audio[qid] = [...(audio[qid] || []), { path, seconds, at: new Date().toISOString(), transcript }];
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
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return NextResponse.json({ text });
      /**
       * THE BOX GETS THE ANSWER, NOT THE DICTATION (Dr Raghu, 23 Aug 2026).
       *
       * The words as heard are kept verbatim BESIDE the recording, so nothing
       * is ever lost — which frees this step to do its real job: turn spoken
       * thinking into the answer the person was giving. Well-organised, plain
       * English, every distinct point kept but said once and cleanly, and
       * written knowing what their role is FOR, so the answer lands against
       * the role rather than in mid-air.
       */
      const who = await whoAreThey(u.email);
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
        if (!r.ok) return NextResponse.json({ text });
        const j = await r.json();
        const out = j?.content?.[0]?.text;
        if (typeof out !== "string" || !out.trim()) return NextResponse.json({ text });
        const tidy = out.trim().replace(/\r/g, "").replace(/\n{2,}/g, "\n");
        return NextResponse.json({ text: tidy });
      } catch {
        return NextResponse.json({ text });
      }
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

    if (action === "start") {
      if (body.consent !== true)
        throw new HttpError(400, "The IDP cannot be started without consent.");
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
        consent_text: CONSENT_TEXT,
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
