import { NextResponse } from "next/server";
import { idpSession } from "@/lib/idp-session";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import * as XLSX from "xlsx";
import { requireUser, requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, FIELD_GROUPS } from "@/lib/hrms";
import { people } from "@/lib/hrms-wa";
import { extractSlips, slipsFromRegister, type Slip } from "@/lib/salary-slip";
import { HANDBOOK_EDITION } from "@/lib/handbook-seed";
import { salaryTable } from "@/lib/salary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/my/sheet — everything an employee's own page shows (Dr Raghu, 5 Sep
 * 2026): their record, their slips, the leave and loan registers month by
 * month, their IDP and what came back, their learning goals and log, their
 * queries and applications, and the handbook acknowledgement.
 *
 * YOURS AND NOBODY ELSE'S. The login's e-mail is matched to one employee
 * record — the Genie user set on the record first, the record's own e-mail
 * second, lowercase-exact, never a pattern.
 */
const CYCLE = "2026-27";
/** The salary table reads by sheet header; the record keeps field keys. */
const SHEET_TO_KEY: Record<string, string> = {
  "Basic and DA": "basic_da", "HRA": "hra", "Fixed Allowance": "fixed_allowance",
  "Conveyance": "conveyance", "Medical Allowance": "medical_allowance", "Site Allowance": "site_allowance",
};
/** The record groups the person reads on their own sheet. */
const MY_GROUPS = ["identity", "contact", "personal", "family", "statutory", "pay", "bank", "benefits", "documents"];

const APPLICATION_KINDS: Record<string, { label: string; fields: { key: string; label: string; type: "date" | "number" | "text" | "select"; options?: string[]; required?: boolean }[] }> = {
  leave: { label: "Leave", fields: [
    { key: "kind", label: "Kind of leave", type: "select", options: ["Earned / paid leave", "Comp off", "Sick", "Without pay"], required: true },
    { key: "from", label: "From", type: "date", required: true }, { key: "to", label: "To", type: "date", required: true },
    { key: "reason", label: "Reason", type: "text", required: true } ] },
  advance: { label: "Advance", fields: [
    { key: "amount", label: "Amount (₹)", type: "number", required: true }, { key: "reason", label: "What for", type: "text", required: true },
    { key: "recover", label: "Recover from", type: "select", options: ["Next salary", "Two salaries", "Three salaries"] } ] },
  loan: { label: "Loan", fields: [
    { key: "amount", label: "Amount (₹)", type: "number", required: true }, { key: "months", label: "Repay over (months)", type: "number", required: true },
    { key: "reason", label: "What for", type: "text", required: true } ] },
  encashment: { label: "Leave encashment", fields: [
    { key: "days", label: "Days to encash", type: "number", required: true }, { key: "reason", label: "Reason", type: "text" } ] },
  uniform: { label: "Uniform", fields: [
    { key: "item", label: "Item", type: "select", options: ["Shirt", "Pant", "Shirt and pant", "Jacket", "Cap"], required: true },
    { key: "size", label: "Size", type: "text", required: true }, { key: "qty", label: "How many", type: "number", required: true }, { key: "reason", label: "Reason", type: "text" } ] },
  shoes: { label: "Shoes", fields: [
    { key: "size", label: "Shoe size", type: "text", required: true }, { key: "reason", label: "Reason", type: "select", options: ["Worn out", "New joinee", "Damaged at work", "Other"], required: true } ] },
  other: { label: "Other things", fields: [
    { key: "what", label: "What do you need", type: "text", required: true }, { key: "why", label: "Why", type: "text" } ] },
};

async function me(email: string) {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const e = email.trim().toLowerCase();
  const { data: eds } = await admin.from(T.edits).select("employee_id, value").eq("field", "user_email");
  const hitEdit = (eds || []).find((x) => String(x.value || "").trim().toLowerCase() === e);
  let id: string | null = hitEdit ? String(hitEdit.employee_id) : null;
  if (!id) {
    const { data: emps } = await admin.from(T.employees).select("id, email");
    const hit = (emps || []).find((x) => String(x.email || "").trim().toLowerCase() === e);
    id = hit ? String(hit.id) : null;
  }
  if (!id) return null;
  const p = (await people(admin, [id]))[0];
  return p || null;
}

export async function GET(req: Request) {
  try {
    /**
     * A person signed in with their PERSONAL e-mail has no Genie user
     * (Dr Raghu, 7 Sep 2026). Their cookie proves exactly one thing — which
     * employee they are — so the sheet is served for that employee and can
     * name nobody else. Everything below reads from `p` and `subject`, which
     * is why this needs no second copy of the assembly.
     */
    const viaIdp = await idpSession();
    const u = viaIdp ? null : await requireUser();
    const admin = adminClient();

    /**
     * ?person=<employee id> — THE SAME SHEET, SEEN FROM HR'S SIDE.
     *
     * The Individual Report Card shows what the person themselves sees
     * (Dr Raghu, 7 Sep 2026: "most of it will be what will be seen in his IDP
     * that he sees"), so it asks this route rather than assembling a second,
     * slightly different truth beside it. Naming somebody else needs the
     * HRMS key; without the parameter nothing changes, and there is still no
     * way for an ordinary login to name a person other than themselves.
     */
    const asked = viaIdp ? null : new URL(req.url).searchParams.get("person");
    let p: Awaited<ReturnType<typeof me>> = null;
    let subject = u?.email ?? "";
    if (viaIdp) {
      p = (await people(admin, [viaIdp]))[0] || null;
      const pv = (p?.value || {}) as Record<string, string | null>;
      subject = String(pv.user_email || pv.email || pv.personal_email || "").trim().toLowerCase();
    } else if (asked) {
      await requireHrms();
      p = (await people(admin, [asked]))[0] || null;
      if (!p) throw new HttpError(404, "No such person on the roll.");
      const pv = p.value as Record<string, string | null>;
      // The IDP, the queries and the handbook are all keyed by the person's
      // own e-mail, which is the Genie login on the record before the work one.
      subject = String(pv.user_email || pv.email || "").trim().toLowerCase();
    } else {
      p = await me(u!.email);
    }
    if (!p) return NextResponse.json({ linked: false, name: u?.displayName || u?.email || "", email: u?.email || "" });
    const v = p.value as Record<string, string | null>;

    // ---- the record, in the groups the person reads ----
    const record = FIELD_GROUPS.filter((g) => MY_GROUPS.includes(g.key)).map((g) => ({
      key: g.key, label: g.label,
      fields: g.fields.filter((f) => f.kind !== "url" || v[f.key]).map((f) => ({ key: f.key, label: f.label, kind: f.kind, value: v[f.key] ?? null })).filter((f) => f.value != null && f.value !== ""),
    })).filter((g) => g.fields.length);

    // ---- the months: slips, leave and loan, newest first ----
    const { data: sheets } = await admin
      .from("hrms_salary_sheet").select("id, month, year, status, generated_at, file_path, rows")
      .order("year", { ascending: false }).order("month", { ascending: false }).limit(78);
    const months: { id: string; month: number; year: number; status: string; net: number | null; slip: Slip | null; frozen: boolean }[] = [];
    let parsedFiles = 0;
    for (const s of sheets || []) {
      const rows = (s.rows || []) as ({ employee_id: string } & Record<string, unknown>)[];
      const row = rows.find((r) => String(r.employee_id) === p.id);
      if (!row) continue;
      let slip: Slip | null = null;
      if (s.generated_at && "leave_cb" in row) {
        slip = slipsFromRegister([row], () => v, new Date(Date.UTC(Number(s.year), Number(s.month), 0)).getUTCDate())[0] || null;
      } else if (s.file_path && parsedFiles < 12) {
        // an uploaded month: the leave and loan lines live only in the file
        parsedFiles++;
        try {
          const { data: blob } = await admin.storage.from("voice-notes").download(String(s.file_path));
          if (blob) {
            const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", raw: false });
            const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
            slip = extractSlips(grid).find((x) => x.id === p.id) || null;
          }
        } catch (e) { swallow("my/sheet", e); /* the month shows without its ledger */ }
      }
      months.push({ id: String(s.id), month: Number(s.month), year: Number(s.year), status: String(s.status), net: slip?.net ?? (row.net != null ? Number(row.net) : null), slip, frozen: String(s.status) === "Frozen" });
    }

    // ---- the IDP, the reviews that came back, the appraisal that was released ----
    const { data: idps } = await admin.from("hrms_idp").select("id, submitted_at, answers, ratings, role_at_time, cycle").eq("person_email", subject.toLowerCase()).order("started_at", { ascending: false }).limit(5);
    const done = (idps || []).filter((d) => d.submitted_at);
    let reviews: Record<string, unknown>[] = [];
    if (done.length) {
      const { data: rv } = await admin.from("hrms_idp_review").select("idp_id, reviewer_name, ratings, notes, submitted_at").in("idp_id", done.map((d) => d.id)).not("submitted_at", "is", null);
      // The reviewer's ratings and words reach the person; the gross figures
      // do not — those are released through the appraisal below, on Dr Raghu's word.
      reviews = (rv || []).map((r) => ({ idp_id: r.idp_id, reviewer: r.reviewer_name, ratings: r.ratings, notes: r.notes, at: r.submitted_at }));
    }
    const { data: ap } = await admin.from("hrms_appraisal").select("cycle, new_gross, prev_gross, new_designation, brief, brief_at, decided_at").eq("employee_id", p.id).order("decided_at", { ascending: false }).limit(3);
    const released = (ap || []).filter((a) => a.brief_at).map((a) => ({ cycle: a.cycle, new_gross: a.new_gross, prev_gross: a.prev_gross, new_designation: a.new_designation, brief: a.brief, at: a.brief_at }));

    // ---- learning ----
    let learning: { note: string; at: string; id: string }[] = [];
    try { const { data } = await admin.from("hrms_learning_log").select("id, note, at").eq("employee_id", p.id).order("at", { ascending: false }).limit(100); learning = (data || []) as typeof learning; } catch (e) { swallow("my/sheet", e); /* pre-0142 */ }

    // ---- queries and applications ----
    const { data: qs } = await admin.from("hrms_query").select("id, subject, question, topic, status, answer, raised_at, answered_at, answered_by, form")
      .in("topic", ["HR Query", "Application", "Handbook"]).or(`raised_email.eq.${subject.toLowerCase()},employee_id.eq.${p.id}`).order("raised_at", { ascending: false }).limit(200);

    /**
     * WHAT THE IDP RESULTS PAGE SHOWS, in his order (Dr Raghu, 7 Sep 2026:
     * "show the table up front, then Raghu's message, then the Growth Plan,
     * then the Role, responsibility, KRA, KPI, Competence, then his form
     * filled up").
     *
     * The salary table is the same one every other screen draws, so a person
     * reads on their own page exactly what HR reads on theirs. The role and
     * its competencies come from the register, by the role they actually
     * hold. The growth note is Dr Raghu's letter to them.
     */
    const salary = salaryTable((k) => v[SHEET_TO_KEY[k] || k] ?? null, p.type);
    let growth: { note: string | null; hi: string | null; at: string | null } | null = null;
    try {
      const { data: g } = await admin.from("hrms_appraisal")
        .select("growth_note, growth_note_hi, growth_note_at")
        .eq("employee_id", p.id).eq("cycle", CYCLE).maybeSingle();
      if (g?.growth_note) growth = { note: g.growth_note, hi: g.growth_note_hi ?? null, at: g.growth_note_at ?? null };
    } catch (e) { swallow("my/sheet growth", e); }

    let roles: { role: string; job_description: string | null; deliverable: string | null; metric: string | null; competencies: { competency: string; level: string | null; note: string | null }[] }[] = [];
    try {
      const held = String(v.role || "").split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
      if (held.length) {
        const { data: rs } = await admin.from("hrms_role")
          .select("id, role, job_description, deliverable, metric").in("role", held);
        const ids = (rs || []).map((r) => r.id);
        const { data: cs } = ids.length
          ? await admin.from("hrms_role_competency").select("role_id, competency, level, note").in("role_id", ids)
          : { data: [] };
        roles = (rs || []).map((r) => ({
          role: String(r.role), job_description: r.job_description, deliverable: r.deliverable, metric: r.metric,
          competencies: ((cs || []) as { role_id: string; competency: string; level: string | null; note: string | null }[])
            .filter((c) => String(c.role_id) === String(r.id))
            .map((c) => ({ competency: c.competency, level: c.level, note: c.note })),
        }));
      }
    } catch (e) { swallow("my/sheet roles", e); }

    // ---- the handbook ----
    let acknowledged: string | null = null;
    try { const { data: a } = await admin.from("hrms_handbook_ack").select("acknowledged_at").eq("email", subject.toLowerCase()).eq("edition", HANDBOOK_EDITION).maybeSingle(); acknowledged = a?.acknowledged_at || null; } catch (e) { swallow("my/sheet", e); /* */ }

    return NextResponse.json({
      linked: true,
      me: { id: p.id, name: p.name, email: subject, type: p.type, department: p.department, designation: v.designation || null, doj: v.doj || null, location: v.location || null, manager: v.reporting_manager || null, phone: p.phone },
      record, months, idps: done, reviews, released, learning, queries: qs || [],
      salary: salary ? { rows: salary.rows, gross: salary.gross, ctcLakhs: salary.ctcLakhs } : null,
      growth, roles,
      handbook: { edition: HANDBOOK_EDITION, acknowledged },
      kinds: APPLICATION_KINDS,
      today: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric" }),
    });
  } catch (e) { return errJson(e); }
}

/** POST { action: apply, kind, fields } · { action: learning, note } · { action: learning_remove, id } */
export async function POST(req: Request) {
  try {
    /** The same two doors as the GET: a Genie login, or the personal one. */
    const viaIdp = await idpSession();
    const u = viaIdp ? null : await requireUser();
    const admin = adminClient();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const now = new Date().toISOString();
    const p = viaIdp ? (await people(admin, [viaIdp]))[0] || null : await me(u!.email);
    if (!p) throw new HttpError(403, "Your login is not linked to an employee record yet — ask HR.");
    const pv = (p.value || {}) as Record<string, string | null>;
    // whoever they are, an application is signed with an address that is theirs
    const mine = viaIdp
      ? String(pv.personal_email || pv.user_email || pv.email || "").trim().toLowerCase()
      : u!.email.toLowerCase();
    const stamp = viaIdp ? `${p.name} · ${mine}` : (u!.initials ? `${u!.initials} · ${u!.email}` : u!.email);

    if (action === "apply") {
      const kind = String(body.kind || "");
      const spec = APPLICATION_KINDS[kind];
      if (!spec) throw new HttpError(400, "Which application?");
      const fields = (body.fields || {}) as Record<string, string>;
      for (const f of spec.fields) if (f.required && !String(fields[f.key] ?? "").trim()) throw new HttpError(400, `${f.label} is needed.`);
      const lines = spec.fields.filter((f) => String(fields[f.key] ?? "").trim()).map((f) => `${f.label}: ${String(fields[f.key]).trim()}`);
      let head = spec.label;
      if (kind === "leave") {
        const d1 = new Date(fields.from), d2 = new Date(fields.to);
        const days = Number.isFinite(d1.getTime()) && Number.isFinite(d2.getTime()) ? Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1 : null;
        if (days != null && days < 1) throw new HttpError(400, "To must be on or after From.");
        head = `Leave ${fields.from} to ${fields.to}${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}`;
      } else if (kind === "advance" || kind === "loan") head = `${spec.label} of ₹${Number(fields.amount).toLocaleString("en-IN")}`;
      else if (kind === "encashment") head = `Leave encashment, ${fields.days} day${Number(fields.days) === 1 ? "" : "s"}`;
      else if (kind === "uniform") head = `Uniform: ${fields.item}, size ${fields.size} × ${fields.qty}`;
      else if (kind === "shoes") head = `Shoes, size ${fields.size}`;
      else head = `Other: ${String(fields.what).slice(0, 60)}`;
      const { error } = await admin.from("hrms_query").insert({
        employee_id: p.id, subject: `Application — ${head}`, question: lines.join("\n"), topic: "Application", status: "Open",
        raised_by: stamp, raised_email: mine, for_self: true,
        form: { application: kind, fields, contact: { employee_id: p.id, name: p.name, mobile: p.phone || "", personal_email: "", stay_location: "" } }, updated_at: now,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, subject: head });
    }

    if (action === "learning") {
      const note = String(body.note || "").trim();
      if (!note) throw new HttpError(400, "Write what you did.");
      const { error } = await admin.from("hrms_learning_log").insert({ employee_id: p.id, email: mine, note: note.slice(0, 2000) });
      if (error) { if (/hrms_learning_log|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0142 first."); throw new Error(error.message); }
      return NextResponse.json({ ok: true });
    }
    if (action === "learning_remove") {
      const { error } = await admin.from("hrms_learning_log").delete().eq("id", String(body.id || "")).eq("email", mine);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
