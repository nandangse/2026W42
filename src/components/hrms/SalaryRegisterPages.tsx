"use client";
/**
 * THE SALARY REGISTER AS SEPARATE PAGES, PORTRAIT (Dr Raghu, 7 Sep 2026:
 * "can we have the salary register as separate pages like this? Keep it in
 * portrait mode only, not landscape ... This will help us to print it, stamp
 * it, sign it, and keep it on record").
 *
 * This is NOT a replacement for the landscape register — that one is the full
 * nineteen-column ledger and he has confirmed it prints correctly. This is the
 * SIGNING copy: eight columns, one group of people per page, portrait, with a
 * stamp-and-sign strip at the foot of every group.
 *
 * The groups are his, in his order: the MIS first, then Management, then
 * Contractors, then Staff and Labour together sorted by employee ID, then the
 * two contract types together, then interns and trainees. A group with nobody
 * in it this month is not given a blank page — it is named on the summary as
 * having none, which is the thing worth recording.
 *
 * A group larger than a page simply runs on, with the heading row repeating.
 * Staff and Labour together is 183 people in August; no font makes that one
 * sheet of A4, and pretending otherwise would print something unreadable.
 */
import { useMemo } from "react";
import { LOGO } from "@/lib/logo";
import { MONTHS, type SheetRow } from "@/lib/salary-sheet";
import { inr } from "@/lib/fmt";

export interface Bank { acct: string; ifsc: string; bank: string }

interface Sheet {
  id: string; month: number; year: number; status: string;
  file_name: string | null; total_count: number | null; total_salary: number | null;
  earned_pay: number | null; deductions: number | null; net_payable: number | null;
  frozen_by: string | null; frozen_at: string | null;
  rows: SheetRow[];
}

const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${inr(n)}`);

/**
 * HIS GROUPS. `match` is tested against the row's own Category, lower-cased.
 * Order is the order he gave them in. "Staff" and "Labour" share a page, and
 * the two contract types share a page, because he asked for them combined.
 */
const GROUPS: { title: string; note: string; match: (t: string) => boolean }[] = [
  { title: "Management", note: "Directors and management", match: (t) => /^management$/.test(t) },
  { title: "Contractors", note: "Engaged as contractors", match: (t) => /^contractor$/.test(t) },
  { title: "Staff & Labour", note: "On the rolls — sorted by employee ID", match: (t) => /^staff$/.test(t) || /^labour$/.test(t) },
  { title: "Staff Contract & Labour Contract", note: "On contract", match: (t) => /contract/.test(t) && !/^contractor$/.test(t) },
  { title: "Interns & Trainees", note: "Interns, trainees and apprentices", match: (t) => /intern|trainee|apprentice/.test(t) },
];

export default function SalaryRegisterPages({ sheet, banks }: { sheet: Sheet; banks: Record<string, Bank> }) {
  const rows = sheet.rows || [];
  const title = `${MONTHS[sheet.month - 1]} ${sheet.year}`;

  const num = (id: string) => {
    const n = Number(String(id).replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };

  /** Every row placed in exactly one group; anything unmatched is its own. */
  const groups = useMemo(() => {
    const used = new Set<SheetRow>();
    const out = GROUPS.map((g) => {
      const list = rows.filter((r) => !used.has(r) && g.match(String(r.type || "").trim().toLowerCase()));
      list.forEach((r) => used.add(r));
      list.sort((a, b) => num(String(a.employee_id)) - num(String(b.employee_id)));
      return { ...g, list };
    });
    // nobody is silently dropped — a type nobody thought of still gets a page
    const rest = rows.filter((r) => !used.has(r)).sort((a, b) => num(String(a.employee_id)) - num(String(b.employee_id)));
    if (rest.length) out.push({ title: "Others", note: "Types not covered by the groups above", match: () => false, list: rest });
    return out;
  }, [rows]);

  const T = {
    n: rows.length,
    earned: rows.reduce((a, r) => a + (r.earned || 0), 0),
    ded: rows.reduce((a, r) => a + (r.deductions || 0), 0),
    net: rows.reduce((a, r) => a + (r.net || 0), 0),
    hold: rows.filter((r) => r.hold).length,
  };

  const paidOn = sheet.frozen_at ? new Date(sheet.frozen_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

  const Head = ({ page }: { page: string }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderBottom: "2px solid #16232F", paddingBottom: 5, marginBottom: 7 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="Nandan GSE" style={{ height: 26, width: "auto" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.15 }}>Nandan GSE Pvt Ltd — Salary Register</div>
        <div style={{ fontSize: 8.5, color: "#5A6572" }}>{title} · {page}</div>
      </div>
      <div style={{ textAlign: "right", fontSize: 8 }}>
        <div style={{ fontWeight: 700 }}>{sheet.status}</div>
        {sheet.status !== "Frozen" && <div style={{ color: "#8A5B00", fontWeight: 700 }}>DRAFT — not frozen</div>}
      </div>
    </div>
  );

  /** The strip that makes the page a record: checked, stamped, signed. */
  const SignOff = ({ label }: { label: string }) => (
    <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "flex-end", breakInside: "avoid" }}>
      {["Prepared by", "Checked by", "Approved by"].map((r) => (
        <div key={r} style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #16232F", height: 26 }} />
          <div style={{ fontSize: 7.5, color: "#5A6572", marginTop: 2 }}>{r}</div>
        </div>
      ))}
      <div style={{ width: 120, textAlign: "right" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nandan-stamp.png" alt="Nandan GSE Pvt Ltd" style={{ height: 56, width: "auto", maxWidth: 120, objectFit: "contain" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        <div style={{ fontSize: 7, color: "#5A6572" }}>{label}</div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        /* A4 PORTRAIT, EVERY GROUP ITS OWN PAGE.
           The nineteen-column ledger is landscape and stays landscape; this
           signing copy is eight columns and fits portrait comfortably, which
           is the whole point of it. */
        @media print {
          @page { size: A4 portrait; margin: 9mm; }
          html, body { background: #fff; }
          .noprint { display: none !important; }
          .sheet { width: auto !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important;
                   box-shadow: none !important; border: 0 !important; }
          .sheet + .sheet { page-break-before: always; }
          .rg { font-size: 7.2px !important; }
          .rg thead { display: table-header-group; }   /* the heading repeats when a group runs on */
          .rg tr { break-inside: avoid; }
        }
        .sheet { background: #fff; width: 192mm; margin: 0 auto 14px; padding: 10mm 9mm; box-shadow: 0 1px 4px rgba(0,0,0,.14); }
        .rg { width: 100%; border-collapse: collapse; font-size: 8.4px; table-layout: fixed; }
        .rg th, .rg td { border: 1px solid #C9C6BD; padding: 1.6px 3px; vertical-align: top; }
        .rg th { background: #16232F; color: #fff; font-weight: 700; text-align: left; }
        .rg td.r, .rg th.r { text-align: right; font-variant-numeric: tabular-nums; }
        .rg tr:nth-child(even) td { background: #FAF9F6; }
        .bankline { font-size: 5.8px; color: #6B7681; line-height: 1.25; }
        .mis td, .mis th { border: 1px solid #C9C6BD; padding: 3px 5px; font-size: 9px; }
      `}</style>

      <div className="noprint" style={{ textAlign: "center", padding: "10px 0", fontFamily: "system-ui, sans-serif" }}>
        <button onClick={() => window.print()} style={{ background: "var(--blue,#1D4E7E)", color: "#fff", border: 0, borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>
          Print / Save as PDF
        </button>
        <div style={{ fontSize: 11.5, color: "#5A6572", marginTop: 5 }}>
          A4 <b>portrait</b> · {groups.filter((g) => g.list.length).length} groups · {rows.length} people
        </div>
      </div>

      {/* ───────────── PAGE 1 — THE MIS ───────────── */}
      <div className="sheet" style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#16232F" }}>
        <Head page="Page 1 — Summary" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7, marginBottom: 9 }}>
          {[["People paid", String(T.n)], ["Earned salary", lakh(T.earned)], ["Deductions", lakh(T.ded)], ["Net payable", lakh(T.net)]].map(([k, v]) => (
            <div key={k} style={{ border: "1px solid #C9C6BD", borderRadius: 4, padding: "5px 7px", background: "#FAF9F6" }}>
              <div style={{ fontSize: 7.5, color: "#5A6572", textTransform: "uppercase", letterSpacing: .3 }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, margin: "8px 0 4px" }}>The month by group</div>
        <table className="mis" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#16232F", color: "#fff" }}>
            <th style={{ textAlign: "left" }}>Group</th><th className="r">People</th><th className="r">On hold</th>
            <th className="r">Earned</th><th className="r">Deductions</th><th className="r">Net payable</th><th className="r">Page</th>
          </tr></thead>
          <tbody>
            {groups.map((g, i) => {
              const e = g.list.reduce((a, r) => a + (r.earned || 0), 0);
              const d = g.list.reduce((a, r) => a + (r.deductions || 0), 0);
              const n = g.list.reduce((a, r) => a + (r.net || 0), 0);
              const pg = groups.slice(0, i).filter((x) => x.list.length).length + 2;
              return (
                <tr key={g.title} style={g.list.length ? undefined : { color: "#9AA3AC" }}>
                  <td><b>{g.title}</b> <span style={{ color: "#6B7681", fontSize: 8 }}>· {g.note}</span></td>
                  <td className="r">{g.list.length || "none"}</td>
                  <td className="r">{g.list.filter((r) => r.hold).length || "—"}</td>
                  <td className="r">{g.list.length ? inr(Math.round(e)) : "—"}</td>
                  <td className="r">{g.list.length ? inr(Math.round(d)) : "—"}</td>
                  <td className="r"><b>{g.list.length ? inr(Math.round(n)) : "—"}</b></td>
                  <td className="r">{g.list.length ? pg : "—"}</td>
                </tr>
              );
            })}
            <tr style={{ background: "#EEECE6", fontWeight: 800 }}>
              <td>Total</td><td className="r">{T.n}</td><td className="r">{T.hold || "—"}</td>
              <td className="r">{inr(Math.round(T.earned))}</td><td className="r">{inr(Math.round(T.ded))}</td>
              <td className="r">{inr(Math.round(T.net))}</td><td />
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 8, color: "#5A6572", marginTop: 9, lineHeight: 1.5 }}>
          Every figure is summed from the month&apos;s own register lines. A group showing <b>none</b> had nobody in it
          this month and is given no page — the absence is recorded here instead.
          {sheet.file_name ? <> Source: {sheet.file_name}.</> : null}
        </div>
        <SignOff label="Summary" />
      </div>

      {/* ───────────── ONE PAGE PER GROUP ───────────── */}
      {groups.filter((g) => g.list.length).map((g, gi) => {
        const e = g.list.reduce((a, r) => a + (r.earned || 0), 0);
        const d = g.list.reduce((a, r) => a + (r.deductions || 0), 0);
        const n = g.list.reduce((a, r) => a + (r.net || 0), 0);
        return (
          <div key={g.title} className="sheet" style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#16232F" }}>
            <Head page={`Page ${gi + 2} — ${g.title}`} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>{g.title}</div>
              <div style={{ fontSize: 8, color: "#5A6572" }}>{g.note} · {g.list.length} people</div>
            </div>
            <table className="rg">
              <colgroup>
                <col style={{ width: "8%" }} /><col style={{ width: "31%" }} /><col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} /><col style={{ width: "12%" }} /><col style={{ width: "11%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Emp ID</th><th>Name &amp; bank account</th><th className="r">Attend.</th><th className="r">Pay days</th>
                  <th className="r">Earned</th><th className="r">Deductions</th><th className="r">Net salary</th><th>Date paid</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((r) => {
                  const b = banks[String(r.employee_id)];
                  return (
                    <tr key={String(r.employee_id)}>
                      <td>{r.employee_id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.name}{r.hold ? <span style={{ color: "#B3392E", fontWeight: 700 }}> · ON HOLD</span> : null}</div>
                        {/* THE BANK DETAILS, SMALL, ONE ABOVE ANOTHER (his words).
                            201 of the 205 on the August register carry an account
                            number, so the line is worth its space; the four without
                            one say so rather than showing an empty gap. */}
                        <div className="bankline">
                          {b?.acct ? <>A/c {b.acct}{b.ifsc ? <> · {b.ifsc}</> : null}<br />{b.bank || ""}</> : <i>no bank account on record</i>}
                        </div>
                      </td>
                      <td className="r">{r.attendance ?? "—"}</td>
                      <td className="r">{r.paid_days ?? "—"}</td>
                      <td className="r">{inr(Math.round(r.earned || 0))}</td>
                      <td className="r">{inr(Math.round(r.deductions || 0))}</td>
                      <td className="r"><b>{inr(Math.round(r.net || 0))}</b></td>
                      <td style={{ fontSize: 7 }}>{paidOn}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#EEECE6", fontWeight: 800 }}>
                  <td colSpan={4}>{g.title} — {g.list.length} people</td>
                  <td className="r">{inr(Math.round(e))}</td>
                  <td className="r">{inr(Math.round(d))}</td>
                  <td className="r">{inr(Math.round(n))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <SignOff label={g.title} />
          </div>
        );
      })}
    </>
  );
}
