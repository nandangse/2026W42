/**
 * THE BANK FILES (Dr Raghu, 7 Oct 2026): "after the payroll is done,
 * everything is frozen. All HR will do is make a download of a zip file
 * from the system, which will be a combination of multiple txt files like
 * this … The total within each file should not exceed ₹10 lakh,
 * cumulative … Do not merge the classes together."
 *
 * The format is the bank's own, copied from the file accounts uploads today
 * (10000.07.05.txt), character for character:
 *
 *   FILEHDR|NAN53PVT|<file number>|N|Salary   ⏎
 *   NEFT|<our IFSC>|<our account>|<their IFSC>|<their account>|INR|<rupees>|<name>|<name>|accounts@nandan.co.in|Salary⏎
 *
 * CRLF line endings, whole rupees, the beneficiary's name twice. One file
 * per class — management, staff, labour — cut again every time the running
 * total would pass ₹10,00,000, numbered 01, 02 … and named for the month:
 * sept_2026_staff_01.txt. THE FILE NUMBER IN THE HEADER IS UNIQUE FOR EVER
 * (Dr Raghu, 7 Oct 2026: "That 5-digit number should start with a series
 * starting from 50000, and then, for every file after that, keep
 * incrementing by 1. Whenever you generate a file, make that number very
 * unique so that it doesn't repeat. The same number is not going to be
 * accepted by the bank"). The next number is one above the highest ever
 * written on any run's bank files, never below 50000 — so a zip made twice
 * carries fresh numbers both times.
 *
 * Who rides: every line with something to pay (a held salary pays nought
 * and stays out) whose record carries an IFSC and the 15-DIGIT account
 * number — "the correct one will be the 15 digit account no" (Dr Raghu,
 * 7 Oct 2026); the short account number is never used. Who
 * does not ride is written into NOT_IN_FILES.txt in the same zip, by name
 * and reason, so nobody is quietly left unpaid.
 */
import type { RegisterRow } from "@/lib/muster";
import { MONTHS } from "@/lib/salary-sheet";

export const BANK = {
  corporate: "NAN53PVT",
  debitIfsc: "UBIN0556688",
  debitAccount: "566805010000130",
  email: "accounts@nandan.co.in",
  remark: "Salary",
  firstFileNo: 50000,   // the series starts at 50000 (Dr Raghu, 7 Oct 2026) and never repeats — see nextBankFileNo
  capPerFile: 10_00_000,
};

export interface BankPerson { ifsc: string; account: string; nameInBank: string }
export interface BankFile { name: string; text: string; cls: string; lines: number; total: number; fileNo: number }
export interface BankBuild { files: BankFile[]; skipped: { employee_id: string; name: string; why: string }[]; total: number; lines: number; notInFiles: string }

const classOf = (type: string | null | undefined) => {
  const t = String(type || "");
  if (/management/i.test(t)) return "management";
  if (/labour|labor/i.test(t)) return "labor";
  return "staff";
};
const monthTag = (month: number, year: number) => `${MONTHS[month - 1].slice(0, 4).toLowerCase()}_${year}`;
const clean = (s: string) => s.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();

export function buildBankFiles(rows: RegisterRow[], bankOf: (employee_id: string) => BankPerson | null, month: number, year: number, opts: Partial<typeof BANK> = {}): BankBuild {
  const B = { ...BANK, ...opts };
  const skipped: BankBuild["skipped"] = [];
  const byClass = new Map<string, { row: RegisterRow; bank: BankPerson; amount: number }[]>();
  for (const r of rows) {
    const amount = Math.round(Number(r.to_pay) || 0);
    if (r.hold) { skipped.push({ employee_id: r.employee_id, name: r.name, why: `on hold — ₹${Math.round(r.net || 0).toLocaleString("en-IN")} withheld` }); continue; }
    if (amount <= 0) { skipped.push({ employee_id: r.employee_id, name: r.name, why: "nothing to pay" }); continue; }
    const bank = bankOf(r.employee_id);
    const ifsc = clean(bank?.ifsc || "").toUpperCase().replace(/\s+/g, "");
    const account = clean(bank?.account || "").replace(/\s+/g, "");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { skipped.push({ employee_id: r.employee_id, name: r.name, why: ifsc ? `IFSC "${ifsc}" is not a valid code` : "no IFSC on the record" }); continue; }
    if (!/^\d{15}$/.test(account)) { skipped.push({ employee_id: r.employee_id, name: r.name, why: account ? `15-digit account "${account}" is ${account.length} characters` : "no 15-digit account number on the record" }); continue; }
    const cls = classOf(r.type);
    (byClass.get(cls) ?? byClass.set(cls, []).get(cls)!).push({ row: r, bank: { ifsc, account, nameInBank: clean(bank?.nameInBank || r.name) }, amount });
  }
  const files: BankFile[] = [];
  let fileNo = B.firstFileNo;
  for (const cls of ["management", "staff", "labor"]) {
    const list = (byClass.get(cls) ?? []).sort((a, b) => a.row.name.localeCompare(b.row.name));
    if (!list.length) continue;
    let part: typeof list = [], running = 0, n = 0;
    const flush = () => {
      if (!part.length) return;
      n++;
      const body = part.map((p) => `NEFT|${B.debitIfsc}|${B.debitAccount}|${p.bank.ifsc}|${p.bank.account}|INR|${p.amount}|${p.bank.nameInBank}|${p.bank.nameInBank}|${B.email}|${B.remark}`);
      const text = [`FILEHDR|${B.corporate}|${fileNo}|N|${B.remark}   `, ...body].join("\r\n") + "\r\n";
      files.push({ name: `${monthTag(month, year)}_${cls}_${String(n).padStart(2, "0")}.txt`, text, cls, lines: part.length, total: running, fileNo });
      fileNo++; part = []; running = 0;
    };
    for (const p of list) {
      if (part.length && running + p.amount > B.capPerFile) flush();
      part.push(p); running += p.amount;
    }
    flush();
  }
  const total = files.reduce((a, f) => a + f.total, 0), lines = files.reduce((a, f) => a + f.lines, 0);
  const notInFiles = [
    `Bank files for ${MONTHS[month - 1]} ${year} — made by Genie`,
    `${files.length} file(s), ${lines} payment(s), ₹${total.toLocaleString("en-IN")} in all. Each file stays under ₹${B.capPerFile.toLocaleString("en-IN")}.`,
    ...files.map((f) => `  ${f.name}: ${f.lines} payment(s), ₹${f.total.toLocaleString("en-IN")} (file no. ${f.fileNo})`),
    "",
    skipped.length ? `NOT IN ANY FILE — ${skipped.length} line(s). Pay these by hand or fix the record and make the files again:` : "Everybody with something to pay is in a file.",
    ...skipped.map((s) => `  ${s.employee_id}  ${s.name}  — ${s.why}`),
    "",
  ].join("\r\n");
  return { files, skipped, total, lines, notInFiles };
}
