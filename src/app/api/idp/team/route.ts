import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { requireUser, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { teamOf } from "@/lib/team";
import { IDP_SECTIONS } from "@/lib/idp";
import { IDP_RATINGS } from "@/lib/idp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;
const CYCLE = "2026-27";

/**
 * The manager's side of the IDP.
 *
 * WHO GETS IN: somebody who has SUBMITTED THEIR OWN — reviewing others before
 * finishing your own is answering questions you have not faced. The owner is
 * exempt and sees everyone at any time.
 *
 * WHO THEY SEE: their own cascade, by the same reports_to walk Team Goals
 * uses. Not their department, not the company — the people they answer for.
 *
 * WHAT THEY NEVER SEE: the person's self-ratings and the salary the person
 * asked for. Two independent ratings are only worth having if they are
 * independent, so those fields are stripped HERE, not hidden on the page.
 */
/** Named exemptions from the own-IDP-first rule (Dr Raghu, 29 Aug 2026:
 *  "for Tushar Giri also allow him to fill the reporting manager's IDP
 *  without filling his own"). The rule stands for everyone else. */
const OWN_FIRST_EXEMPT = new Set(["tushar@nandan.co.in"]);

async function gate(u: { email: string; id: string }) {
  const admin = adminClient();
  const isOwner = u.email.toLowerCase() === RAGHU_EMAIL;
  if (!isOwner && !OWN_FIRST_EXEMPT.has(u.email.toLowerCase())) {
    const { data: mine } = await admin
      .from("hrms_idp").select("id").eq("person_email", u.email).eq("cycle", CYCLE)
      .not("submitted_at", "is", null).limit(1);
    if (!mine?.length)
      throw new HttpError(403, "Finish and submit your own IDP first — then your team's open here.");
  }
  // the cascade, as Genie logins
  const { data: profs } = await admin.from("profiles").select("id, email, display_name, reports_to, disabled");
  const people = (profs || []).filter((p) => !p.disabled);
  const below = isOwner
    ? people.filter((p) => String(p.email).toLowerCase() !== u.email.toLowerCase()).map((p) => ({ id: String(p.id), depth: 1 }))
    : teamOf(people.map((p) => ({ id: String(p.id), reports_to: p.reports_to ? String(p.reports_to) : null })), u.id);
  const byId = new Map(people.map((p) => [String(p.id), p]));

  // THE RECORD'S REPORTING MANAGER COUNTS TOO (Dr Raghu, 5 Sep 2026: "Suresh
  // says he's not able to see his people"). Only 23 logins carry reports_to;
  // the employee master names a Reporting Manager on every record. So the
  // team is the union: the profile chain, plus everyone whose record names
  // this person — and their people in turn — matched to logins by e-mail.
  if (!isOwner) {
    try {
      const byEmail = new Map(people.map((p) => [String(p.email).toLowerCase(), p]));
      const T = await hrmsTables(admin);
      const [{ data: emps }, { data: links }] = await Promise.all([
        admin.from(T.employees).select("id, name, email, active, extra"),
        admin.from(T.edits).select("employee_id, value").eq("field", "user_email"),
      ]);
      const loginOf = new Map<string, string>();
      for (const l of links || []) if (l.value) loginOf.set(String(l.employee_id), String(l.value).trim().toLowerCase());
      const rows = (emps || []).map((e) => ({
        id: String(e.id), name: String(e.name || "").trim(), active: e.active !== false,
        login: loginOf.get(String(e.id)) || String(e.email || "").trim().toLowerCase(),
        rm: String(((e.extra || {}) as Record<string, string>)["Reporting Manager"] || "").trim().toLowerCase(),
      }));
      const mine = rows.find((r) => r.login === u.email.toLowerCase());
      if (mine) {
        const have = new Map(below.map((m) => [m.id, m.depth]));
        const seen = new Set<string>([mine.id]);
        let frontier = [{ name: mine.name.toLowerCase(), depth: 0 }];
        while (frontier.length) {
          const next: { name: string; depth: number }[] = [];
          for (const f of frontier) {
            for (const r of rows) {
              if (!r.active || seen.has(r.id) || !f.name || r.rm !== f.name) continue;
              seen.add(r.id);
              const prof = r.login ? byEmail.get(r.login) : undefined;
              if (prof) {
                const d = f.depth + 1;
                if (!have.has(String(prof.id)) || have.get(String(prof.id))! > d) have.set(String(prof.id), d);
              }
              next.push({ name: r.name.toLowerCase(), depth: f.depth + 1 });
            }
          }
          frontier = next;
        }
        below.length = 0;
        for (const [id, depth] of have) if (id !== u.id) below.push({ id, depth });
      }
    } catch (e) { swallow("idp/team", e); /* the profile chain alone, as before */ }
  }
  return { admin, isOwner, members: below.map((m) => ({ ...byId.get(m.id)!, depth: (m as { depth: number }).depth })) };
}

export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const { admin, members } = await gate(u);
    const url = new URL(req.url);
    const idpId = url.searchParams.get("id");

    const emails = members.map((m) => String(m.email).toLowerCase());

    if (!idpId) {
      // the list: who below has an IDP, and where each review stands
      const { data: idps } = emails.length
        ? await admin
            .from("hrms_idp")
            .select("id, person_email, person_name, employee_id, role_at_time, started_at, submitted_at")
            .eq("cycle", CYCLE)
            .in("person_email", emails)
            .order("submitted_at", { ascending: false })
        : { data: [] };
      const ids = (idps || []).map((r) => r.id);
      const reviews = new Map<string, { submitted_at: string | null }>();
      if (ids.length) {
        const { data: rv } = await admin
          .from("hrms_idp_review").select("idp_id, submitted_at")
          .in("idp_id", ids).ilike("reviewer_email", u.email);
        for (const r of rv || []) reviews.set(String(r.idp_id), { submitted_at: r.submitted_at });
      }
      const depthOf = new Map(members.map((m) => [String(m.email).toLowerCase(), m.depth]));
      return NextResponse.json({
        team: (idps || []).map((r) => ({
          idpId: r.id,
          name: r.person_name || r.person_email,
          email: r.person_email,
          employeeId: r.employee_id,
          role: r.role_at_time,
          depth: depthOf.get(String(r.person_email).toLowerCase()) ?? 1,
          submitted_at: r.submitted_at,
          review: reviews.get(String(r.id)) ?? null,
        })),
        noTeam: members.length === 0,
      });
    }

    // one person, for review — self-ratings and the asked salary STRIPPED
    const { data: idp } = await admin.from("hrms_idp").select("*").eq("id", idpId).maybeSingle();
    if (!idp) throw new HttpError(404, "No such IDP.");
    if (!emails.includes(String(idp.person_email).toLowerCase()))
      throw new HttpError(403, "That person is not in your team.");
    if (!idp.submitted_at) throw new HttpError(409, "They have not submitted yet — there is nothing to review.");

    const answers = { ...(idp.answers || {}) } as Record<string, string>;
    delete answers["ask_gross"]; // never shown to the reviewer

    const audio = (idp.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
    const audioUrls: Record<string, { url: string | null; seconds: number | null; transcript: string | null }[]> = {};
    for (const [qid, list] of Object.entries(audio)) {
      audioUrls[qid] = await Promise.all(list.map(async (a) => {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
        return { url: sgn?.signedUrl ?? null, seconds: a.seconds, transcript: a.transcript ?? null };
      }));
    }

    // their role, as written, for the reviewer's judgement
    let roleDoc: Record<string, unknown> | null = null;
    if (idp.role_at_time) {
      const { data: r } = await admin
        .from("hrms_role").select("role, job_description, deliverable, metric, summary").eq("role", String(idp.role_at_time).split(" · ")[0]).maybeSingle();
      roleDoc = r ?? null;
    }

    // my review so far
    const { data: rv } = await admin
      .from("hrms_idp_review").select("*").eq("idp_id", idpId).ilike("reviewer_email", u.email).maybeSingle();
    let reviewAudio: { url: string | null; seconds: number | null; transcript: string | null }[] = [];
    if (rv?.audio) {
      reviewAudio = await Promise.all(((rv.audio || []) as { path: string; seconds: number | null; transcript?: string }[]).map(async (a) => {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
        return { url: sgn?.signedUrl ?? null, seconds: a.seconds, transcript: a.transcript ?? null };
      }));
    }

    /**
     * THE CURRENT GROSS IS EARNED, NOT GIVEN: it comes back only once the
     * reviewer's own ratings are complete, so the number cannot colour the
     * judgement of the work. The same rule as hiding the self-ratings, applied
     * to the reviewer themself.
     */
    const rated = rv && IDP_RATINGS.every((d) => ((rv.ratings || {}) as Record<string, number>)[d.key]);
    let grossCurrent: number | null = null;
    if (rated && idp.employee_id) {
      const { hrmsTables } = await import("@/lib/hrms");
      const T = await hrmsTables(admin);
      const { data: emp } = await admin.from(T.employees).select("extra").eq("id", idp.employee_id).maybeSingle();
      const ex = (emp?.extra || {}) as Record<string, string>;
      const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
      const g = num(ex["Basic and DA"]) + num(ex["HRA"]) + num(ex["Fixed Allowance"]) + num(ex["Conveyance"]) + num(ex["Medical Allowance"]);
      grossCurrent = g || null;
    }

    return NextResponse.json({
      person: {
        name: idp.person_name || idp.person_email,
        employeeId: idp.employee_id,
        role: idp.role_at_time,
        roleSummary: idp.role_summary,
        submitted_at: idp.submitted_at,
        answers, audioUrls,
        attachments: await Promise.all(((idp.attachments || []) as { path: string; name: string; size: number }[]).map(async (a) => {
          const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
          return { name: a.name, size: a.size, url: sgn?.signedUrl ?? null };
        })),
      },
      roleDoc,
      review: rv ? { ratings: rv.ratings || {}, gross_proposed: rv.gross_proposed, notes: rv.notes, analysis: rv.analysis, submitted_at: rv.submitted_at, audio: reviewAudio } : null,
      grossCurrent,
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/idp/team
 *   { action: "save", idpId, ratings?, gross_proposed?, notes? }
 *   { action: "submit", idpId }  — writes the CHRO analysis and locks
 *   multipart kind=review-voice  — the recording, added to the review
 */
export async function POST(req: Request) {
  try {
    await assertAiOn();
    const u = await requireUser();
    const { admin, members } = await gate(u);
    const emails = members.map((m) => String(m.email).toLowerCase());
    const stampName = u.displayName || u.email;

    const ensureMine = async (idpId: string) => {
      const { data: idp } = await admin.from("hrms_idp").select("id, person_email, submitted_at").eq("id", idpId).maybeSingle();
      if (!idp) throw new HttpError(404, "No such IDP.");
      if (!emails.includes(String(idp.person_email).toLowerCase())) throw new HttpError(403, "That person is not in your team.");
      if (!idp.submitted_at) throw new HttpError(409, "They have not submitted yet.");
      const { data: rv } = await admin
        .from("hrms_idp_review")
        .upsert({ idp_id: idpId, reviewer_email: u.email, reviewer_name: stampName }, { onConflict: "idp_id,reviewer_email", ignoreDuplicates: false })
        .select("*").maybeSingle();
      if (!rv) throw new Error("could not open the review");
      if (rv.submitted_at) throw new HttpError(409, "This review is already submitted.");
      return rv;
    };

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      if (String(form.get("kind") || "") !== "review-voice") throw new HttpError(400, "unknown upload");
      const idpId = String(form.get("id") || "");
      const rv = await ensureMine(idpId);
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "Nothing was recorded.");
      const ext = (file.type.split("/")[1] || "webm").split(";")[0];
      const path = `idp/${idpId}/review/${u.email.replace(/[^a-z0-9@.]/gi, "_")}/${Date.now()}.${ext}`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type || "audio/webm" });
      if (up) throw new Error(up.message);
      const transcript = String(form.get("transcript") || "").trim() || undefined;
      const seconds = Number(form.get("seconds") || 0) || null;
      const list = [...((rv.audio || []) as unknown[]), { path, seconds, at: new Date().toISOString(), transcript }];
      const { error } = await admin.from("hrms_idp_review").update({ audio: list, updated_at: new Date().toISOString() }).eq("id", rv.id);
      if (error) throw new Error(error.message);
      const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(path, LINK_TTL);
      return NextResponse.json({ ok: true, url: sgn?.signedUrl ?? null, seconds });
    }

    const body = await readBody(req, {});
    const idpId = String(body.idpId || "");
    const rv = await ensureMine(idpId);

    if (body.action === "save") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.ratings) patch.ratings = body.ratings;
      if ("gross_proposed" in body) patch.gross_proposed = Number(String(body.gross_proposed).replace(/[^0-9.]/g, "")) || null;
      if ("notes" in body) patch.notes = String(body.notes || "").trim() || null;
      const { error } = await admin.from("hrms_idp_review").update(patch).eq("id", rv.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "submit") {
      const ratings = (body.ratings || rv.ratings || {}) as Record<string, number>;
      const unrated = IDP_RATINGS.filter((d) => !ratings[d.key]);
      if (unrated.length) throw new HttpError(400, `${unrated.length} dimension${unrated.length === 1 ? "" : "s"} still to rate.`);
      const voiced = ((rv.audio || []) as unknown[]).length > 0;
      if (!voiced) throw new HttpError(400, "The voice note on how this person becomes more useful is compulsory.");

      // everything the CHRO view needs, in one read
      const { data: idp } = await admin.from("hrms_idp").select("*").eq("id", idpId).maybeSingle();
      const answers = (idp?.answers || {}) as Record<string, string>;
      const self = (idp?.ratings || {}) as Record<string, number>;
      const gross_proposed = Number(String(body.gross_proposed ?? rv.gross_proposed ?? "").replace(/[^0-9.]/g, "")) || null;

      let analysis: string | null = null;
      const key = process.env.ANTHROPIC_API_KEY;
      if (key) {
        try {
          const qa = IDP_SECTIONS.flatMap((s) => s.questions)
            .map((q) => (answers[q.id] ? `${q.label}:\n${answers[q.id]}` : null)).filter(Boolean).join("\n\n");
          const gaps = IDP_RATINGS
            .map((d) => ({ d: d.key, self: self[d.key], mgr: ratings[d.key] }))
            .filter((x) => x.self && x.mgr);
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: AI.FRONT,
              max_tokens: 2500,
              system:
                "You are the CHRO of an Indian MSME engineering company, writing a one-page growth note about one " +
                "employee for their manager and the Managing Director. You have their own IDP answers, their " +
                "manager's independent ratings, and where self-view and manager-view diverge.\n\n" +
                "Write, in simple clear English, under these headings exactly:\n" +
                "WHERE THEY STAND — three or four sentences on what the IDP shows about this person.\n" +
                "STRENGTHS TO USE MORE — bullets.\n" +
                "GAPS THAT MATTER — bullets; where self-view and manager-view diverge sharply, say so plainly " +
                "without quoting either side's numbers.\n" +
                "WHAT THEY SHOULD DO IN THE NEXT 90 DAYS — three to five concrete actions.\n" +
                "WHAT THE COMPANY SHOULD DO — training, exposure, responsibility; two or three items.\n" +
                "A LINE FOR THE ONE-TO-ONE — one sentence the manager can open the conversation with.\n\n" +
                "Ground every claim in what is actually written. Invent nothing. No preamble.",
              messages: [{
                role: "user",
                content:
                  `Person: ${idp?.person_name || idp?.person_email}. Role: ${idp?.role_at_time || "?"}.\n` +
                  `What the role expects:\n${idp?.role_summary || "—"}\n\n` +
                  `THEIR OWN IDP ANSWERS:\n${qa || "—"}\n\n` +
                  `SELF-RATINGS (1-10): ${gaps.map((g) => `${g.d}: ${g.self}`).join(", ") || "—"}\n` +
                  `MANAGER RATINGS (1-10): ${gaps.map((g) => `${g.d}: ${g.mgr}`).join(", ") || "—"}\n\n` +
                  `Manager's spoken note (transcript): ${((rv.audio || []) as { transcript?: string }[]).map((a) => a.transcript).filter(Boolean).join(" ") || "—"}\n` +
                  `Manager's written note: ${body.notes ?? rv.notes ?? "—"}\n` +
                  `Current gross/month: ${rv.gross_current ?? "?"} · Manager proposes: ${gross_proposed ?? "no change stated"}`,
              }],
            }),
          });
          if (r.ok) {
            const j = await r.json();
            const t = j?.content?.[0]?.text;
            if (typeof t === "string" && t.trim()) analysis = t.trim();
          }
        } catch (e) { swallow("idp/team", e); /* the review stands; the analysis can be written again */ }
      }

      const { error } = await admin.from("hrms_idp_review").update({
        ratings, gross_proposed,
        notes: String(body.notes ?? rv.notes ?? "").trim() || null,
        analysis, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", rv.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, analysis });
    }

    // the reveal: current gross once the ratings are complete
    if (body.action === "reveal") {
      const ratings = (body.ratings || {}) as Record<string, number>;
      const unrated = IDP_RATINGS.filter((d) => !ratings[d.key]);
      if (unrated.length) throw new HttpError(400, "Rate every dimension first — then the salary is shown.");
      await admin.from("hrms_idp_review").update({ ratings, updated_at: new Date().toISOString() }).eq("id", rv.id);
      const { data: idp } = await admin.from("hrms_idp").select("employee_id").eq("id", idpId).maybeSingle();
      let gross: number | null = null;
      if (idp?.employee_id) {
        const { hrmsTables } = await import("@/lib/hrms");
        const T = await hrmsTables(admin);
        const { data: emp } = await admin.from(T.employees).select("extra").eq("id", idp.employee_id).maybeSingle();
        const ex = (emp?.extra || {}) as Record<string, string>;
        const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
        gross = num(ex["Basic and DA"]) + num(ex["HRA"]) + num(ex["Fixed Allowance"]) + num(ex["Conveyance"]) + num(ex["Medical Allowance"]) || null;
      }
      await admin.from("hrms_idp_review").update({ gross_current: gross }).eq("id", rv.id);
      return NextResponse.json({ ok: true, grossCurrent: gross });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
