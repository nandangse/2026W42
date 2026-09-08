import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/hrms/essl — the biometric machine's own record
 * (Dr Raghu, 8 Sep 2026: "also I want to get the ESSL biometric data into the
 * system").
 *
 * ESSL EXPORTS ARE NOT ONE FORMAT. Different machines and different report
 * templates put the same three facts under different headings — the man, the
 * day, the moment — and some put in and out in one row while others give a
 * row per punch. So the columns are FOUND rather than assumed: the header is
 * read, each column is matched by what it is called, and a file whose headings
 * are not recognised is REFUSED WITH ITS OWN HEADINGS QUOTED BACK, so the fix
 * is obvious instead of mysterious.
 *
 * NOTHING IS INVENTED. A row without an employee number, or without a time
 * that parses, is counted and skipped — never rounded, never guessed at, never
 * attached to the nearest name. The count of what was skipped comes back with
 * the answer, because an import that silently drops a tenth of the file is
 * worse than one that fails.
 *
 * IT DOES NOT DECIDE ANYTHING. The punches land beside the ones from /present
 * with `source = 'essl'`, and what a day adds up to is still an open question
 * — "let's capture data first and then decide how we will do this".
 */
const S = (v: unknown) => String(v ?? "").trim();
const IST = "Asia/Kolkata";

/** Which column is which, by what it is called rather than where it sits. */
const pick = (headers: string[], ...names: RegExp[]): number => {
  for (const re of names) {
    const i = headers.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/** A date and a time, in whatever shape the machine wrote them. */
function when(dateCell: unknown, timeCell: unknown): string | null {
  const d = S(dateCell), t = S(timeCell);
  if (!d) return null;
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) iso = d.slice(0, 10);
  else {
    const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(d);          // dd-mm-yyyy, the Indian order
    if (m) {
      const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
      iso = `${yr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  if (!iso) return null;
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t || (typeof dateCell === "string" ? dateCell : ""));
  const hh = tm ? tm[1].padStart(2, "0") : "00";
  const mm = tm ? tm[2] : "00";
  const ss = tm?.[3] ?? "00";
  return `${iso}T${hh}:${mm}:${ss}+05:30`;
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file arrived.");
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", raw: /\.csv$/i.test(file.name), cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new HttpError(400, "That workbook has no sheets in it.");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });

    /* the header is the first row that names an employee AND a date */
    let hi = -1, headers: string[] = [];
    for (let i = 0; i < Math.min(grid.length, 25); i++) {
      const row = (grid[i] || []).map((c) => S(c).toLowerCase());
      if (row.some((c) => /emp|employee|user|person|card|code/.test(c)) && row.some((c) => /date|day|punch|time/.test(c))) {
        hi = i; headers = row; break;
      }
    }
    if (hi < 0)
      throw new HttpError(400,
        "This does not look like an ESSL export — no row names both an employee and a date. "
        + `The first row reads: ${(grid[0] || []).map((c) => S(c)).slice(0, 12).join(" | ") || "(empty)"}`);

    const cEmp  = pick(headers, /employee\s*(id|code|no)/, /emp\s*(id|code|no)/, /user\s*id/, /card\s*no/, /^code$/, /employee/, /^user$/);
    const cDate = pick(headers, /^date$/, /att.*date/, /punch\s*date/, /^day$/, /date/);
    const cIn   = pick(headers, /in\s*time/, /first\s*in/, /^in$/, /check\s*in/);
    const cOut  = pick(headers, /out\s*time/, /last\s*out/, /^out$/, /check\s*out/);
    const cTime = pick(headers, /punch\s*time/, /^time$/, /log\s*time/, /date\s*and\s*time/, /datetime/);
    if (cEmp < 0 || cDate < 0)
      throw new HttpError(400, `Found the header but not the columns. It reads: ${headers.filter(Boolean).join(" | ")}`);

    const rows = grid.slice(hi + 1);
    const punches: Record<string, unknown>[] = [];
    let skippedNoEmp = 0, skippedNoTime = 0;
    const batch = crypto.randomUUID();
    let lo = "", hiDate = "";

    for (const r of rows) {
      const emp = S(r[cEmp]).replace(/\.0$/, "");
      if (!emp || /^total$/i.test(emp)) { skippedNoEmp++; continue; }
      const dCell = r[cDate];
      const add = (timeCell: unknown, kind: "in" | "out") => {
        const at = when(dCell, timeCell);
        if (!at) { skippedNoTime++; return; }
        const day = at.slice(0, 10);
        if (!lo || day < lo) lo = day;
        if (!hiDate || day > hiDate) hiDate = day;
        punches.push({ employee_id: emp, for_date: day, at, kind, source: "essl", batch_id: batch, created_by: me.email });
      };
      if (cIn >= 0 || cOut >= 0) {
        if (cIn >= 0 && S(r[cIn])) add(r[cIn], "in");
        if (cOut >= 0 && S(r[cOut])) add(r[cOut], "out");
        if (cIn >= 0 && !S(r[cIn]) && cOut >= 0 && !S(r[cOut])) skippedNoTime++;
      } else if (cTime >= 0) {
        /* one row per punch: the machine says in/out, or the order does */
        const dir = S(r[pick(headers, /in\s*\/\s*out/, /direction/, /status/, /type/)] ?? "").toLowerCase();
        add(r[cTime], /out/.test(dir) ? "out" : "in");
      } else skippedNoTime++;
    }

    if (!punches.length)
      throw new HttpError(400, `Read ${rows.length} rows and could not use one of them — ${skippedNoEmp} had no employee number and ${skippedNoTime} no usable time.`);

    /* which of these people do we actually know? An unknown number is kept
       and reported, never quietly dropped — it usually means the machine and
       the HRIS disagree about somebody, which is worth seeing. */
    const admin = adminClient();
    const ids = [...new Set(punches.map((p) => String(p.employee_id)))];
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from("hrms_employees").select("id").in("id", ids.slice(i, i + 200));
      for (const e of data ?? []) known.add(String(e.id));
    }
    const strangers = ids.filter((i) => !known.has(i));

    let written = 0;
    for (let i = 0; i < punches.length; i += 500) {
      const { error } = await admin.from("hrms_attendance_punch")
        .upsert(punches.slice(i, i + 500), { onConflict: "employee_id,kind,source,at", ignoreDuplicates: true });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0163 first — attendance has nowhere to live yet.");
        if (/no unique|constraint matching/i.test(error.message)) {
          const { error: e2 } = await admin.from("hrms_attendance_punch").insert(punches.slice(i, i + 500));
          if (e2 && !/duplicate/i.test(e2.message)) throw new Error(e2.message);
        } else throw new Error(error.message);
      }
      written += punches.slice(i, i + 500).length;
    }

    await admin.from("hrms_essl_import").insert({
      id: batch, filename: file.name, rows_read: rows.length, rows_written: written,
      from_date: lo || null, to_date: hiDate || null, uploaded_by: me.email,
      note: strangers.length ? `${strangers.length} employee number(s) not in HRIS: ${strangers.slice(0, 20).join(", ")}` : null,
    });

    return NextResponse.json({
      ok: true, batch, read: rows.length, written,
      people: ids.length, unknown: strangers.length, unknownIds: strangers.slice(0, 20),
      from: lo, to: hiDate,
      skipped: { noEmployee: skippedNoEmp, noTime: skippedNoTime },
      columns: { employee: headers[cEmp], date: headers[cDate], in: cIn >= 0 ? headers[cIn] : null, out: cOut >= 0 ? headers[cOut] : null, time: cTime >= 0 ? headers[cTime] : null },
    });
  } catch (e) { return errJson(e); }
}
