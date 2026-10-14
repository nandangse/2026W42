import type { SupabaseClient } from "@supabase/supabase-js";
import { newestByName } from "@/lib/kuber-fy";
import { classifyLedger, oeRuleOf, isPay } from "@/lib/kuber-rules";

/** SALARIES, for the CEO (14 Oct 2026): wages on the floor (Manufacturing, a pay group) and the OE pay heads; directors' remuneration stays in OE on its own. */
const SALARY_HEADS = new Set(["Labour Salaries", "Staff Salaries", "Consultant Salaries"]);

/**
 * OPERATING EXPENSE AND SALES, LINE BY LINE, FOR ANY DATES (13–14 Oct 2026).
 *
 * The one computation behind Kuber → OE Register and the CEO cockpit, so the
 * two can never disagree. Every voucher line whose ledger the one ladder
 * (kuber-rules.ts) puts under Indirect or Finance is OE; under Sales, sales —
 * each times its rule's sign, exactly as the P&L does. Proformas are out, as
 * they are everywhere in Kuber. Checked 13 Oct 2026: 1 Apr – 10 Oct 2026 OE
 * ₹7,25,97,430 here and on the P&L, to the rupee.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const stripNo = (r: string) => r.replace(/^\s*\d+\s*[.)-]*\s*/, "");
const isProforma = (vtype: unknown, vno: unknown) => S(vtype) === "Proforma Invoice" || /^PI[-/]/i.test(S(vno));

async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 500000; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type OeLine = { date: string; vtype: string; vno: string; party: string; narration: string; ledger: string; group: string; head: string; amount: number };
/** every line the CEO can click in to (14 Oct 2026): sales, purchases, OE, and floor wages — with whether it is pay */
export type BookLine = OeLine & { kind: "sales" | "purchase" | "oe" | "wages"; pay: boolean };

export async function oeAndSales(admin: SupabaseClient, from: string, to: string): Promise<{ empty: boolean; rows: OeLine[]; lines: BookLine[]; sales: number; salesByMonth: Record<string, number>; purchasesByMonth: Record<string, number>; salariesByMonth: Record<string, number>; latest: string | null }> {
  const [groups, ledgersRaw, vouchers] = await Promise.all([
    all((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
    all((a, b) => admin.from("kuber_ledger").select("name, parent, fy").order("name").range(a, b)),
    all((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno, party, narration").gte("date", from).lte("date", to).order("id").range(a, b)),
  ]);
  const ledgers = newestByName(ledgersRaw as { name?: unknown; fy?: unknown }[]) as R[];
  if (!ledgers.length) return { empty: true, rows: [], lines: [], sales: 0, salesByMonth: {}, purchasesByMonth: {}, salariesByMonth: {}, latest: null };
  const parentOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.parent)]));
  const properOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.name)]));
  const rootOf = (g: string) => { let cur = g.toLowerCase(); for (let i = 0; i < 25; i++) { const p = (parentOf.get(cur) || "").toLowerCase(); if (!p || p === cur) break; cur = p; } return properOf.get(cur) || g; };
  const cls = new Map<string, { bucket: string; sign: number; group: string; head: string; pay: boolean }>();
  for (const l of ledgers) {
    const name = S(l.name), grp = S(l.parent); if (!grp) continue;
    const root = rootOf(grp);
    const { bucket, rule } = classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) });
    if (bucket !== "indirect" && bucket !== "finance" && bucket !== "sales" && bucket !== "purchases" && bucket !== "manuf") continue;
    const head = bucket === "indirect" || bucket === "finance" ? oeRuleOf(grp, name).head : "";
    cls.set(name, { bucket, sign: rule.sign, group: grp, head, pay: bucket === "manuf" ? isPay(grp.toLowerCase()) : SALARY_HEADS.has(head) });
  }
  const vById = new Map(vouchers.filter((v) => !isProforma(v.vtype, v.vno)).map((v) => [S(v.id), v]));
  const ids = [...vById.keys()];
  const lines: R[] = [];
  for (let i = 0; i < ids.length; i += 300) lines.push(...(await all((a, b) => admin.from("kuber_voucher_line").select("id, voucher_id, ledger, amount").in("voucher_id", ids.slice(i, i + 300)).order("id").range(a, b))));
  const rows: OeLine[] = []; const all_: BookLine[] = []; let sales = 0; const salesByMonth: Record<string, number> = {}, purchasesByMonth: Record<string, number> = {}, salariesByMonth: Record<string, number> = {};
  for (const l of lines) {
    const c = cls.get(S(l.ledger)); if (!c) continue;
    const amt = (Number(l.amount) || 0) * c.sign; if (!amt) continue;
    const v = vById.get(S(l.voucher_id))!;
    const m = S(v.date).slice(0, 7);
    if (c.pay) salariesByMonth[m] = (salariesByMonth[m] || 0) + amt;
    const base = { date: S(v.date), vtype: S(v.vtype), vno: S(v.vno), party: S(v.party), narration: S(v.narration), ledger: S(l.ledger), group: c.group, head: c.head, amount: Math.round(amt * 100) / 100 };
    all_.push({ ...base, kind: c.bucket === "sales" ? "sales" : c.bucket === "purchases" ? "purchase" : c.bucket === "manuf" ? "wages" : "oe", pay: c.pay });
    if (c.bucket === "sales") { sales += amt; salesByMonth[m] = (salesByMonth[m] || 0) + amt; continue; }
    if (c.bucket === "purchases") { purchasesByMonth[m] = (purchasesByMonth[m] || 0) + amt; continue; }
    if (c.bucket === "manuf") continue;
    rows.push({ date: S(v.date), vtype: S(v.vtype), vno: S(v.vno), party: S(v.party), narration: S(v.narration), ledger: S(l.ledger), group: c.group, head: c.head, amount: Math.round(amt * 100) / 100 });
  }
  const latest = [...vById.values()].map((v) => S(v.date)).sort().pop() || null;
  return { empty: false, rows, lines: all_.filter((x) => x.kind !== "wages" || x.pay), sales, salesByMonth, purchasesByMonth, salariesByMonth, latest };
}
