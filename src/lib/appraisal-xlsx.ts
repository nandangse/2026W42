import ExcelJS from "exceljs";
import { payDaysFor } from "@/lib/salary";

/**
 * THE EMPLOYEE MASTER SHEET, AS HE PASTES IT (Dr Raghu, 7 Sep 2026).
 *
 * Three bands across: what the person is on TODAY, read from Genie's own
 * records; what the finalised APPRAISAL says; and Genie's own arithmetic
 * kept to the right, where a paste into his master sheet cannot reach it.
 * One empty column between the first two, exactly as the Salary Revision
 * Master has it, because a paste lands by position and not by name.
 *
 * "The old rates that are there in Genie are correct. The new rates that are
 * there in the Genie appraisal are also correct." So neither side is read
 * from a spreadsheet: the left comes from the record, the right from the
 * appraisal, and the sheet he pastes into is the destination, never a source.
 */
export interface ExportRow {
  id: string; name: string; type: string | null;
  exp: number | null; age: number | null;
  department: string | null; designation: string | null; manager: string | null; location: string | null;
  mobile: string | null; personalEmail: string | null;
  payDays: number | null;
  oldParts: Parts | null; prevGross: number | null;
  newParts: (Parts & { site?: number; agreed?: boolean }) | null; newGross: number | null;
  newDesignation: string | null;
  stage?: string | null; released?: string | null;
}
interface Parts { basic_da: number; hra: number; fixed: number; conveyance: number; medical: number }

const LEFT = ["ID", "Name", "Type", "Experience in Nandan", "Age", "Department", "Designation", "Reporting Manager", "Job Location", "Days Paid", "Basic and DA", "HRA", "Fixed Allowance", "Conveyance", "Medical Allowance", "Gross Salary", "Per Day Rate", "PERSONAL Mobile No", "Personal Mail ID"];
const RIGHT = ["Department", "Designation", "Reporting Manager", "Job Location", "Days Paid", "Basic and DA", "HRA", "Fixed Allowance", "Conveyance", "Medical Allowance", "Gross Salary", "Per Day Rate"];
const TAIL = ["Site Allowance", "Increase / month", "Increase / day", "Increase %", "Stage", "Remarks"];

const INK = "FF22303C", OLDB = "FFE7EDF3", NEWB = "FFE6F4EA", GEN = "FFFDF3E3";
const MONEY = "#,##0";
const r0 = (n: number | null | undefined) => (n == null ? "" : Math.round(n));

export async function buildAppraisalWorkbook(rows: ExportRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Genie · Nandan GSE";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 28) || "Appraisal", { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });

  const L = LEFT.length, R = RIGHT.length, W = L + 1 + R + TAIL.length;
  const band = new Array(W).fill("");
  band[0] = "AS IT STANDS TODAY — from Genie's records";
  band[L + 1] = "AS THE APPRAISAL SAYS — finalised in Genie";
  band[L + 1 + R] = "GENIE";
  ws.addRow(band);
  ws.addRow([...LEFT, "", ...RIGHT, ...TAIL]);

  for (const r of rows) {
    const days = r.payDays || payDaysFor(String(r.type || ""));   // 26 for workers, the calendar month otherwise — never a fixed 31 (7 Oct 2026)
    const o = r.oldParts, p = r.newParts;
    const og = r.prevGross, ng = r.newGross;
    const opd = og != null && days ? og / days : null;
    const npd = ng != null && days ? ng / days : null;
    const moved = og != null && ng != null && Math.abs(ng - og) > 1;
    ws.addRow([
      r.id, r.name, r.type || "", r.exp ?? "", r.age ?? "",
      r.department || "", r.designation || "", r.manager || "", r.location || "", days,
      r0(o?.basic_da), r0(o?.hra), r0(o?.fixed), r0(o?.conveyance), r0(o?.medical),
      r0(og), r0(opd), r.mobile || "", r.personalEmail || "",
      "",
      r.department || "", r.newDesignation || r.designation || "", r.manager || "", r.location || "", days,
      r0(p?.basic_da), r0(p?.hra), r0(p?.fixed), r0(p?.conveyance), r0(p?.medical),
      r0(ng), r0(npd),
      r0(p?.site) || "",
      moved ? Math.round((ng as number) - (og as number)) : "",
      moved && npd != null && opd != null ? Math.round(npd - opd) : "",
      og ? Number(((((ng as number) - og) / og) * 100).toFixed(1)) : "",
      r.stage || "",
      p && p.agreed === false ? "split by Genie — no structure was agreed by hand" : "",
    ]);
  }

  const zoneOf = (c: number) => (c <= L ? "old" : c === L + 1 ? "gap" : c <= L + 1 + R ? "new" : "gen");
  const b = ws.getRow(1), h = ws.getRow(2);
  b.height = 20; h.height = 30;
  for (let c = 1; c <= W; c++) {
    const z = zoneOf(c), bc = b.getCell(c), hc = h.getCell(c);
    hc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: z === "gap" ? "FFFFFFFF" : INK } };
    hc.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    bc.font = { bold: true, size: 10, color: { argb: z === "new" ? "FF0D7A3F" : z === "gen" ? "FF8A5B00" : "FF3D566E" } };
    bc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: z === "old" ? OLDB : z === "new" ? NEWB : z === "gen" ? GEN : "FFFFFFFF" } };
    bc.alignment = { vertical: "middle" };
  }
  ws.mergeCells(1, 1, 1, L);
  ws.mergeCells(1, L + 2, 1, L + 1 + R);
  ws.mergeCells(1, L + 2 + R, 1, W);

  for (let i = 3; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const moved = row.getCell(L + 1 + R + 2).value !== "" && row.getCell(L + 1 + R + 2).value != null;
    for (let c = 1; c <= W; c++) {
      const cell = row.getCell(c), z = zoneOf(c);
      if (z === "new") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: moved ? "FFF2FBF4" : "FFFAFAF8" } };
      if (z === "gen") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEFAF2" } };
      if (typeof cell.value === "number" && c !== 1) cell.numFmt = c === L + 1 + R + 4 ? "0.0" : MONEY;
      cell.font = { size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE7E4DC" } } };
      if (c === L || c === L + 1 + R) cell.border = { ...cell.border, right: { style: "thin", color: { argb: "FFB9C2CC" } } };
    }
    row.getCell(1).font = { size: 10, bold: true };
    row.getCell(2).font = { size: 10, bold: true };
    row.getCell(4).numFmt = "0.0";
    row.getCell(5).numFmt = "0.0";
  }

  // Totals live as formulas, so the sheet stays right if a cell is edited.
  const n = rows.length, last = n + 2;
  const col = (i: number) => ws.getColumn(i).letter;
  const sum = (i: number) => ({ formula: `SUM(${col(i)}3:${col(i)}${last})` });
  const tot: (string | number | { formula: string })[] = new Array(W).fill("");
  tot[0] = "TOTAL"; tot[1] = `${n} ${n === 1 ? "person" : "people"}`;
  for (const i of [11, 12, 13, 14, 15, 16]) tot[i - 1] = sum(i);
  for (const i of [L + 1 + 6, L + 1 + 7, L + 1 + 8, L + 1 + 9, L + 1 + 10, L + 1 + 11]) tot[i - 1] = sum(i);
  for (const i of [L + 1 + R + 1, L + 1 + R + 2, L + 1 + R + 3]) tot[i - 1] = sum(i);
  ws.addRow([]);
  const tr = ws.addRow(tot);
  tr.eachCell((c) => {
    c.font = { bold: true, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2EC" } };
    c.border = { top: { style: "medium", color: { argb: INK } } };
    if (typeof c.value === "object" && c.value && "formula" in c.value) c.numFmt = MONEY;
  });

  const widths = [9, 30, 17, 10, 7, 20, 26, 24, 13, 7, 13, 11, 14, 12, 13, 14, 12, 18, 28, 3,
    20, 26, 24, 13, 7, 13, 11, 14, 12, 13, 14, 12, 13, 14, 12, 9, 20, 44];
  widths.forEach((w, i) => { if (i < W) ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: last, column: W } };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
