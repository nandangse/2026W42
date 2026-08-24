import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { salaryTable, splitGross, getterFor, componentsTotal, type Components } from "@/lib/salary";
import { offerNumber, financialYear, RESUME_SCHEMA, RESUME_SYSTEM, offerLetterHtml, textToHtml, type ResumeRead } from "@/lib/offer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;

/** The HTML an offer's rich text may carry — the role register's set. */
const RICH = /<\/?(p|br|b|strong|i|em|u|ol|ul|li|h3|h4|span)(\s[^>]*)?>/gi;
const scrub = (html: string) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(iframe|object|embed|form|input|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "")
    .replace(/<(?!\/?(p|br|b|strong|i|em|u|ol|ul|li|h3|h4|span)(\s|\/|>))[^>]*>/gi, "")
    .slice(0, 200000);

const clean = (v: unknown, max = 4000) => (v == null ? null : String(v).trim().slice(0, max) || null);

/**
 * GET               — the register, newest first.
 * GET ?id=          — one offer in full, with links to its resume.
 * GET ?bootstrap=1  — what a new offer needs: roles, competencies, people to report to, standard texts.
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (url.searchParams.get("bootstrap")) {
      const T = await hrmsTables(admin);
      const [roles, comps, emps, texts] = await Promise.all([
        admin.from("hrms_role").select("id, role, department, grade, job_description, deliverable, metric, summary, reports_to").order("role"),
        admin.from("hrms_competency").select("name, definition, category").order("name"),
        admin.from(T.employees).select("id, name, designation, active").order("name"),
        admin.from("hrms_text_master").select("key, title, body").in("key", ["terms_of_engagement", "offer_covering_letter"]),
      ]);
      const roleComp = await admin.from("hrms_role_competency").select("role_id, competency, level");
      return NextResponse.json({
        roles: roles.data || [],
        competencies: comps.data || [],
        roleCompetency: roleComp.data || [],
        people: (emps.data || []).filter((e) => e.active).map((e) => ({ id: e.id, name: e.name, designation: e.designation })),
        texts: Object.fromEntries((texts.data || []).map((t) => [t.key, t.body])),
      });
    }

    if (id) {
      const { data, error } = await admin.from("hrms_offer").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new HttpError(404, "No such offer.");
      let resumeUrl: string | null = null;
      if (data.resume_path) {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(String(data.resume_path), LINK_TTL);
        resumeUrl = sgn?.signedUrl ?? null;
      }
      return NextResponse.json({ offer: { ...data, resumeUrl } });
    }

    const { data, error } = await admin
      .from("hrms_offer")
      .select("id, offer_no, name, email, mobile, designation, roles, reporting_to, offer_date, joining_date, type, agreed_gross, status, sent_at, accepted_at, joined_at, employee_id, created_by, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (/hrms_offer|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ offers: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ offers: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * Reading a resume.
 *
 * Claude reads the document directly — a resume is a PDF laid out by
 * somebody who cared about how it looked, sometimes a scan, and no parser
 * survives that variety. What comes back is stored ALONGSIDE the fields it
 * filled, so a wrong prefill can be traced to what was read rather than
 * argued about.
 */
async function readResume(buf: Buffer, mime: string, filename: string): Promise<{ read: ResumeRead | null; why: string | null }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { read: null, why: "ANTHROPIC_API_KEY is not set on this deploy — type the details in by hand." };

  const isPdf = /pdf/i.test(mime) || /\.pdf$/i.test(filename);
  const content: Record<string, unknown>[] = [
    isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }
      : { type: "text", text: buf.toString("utf8").slice(0, 60000) },
    { type: "text", text: "Read this resume and return the candidate's details." },
  ];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        system: RESUME_SYSTEM,
        tools: [{ name: "candidate", description: "The candidate's details, exactly as the resume gives them.", input_schema: RESUME_SCHEMA }],
        tool_choice: { type: "tool", name: "candidate" },
        messages: [{ role: "user", content }],
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return {
        read: null,
        why: r.status === 401 ? "the ANTHROPIC_API_KEY is wrong or revoked"
          : r.status === 429 || r.status === 529 ? "the model was busy — try the upload again in a minute"
          : `the model answered ${r.status}: ${body.slice(0, 160)}`,
      };
    }
    const j = await r.json();
    const use = (j?.content || []).find((c: { type?: string }) => c?.type === "tool_use");
    if (!use?.input) return { read: null, why: "the model returned nothing usable" };
    return { read: use.input as ResumeRead, why: null };
  } catch (e) {
    return { read: null, why: `could not reach the model: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;
    const now = new Date().toISOString();
    const ct = req.headers.get("content-type") || "";

    /* ── the resume ── */
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const id = String(form.get("id") || "");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "No file was attached.");
      if (file.size > 12 * 1024 * 1024) throw new HttpError(400, "That file is over 12MB — a resume should be far smaller.");

      const buf = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `offers/${id || "new"}/${Date.now()}.${ext}`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type || "application/pdf" });
      if (up) throw new Error(`Could not store the resume: ${up.message}`);

      const { read, why } = await readResume(buf, file.type || "", file.name);
      return NextResponse.json({ ok: true, path, filename: file.name, read, why });
    }

    const body = await req.json();
    const action = String(body.action || "");

    /* ── create ── */
    if (action === "create") {
      const { data: last } = await admin
        .from("hrms_offer").select("offer_no").like("offer_no", `NGSE/HR/OL/${financialYear()}/%`)
        .order("offer_no", { ascending: false }).limit(1).maybeSingle();
      const seq = last?.offer_no ? Number(String(last.offer_no).split("/").pop()) + 1 : 1;

      const { data, error } = await admin.from("hrms_offer").insert({
        offer_no: offerNumber(Number.isFinite(seq) ? seq : 1),
        name: clean(body.name, 200) || "",
        email: clean(body.email, 200), mobile: clean(body.mobile, 60), address: clean(body.address),
        resume_name: clean(body.resume_name, 300), resume_path: clean(body.resume_path, 500),
        resume_read: body.resume_read ?? null,
        offer_date: body.offer_date || null, joining_date: body.joining_date || null,
        send_to: clean(body.email, 200),
        terms: clean(body.terms, 200000), covering_letter: clean(body.covering_letter, 20000),
        status: "Draft", created_by: stamp, updated_by: stamp, updated_at: now,
      }).select("id, offer_no").maybeSingle();
      if (error) {
        if (/hrms_offer|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0067 first — an offer has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, id: data?.id, offer_no: data?.offer_no });
    }

    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "Which offer?");

    /** A sent offer is a document somebody has. Editing it is the owner's call. */
    const guardSent = async () => {
      const { data } = await admin.from("hrms_offer").select("status").eq("id", id).maybeSingle();
      if (data && data.status !== "Draft" && !owner)
        throw new HttpError(409, `This offer is ${String(data.status).toLowerCase()} — only ${RAGHU_EMAIL} may change it now.`);
    };

    /* ── save a page ── */
    if (action === "save") {
      await guardSent();
      const p = (body.patch || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_by: stamp, updated_at: now };
      for (const k of ["name", "email", "mobile", "address", "designation", "roles", "reporting_to", "discussion_notes", "type", "send_to", "send_from", "send_cc"])
        if (k in p) patch[k] = clean(p[k], 4000);
      for (const k of ["offer_date", "joining_date"]) if (k in p) patch[k] = p[k] || null;
      for (const k of ["probation_months", "valid_days"]) if (k in p) patch[k] = Number(p[k]) || null;
      if ("agreed_gross" in p) patch.agreed_gross = Number(String(p.agreed_gross ?? "").replace(/[^0-9.]/g, "")) || null;
      for (const k of ["terms", "internal_notes", "covering_letter"]) if (k in p) patch[k] = scrub(String(p[k] ?? ""));
      if ("role_doc" in p && p.role_doc && typeof p.role_doc === "object") {
        const rd = p.role_doc as Record<string, unknown>;
        patch.role_doc = {
          role: clean(rd.role, 300), purpose: scrub(String(rd.purpose ?? "")),
          job_description: scrub(String(rd.job_description ?? "")),
          deliverable: scrub(String(rd.deliverable ?? "")),
          metric: scrub(String(rd.metric ?? "")),
        };
      }
      if ("competencies" in p && Array.isArray(p.competencies))
        patch.competencies = (p.competencies as { name?: unknown; level?: unknown }[])
          .slice(0, 60)
          .map((c) => ({ name: clean(c.name, 200), level: Math.max(1, Math.min(5, Number(c.level) || 3)) }))
          .filter((c) => c.name);
      if ("salary" in p && p.salary && typeof p.salary === "object") patch.salary = p.salary;
      if ("components" in p && p.components && typeof p.components === "object") patch.components = p.components;
      if ("basic_pct" in p) patch.basic_pct = Number(p.basic_pct) || null;

      const { error } = await admin.from("hrms_offer").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * The structure, computed server-side so it matches every other screen.
     *
     * Two numbers drive it — the agreed gross and the basic percentage — and
     * the rest adjusts. Explicit components, when sent, win over the split:
     * the letter can be tuned line by line, and Fixed Allowance absorbs the
     * difference so the five never stop summing to the gross that was agreed.
     */
    if (action === "salary") {
      const gross = Number(String(body.agreed_gross ?? "").replace(/[^0-9.]/g, "")) || 0;
      const type = clean(body.type, 60);
      const basicPct = Number(body.basic_pct) || 58;
      if (!gross) throw new HttpError(400, "What is the agreed gross?");

      let comps: Components = splitGross(gross, basicPct, type);
      if (body.components && typeof body.components === "object") {
        const c = body.components as Record<string, unknown>;
        const n = (k: string, fallback: number) => {
          const v = c[k];
          return v === undefined || v === null || v === "" ? fallback : Math.max(0, Math.round(Number(String(v).replace(/[^0-9.]/g, "")) || 0));
        };
        comps = {
          basic_da: n("basic_da", comps.basic_da),
          hra: n("hra", comps.hra),
          conveyance: n("conveyance", comps.conveyance),
          medical_allowance: n("medical_allowance", comps.medical_allowance),
          fixed_allowance: n("fixed_allowance", comps.fixed_allowance),
        };
        // Fixed absorbs any drift, unless it is the line being edited
        if (!("fixed_allowance" in c) || c.fixed_allowance === undefined)
          comps.fixed_allowance = Math.max(0, gross - comps.basic_da - comps.hra - comps.conveyance - comps.medical_allowance);
      }

      const table = salaryTable(getterFor(comps), type);
      return NextResponse.json({
        salary: table,
        components: comps,
        componentsTotal: componentsTotal(comps),
        basic_pct: comps.basic_da && gross ? Math.round((comps.basic_da / gross) * 10000) / 100 : basicPct,
      });
    }

    /* ── the status ladder ── */
    if (action === "status") {
      const to = String(body.status || "");
      const patch: Record<string, unknown> = { status: to, updated_by: stamp, updated_at: now };
      if (to === "Sent") { patch.sent_at = now; patch.sent_by = stamp; }
      if (to === "Accepted") patch.accepted_at = now;
      if (to === "Declined") patch.declined_at = now;
      if (to === "Draft") { patch.sent_at = null; patch.sent_by = null; patch.accepted_at = null; patch.declined_at = null; }
      if (to === "Joined") {
        patch.joined_at = now;
        if (body.employee_id) patch.employee_id = clean(body.employee_id, 40);
      }
      const { error } = await admin.from("hrms_offer").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may remove an offer.`);
      const { error } = await admin.from("hrms_offer").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
