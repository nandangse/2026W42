import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, onRoll } from "@/lib/hrms";

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
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const { data, error } = await admin
      .from("hrms_role")
      .select("id, role, department, grade, reports_to, job_description, deliverable, metric, stage, voice_path, voice_seconds, transcript, summary, created_by, updated_by, updated_at, approved_by, approved_at")
      .order("role");
    if (error) {
      if (/hrms_role|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ roles: [], needsMigration: true, unassigned: 0, activeTotal: 0 });
      throw new Error(error.message);
    }

    const { byRole, unassigned, activeTotal } = await holders();

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
          people: people.map((p) => ({ id: p.id, name: p.name, onRoll: p.onRoll })),
          activeCount: people.filter((p) => p.onRoll).length,
        };
      }),
    );

    return NextResponse.json({ roles, unassigned, activeTotal });
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
      let summary = transcript.slice(0, 200);
      const key = process.env.ANTHROPIC_API_KEY;
      if (key && transcript.length > 60) {
        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-5",
              max_tokens: 300,
              system:
                "You are summarising a spoken note from the Managing Director about what a ROLE in his company is expected to deliver. " +
                "Give at most three short bullet points, in his own vocabulary, stating what the role must achieve. " +
                "No preamble, no headings, no restating the question. If the note says nothing about expectations, say so in one line.",
              messages: [{ role: "user", content: transcript.slice(0, 6000) }],
            }),
          });
          const j = await r.json();
          const text = j?.content?.[0]?.text;
          if (typeof text === "string" && text.trim()) summary = text.trim();
        } catch { /* keep the fallback */ }
      }

      const { error } = await admin
        .from("hrms_role")
        .update({ voice_path, voice_seconds: seconds, transcript, summary, updated_by: stamp, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, summary });
    }

    // ---- the fields ----
    const body = await req.json();
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
      const patch: Record<string, unknown> = { updated_by: stamp, updated_at: new Date().toISOString() };
      for (const f of ["role", "department", "grade", "reports_to", "job_description", "deliverable", "metric"]) {
        if (!(f in body)) continue;
        const raw = String(body[f] ?? "");
        const v = RICH.has(f) ? scrub(raw) : raw.trim();
        // markup with no words in it is not content
        patch[f] = (RICH.has(f) ? v.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() : v) ? v : null;
      }
      if (patch.role === null) throw new HttpError(400, "A role must have a name");
      const { error } = await admin.from("hrms_role").update(patch).eq("id", body.id);
      if (error) {
        if (/unique|duplicate/i.test(error.message)) throw new HttpError(409, "Another role already has that name.");
        throw new Error(error.message);
      }
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
