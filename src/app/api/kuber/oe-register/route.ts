import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { newestByName } from "@/lib/kuber-fy";
import { OE_HEADS, OE_RULES, classifyLedger, oeRuleOf } from "@/lib/kuber-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/kuber/oe-register?from=&to= — THE OE REGISTER (Dr Raghu, 13 Oct
 * 2026: "make an OE Register. This will help to know the OE").
 *
 * Every voucher line that the P&L counts as operating expense — a ledger the
 * one ladder (kuber-rules.ts) puts under Indirect or Finance — line by line,
 * with the voucher, the party, the narration, the ledger, its group and the
 * OE head it lands in. Struck by the same rules and the same sign as the P&L,
 * so the register adds back to the P&L's OE for the same dates to the paisa;
 * the sales over the same dates give OE as a share of sales.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const stripNo = (r: string) => r.replace(/^\s*\d+\s*[.)-]*\s*/, "");
const isProforma = (vtype: unknown, vno: unknown) => S(vtype) === "Proforma Invoice" || /^PI[-/]/i.test(S(vno));
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

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

export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const today = istDay();
    const fy = today.slice(5, 7) >= "04" ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
    const isD = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isD(sp.get("from")) ? String(sp.get("from")) : fy;
    const to = isD(sp.get("to")) ? String(sp.get("to")) : today;

    let groups: R[], ledgersRaw: R[], vouchers: R[];
    try {
      [groups, ledgersRaw, vouchers] = await Promise.all([
        all((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
        all((a, b) => admin.from("kuber_ledger").select("name, parent, fy").order("name").range(a, b)),
        all((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno, party, narration").gte("date", from).lte("date", to).order("id").range(a, b)),
      ]);
    } catch (e) { if (/does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ empty: true }); throw e; }
    const ledgers = newestByName(ledgersRaw as { name?: unknown; fy?: unknown }[]) as R[];
    if (!ledgers.length) return NextResponse.json({ empty: true });

    /* the group tree, to its root — the same walk the P&L makes */
    const parentOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.parent)]));
    const properOf = new Map(groups.map((g) => [S(g.name).toLowerCase(), S(g.name)]));
    const rootOf = (g: string) => { let cur = g.toLowerCase(); for (let i = 0; i < 25; i++) { const p = (parentOf.get(cur) || "").toLowerCase(); if (!p || p === cur) break; cur = p; } return properOf.get(cur) || g; };

    /* each ledger classed once */
    const cls = new Map<string, { bucket: string; sign: number; group: string; head: string; ruleId: string }>();
    for (const l of ledgers) {
      const name = S(l.name), grp = S(l.parent); if (!grp) continue;
      const root = rootOf(grp);
      const { bucket, rule } = classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) });
      if (bucket !== "indirect" && bucket !== "finance" && bucket !== "sales") continue;
      const oe = bucket === "sales" ? null : oeRuleOf(grp, name);
      cls.set(name, { bucket, sign: rule.sign, group: grp, head: oe ? oe.head : "", ruleId: oe ? oe.id : "" });
    }

    const vById = new Map(vouchers.filter((v) => !isProforma(v.vtype, v.vno)).map((v) => [S(v.id), v]));
    const ids = [...vById.keys()];
    const lines: R[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      lines.push(...(await all((a, b) => admin.from("kuber_voucher_line").select("id, voucher_id, ledger, amount").in("voucher_id", ids.slice(i, i + 300)).order("id").range(a, b))));
    }

    const rows: { date: string; vtype: string; vno: string; party: string; narration: string; ledger: string; group: string; head: string; amount: number }[] = [];
    let sales = 0;
    for (const l of lines) {
      const c = cls.get(S(l.ledger)); if (!c) continue;
      const amt = (Number(l.amount) || 0) * c.sign;
      if (!amt) continue;
      if (c.bucket === "sales") { sales += amt; continue; }
      const v = vById.get(S(l.voucher_id))!;
      rows.push({ date: S(v.date), vtype: S(v.vtype), vno: S(v.vno), party: S(v.party), narration: S(v.narration), ledger: S(l.ledger), group: c.group, head: c.head, amount: Math.round(amt * 100) / 100 });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

    /* head × month, the latest month first */
    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse();
    const byHead: Record<string, Record<string, number>> = {};
    for (const h of OE_HEADS) byHead[h] = {};
    for (const r of rows) { const m = r.date.slice(0, 7); byHead[r.head][m] = (byHead[r.head][m] || 0) + r.amount; }
    const salesByMonth: Record<string, number> = {};
    for (const l of lines) { const c = cls.get(S(l.ledger)); if (c?.bucket !== "sales") continue; const m = S(vById.get(S(l.voucher_id))?.date).slice(0, 7); salesByMonth[m] = (salesByMonth[m] || 0) + (Number(l.amount) || 0) * c.sign; }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return NextResponse.json({
      from, to, total: Math.round(total), sales: Math.round(sales), heads: OE_HEADS, months, byHead, salesByMonth,
      says: Object.fromEntries(OE_RULES.map((r) => [r.head, r.says])), rows,
    });
  } catch (e) { return errJson(e); }
}
