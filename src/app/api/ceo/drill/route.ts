import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { requireCeo } from "@/lib/ceo/auth";
import { oeAndSales } from "@/lib/kuber-oe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/ceo/drill?what=…&from=&to= — WHAT IS BEHIND A NUMBER (Dr Raghu, 14
 * Oct 2026: "all the numbers should be clickable in to a lightbox … in the
 * lightbox show details which will open in new tab"). The rows that make the
 * figure, largest first, each with the place it opens (the ERP's own record,
 * or the Genie screen that holds it), and the screen for the whole list.
 *
 *   what = sales | purchase | oe | salaries | head:<OE head>
 *        | receivable | receivable_overdue | receivable_180 | advances | payable | payable_180
 *        | orders | quotes | live_jobs | late_jobs | delivered | tickets | amc | people
 */
type R = Record<string, unknown>;
type Row = { date?: string | null; title: string; sub?: string; amount?: number | null; href?: string | null };
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const ERP = "https://nandanerp.in/app";
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
async function all(q: (a: number, b: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let a = 0; a < 200000; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
const done = (title: string, rows: Row[], screen: string | null, note?: string) => {
  rows.sort((a, b) => Math.abs(N(b.amount)) - Math.abs(N(a.amount)));
  return NextResponse.json({ title, total: rows.reduce((s, r) => s + N(r.amount), 0), count: rows.length, rows: rows.slice(0, 400), screen, note: note || null });
};

export async function GET(req: Request) {
  try {
    await requireCeo();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    const what = S(sp.get("what"));
    const today = istDay();
    const isD = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isD(sp.get("from")) ? String(sp.get("from")) : addDays(today, -365);
    const to = isD(sp.get("to")) ? String(sp.get("to")) : today;

    /* THE BOOKS — the voucher lines, a voucher at a time */
    if (["sales", "purchase", "oe", "salaries"].includes(what) || what.startsWith("head:")) {
      const g = await oeAndSales(admin, from, to);
      const head = what.startsWith("head:") ? what.slice(5) : "";
      const keep = g.lines.filter((l) => (what === "sales" ? l.kind === "sales" : what === "purchase" ? l.kind === "purchase" : what === "salaries" ? l.pay : what === "oe" ? l.kind === "oe" : l.kind === "oe" && l.head === head));
      const byV = new Map<string, { date: string; title: string; sub: string; amount: number; ledgers: Set<string> }>();
      for (const l of keep) {
        const k = `${l.date}|${l.vtype}|${l.vno}`;
        const x = byV.get(k) || { date: l.date, title: `${l.vtype} ${l.vno}`.trim(), sub: "", amount: 0, ledgers: new Set<string>() };
        x.amount += l.amount; x.ledgers.add(l.ledger); x.sub = [l.party, [...x.ledgers].slice(0, 3).join(", "), l.narration].filter(Boolean).join(" · ").slice(0, 220);
        byV.set(k, x);
      }
      const screen = what === "sales" ? "/kuber#salesreg" : what === "purchase" ? "/kuber#purchreg" : what === "salaries" ? "/kuber#pnl" : "/kuber#oereg";
      const label = what === "sales" ? "Sales" : what === "purchase" ? "Purchase" : what === "salaries" ? "Salaries" : what === "oe" ? "OE" : head;
      return done(label, [...byV.values()].map((r) => ({ date: r.date, title: r.title, sub: r.sub, amount: Math.round(r.amount), href: null })), screen, "Tally vouchers, a voucher at a time — open the full register for every line.");
    }

    /* WHAT IS OWED — by party */
    if (/^(receivable|receivable_overdue|receivable_180|advances|payable|payable_180)$/.test(what)) {
      const kind = what.startsWith("pay") ? "payable" : "receivable";
      const bills = await all((a, b) => admin.from("kuber_bill").select("party, bill, amount, bill_date, due_date").eq("kind", kind).order("id").range(a, b));
      const old = addDays(today, -180);
      const keep = bills.filter((b) => {
        const a = kind === "receivable" ? N(b.amount) : -N(b.amount);
        if (what === "advances") return N(b.amount) < 0;
        if (a <= 0) return false;
        if (what === "receivable_overdue") return !!S(b.due_date) && S(b.due_date) < today;
        if (what.endsWith("_180")) return !!S(b.bill_date) && S(b.bill_date) < old;
        return true;
      });
      const m = new Map<string, { title: string; amount: number; n: number; oldest: string }>();
      for (const b of keep) {
        const amt = what === "advances" ? -N(b.amount) : kind === "receivable" ? N(b.amount) : -N(b.amount);
        const x = m.get(S(b.party)) || { title: S(b.party), amount: 0, n: 0, oldest: "9999" };
        x.amount += amt; x.n++; if (S(b.bill_date) && S(b.bill_date) < x.oldest) x.oldest = S(b.bill_date); m.set(S(b.party), x);
      }
      const label = ({ receivable: "Receivables", receivable_overdue: "Receivables past due", receivable_180: "Receivables over 180 days", advances: "Advances held", payable: "Payables", payable_180: "Payables over 180 days" } as Record<string, string>)[what] || what;
      return done(label, [...m.values()].map((x) => ({ title: x.title, amount: Math.round(x.amount), sub: `${x.n} bill${x.n === 1 ? "" : "s"}${x.oldest !== "9999" ? ` · oldest ${x.oldest}` : ""}`, date: null, href: null })), kind === "receivable" ? "/kuber#receivables" : "/kuber#payables", "By party, from Tally's open bills.");
    }

    if (what === "orders" || what === "quotes") {
      if (!crmConfigured()) throw new HttpError(503, "The CRM database is not connected.");
      const crm = crmDb();
      const cos = new Map<string, string>();
      const names = async (ids: string[]) => { for (let i = 0; i < ids.length; i += 200) { const { data } = await crm.from("company").select("id, name").in("id", ids.slice(i, i + 200)); for (const c of data || []) cos.set(S(c.id), S(c.name)); } };
      if (what === "orders") {
        const so = (await all((a, b) => crm.from("sales_order").select("so_no, erpnext_so_no, company_id, amount, ordered_on, erp_status").gte("ordered_on", from).lte("ordered_on", to).order("id").range(a, b))).filter((s) => !/cancel/i.test(S(s.erp_status)));
        await names([...new Set(so.map((s) => S(s.company_id)).filter(Boolean))]);
        return done("Orders booked", so.map((s) => ({ date: S(s.ordered_on), title: cos.get(S(s.company_id)) || S(s.so_no), sub: `${S(s.so_no)} · ${S(s.erp_status)}`, amount: Math.round(N(s.amount)), href: `${ERP}/sales-order/${encodeURIComponent(S(s.erpnext_so_no) || S(s.so_no))}` })), "/crm/salesorders");
      }
      const q = await all((a, b) => crm.from("quotation").select("quote_no, company_id, grand_total, quoted_on, status, subject").in("status", ["live", "hotlist", "submitted"]).order("id").range(a, b));
      await names([...new Set(q.map((s) => S(s.company_id)).filter(Boolean))]);
      return done("Live quotations", q.map((s) => ({ date: S(s.quoted_on) || null, title: cos.get(S(s.company_id)) || S(s.quote_no), sub: `${S(s.quote_no)} · ${S(s.status)}${s.subject ? ` · ${S(s.subject)}` : ""}`, amount: Math.round(N(s.grand_total)), href: `${ERP}/quotation/${encodeURIComponent(S(s.quote_no))}` })), "/crm/quotations");
    }

    if (what === "live_jobs" || what === "late_jobs") {
      let q = admin.from("jobs").select("id, cust, tag, tdd, own, stat, val").eq("delivered", false).eq("active", true);
      if (what === "late_jobs") q = q.lt("tdd", today);
      const { data } = await q;
      return done(what === "late_jobs" ? "Jobs past their delivery date" : "Live jobs", (data || []).map((j) => ({ date: S(j.tdd) || null, title: `${S(j.id)} · ${S(j.cust)}`, sub: `${S(j.tag)} · ${S(j.stat)} · ${S(j.own).split("@")[0]}`, amount: Math.round(N(j.val)), href: `${ERP}/jobmaster/${S(j.id)}` })), "/", "Date is the target delivery date.");
    }
    if (what === "delivered") {
      const dj = await all((a, b) => admin.from("delivered_jobs").select("id, cust, tag, val, delivered_on").gte("delivered_on", from).lte("delivered_on", to).order("id").range(a, b));
      return done("Delivered", dj.map((j) => ({ date: S(j.delivered_on), title: `${S(j.id)} · ${S(j.cust)}`, sub: S(j.tag), amount: Math.round(N(j.val)), href: `${ERP}/jobmaster/${S(j.id)}` })), "/");
    }
    if (what === "tickets") {
      const t = await all((a, b) => admin.from("seva_issue").select("erp_name, title, customer, status, issue_date, at, cost_spent").not("status", "ilike", "%closed%").not("status", "ilike", "%resolved%").order("id").range(a, b));
      return done("Open tickets", t.map((i) => ({ date: S(i.issue_date || i.at).slice(0, 10) || null, title: `${S(i.erp_name)} · ${S(i.customer)}`, sub: `${S(i.title)} · ${S(i.status)}`, amount: N(i.cost_spent) || null, href: S(i.erp_name) ? `${ERP}/issue/${encodeURIComponent(S(i.erp_name))}` : null })), "/seva#issues", "Amount is the cost spent so far, as the ERP has it.");
    }
    if (what === "amc") {
      const { data } = await admin.from("seva_amc").select("erp_name, customer, start_date, end_date, value, visits_planned").eq("status", "AMC valid paid");
      return done("AMC valid", (data || []).map((a) => ({ date: S(a.end_date) || null, title: S(a.customer), sub: `${S(a.erp_name)} · ${S(a.start_date)} → ${S(a.end_date)} · ${S(a.visits_planned)} visits`, amount: Math.round(N(a.value)), href: S(a.erp_name) ? `${ERP}/annual-maintenance-contract/${encodeURIComponent(S(a.erp_name))}` : null })), "/seva#amc", "Date is the valid-till date.");
    }
    if (what === "people") {
      const { data } = await admin.from("hrms_employees").select("id, name, department, designation, doj").eq("active", true);
      return done("On the roll", (data || []).map((e) => ({ date: S(e.doj) || null, title: S(e.name), sub: `${S(e.designation)} · ${S(e.department)} · ${S(e.id)}`, amount: null, href: null })), "/hrms", "Date is the date of joining.");
    }
    throw new HttpError(400, "Not a figure this page knows.");
  } catch (e) { return errJson(e); }
}
