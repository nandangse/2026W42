import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, onRoll } from "@/lib/hrms";
import { LEVELS } from "@/lib/competency";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "voice-notes";

/**
 * Job Description, Deliverable and Measurement Metric are rich text, so what
 * arrives is HTML. It is scrubbed HERE as well as in the editor: the browser
 * is not where a security rule is enforced, and a value can reach this route
 * without going through the editor at all.
 */
const RICH = new Set(["job_description", "deliverable", "metric"]);


/**
 * The summary of a spoken expectation note.
 *
 * THREE THINGS IT MUST DO, and the first is why this is not a one-liner.
 * These notes are spoken in the way people here actually speak — English and
 * Hindi in the same sentence ("accounts executive ko make sure karna hai ki
 * filing correctly ho"). The summary has to come out in PLAIN ENGLISH, as
 * BULLETS, in language simple enough for somebody whose English is their
 * third language to act on. A summary nobody can read is not a summary.
 *
 * If it cannot be written, this returns null and the caller says so plainly.
 * The old behaviour was to fall back to the first 200 characters of the
 * transcript and present that as the summary, which looked like a working
 * feature and was not — that is exactly how a broken thing survives.
 */
/**
 * Returns the summary, or names the exact reason there is none. "It failed"
 * from a phone looks the same whether the key is missing, wrong, or the
 * model was briefly overloaded — and each of those has a different fix, so
 * the reason travels with the failure instead of being guessed at later.
 */
async function summarise(transcript: string): Promise<{ text: string | null; why: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, why: "ANTHROPIC_API_KEY is not set on this deploy" };
  if (transcript.trim().length < 40) return { text: null, why: "the words are too few to summarise" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI.FRONT,
        max_tokens: 500,
        system:
          "You summarise a spoken note from the Managing Director of an Indian engineering company, " +
          "saying what he expects from a ROLE in his company.\n\n" +
          "The note is dictated speech and is usually a MIX OF ENGLISH AND HINDI. Understand both.\n\n" +
          "Rules for your answer:\n" +
          "1. Write ONLY IN ENGLISH. Translate anything said in Hindi.\n" +
          "2. Write BULLET POINTS, one per line, each starting with '- '. Never a paragraph.\n" +
          "3. Use VERY SIMPLE ENGLISH. Short words, short sentences. The reader may be a fitter or a " +
          "storekeeper reading English as their third language. Say 'check every week', not 'conduct weekly verification'.\n" +
          "4. Each bullet is one thing the person must DO or must ACHIEVE. Start with a verb.\n" +
          "5. At most 6 bullets. Leave out anything that is not an expectation.\n" +
          "6. No heading, no preamble, no closing line. Bullets only.\n\n" +
          "If the note contains no expectations at all, answer with the single line: - Nothing specific was said about what this role must deliver.",
        messages: [{ role: "user", content: transcript.slice(0, 8000) }],
      }),
    });
    if (!r.ok)
      return {
        text: null,
        why: r.status === 401 ? "the ANTHROPIC_API_KEY on the server is wrong or revoked"
          : r.status === 429 || r.status === 529 ? `the model was busy (answered ${r.status}) — press Summarise again in a minute`
          : `the model answered ${r.status}`,
      };
    const j = await r.json();
    const text = j?.content?.[0]?.text;
    return typeof text === "string" && text.trim()
      ? { text: text.trim(), why: null }
      : { text: null, why: "the model answered empty" };
  } catch (e) {
    return { text: null, why: `could not reach the model: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function scrub(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<\/?(?:object|embed|form|input|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}
const LINK_TTL = 60 * 60;

/** Who holds each role today, and whether they are on the roll. */
async function holders() {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const { data } = await admin
    .from(T.employees)
    .select("id, name, designation, department, active, extra");
  const { data: eds } = await admin
    .from(T.edits).select("employee_id, field, value").in("field", ["role", "status"]);

  const roleOf = new Map<string, string>();
  const statusOf = new Map<string, string>();
  for (const e of eds || []) {
    if (e.field === "role") roleOf.set(String(e.employee_id), String(e.value ?? ""));
    else statusOf.set(String(e.employee_id), String(e.value ?? ""));
  }

  const byRole = new Map<string, { id: string; name: string; onRoll: boolean }[]>();
  let unassigned = 0;
  let activeTotal = 0;
  for (const r of data || []) {
    const id = String(r.id);
    const status = statusOf.get(id) ?? ((r.extra || {}) as Record<string, string>)["Status"] ?? "";
    const on = onRoll({ status, active: r.active ? "yes" : "no" });
    if (on) activeTotal++;
    // no override means the role has not been set — the designation is NOT a
    // role, and quietly treating it as one is how an unassigned person hides
    const role = (roleOf.get(id) ?? "").trim();
    if (!role) { if (on) unassigned++; continue; }
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push({ id, name: String(r.name || id), onRoll: on });
  }
  return { byRole, unassigned, activeTotal };
}

// GET /api/hrms/roles — the register, with who holds each role.
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();

    // ?changes=<role id> — the history panel, fetched only when it is opened
    const changesFor = new URL(req.url).searchParams.get("changes");
    if (changesFor) {
      const { data, error } = await admin
        .from("hrms_role_change")
        .select("id, field, old_value, new_value, old_audio, changed_by, changed_at")
        .eq("role_id", changesFor)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) return NextResponse.json({ changes: [] });
      const changes = await Promise.all((data || []).map(async (c) => {
        let oldUrl: string | null = null;
        if (c.old_audio) {
          const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(c.old_audio, LINK_TTL);
          oldUrl = sgn?.signedUrl ?? null;
        }
        return { ...c, oldUrl };
      }));
      return NextResponse.json({ changes });
    }
    const { data, error } = await admin
      .from("hrms_role")
      .select("id, role, department, grade, reports_to, location, job_description, deliverable, metric, stage, voice_path, voice_seconds, transcript, summary, created_by, updated_by, updated_at, approved_by, approved_at, pending_since, pending_by")
      .order("role");
    if (error) {
      if (/hrms_role|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ roles: [], needsMigration: true, unassigned: 0, activeTotal: 0 });
      throw new Error(error.message);
    }

    const { byRole, unassigned, activeTotal } = await holders();

    // the competency master, and what each role needs
    let competencies: { name: string; definition: string; category: string | null }[] = [];
    const needed = new Map<string, { competency: string; level: number }[]>();
    try {
      const { data: cm } = await admin
        .from("hrms_competency").select("name, definition, category, sort_order").order("sort_order").order("name");
      competencies = (cm || []).map((c) => ({ name: String(c.name), definition: String(c.definition), category: c.category ?? null }));
      const { data: rc } = await admin.from("hrms_role_competency").select("role_id, competency, level");
      for (const r of rc || []) {
        const id = String(r.role_id);
        if (!needed.has(id)) needed.set(id, []);
        needed.get(id)!.push({ competency: String(r.competency), level: Number(r.level) });
      }
    } catch (e) { swallow("hrms/roles", e); /* pre-0056 */ }

    const roles = await Promise.all(
      (data || []).map(async (r) => {
        let url: string | null = null;
        if (r.voice_path) {
          // signed per read — a stored URL either expires in the row or never
          const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(r.voice_path, LINK_TTL);
          url = s?.signedUrl ?? null;
        }
        const people = byRole.get(String(r.role)) || [];
        return {
          ...r,
          url,
          competencies: (needed.get(String(r.id)) || []).sort((a, b) => b.level - a.level || a.competency.localeCompare(b.competency)),
          people: people.map((p) => ({ id: p.id, name: p.name, onRoll: p.onRoll })),
          activeCount: people.filter((p) => p.onRoll).length,
        };
      }),
    );

    return NextResponse.json({ roles, unassigned, activeTotal, competencies, levels: LEVELS });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/roles — JSON for the fields, multipart for the voice note.
 *
 *   { action: "create", role }
 *   { action: "save",   id, ...fields }
 *   { action: "stage",  id, stage }     — Final is the owner's alone
 *   { action: "delete", id }
 *
 * MAKING A ROLE FINAL IS DR RAGHU'S, and only his. A draft job description is
 * a suggestion; an appraisal run against a suggestion is not defensible. HR
 * may write every word of it and may not be the one who agrees it.
 */
export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireHrms();
    const admin = adminClient();
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const ct = req.headers.get("content-type") || "";

    // ---- the management expectation note ----
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const id = String(form.get("id") || "");
      if (!id) throw new HttpError(400, "Which role?");
      const transcript = String(form.get("transcript") || "").trim();
      const seconds = Number(form.get("seconds") || 0) || null;
      const file = form.get("file");
      const hasAudio = file instanceof File && file.size > 0;
      if (!hasAudio && !transcript) throw new HttpError(400, "Nothing was recorded.");

      let voice_path: string | null = null;
      if (hasAudio) {
        const f = file as File;
        const ext = (f.type.split("/")[1] || "webm").split(";")[0];
        voice_path = `roles/${id}/${Date.now()}.${ext}`;
        const { error: up } = await admin.storage
          .from(BUCKET)
          .upload(voice_path, await f.arrayBuffer(), { contentType: f.type || "audio/webm" });
        if (up) throw new Error(`Could not store the recording: ${up.message}`);
      }

      /**
       * The summary. Spoken words run long; what a role is FOR is usually two
       * sentences inside ninety seconds of them. Falls back to the opening of
       * the transcript when there is no key configured — a worse summary is
       * better than a failed save.
       */
      const { text: summary, why } = await summarise(transcript);

      const { data: prev } = await admin
        .from("hrms_role").select("voice_path, transcript, summary").eq("id", id).maybeSingle();

      const { error } = await admin
        .from("hrms_role")
        .update({
          voice_path, voice_seconds: seconds, transcript, summary,
          updated_by: stamp, updated_at: new Date().toISOString(),
          pending_since: new Date().toISOString(), pending_by: stamp,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);

      try {
        await admin.from("hrms_role_change").insert({
          role_id: id, field: "voice",
          old_value: prev?.summary ? `superseded summary: ${prev.summary}` : null,
          new_value: summary,
          old_audio: prev?.voice_path ?? null,
          changed_by: stamp,
        });
      } catch (e) { swallow("hrms/roles", e); /* the recording matters more than the line about it */ }

      return NextResponse.json({
        ok: true,
        summary,
        warning: summary ? null : `The recording and the words were saved, but the summary could not be written — ${why}. Press “Summarise again”.`,
      });
    }

    // ---- the fields ----
    const body = await readBody(req, {});
    const action = String(body.action || "");

    if (action === "create") {
      const role = String(body.role || "").trim();
      if (!role) throw new HttpError(400, "A role name is required");
      const { data: clash } = await admin.from("hrms_role").select("id").eq("role", role).maybeSingle();
      if (clash) throw new HttpError(409, `“${role}” is already in the register.`);
      const { data, error } = await admin
        .from("hrms_role")
        .insert({ role, stage: "Draft", created_by: stamp, updated_by: stamp })
        .select("id")
        .maybeSingle();
      if (error) {
        if (/hrms_role|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0050 first — the role register does not exist yet");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, id: data?.id });
    }

    if (action === "save") {
      if (!body.id) throw new HttpError(400, "id required");
      // what it says now, so the change history records a from as well as a to
      const { data: before } = await admin
        .from("hrms_role")
        .select("role, department, grade, reports_to, location, job_description, deliverable, metric")
        .eq("id", body.id).maybeSingle();
      const patch: Record<string, unknown> = { updated_by: stamp, updated_at: new Date().toISOString() };
      for (const f of ["role", "department", "grade", "reports_to", "location", "job_description", "deliverable", "metric"]) {
        if (!(f in body)) continue;
        const raw = String(body[f] ?? "");
        const v = RICH.has(f) ? scrub(raw) : raw.trim();
        // markup with no words in it is not content
        patch[f] = (RICH.has(f) ? v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() : v) ? v : null;
      }
      if (patch.role === null) throw new HttpError(400, "A role must have a name");
      /**
       * ANY CHANGE PUTS THE ROLE BACK IN FRONT OF DR RAGHU. It appears under
       * Approvals -> RJ Approval - Records from this moment. Stage is a
       * separate question and stays where it is: Draft/Final is whether the
       * role is AGREED, pending is whether the latest edit has been SEEN.
       */
      const changes = Object.entries(patch)
        .filter(([k]) => !["updated_by", "updated_at"].includes(k))
        .filter(([k, v]) => String((before as Record<string, unknown> | null)?.[k] ?? "") !== String(v ?? ""));
      if (changes.length) {
        patch.pending_since = new Date().toISOString();
        patch.pending_by = stamp;
      }

      const { error } = await admin.from("hrms_role").update(patch).eq("id", body.id);
      if (error) {
        if (/unique|duplicate/i.test(error.message)) throw new HttpError(409, "Another role already has that name.");
        throw new Error(error.message);
      }

      if (changes.length) {
        try {
          await admin.from("hrms_role_change").insert(
            changes.map(([k, v]) => ({
              role_id: body.id, field: k,
              old_value: ((before as Record<string, unknown> | null)?.[k] ?? null) as string | null,
              new_value: (v ?? null) as string | null,
              changed_by: stamp,
            })),
          );
        } catch (e) { swallow("hrms/roles", e); /* a lost history line must not fail the edit */ }
      }
      return NextResponse.json({ ok: true, pending: changes.length > 0 });
    }

    /**
     * { action: "competency", id, competency, level }  — add or set the level
     * { action: "competency", id, competency, remove: true }
     *
     * A role may need many, and the LEVEL is what makes the list useful: a Sr
     * Design Manager and a Draughtsman both need Drawing Reading, at 5 and at
     * 3, and that difference is the job.
     */
    if (action === "competency") {
      if (!body.id || !body.competency) throw new HttpError(400, "id and competency are required");
      const name = String(body.competency);
      if (body.remove) {
        const { error } = await admin
          .from("hrms_role_competency").delete().eq("role_id", body.id).eq("competency", name);
        if (error) throw new Error(error.message);
      } else {
        const level = Math.max(1, Math.min(5, Number(body.level) || 3));
        const { error } = await admin.from("hrms_role_competency").upsert(
          { role_id: body.id, competency: name, level, added_by: stamp },
          { onConflict: "role_id,competency" },
        );
        if (error) {
          if (/hrms_role_competency|does not exist|schema cache/i.test(error.message))
            throw new HttpError(503, "Run migration 0056 first — competencies have nowhere to live yet.");
          if (/foreign key|violates/i.test(error.message))
            throw new HttpError(400, `“${name}” is not in the competency master.`);
          throw new Error(error.message);
        }
      }
      // a change to what a role needs is a change to the role
      await admin.from("hrms_role")
        .update({ pending_since: new Date().toISOString(), pending_by: stamp, updated_by: stamp, updated_at: new Date().toISOString() })
        .eq("id", body.id);
      try {
        await admin.from("hrms_role_change").insert({
          role_id: body.id, field: "competency",
          old_value: body.remove ? name : null,
          new_value: body.remove ? null : `${name} — level ${Math.max(1, Math.min(5, Number(body.level) || 3))}`,
          changed_by: stamp,
        });
      } catch (e) { swallow("hrms/roles", e); /* the change matters more than the line about it */ }
      return NextResponse.json({ ok: true });
    }

    /** { action: "resummarise", id } — rewrite the summary from the words already stored. */
    if (action === "resummarise") {
      const { data: row } = await admin.from("hrms_role").select("transcript").eq("id", body.id).maybeSingle();
      const t = String(row?.transcript || "");
      if (!t.trim()) throw new HttpError(400, "There are no words to summarise — record the note first.");
      const { text: summary, why } = await summarise(t);
      if (!summary) throw new HttpError(503, `The summary could not be written — ${why}.`);
      const { error } = await admin
        .from("hrms_role").update({ summary, updated_by: stamp, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, summary });
    }

    /** { action: "approve", id } — the owner has seen the latest change. */
    if (action === "approve") {
      if (me.email.toLowerCase() !== RAGHU_EMAIL)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may approve a role change.`);
      const { error } = await admin
        .from("hrms_role")
        .update({ pending_since: null, pending_by: null, approved_by: stamp, approved_at: new Date().toISOString() })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      try {
        await admin.from("hrms_role_change").insert({
          role_id: body.id, field: "(approved)", old_value: null, new_value: "changes approved", changed_by: stamp,
        });
      } catch (e) { swallow("hrms/roles", e); /* as above */ }
      return NextResponse.json({ ok: true });
    }

    if (action === "stage") {
      const stage = body.stage === "Final" ? "Final" : "Draft";
      if (stage === "Final" && me.email.toLowerCase() !== RAGHU_EMAIL)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may make a role Final. Leave it as a draft and ask him.`);
      const { error } = await admin
        .from("hrms_role")
        .update(
          stage === "Final"
            ? { stage, approved_by: stamp, approved_at: new Date().toISOString(), updated_by: stamp }
            : { stage, approved_by: null, approved_at: null, updated_by: stamp },
        )
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, stage });
    }

    if (action === "delete") {
      const { data: r } = await admin.from("hrms_role").select("role").eq("id", body.id).maybeSingle();
      if (r) {
        const { byRole } = await holders();
        const n = (byRole.get(String(r.role)) || []).length;
        if (n) throw new HttpError(409, `${n} record${n === 1 ? " holds" : "s hold"} “${r.role}”. Move them to another role first.`);
      }
      const { error } = await admin.from("hrms_role").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
