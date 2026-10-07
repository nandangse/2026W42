import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { splitGross } from "@/lib/salary";
import { swallow } from "@/lib/swallow";
import * as XLSX from "xlsx";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { driveConfig, uploadToFolder, trashFile } from "@/lib/drive";
import { readEssl, type EsslPunch } from "@/lib/essl";
import { parseMuster, parseRates, generateRegister, musterVars, OPTIONAL_MUSTER_VARS, type Muster, type Rates, workingDaysFor } from "@/lib/muster";
import { totalsFor } from "@/lib/salary-sheet";
import { MONTHS } from "@/lib/hrms-template";
import { people, renderFor, queueMessages, queueStatuses } from "@/lib/hrms-wa";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run Monthly Payroll (Dr Raghu, 4 Sep 2026).
 *
 * The table: "Month, Year, Date run, run by, approved by. Approval is by
 * Raghu." The document behind each row: "Upload Documents — multiple —
 * saved in the drive folder HR-Payroll run-Month Year ... upload the Muster,
 * the salary rate list. Press Generate ... Salary register ... attendance
 * muster ... send messages to people ... kept in the communications tab ...
 * Any replies given by them is to be also pulled and kept."
 *
 * GET                → the runs
 * GET ?id=           → one run: files, muster, register, messages
 * POST multipart     → upload (id, kind, files[]) — parsed and filed in Drive
 * POST json          → record · approve · unapprove · note · generate ·
 *                      wa_preview · wa_queue · pull_replies
 */
const label = (m: number, y: number) => `${MONTHS[m - 1] || m} ${y}`;
const folderName = (m: number, y: number) => `HR-Payroll run-${label(m, y)}`;
const daysIn = (m: number, y: number) => new Date(y, m, 0).getDate();

async function runRow(admin: ReturnType<typeof adminClient>, id: string) {
  const { data, error } = await admin.from("hrms_salary_sheet").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (/muster|rates|drive_folder|generated/i.test(error.message)) throw new HttpError(503, "Run migration 0133 first — the payroll run has nowhere to keep its uploads yet.");
    throw new Error(error.message);
  }
  if (!data) throw new HttpError(404, "No such run.");
  return data as Record<string, unknown>;
}

const gridOf = (buf: Buffer, name: string): unknown[][] => {
  const wb = XLSX.read(buf, { type: "buffer", raw: /\.csv$/i.test(name) });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as unknown[][];
};

export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const r = await runRow(admin, id);
      const [{ data: files }, { data: comms }, inputsQ, { data: liveStruct }] = await Promise.all([
        admin.from("hrms_payroll_file").select("id, kind, name, mime, size, drive_id, drive_link, uploaded_by, uploaded_at").eq("sheet_id", id).order("uploaded_at", { ascending: false }),
        admin.from("hrms_communication").select("id, employee_id, channel, direction, to_address, subject, body, status, error, sent_by, sent_at, meta, external_id").eq("run_id", id).order("sent_at", { ascending: false }).limit(1000),
        admin.from("hrms_payroll_input").select("key, submitted_by, submitted_at, note").eq("sheet_id", id),
        admin.from("hrms_salary_structure").select("id, title, effective_from").eq("status", "Live").maybeSingle(),
      ]);
      // pre-0140 the inputs table is not there yet; the forms still show, unsigned
      const inputs = inputsQ.error ? [] : inputsQ.data || [];
      let liveRates: { title: string; count: number } | null = null;
      if (liveStruct) {
        const { count } = await admin.from("hrms_salary_rate").select("id", { count: "exact", head: true }).eq("structure_id", liveStruct.id);
        liveRates = { title: String(liveStruct.title), count: count || 0 };
      }
      // the queue's live word on each outbound WhatsApp line
      const rows = (comms || []) as Record<string, unknown>[];
      const qids = rows.map((c) => String((c.meta as { queue_id?: string } | null)?.queue_id || "")).filter(Boolean);
      const live = await queueStatuses(qids);
      for (const c of rows) {
        const q = live.get(String((c.meta as { queue_id?: string } | null)?.queue_id || ""));
        if (q) { c.status = q.status; if (q.error) c.error = q.error; }
      }
      const names = new Map<string, string>();
      const muster = r.muster as Muster | null;
      for (const m of muster?.rows || []) names.set(m.employee_id, m.name);
      const { muster: _m, rates: _r, rows: register, ...head } = r as Record<string, unknown> & { rows: unknown };
      const counts: Record<string, number> = {};
      for (const c of rows) { if (c.direction === "in") counts.replies = (counts.replies || 0) + 1; else counts[String(c.status)] = (counts[String(c.status)] || 0) + 1; }
      return NextResponse.json({
        run: head, files: files || [],
        muster: muster ? { month: muster.month, year: muster.year, days: muster.days, columns: muster.columns, unmapped: muster.unmapped, warnings: muster.warnings, rows: muster.rows } : null,
        rates: r.rates ? { rows: (r.rates as Rates).rows.length, columns: (r.rates as Rates).columns, warnings: (r.rates as Rates).warnings } : null,
        register: register || [],
        messages: rows.map((c) => ({ ...c, name: names.get(String(c.employee_id)) || c.employee_id })),
        counts,
        inputs,
        live_rates: liveRates,
      });
    }

    const { data, error } = await admin.from("hrms_salary_sheet")
      .select("id, month, year, status, file_name, uploaded_by, uploaded_at, frozen_by, frozen_at, approved_by, approved_at, run_note, total_count, total_salary, net_payable, paid_to_bank, generated_at, wa_batch_id, drive_folder_link, created_at")
      .order("year", { ascending: false }).order("month", { ascending: false });
    if (error) {
      if (/approved_by|run_note|generated_at|wa_batch_id|drive_folder/i.test(error.message)) {
        const { data: d2 } = await admin.from("hrms_salary_sheet").select("id, month, year, status, file_name, uploaded_by, uploaded_at, frozen_by, frozen_at, total_count, total_salary, net_payable, paid_to_bank, created_at").order("year", { ascending: false }).order("month", { ascending: false });
        return NextResponse.json({ rows: d2 || [], needsMigration: true });
      }
      if (/hrms_salary_sheet|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ rows: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;

    // ── uploads: multipart ──
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const id = String(form.get("id") || "");
      const kind = String(form.get("kind") || "other");
      const r = await runRow(admin, id);
      const month = Number(r.month), year = Number(r.year);
      const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) throw new HttpError(400, "No file came through.");
      const cfg = driveConfig();
      const out: { name: string; kind: string; drive_link: string | null; parsed: string | null; warnings: string[] }[] = [];
      for (const f of files) {
        const ab = await f.arrayBuffer();
        const buf = Buffer.from(ab);
        let parsed: unknown = null, summary: string | null = null, warnings: string[] = [];
        /* THE BIOMETRIC EXPORT NOW LANDS SOMEWHERE (Dr Raghu, 9 Sep 2026).
           Until today an ESSL file was filed to Drive and nothing else —
           the bytes were kept and the facts inside them were not. It is
           parsed into punches now, beside the ones from /present, and
           several files may be dropped at once because one machine per
           gate means one export per gate. */
        if (kind === "essl") {
          try {
            const read = readEssl(buf, f.name);
            summary = `${read.punches.length} punch(es) · ${read.rows} rows · ${read.from || "?"} to ${read.to || "?"}`;
            if (read.skipped.noEmployee || read.skipped.noTime)
              warnings.push(`Skipped ${read.skipped.noEmployee} row(s) with no employee number and ${read.skipped.noTime} with no readable time — nothing was guessed at.`);
            const batch = crypto.randomUUID();
            let written = 0;
            for (let i = 0; i < read.punches.length; i += 500) {
              const slice = read.punches.slice(i, i + 500).map((x: EsslPunch) => ({ ...x, batch_id: batch, created_by: stamp }));
              const { error: pe } = await admin.from("hrms_attendance_punch")
                .upsert(slice, { onConflict: "employee_id,kind,source,at", ignoreDuplicates: true });
              if (pe) {
                if (/does not exist|schema cache/i.test(pe.message)) { warnings.push("Run migration 0163 — attendance has nowhere to live yet, so the punches were not kept."); break; }
                warnings.push(pe.message); break;
              }
              written += slice.length;
            }
            if (written) {
              summary += ` · ${written} kept`;
              await admin.from("hrms_essl_import").insert({
                id: batch, filename: f.name, rows_read: read.rows, rows_written: written,
                from_date: read.from || null, to_date: read.to || null, uploaded_by: stamp,
              });
            }
            parsed = { columns: read.columns, rows: read.rows, punches: read.punches.length, from: read.from, to: read.to };
          } catch (e) {
            warnings.push(e instanceof Error ? e.message : String(e));
          }
        }
        if (kind === "muster" || kind === "rates") {
          try {
            const grid = gridOf(buf, f.name);
            if (kind === "muster") { const m = parseMuster(grid); parsed = m; summary = `${m.rows.length} people · ${m.days} days · ${m.month ? label(m.month, m.year || year) : "month unknown"}`; warnings = m.warnings; if (m.month && m.month !== month) warnings.push(`The muster's day columns say month ${m.month}, but this run is ${label(month, year)}.`); }
            else { const rt = parseRates(grid); parsed = rt; summary = `${rt.rows.length} rates`; warnings = rt.warnings; }
          } catch (e) { warnings.push(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        let drive: { id: string; link: string | null } | null = null;
        if (cfg) {
          try { drive = await uploadToFolder(cfg, cfg.folderId, folderName(month, year), ab, f.name, f.type || "application/octet-stream"); }
          catch (e) { warnings.push(`Drive: ${e instanceof Error ? e.message : String(e)}`); }
        } else warnings.push("Drive is not configured on this deploy — the file is read but not filed.");
        const { error } = await admin.from("hrms_payroll_file").insert({ sheet_id: id, kind, name: f.name, mime: f.type || null, size: f.size, drive_id: drive?.id || null, drive_link: drive?.link || null, parsed, uploaded_by: stamp });
        if (error) {
          if (/hrms_payroll_file|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0133 first — uploads have nowhere to be kept yet.");
          throw new Error(error.message);
        }
        // the latest muster / rates become the run's
        const patch: Record<string, unknown> = { updated_at: now };
        if (kind === "muster" && parsed) patch.muster = parsed;
        if (kind === "rates" && parsed) patch.rates = parsed;
        if (drive && !r.drive_folder_id) {
          // the folder's own id, from the file's parent — one lookup, once
          patch.drive_folder_link = drive.link ? drive.link.replace(/\/file\/d\/[^/]+.*$/, "") : null;
        }
        await admin.from("hrms_salary_sheet").update(patch).eq("id", id);
        out.push({ name: f.name, kind, drive_link: drive?.link || null, parsed: summary, warnings });
      }
      return NextResponse.json({ ok: true, files: out });
    }

    const body = await readBody(req, {});
    const action = String(body.action || "");

    if (action === "record") {
      const month = Number(body.month), year = Number(body.year);
      if (!(month >= 1 && month <= 12) || !(year >= 2020 && year <= 2100)) throw new HttpError(400, "Month and year, please.");
      const { data: have } = await admin.from("hrms_salary_sheet").select("id").eq("month", month).eq("year", year).maybeSingle();
      if (have) return NextResponse.json({ ok: true, id: have.id, existed: true });
      const { data, error } = await admin.from("hrms_salary_sheet").insert({ month, year, status: "Draft", uploaded_by: stamp, uploaded_at: now, run_note: String(body.note || "").slice(0, 500) || null, updated_at: now }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "approve" || action === "unapprove") {
      if (!owner) throw new HttpError(403, `Approval is ${RAGHU_EMAIL}'s.`);
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "Which run?");
      const patch = action === "approve" ? { approved_by: stamp, approved_at: now, updated_at: now } : { approved_by: null, approved_at: null, updated_at: now };
      const { error } = await admin.from("hrms_salary_sheet").update(patch).eq("id", id);
      if (error) { if (/approved_by/i.test(error.message)) throw new HttpError(503, "Run migration 0132 first — approval has nowhere to be kept yet."); throw new Error(error.message); }
      return NextResponse.json({ ok: true });
    }

    /** REMOVE an upload — the row goes, the Drive copy is binned, and the run's muster or rates fall back to the newest remaining file of that kind. */
    if (action === "remove_file") {
      const id = String(body.id || ""), fileId = String(body.file_id || "");
      if (!fileId) throw new HttpError(400, "Which file?");
      const { data: f } = await admin.from("hrms_payroll_file").select("id, kind, drive_id, sheet_id").eq("id", fileId).eq("sheet_id", id).maybeSingle();
      if (!f) throw new HttpError(404, "No such upload on this run.");
      const { error } = await admin.from("hrms_payroll_file").delete().eq("id", fileId);
      if (error) throw new Error(error.message);
      let binned = false;
      if (f.drive_id) { const cfg = driveConfig(); if (cfg) { try { await trashFile(cfg, String(f.drive_id)); binned = true; } catch (e) { swallow("hrms/payroll", e); /* the row is gone; the Drive copy can be binned by hand */ } } }
      if (f.kind === "muster" || f.kind === "rates") {
        const { data: rest } = await admin.from("hrms_payroll_file").select("parsed").eq("sheet_id", id).eq("kind", f.kind).not("parsed", "is", null).order("uploaded_at", { ascending: false }).limit(1);
        const next = rest && rest[0] ? rest[0].parsed : null;
        await admin.from("hrms_salary_sheet").update({ [f.kind]: next, updated_at: now }).eq("id", id);
      }
      return NextResponse.json({ ok: true, binned });
    }

    /** RE-READ THE MUSTER (7 Oct 2026) — the newest muster file on the run,
        fetched back from Drive and parsed again with today's parser. For
        the day a file lands that the parser did not yet understand, so
        nobody has to find the CSV and upload it twice. */
    if (action === "reparse_muster") {
      const id = String(body.id || "");
      const { data: f } = await admin.from("hrms_payroll_file").select("id, name, drive_id, kind").eq("sheet_id", id).eq("kind", "muster").order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
      if (!f) throw new HttpError(404, "No muster file on this run yet — upload it first.");
      if (!f.drive_id) throw new HttpError(409, `${f.name} was never filed in Drive, so it cannot be read again — upload it once more.`);
      const cfg = driveConfig();
      if (!cfg) throw new HttpError(503, "Drive is not configured on this deploy.");
      const { downloadFile } = await import("@/lib/drive");
      const buf = await downloadFile(cfg, String(f.drive_id));
      const m = parseMuster(gridOf(buf, String(f.name)));
      await admin.from("hrms_payroll_file").update({ parsed: m }).eq("id", f.id);
      await admin.from("hrms_salary_sheet").update({ muster: m, updated_at: now }).eq("id", id);
      return NextResponse.json({ ok: true, rows: m.rows.length, days: m.days, month: m.month, year: m.year, warnings: m.warnings });
    }

    /** SUBMIT AN INPUT — the signature on one of the run's forms (0140). */
    if (action === "submit_input" || action === "unsubmit_input") {
      const key = String(body.key || "");
      if (!/^(essl|rates|muster|advance|loan|lunch|site)$/.test(key)) throw new HttpError(400, "Which input?");
      const sheetId = String(body.id || "");
      await runRow(admin, sheetId);
      const signed = action === "submit_input";
      const row: { sheet_id: string; key: string; submitted_by: string | null; submitted_at: string | null; note: string; updated_at: string } =
        { sheet_id: sheetId, key, submitted_by: signed ? stamp : null, submitted_at: signed ? now : null, note: String(body.note || "").slice(0, 500), updated_at: now };
      const { error } = await admin.from("hrms_payroll_input").upsert(row, { onConflict: "sheet_id,key" });
      if (error) {
        if (/hrms_payroll_input|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0140 first — the inputs have nowhere to be signed yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "working_days") {
      const n = Number(body.working_days);
      const wd = Number.isFinite(n) && n > 0 && n <= 31 ? Math.round(n) : null;   // null = back to the default
      const { error } = await admin.from("hrms_salary_sheet").update({ working_days: wd, updated_at: now }).eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, working_days: wd });
    }

    if (action === "note") {
      const { error } = await admin.from("hrms_salary_sheet").update({ run_note: String(body.note || "").slice(0, 500) || null, updated_at: now }).eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /** GENERATE — muster × rates → the register, stored as the run's rows. */
    if (action === "generate") {
      const id = String(body.id || "");
      const r = await runRow(admin, id);
      const muster = r.muster as Muster | null;
      if (!muster?.rows?.length) throw new HttpError(400, "Upload the muster first — there is nothing to generate from.");
      /**
       * THE RATE FROM THE SYSTEM (Dr Raghu, 7 Sep 2026: "from the August
       * month we should not use the salary rates as an upload. It should
       * have an option saying take the salary rate from the system, which is
       * the latest one available").
       *
       * The latest one available is the appraisal he has FINALISED, for a
       * month at or after the date it takes effect. Where a person has no
       * finalised appraisal in force, nothing is invented for them: they fall
       * through to their record, exactly as they did before.
       *
       * Why this had to exist: the August run generated on 5 September read
       * the Live salary structure and paid 43 people on their old rate, two
       * days before the revision was loaded. A rate list is a copy, and a
       * copy is out of date the moment the thing it copied moves.
       */
      const savedSource = ((r.mapping as { rate_source?: string } | null) || {}).rate_source;
      const wantSystem = String(body.rate_source ?? savedSource ?? "") === "system";
      let rates = (r.rates as Rates | null) || null;
      let systemCount = 0;
      if (wantSystem) {
        const monthEnd = new Date(Date.UTC(Number(r.year), Number(r.month), 0)).toISOString().slice(0, 10);
        const { data: aps } = await admin.from("hrms_appraisal")
          .select("employee_id, new_gross, approved_at, effective_from, structure, new_designation")
          .not("approved_at", "is", null).not("new_gross", "is", null);
        const inForce = ((aps || []) as { employee_id: string; new_gross: number; effective_from: string | null; structure: { components?: Record<string, number> } | null }[])
          .filter((a) => !a.effective_from || String(a.effective_from).slice(0, 10) <= monthEnd);
        const who = await people(admin, inForce.map((a) => String(a.employee_id)));
        const typeOfId = new Map(who.map((p) => [p.id, p.type]));
        const nameOfId = new Map(who.map((p) => [p.id, p.name]));
        const rows2 = inForce.map((a) => {
          const id = String(a.employee_id);
          const type = typeOfId.get(id) || null;
          const c = a.structure?.components;
          const parts = c && Object.keys(c).length
            ? { basic_da: Number(c.basic_da) || 0, hra: Number(c.hra) || 0, fixed_allowance: Number(c.fixed) || 0, conveyance: Number(c.conveyance) || 0, medical_allowance: Number(c.medical) || 0 }
            : splitGross(Number(a.new_gross), undefined, type);
          return {
            employee_id: id, name: nameOfId.get(id) || null, type,
            gross: Number(a.new_gross),
            basic_da: parts.basic_da, hra: parts.hra, fixed: parts.fixed_allowance,
            conveyance: parts.conveyance, medical: parts.medical_allowance,
            site: c ? Number(c.site) || null : null, per_day: null,
          };
        });
        systemCount = rows2.length;
        rates = { rows: rows2, columns: { source: `Genie — ${rows2.length} finalised appraisals in force on ${monthEnd}` }, warnings: [] };
      }
      // no rate list uploaded → the Live salary structure (HRIS → Salary Rate List) is the rate list
      if (!rates || !rates.rows?.length) {
        const { data: live } = await admin.from("hrms_salary_structure").select("id, title").eq("status", "Live").maybeSingle();
        if (live) {
          const { data: lr } = await admin.from("hrms_salary_rate").select("employee_id, name, type, basic_da, hra, fixed_allowance, conveyance, medical_allowance, gross, per_day").eq("structure_id", live.id);
          rates = { rows: (lr || []).map((x) => ({ employee_id: String(x.employee_id), name: x.name, type: x.type, gross: Number(x.gross), basic_da: Number(x.basic_da), hra: Number(x.hra), fixed: Number(x.fixed_allowance), conveyance: Number(x.conveyance), medical: Number(x.medical_allowance), site: null, per_day: Number(x.per_day) })), columns: { source: String(live.title) }, warnings: [] };
        }
      }
      const month = Number(r.month), year = Number(r.year);
      const workingDays = Number(r.working_days) > 0 ? Number(r.working_days) : workingDaysFor(month, year);
      const ppl = await people(admin, muster.rows.map((m) => m.employee_id));
      const byId = new Map(ppl.map((p) => [p.id, p]));
      const HEADERS: Record<string, string> = { "Basic and DA": "Basic and DA", HRA: "HRA", "Fixed Allowance": "Fixed Allowance", Conveyance: "Conveyance", "Medical Allowance": "Medical Allowance", "Gross Salary": "Gross Salary" };
      // last month's register closes the leave and loan ledgers this one opens
      const pm = month === 1 ? 12 : month - 1, py = month === 1 ? year - 1 : year;
      const { data: prevSheet } = await admin.from("hrms_salary_sheet").select("rows").eq("month", pm).eq("year", py).maybeSingle();
      const prevRows = new Map<string, { leave_cb?: number; loan_cb?: number }>(((prevSheet?.rows as { employee_id?: string; leave_cb?: number; loan_cb?: number }[] | null) || []).map((x) => [String(x.employee_id), x]));
      const { rows, warnings } = generateRegister(muster, rates, (eid) => {
        const p = byId.get(eid); if (!p) return null;
        // the record's pay fields live under the sheet's own headers in extra — read through the catalogue's keys
        const get = (k: string) => {
          const key = ({ "Basic and DA": "basic_da", HRA: "hra", "Fixed Allowance": "fixed_allowance", Conveyance: "conveyance", "Medical Allowance": "medical_allowance", "Gross Salary": "gross_salary", "Leave as on 31st june 2026": "leave_as_on" } as Record<string, string>)[k] || k;
          return p.value[key] ?? p.value[HEADERS[k] || k] ?? null;
        };
        return { type: p.type || null, name: p.name, get };
      }, daysIn(month, year), (eid) => {
        const prev = prevRows.get(eid);
        if (prev && prev.leave_cb != null) return { leave_ob: Number(prev.leave_cb) || 0, loan_ob: Number(prev.loan_cb) || 0 };
        const p = byId.get(eid);
        return p ? { leave_ob: Number(String(p.value.leave_as_on || "").replace(/[^0-9.]/g, "")) || 0, loan_ob: Number(String(p.value.loan_as_on || "").replace(/[^0-9.]/g, "")) || 0 } : null;
      }, workingDays, month);
      const typeOf = (eid: string | null) => (eid ? byId.get(eid)?.type || null : null);
      const totals = totalsFor(rows.map((x) => ({ employee_id: x.employee_id, name: x.name, type: x.type, earned: x.earned, deductions: x.deductions, net: x.net, attendance: x.attendance, paid_days: x.paid_days, gross: x.gross, basic_da: x.basic_da, hra: x.hra, fixed_allowance: x.fixed_allowance, conveyance: x.conveyance, site_allowance: x.site_allowance, pf: x.pf, pt: x.pt, other_ded: x.other_ded, loan: x.loan, advance: x.advance, tds: x.tds, arrears: x.arrears, hold: x.hold })), typeOf);
      const { error } = await admin.from("hrms_salary_sheet").update({ rows, ...totals, generated_at: now, generated_by: stamp, updated_at: now, mapping: { source: "generated", rate_source: wantSystem ? "system" : "list", muster: muster.columns, rates: rates?.columns || null, warnings: [...muster.warnings, ...(rates?.warnings || []), ...warnings] } }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, lines: rows.length, warnings, totals, rateSource: wantSystem ? "system" : rates?.columns?.source || "record", fromSystem: systemCount });
    }

    /** WHATSAPP — the attendance message to everybody on the muster. */
    if (action === "wa_preview" || action === "wa_queue") {
      const id = String(body.id || "");
      const r = await runRow(admin, id);
      const muster = r.muster as Muster | null;
      if (!muster?.rows?.length) throw new HttpError(400, "Upload the muster first — the message is built from it.");
      const month = Number(r.month), year = Number(r.year);
      let template = String(body.body || "");
      // "the whatsapp message needs template name - Attendance monthly" (Dr Raghu, 4 Sep 2026)
      let key = String(body.template_key || "attendance_monthly");
      if (!template.trim()) {
        const { data: t } = await admin.from("hrms_text_master").select("body").eq("key", key).maybeSingle();
        template = String(t?.body || "");
        if (!template.trim() && key === "attendance_monthly") { key = "attendance_whatsapp"; const { data: t2 } = await admin.from("hrms_text_master").select("body").eq("key", key).maybeSingle(); template = String(t2?.body || ""); }
      }
      if (!template.trim()) throw new HttpError(400, "No template — Masters → Standard Texts, kind WhatsApp.");
      const only = new Set<string>((body.ids || []).map(String));
      const lines = muster.rows.filter((m) => (only.size ? only.has(m.employee_id) : true) && !/resign|terminat|left/i.test(m.status));
      const ppl = await people(admin, lines.map((m) => m.employee_id));
      const byId = new Map(ppl.map((p) => [p.id, p]));
      const rendered = lines.map((m) => {
        const p = byId.get(m.employee_id) || { id: m.employee_id, name: m.name, type: m.category, department: m.department, phone: "", value: { name: m.name } as Record<string, string | null> };
        return renderFor(p, template, null, musterVars(m, label(month, year)), m.mobile || null);
      });
      if (action === "wa_preview") {
        const blanks: Record<string, number> = {};
        for (const x of rendered) for (const k of x.missing) if (!OPTIONAL_MUSTER_VARS.has(k)) blanks[k] = (blanks[k] || 0) + 1;
        return NextResponse.json({ count: rendered.length, noPhone: rendered.filter((x) => !x.phone || x.phone.length < 8).length, blanks, sample: rendered.slice(0, 5), template, template_key: key });
      }
      let crmProfileId: string | null = null;
      try { const { crmDb } = await import("@/crm/db"); const { data: rp } = await crmDb().from("profile").select("id").ilike("email", me.email).maybeSingle(); crmProfileId = rp?.id ? String(rp.id) : null; } catch (e) { swallow("hrms/payroll", e); /* fine */ }
      const res = await queueMessages(admin, rendered, { templateKey: key, by: stamp, crmProfileId, runId: id });
      await admin.from("hrms_salary_sheet").update({ wa_batch_id: res.batch_id, updated_at: now }).eq("id", id);
      return NextResponse.json({ ok: true, ...res });
    }

    /** REPLIES — what people answered on WhatsApp, pulled from Periskope and kept against the run and the person. */
    if (action === "pull_replies") {
      const id = String(body.id || "");
      const { data: sent } = await admin.from("hrms_communication").select("employee_id, to_address, sent_at").eq("run_id", id).eq("channel", "whatsapp").eq("direction", "out");
      const byPhone = new Map<string, { employee_id: string; since: string }>();
      for (const s of sent || []) { const ph = String(s.to_address || "").replace(/\D/g, ""); if (!ph) continue; const cur = byPhone.get(ph); if (!cur || String(s.sent_at) < cur.since) byPhone.set(ph, { employee_id: String(s.employee_id), since: String(s.sent_at) }); }
      if (!byPhone.size) return NextResponse.json({ ok: true, pulled: 0, why: "No WhatsApp has gone out from this run yet." });
      const { crmDb } = await import("@/crm/db");
      const { periskopeConfig, periskopeMessages } = await import("@/crm/periskope");
      const cfg = await periskopeConfig(crmDb());
      if ("error" in cfg) throw new HttpError(400, cfg.error);
      let pulled = 0, checked = 0, failed = 0;
      for (const [phone, who] of byPhone) {
        checked++;
        const got = await periskopeMessages(cfg, phone, 50);
        if (got.error) { failed++; continue; }
        const replies = got.messages.filter((m) => !m.from_me && m.at >= who.since);
        for (const m of replies) {
          const { error } = await admin.from("hrms_communication").insert({ employee_id: who.employee_id, channel: "whatsapp", direction: "in", to_address: phone, subject: "Reply", body: m.text, status: "received", sent_by: phone, sent_at: m.at || now, run_id: id, external_id: m.id || null, meta: { via: "periskope" } });
          if (!error) pulled++; // a duplicate external_id is refused by the index — kept once
        }
      }
      return NextResponse.json({ ok: true, pulled, checked, failed });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
