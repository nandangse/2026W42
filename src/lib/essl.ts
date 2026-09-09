import * as XLSX from "xlsx";

/**
 * READING WHAT THE BIOMETRIC MACHINE WROTE (Dr Raghu, 8–9 Sep 2026: "also I
 * want to get the ESSL biometric data into the system" · "in HRMS they will
 * upload the essl file which can be multiple too").
 *
 * ESSL EXPORTS ARE NOT ONE FORMAT. Different machines and different report
 * templates put the same three facts — the man, the day, the moment — under
 * different headings, and some give a row per DAY with In and Out columns
 * while others give a row per PUNCH. So the columns are FOUND rather than
 * assumed, and a file whose headings are not recognised is refused with its
 * own headings quoted back: the fix is then obvious instead of mysterious.
 *
 * NOTHING IS INVENTED. A row without an employee number, or without a time
 * that parses, is counted and skipped — never rounded, never guessed at,
 * never attached to the nearest name. The count of what was skipped travels
 * with the result, because an import that silently drops a tenth of a file is
 * worse than one that fails outright.
 *
 * This lives in a library and not in a route because two doors need it: the
 * payroll run's own ESSL slot, and the standalone importer.
 */
export interface EsslPunch {
  employee_id: string; for_date: string; at: string;
  kind: "in" | "out"; source: "essl";
}
export interface EsslRead {
  punches: EsslPunch[];
  headers: string[];
  columns: { employee: string; date: string; in: string | null; out: string | null; time: string | null };
  rows: number;
  skipped: { noEmployee: number; noTime: number };
  from: string; to: string;
}

const S = (v: unknown) => String(v ?? "").trim();

/** Which column is which, by what it is called rather than where it sits. */
const pick = (headers: string[], ...names: RegExp[]): number => {
  for (const re of names) {
    const i = headers.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/** A date and a time, in whatever shape the machine wrote them. */
export function esslWhen(dateCell: unknown, timeCell: unknown): string | null {
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

export class EsslUnreadable extends Error {}

export function readEssl(buf: Buffer, filename: string): EsslRead {
  const wb = XLSX.read(buf, { type: "buffer", raw: /\.csv$/i.test(filename), cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new EsslUnreadable(`${filename} has no sheets in it.`);
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
    throw new EsslUnreadable(
      `${filename} does not look like an ESSL export — no row names both an employee and a date. `
      + `Its first row reads: ${(grid[0] || []).map((c) => S(c)).slice(0, 12).join(" | ") || "(empty)"}`);

  const cEmp = pick(headers, /employee\s*(id|code|no)/, /emp\s*(id|code|no)/, /user\s*id/, /card\s*no/, /^code$/, /employee/, /^user$/);
  const cDate = pick(headers, /^date$/, /att.*date/, /punch\s*date/, /^day$/, /date/);
  const cIn = pick(headers, /in\s*time/, /first\s*in/, /^in$/, /check\s*in/);
  const cOut = pick(headers, /out\s*time/, /last\s*out/, /^out$/, /check\s*out/);
  const cTime = pick(headers, /punch\s*time/, /^time$/, /log\s*time/, /date\s*and\s*time/, /datetime/);
  const cDir = pick(headers, /in\s*\/\s*out/, /direction/, /status/, /type/);
  if (cEmp < 0 || cDate < 0)
    throw new EsslUnreadable(`${filename}: found the header but not the columns. It reads: ${headers.filter(Boolean).join(" | ")}`);

  const body = grid.slice(hi + 1);
  const punches: EsslPunch[] = [];
  let noEmployee = 0, noTime = 0, from = "", to = "";

  for (const r of body) {
    const emp = S(r[cEmp]).replace(/\.0$/, "");
    if (!emp || /^total$/i.test(emp)) { noEmployee++; continue; }
    const dCell = r[cDate];
    const add = (timeCell: unknown, kind: "in" | "out") => {
      const at = esslWhen(dCell, timeCell);
      if (!at) { noTime++; return; }
      const day = at.slice(0, 10);
      if (!from || day < from) from = day;
      if (!to || day > to) to = day;
      punches.push({ employee_id: emp, for_date: day, at, kind, source: "essl" });
    };
    if (cIn >= 0 || cOut >= 0) {
      const hasIn = cIn >= 0 && S(r[cIn]), hasOut = cOut >= 0 && S(r[cOut]);
      if (hasIn) add(r[cIn], "in");
      if (hasOut) add(r[cOut], "out");
      if (!hasIn && !hasOut) noTime++;
    } else if (cTime >= 0) {
      const dir = S(cDir >= 0 ? r[cDir] : "").toLowerCase();
      add(r[cTime], /out/.test(dir) ? "out" : "in");
    } else noTime++;
  }

  return {
    punches, headers, rows: body.length,
    columns: {
      employee: headers[cEmp], date: headers[cDate],
      in: cIn >= 0 ? headers[cIn] : null, out: cOut >= 0 ? headers[cOut] : null,
      time: cTime >= 0 ? headers[cTime] : null,
    },
    skipped: { noEmployee, noTime }, from, to,
  };
}
