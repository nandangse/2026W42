/**
 * Calendar weeks over a month's muster (Dr Raghu, 7 Sep 2026).
 *
 * "Make it proper calendar weeks. A week/month can have a maximum of 5
 * weeks." Weeks run Sunday to Saturday and are clipped to the month. A month
 * can straddle six such weeks; his rule is five, so a final stub of a day or
 * two joins the fifth rather than standing as a week of its own.
 *
 * This lives here rather than in the route because a Next.js route file may
 * export only its handlers — exporting a helper from one fails the build.
 */
export interface Week { n: number; from: number; to: number; present: number; absent: number; marks: string[] }

const PRESENT = /^(p|hd|h\/d|pl?|present)$/i;
const ABSENT = /^(a|abs|absent|lwp)$/i;

export function weeksOf(year: number, month: number, days: string[]): Week[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: Week[] = [];
  let from = 1;
  while (from <= last) {
    const dow = new Date(Date.UTC(year, month - 1, from)).getUTCDay();   // 0 = Sunday
    const to = Math.min(last, from + (6 - dow));
    out.push({ n: out.length + 1, from, to, present: 0, absent: 0, marks: [] });
    from = to + 1;
  }
  while (out.length > 5) {
    const stub = out.pop()!;
    out[out.length - 1].to = stub.to;
  }
  for (const w of out) {
    w.marks = days.slice(w.from - 1, w.to);
    w.present = w.marks.filter((m) => PRESENT.test(String(m || "").trim())).length;
    w.absent = w.marks.filter((m) => ABSENT.test(String(m || "").trim())).length;
  }
  return out;
}
