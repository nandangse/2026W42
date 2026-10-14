import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { requireCeo } from "@/lib/ceo/auth";
import { oeAndSales, pnlOf } from "@/lib/kuber-oe";
import { erpAuth } from "@/lib/saamaan-stock";

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

    /* THE BRIDGE — Throughput and PBT are struck, not booked: the lines they are struck from */
    if (what === "throughput" || what === "pbt" || what === "tvc") {
      const p = await pnlOf(admin, from, to);
      if (!p) throw new HttpError(404, "No books yet.");
      const L = (title: string, amount: number, sub = "", href: string | null = null) => ({ title, amount: Math.round(amount), sub, date: null, href });
      const rows = [
        L("Sales", p.sales, "booked sales", "/kuber#salesreg"),
        L("Purchases", -p.purchases, "materials bought", "/kuber#purchreg"),
        L("Opening stock", -p.openingStock, p.openingAt ? `stock register, ${p.openingAt}` : "no stock entry before the first day", "/kuber#stock"),
        L("Closing stock", p.closingStock, p.closingAt ? `stock register, ${p.closingAt}` : "no stock entry yet", "/kuber#stock"),
        L("= Throughput", p.throughput, `sales − TVC (${Math.round(p.tvc).toLocaleString("en-IN")})`, "/kuber#pnl"),
        ...(what === "pbt" ? [
          L("Manufacturing expenses", -p.manuf, "wages on the floor, factory power, consumables", "/kuber#pnl"),
          L("OE", -p.oe, "indirect expenses and finance costs", "/kuber#oereg"),
          L("Depreciation", -p.depreciation, "", "/kuber#pnl"),
          L("Other income", p.otherIncome, "", "/kuber#pnl"),
          L("= PBT", p.pbt, "profit before tax", "/kuber#pnl"),
        ] : []),
      ];
      return NextResponse.json({ title: what === "pbt" ? "PBT — how it is struck" : what === "tvc" ? "TVC — how it is struck" : "Throughput — how it is struck", total: what === "pbt" ? p.pbt : what === "tvc" ? p.tvc : p.throughput, count: rows.length, rows: what === "tvc" ? rows.slice(1, 4).map((r) => ({ ...r, amount: -N(r.amount) })) : rows, screen: "/kuber#pnl", note: "The P&L's own arithmetic: TVC = purchases + opening stock − closing stock; Throughput = sales − TVC; PBT = throughput − manufacturing − OE − depreciation + other income." });
    }

    /* SUPPLIER BILLS NOT RECEIVED — goods received on the ERP, not yet billed */
    if (what === "grn") {
      const a = await erpAuth(); if (!a) throw new HttpError(503, "The ERP is not connected.");
      const r = await fetch(`${a.base}/api/resource/${encodeURIComponent("Purchase Receipt")}?fields=${encodeURIComponent(JSON.stringify(["name", "supplier", "posting_date", "base_grand_total", "per_billed", "status"]))}&filters=${encodeURIComponent(JSON.stringify([["docstatus", "=", 1], ["per_billed", "<", 100], ["status", "not in", ["Closed", "Return Issued", "Return"]]]))}&limit_page_length=0`, { headers: a.H });
      const rows = (((await r.json()) as { data?: R[] }).data || []).map((x) => ({ date: S(x.posting_date), title: S(x.supplier), sub: `${S(x.name)} · ${Math.round(N(x.per_billed))}% billed · ${S(x.status)}`, amount: Math.round(N(x.base_grand_total) * (1 - N(x.per_billed) / 100)), href: `${ERP}/purchase-receipt/${encodeURIComponent(S(x.name))}` }));
      return done("Supplier bills not received", rows, `${ERP}/query-report/Received Items To Be Billed`, "Goods received on the ERP whose bill has not been booked — the part not yet billed.");
    }
    /* PAYMENT ON ORDER EXECUTION — the ERP's Pending Payment on Delivery, by days since delivery */
    if (what.startsWith("poe:")) {
      const a = await erpAuth(); if (!a) throw new HttpError(503, "The ERP is not connected.");
      const r = await fetch(`${a.base}/api/resource/Jobmaster?fields=${encodeURIComponent(JSON.stringify(["name", "customer", "customer_tag", "status", "actual_delivery_date", "custom_pending_payment_on_delivery"]))}&filters=${encodeURIComponent(JSON.stringify([["custom_pending_payment_on_delivery", ">", 0], ["status", "!=", "Cancelled"]]))}&limit_page_length=0`, { headers: a.H });
      const b = what.slice(4); const dd = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
      const rows = (((await r.json()) as { data?: R[] }).data || []).filter((j) => {
        const d = S(j.actual_delivery_date); if (b === "undelivered") return !d || d > today; if (!d || d > today) return false;
        const n = dd(d); return b === "0_30" ? n <= 30 : b === "31_60" ? n > 30 && n <= 60 : b === "61_90" ? n > 60 && n <= 90 : n > 90;
      }).map((j) => ({ date: S(j.actual_delivery_date) || null, title: `${S(j.name)} · ${S(j.customer)}`, sub: `${S(j.customer_tag)} · ${S(j.status)}${S(j.actual_delivery_date) ? ` · ${dd(S(j.actual_delivery_date))} days since delivery` : ""}`, amount: Math.round(N(j.custom_pending_payment_on_delivery)), href: `${ERP}/jobmaster/${S(j.name)}` }));
      const label = ({ "0_30": "0–30 days", "31_60": "31–60 days", "61_90": "61–90 days", "90": "over 90 days", undelivered: "not yet delivered" } as Record<string, string>)[b] || b;
      return done(`Payment on order execution — ${label}`, rows, `${ERP}/jobmaster`, "The ERP's Pending Payment on Delivery on each job; date is the delivery date.");
    }
    if (what === "due_30" || what === "on_floor" || what === "escalated") {
      let q = admin.from("jobs").select("id, cust, tag, tdd, own, stat, val, escalation, on_floor").eq("delivered", false).eq("active", true);
      if (what === "due_30") q = q.gte("tdd", today).lte("tdd", addDays(today, 30));
      if (what === "on_floor") q = q.eq("on_floor", true);
      const { data } = await q;
      const rows = (data || []).filter((j) => what !== "escalated" || S(j.escalation)).map((j) => ({ date: S(j.tdd) || null, title: `${S(j.id)} · ${S(j.cust)}`, sub: what === "escalated" ? S(j.escalation).replace(/\*\*/g, "").slice(0, 220) : `${S(j.tag)} · ${S(j.stat)} · ${S(j.own).split("@")[0]}`, amount: Math.round(N(j.val)), href: `${ERP}/jobmaster/${S(j.id)}` }));
      return done(what === "due_30" ? "Due in the next 30 days" : what === "on_floor" ? "On the floor now" : "Escalated", rows, "/", "Date is the target delivery date.");
    }
    if (what === "added90" || what === "left90" || what === "notice" || what === "fnf_pending") {
      const d90 = addDays(today, -90);
      if (what === "added90") {
        const { data } = await admin.from("hrms_employees").select("id, name, department, designation, doj").eq("active", true).gte("doj", d90);
        return done("Joined in the last 90 days", (data || []).map((e) => ({ date: S(e.doj), title: S(e.name), sub: `${S(e.designation)} · ${S(e.department)}`, amount: null, href: null })), "/hrms");
      }
      if (what === "notice") {
        const { data: n } = await admin.from("hrms_employee_edits").select("employee_id").eq("field", "status").ilike("value", "notice%");
        const ids = (n || []).map((x) => S(x.employee_id));
        const { data } = ids.length ? await admin.from("hrms_employees").select("id, name, department, designation").in("id", ids).eq("active", true) : { data: [] };
        const { data: f } = ids.length ? await admin.from("hrms_fnf").select("employee_id, exit_date").in("employee_id", ids) : { data: [] };
        return done("In notice period", (data || []).map((e) => ({ date: S((f || []).find((x) => S(x.employee_id) === S(e.id))?.exit_date) || null, title: S(e.name), sub: `${S(e.designation)} · ${S(e.department)}`, amount: null, href: null })), "/hrms", "Date is the exit date, where HR has set it.");
      }
      const { data } = await admin.from("hrms_fnf").select("fnf_no, name, department, exit_date, status, paid_amount");
      const rows = (data || []).filter((f) => what === "left90" ? S(f.exit_date) >= d90 && S(f.exit_date) <= today : S(f.status) !== "Closed" && S(f.exit_date) && S(f.exit_date) <= today)
        .map((f) => ({ date: S(f.exit_date) || null, title: S(f.name), sub: `${S(f.fnf_no)} · ${S(f.department)} · ${S(f.status)}`, amount: N(f.paid_amount) || null, href: null }));
      return done(what === "left90" ? "Left in the last 90 days" : "Full & final settlements pending", rows, "/hrms", "From the F&F register; date is the exit date.");
    }

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
    if (/^(receivable|receivable_overdue|receivable_180|receivable_0_90|receivable_90|advances|advances_paid|payable|payable_180|payable_0_180)$/.test(what)) {
      const kind = what.startsWith("pay") ? "payable" : "receivable";
      const bills = await all((a, b) => admin.from("kuber_bill").select("party, bill, amount, bill_date, due_date").eq("kind", kind).order("id").range(a, b));
      const old = addDays(today, -180), d90 = addDays(today, -90);
      const keep = bills.filter((b) => {
        const a = kind === "receivable" ? N(b.amount) : -N(b.amount);
        if (what === "advances") return N(b.amount) < 0;
        if (what === "advances_paid") return N(b.amount) > 0;
        if (a <= 0) return false;
        if (what === "receivable_0_90") return !S(b.bill_date) || S(b.bill_date) >= d90;
        if (what === "receivable_90") return !!S(b.bill_date) && S(b.bill_date) < d90;
        if (what === "payable_0_180") return !S(b.bill_date) || S(b.bill_date) >= old;
        if (what === "receivable_overdue") return !!S(b.due_date) && S(b.due_date) < today;
        if (what.endsWith("_180")) return !!S(b.bill_date) && S(b.bill_date) < old;
        return true;
      });
      const m = new Map<string, { title: string; amount: number; n: number; oldest: string }>();
      for (const b of keep) {
        const amt = what === "advances" ? -N(b.amount) : what === "advances_paid" ? N(b.amount) : kind === "receivable" ? N(b.amount) : -N(b.amount);
        const x = m.get(S(b.party)) || { title: S(b.party), amount: 0, n: 0, oldest: "9999" };
        x.amount += amt; x.n++; if (S(b.bill_date) && S(b.bill_date) < x.oldest) x.oldest = S(b.bill_date); m.set(S(b.party), x);
      }
      const label = ({ receivable: "Receivables", receivable_overdue: "Receivables past due", receivable_180: "Receivables over 180 days", receivable_0_90: "Receivables 0–90 days", receivable_90: "Receivables over 90 days", advances: "Advances received", advances_paid: "Advances paid", payable: "Payables", payable_180: "Payables over 180 days", payable_0_180: "Payables 0–180 days" } as Record<string, string>)[what] || what;
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
      const q = await all((a, b) => crm.from("quotation").select("quote_no, company_id, grand_total, quoted_on, status, subject").in("status", ["live", "hotlist", "submitted"]).gte("quoted_on", addDays(today, -365)).order("id").range(a, b));
      await names([...new Set(q.map((s) => S(s.company_id)).filter(Boolean))]);
      return done("Live quotations — the last 12 months", q.map((s) => ({ date: S(s.quoted_on) || null, title: cos.get(S(s.company_id)) || S(s.quote_no), sub: `${S(s.quote_no)} · ${S(s.status)}${s.subject ? ` · ${S(s.subject)}` : ""}`, amount: Math.round(N(s.grand_total)), href: `${ERP}/quotation/${encodeURIComponent(S(s.quote_no))}` })), "/crm/quotations");
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
