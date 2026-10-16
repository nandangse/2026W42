import type { ToolDef } from "@/lib/mcp/registry";
import { text, S, N, cr, lim, all } from "@/lib/mcp/registry";
import { ceoFigures, fyStartOf, lastMonthEnd } from "@/lib/ceo/figures";
import { pnlOf } from "@/lib/kuber-oe";
import { approvalQueues } from "@/lib/ceo/approvals";
import { internalKuber } from "@/lib/ceo/internal-figures";

const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });
type R = Record<string, unknown>;
const ok = (x: unknown): x is R => !!x && typeof x === "object" && !("error" in (x as object));

/* ------------------------------------------------------------------ CEO */
export const CEO_TOOLS: ToolDef[] = [
  { name: "genie_company", door: "ceo", description: "The company on one page, as the CEO dashboard shows it: P&L to the last month-end (sales, TVC, throughput, OE, PBT), receivables and payables by age, advances, payment due on delivery, the floor, service and people.", inputSchema: obj({}),
    run: async ({ admin, today }) => {
      const fy = fyStartOf(today); const pnlTo = lastMonthEnd(today);
      const [f, p] = await Promise.all([ceoFigures(admin, fy, today), pnlOf(admin, fy, today, pnlTo)]);
      const owed = ok(f.owed) ? (f.owed as unknown as R) : null, erp = ok(f.erp) ? (f.erp as unknown as R) : null, floor = ok(f.floor) ? (f.floor as unknown as R) : null, people = ok(f.people) ? (f.people as unknown as R) : null, service = ok(f.service) ? (f.service as unknown as R) : null;
      return text([
        `Nandan GSE, FY from ${fy}, today ${today}. P&L struck to ${pnlTo} (the last month-end).`,
        p ? `Sales ${cr(p.sales)} (to date ${cr(p.salesToDate)}) · TVC ${cr(p.tvc)} · Throughput ${cr(p.throughput)} (${p.sales ? Math.round((p.throughput / p.sales) * 100) : 0}%) · OE ${cr(p.oe)} · PBT ${cr(p.pbt)} (${p.sales ? ((p.pbt / p.sales) * 100).toFixed(1) : 0}%).` : "The books are not loaded.",
        owed ? `Receivables ${cr(N(owed.receivable))} (90+ days ${cr(N(owed.rec_90))}) · Payables ${cr(N(owed.payable))} (180+ ${cr(N(owed.pay_180))}) · Advances received ${cr(N(owed.adv_received))}, paid ${cr(N(owed.adv_paid))}.` : "",
        erp ? `Payment due on delivery, pending: 0–30 ${cr(N(erp.poe_0_30))}, 31–60 ${cr(N(erp.poe_31_60))}, 61–90 ${cr(N(erp.poe_61_90))}, 90+ ${cr(N(erp.poe_90))}; not yet delivered ${cr(N(erp.poe_undelivered))}. GRN not billed ${cr(N(erp.grn_unbilled))}.` : "",
        floor ? `Floor: ${N(floor.live)} live jobs ${cr(N(floor.live_value))}, ${N(floor.late)} late (avg ${N(floor.late_avg_days)} days), ${N(floor.due30)} due in 30 days, ${N(floor.on_floor)} on the floor, ${N(floor.escalated)} escalated; delivered this FY ${N(floor.delivered)} (${cr(N(floor.delivered_value))}), this month ${N(floor.delivered_month)}.` : "",
        service ? `Service: ${N(service.open_tickets)} open tickets, ${N(service.amc_valid)} AMCs valid.` : "",
        people ? `People: ${N(people.on_roll)} on the roll, ${N(people.added90)} joined and ${N(people.left90)} left in 90 days, ${N(people.notice)} on notice, ${N(people.fnf_pending)} F&F pending.` : "",
      ].filter(Boolean).join("\n"), { pnl_to: pnlTo, pnl: p ? { sales: p.sales, sales_to_date: p.salesToDate, tvc: p.tvc, throughput: p.throughput, oe: p.oe, pbt: p.pbt } : null, owed, erp, floor, service, people });
    } },
  { name: "genie_approvals", door: "ceo", description: "Everything in Genie waiting for an approval — records, roles, salary decisions, loans, salary queries, F&F, payment plan, service quotations, service claims, council principles, vendor registrations — counts, money and the lines.", inputSchema: obj({}),
    run: async ({ admin }) => { const qs = await approvalQueues(admin); return text(qs.filter((q) => q.count).map((q) => `${q.label} (${q.module}) — ${q.count} waiting on ${q.who}${q.amount ? ` · ${cr(q.amount)}` : ""} · ${q.href}\n` + q.items.slice(0, 10).map((i) => `   - ${i.title} · ${i.sub}${i.amount ? ` · ${cr(i.amount)}` : ""}`).join("\n")).join("\n") || "Nothing is waiting for approval.", { queues: qs }); } },
  { name: "genie_internal_kuber", door: "ceo", description: "Internal Kuber: cash to bring home (old receivables, payment due on delivery, supplier advances, excess stock, AMC renewals) and where money leaks (interest, bank charges, freight, forex, penalties, warranty, free service), each with its lever.", inputSchema: obj({}),
    run: async ({ admin }) => { const d = await internalKuber(admin); return text(`To ${d.pnl_to}. Cash to bring home ${cr(d.generate_total)}; leaking from the books ${cr(d.wastage_total)} (${cr(d.wastage_per_month)} a month); waiting money costs ${cr(d.carry.per_month)} a month.\nGENERATE:\n` + d.generate.map((g) => `- ${g.label}: ${cr(g.amount)}${g.sub ? ` (${g.sub})` : ""} → ${g.lever}`).join("\n") + `\nWASTAGE:\n` + d.wastage.map((w) => `- ${w.label}: ${cr(w.amount)} → ${w.lever}`).join("\n"), d); } },
];

/* ---------------------------------------------------------------- Kuber */
export const KUBER_TOOLS: ToolDef[] = [
  { name: "kuber_pnl", door: "kuber", description: "The P&L from Tally's books for a period (default: this FY to the last month-end): sales, TVC, throughput, manufacturing, OE, depreciation, other income, PBT. Dates YYYY-MM-DD.", inputSchema: obj({ from: { type: "string" }, to: { type: "string" } }),
    run: async ({ admin, today }, a) => {
      const to = /^\d{4}-\d{2}-\d{2}$/.test(S(a.to)) ? S(a.to) : today; const from = /^\d{4}-\d{2}-\d{2}$/.test(S(a.from)) ? S(a.from) : fyStartOf(to); const cut = lastMonthEnd(to) >= from ? lastMonthEnd(to) : to;
      const p = await pnlOf(admin, from, to, cut); if (!p) return text("The books are not loaded.");
      const pc = (v: number) => (p.sales ? `${((v / p.sales) * 100).toFixed(1)}%` : "—");
      return text(`${from} → ${cut} (struck to the month-end; sales to ${to} ${cr(p.salesToDate)}).\nSales ${cr(p.sales)}\nTVC ${cr(p.tvc)} (${pc(p.tvc)}) — purchases ${cr(p.purchases)}, stock ${cr(p.openingStock)} → ${cr(p.closingStock)}\nThroughput ${cr(p.throughput)} (${pc(p.throughput)})\nManufacturing ${cr(p.manuf)} (${pc(p.manuf)})\nOE ${cr(p.oe)} (${pc(p.oe)})\nDepreciation ${cr(p.depreciation)} · Other income ${cr(p.otherIncome)}\nPBT ${cr(p.pbt)} (${pc(p.pbt)})`, { from, to, cut, sales: p.sales, sales_to_date: p.salesToDate, purchases: p.purchases, opening_stock: p.openingStock, closing_stock: p.closingStock, tvc: p.tvc, throughput: p.throughput, manuf: p.manuf, oe: p.oe, depreciation: p.depreciation, other_income: p.otherIncome, pbt: p.pbt });
    } },
  { name: "kuber_receivables", door: "kuber", description: "Who owes us, from Tally's open bills: by party with ageing (0–90, 90+ days) and the bills. Filter by party name.", inputSchema: obj({ party: { type: "string" }, limit: { type: "integer", default: 30 } }),
    run: async ({ admin, today }, a) => {
      const bills = await all<R>((x, y) => admin.from("kuber_bill").select("party, bill, bill_date, due_date, amount").eq("kind", "receivable").order("id").range(x, y));
      const q = S(a.party).toLowerCase(); const d90 = new Date(Date.parse(today) - 90 * 864e5).toISOString().slice(0, 10);
      const by = new Map<string, { party: string; open: number; over90: number; advance: number; bills: R[] }>();
      for (const b of bills) { if (q && !S(b.party).toLowerCase().includes(q)) continue; const x = by.get(S(b.party)) || { party: S(b.party), open: 0, over90: 0, advance: 0, bills: [] }; const amt = N(b.amount); if (amt > 0) { x.open += amt; if (S(b.bill_date) && S(b.bill_date) < d90) x.over90 += amt; x.bills.push(b); } else x.advance -= amt; by.set(S(b.party), x); }
      const rows = [...by.values()].sort((p, r) => r.open - p.open).slice(0, lim(a.limit, 30));
      const tot = [...by.values()].reduce((s, x) => s + x.open, 0);
      return text(`Receivables ${cr(tot)} across ${by.size} parties${q ? ` matching "${S(a.party)}"` : ""}.\n` + rows.map((x) => `- ${x.party}: ${cr(x.open)}${x.over90 ? ` (90+ days ${cr(x.over90)})` : ""}${x.advance ? ` · advance in hand ${cr(x.advance)}` : ""}${q ? "\n" + x.bills.slice(0, 20).map((b) => `    ${S(b.bill)} · ${S(b.bill_date)} · due ${S(b.due_date) || "—"} · ${cr(N(b.amount))}`).join("\n") : ""}`).join("\n"), { total: tot, parties: rows.map((x) => ({ ...x, bills: q ? x.bills : [] })) });
    } },
  { name: "kuber_payables", door: "kuber", description: "Whom we owe, from Tally's open bills: by supplier with ageing (0–180, 180+ days). Filter by party name.", inputSchema: obj({ party: { type: "string" }, limit: { type: "integer", default: 30 } }),
    run: async ({ admin, today }, a) => {
      const bills = await all<R>((x, y) => admin.from("kuber_bill").select("party, bill, bill_date, due_date, amount").eq("kind", "payable").order("id").range(x, y));
      const q = S(a.party).toLowerCase(); const d180 = new Date(Date.parse(today) - 180 * 864e5).toISOString().slice(0, 10);
      const by = new Map<string, { party: string; open: number; over180: number; advance: number; bills: R[] }>();
      for (const b of bills) { if (q && !S(b.party).toLowerCase().includes(q)) continue; const x = by.get(S(b.party)) || { party: S(b.party), open: 0, over180: 0, advance: 0, bills: [] }; const amt = -N(b.amount); if (amt > 0) { x.open += amt; if (S(b.bill_date) && S(b.bill_date) < d180) x.over180 += amt; x.bills.push(b); } else x.advance -= amt; by.set(S(b.party), x); }
      const rows = [...by.values()].sort((p, r) => r.open - p.open).slice(0, lim(a.limit, 30));
      const tot = [...by.values()].reduce((s, x) => s + x.open, 0);
      return text(`Payables ${cr(tot)} across ${by.size} parties${q ? ` matching "${S(a.party)}"` : ""}.\n` + rows.map((x) => `- ${x.party}: ${cr(x.open)}${x.over180 ? ` (180+ days ${cr(x.over180)})` : ""}${x.advance ? ` · advance paid ${cr(x.advance)}` : ""}`).join("\n"), { total: tot, parties: rows.map((x) => ({ ...x, bills: q ? x.bills : [] })) });
    } },
  { name: "kuber_payment_plan", door: "kuber", description: "Kuber's payment plan — what is planned to go out, awaiting approval, approved and not yet paid; by date and party.", inputSchema: obj({ status: { type: "string", enum: ["planned", "approved", "paid", "dropped", "open"], default: "open" }, limit: { type: "integer", default: 50 } }),
    run: async ({ admin }, a) => {
      const st = S(a.status) || "open"; let q = admin.from("kuber_payment_plan").select("plan_date, party, amount, purpose, status, by, paid_on").order("plan_date").limit(lim(a.limit));
      q = st === "open" ? q.in("status", ["planned", "approved"]) : q.eq("status", st);
      const { data, error } = await q; if (error) throw new Error(error.message);
      const tot = (data || []).reduce((s, r) => s + N(r.amount), 0);
      return text(`${(data || []).length} lines, ${cr(tot)}.\n` + (data || []).map((r) => `- ${S(r.plan_date)} · ${S(r.party)} · ${cr(N(r.amount))} · ${S(r.purpose)} · ${S(r.status)}${r.paid_on ? ` on ${S(r.paid_on)}` : ""}`).join("\n"), { rows: data || [] });
    } },
];
