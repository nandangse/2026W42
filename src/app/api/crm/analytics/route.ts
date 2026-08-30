/**
 * GET /api/crm/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Opportunities → Quotations → Sales Orders inside the date range, as one
 * lane per sector plus the whole business. A quotation takes its sector from
 * its opportunity; a sales order carries its own and falls back the same way.
 * Counting is by date of birth — opportunity created, quote created, order
 * ordered — inside the range.
 *
 * ?by=person cuts the same three-station arithmetic PER SALESPERSON instead
 * (Dr Raghu, 28 Aug 2026: "the conversion ratio… for each person or for
 * all") — owner_id on each record, a quote or order falling back to its
 * opportunity's owner when it carries none of its own.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** supabase caps a select at 1000 rows; walk the pages. */
async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new HttpError(500, error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();

    const u = new URL(req.url);
    const from = u.searchParams.get("from") ?? "1900-01-01";
    const to = (u.searchParams.get("to") ?? "2999-12-31") + "T23:59:59+05:30";
    const byPerson = u.searchParams.get("by") === "person";

    const view = u.searchParams.get("view") || "ratios";
    const fromD = from.slice(0, 10), toD = (u.searchParams.get("to") ?? "2999-12-31");

    // ---- SALES FUNNEL: the opportunity ladder, counts and money per rung
    if (view === "funnel") {
      const stages2 = await pageAll((a, b) =>
        db.from("stage").select("id, name, colour, sort_order, entity").range(a, b));
      const opps = await pageAll((a, b) =>
        db.from("opportunity").select("stage_id, amount")
          .is("deleted_at", null)
          .gte("opportunity_on", fromD).lte("opportunity_on", toD).range(a, b));
      const acc = new Map<number, { count: number; amt: number }>();
      for (const o of opps) {
        const k = Number(o.stage_id);
        const a2 = acc.get(k) ?? { count: 0, amt: 0 };
        a2.count++; a2.amt += Number(o.amount) || 0;
        acc.set(k, a2);
      }
      const rungs = stages2
        .filter((st) => st.entity === "opportunity")
        .sort((x, y) => Number(x.sort_order) - Number(y.sort_order))
        .map((st) => ({
          name: String(st.name), colour: (st.colour as string) ?? null,
          count: acc.get(Number(st.id))?.count ?? 0, amt: acc.get(Number(st.id))?.amt ?? 0,
        }));
      return NextResponse.json({ rungs, total: opps.length });
    }

    // ---- FOCUS: where the attention should go, today
    if (view === "focus") {
      const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 14 * 86400000 + 330 * 60000).toISOString().slice(0, 10);
      const [{ data: hot }, { data: expiring }] = await Promise.all([
        db.from("quotation").select("id, quote_no, grand_total, quoted_value, valid_until, status, company_id, stage_id")
          .in("status", ["draft", "live", "hotlist", "submitted"]).order("grand_total", { ascending: false }).limit(10),
        db.from("quotation").select("id, quote_no, grand_total, quoted_value, valid_until, status, company_id")
          .in("status", ["live", "hotlist", "submitted"]).gte("valid_until", today).lte("valid_until", soon)
          .order("valid_until").limit(10),
      ]);
      // opportunities going cold: open, older than 14 days, no interaction in 14 days
      const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
      const openOpps = await pageAll((a, b) =>
        db.from("opportunity").select("id, name, company_id, amount, opportunity_on, stage:stage_id(name, is_terminal)")
          .is("deleted_at", null).order("amount", { ascending: false, nullsFirst: false }).range(a, b));
      const live = openOpps.filter((o) => !(o.stage as { is_terminal?: boolean } | null)?.is_terminal).slice(0, 3000);
      const lastTouch = new Map<string, string>();
      const ints = await pageAll((a, b) =>
        db.from("interaction").select("opportunity_id, happened_at").gte("happened_at", cutoff).range(a, b));
      for (const i of ints) if (i.opportunity_id) lastTouch.set(String(i.opportunity_id), String(i.happened_at));
      const cold = live.filter((o) => !lastTouch.has(String(o.id)) && String(o.opportunity_on || "") < today.slice(0, 10))
        .slice(0, 12)
        .map((o) => ({ id: o.id, name: o.name, company_id: o.company_id, amount: o.amount, opportunity_on: o.opportunity_on, stage: (o.stage as { name?: string } | null)?.name ?? null }));
      // company names for everything shown
      const cids = [...new Set([...(hot ?? []), ...(expiring ?? []), ...cold].map((r) => r.company_id).filter(Boolean).map(String))];
      const coName = new Map<string, string>();
      for (let i = 0; i < cids.length; i += 150) {
        const { data: cs } = await db.from("company").select("id, name").in("id", cids.slice(i, i + 150));
        for (const c of cs ?? []) coName.set(String(c.id), String(c.name));
      }
      const dress = (r: Row) => ({ ...r, company: r.company_id ? coName.get(String(r.company_id)) ?? null : null });
      return NextResponse.json({ hot: (hot ?? []).map(dress), expiring: (expiring ?? []).map(dress), cold: cold.map(dress) });
    }

    // ---- BREAKDOWNS: the range by product family, product, source, industry
    // (Dr Raghu, 30 Aug 2026: "in analytics also show product family and
    // product / Source / industry")
    if (view === "breakdown") {
      const quotes3 = await pageAll((a, b) =>
        db.from("quotation").select("id, grand_total")
          .gte("quoted_on", fromD).lte("quoted_on", toD).range(a, b));
      const qIds = new Set(quotes3.map((q) => String(q.id)));
      const qLines = await pageAll((a, b) =>
        db.from("quotation_line").select("quotation_id, product_id, description, item_group, quantity, unit_price").range(a, b));
      type Agg = Map<string, { count: Set<string>; amt: number }>;
      const bump = (m: Agg, key: string, qid: string, amt: number) => {
        const cur = m.get(key) ?? { count: new Set<string>(), amt: 0 };
        cur.count.add(qid); cur.amt += amt; m.set(key, cur);
      };
      const fam: Agg = new Map(), prod: Agg = new Map();
      for (const l of qLines) {
        const qid = String(l.quotation_id);
        if (!qIds.has(qid)) continue;
        const amt = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
        bump(fam, String(l.item_group || "— ungrouped —"), qid, amt);
        bump(prod, String(l.description || "—"), qid, amt);
      }
      const opps3 = await pageAll((a, b) =>
        db.from("opportunity").select("id, amount, source, company_id")
          .is("deleted_at", null).gte("opportunity_on", fromD).lte("opportunity_on", toD).range(a, b));
      const src: Agg = new Map(), ind: Agg = new Map();
      const coIds = [...new Set(opps3.map((o) => o.company_id).filter(Boolean).map(String))];
      const coInd = new Map<string, string>();
      for (let i = 0; i < coIds.length; i += 150) {
        const { data: cs } = await db.from("company").select("id, industry:industry_id(name)").in("id", coIds.slice(i, i + 150));
        for (const c of cs ?? []) coInd.set(String(c.id), String((c.industry as { name?: string } | null)?.name || ""));
      }
      for (const o of opps3) {
        const amt = Number(o.amount) || 0, oid = String(o.id);
        bump(src, String(o.source || "— unknown —"), oid, amt);
        bump(ind, coInd.get(String(o.company_id)) || "— no industry —", oid, amt);
      }
      const out = (m: Agg, cap: number) => [...m.entries()]
        .map(([name, v]) => ({ name, count: v.count.size, amt: Math.round(v.amt) }))
        .sort((x, y) => y.amt - x.amt).slice(0, cap);
      return NextResponse.json({
        families: out(fam, 40), products: out(prod, 30), sources: out(src, 20), industries: out(ind, 30),
        quotes: quotes3.length, opps: opps3.length,
      });
    }

    // ---- EFFORT: activity vs output per salesperson, inside the range
    if (view === "effort") {
      const ints = await pageAll((a, b) =>
        db.from("interaction").select("by_id, kind")
          .gte("happened_at", from).lte("happened_at", to).range(a, b));
      const quotes2 = await pageAll((a, b) =>
        db.from("quotation").select("owner_id, grand_total, quoted_value")
          .gte("quoted_on", fromD).lte("quoted_on", toD).range(a, b));
      const opps2 = await pageAll((a, b) =>
        db.from("opportunity").select("owner_id")
          .gte("opportunity_on", fromD).lte("opportunity_on", toD).range(a, b));
      type Eff = { touches: number; calls: number; mails: number; visits: number; quotes: number; quoteAmt: number; opps: number };
      const mkE = (): Eff => ({ touches: 0, calls: 0, mails: 0, visits: 0, quotes: 0, quoteAmt: 0, opps: 0 });
      const eff = new Map<string, Eff>();
      const at = (k: unknown) => { const key = k ? String(k) : "none"; if (!eff.has(key)) eff.set(key, mkE()); return eff.get(key)!; };
      for (const i of ints) {
        const e = at(i.by_id);
        e.touches++;
        const kind = String(i.kind || "").toLowerCase();
        if (/call|phone/.test(kind)) e.calls++;
        else if (/mail/.test(kind)) e.mails++;
        else if (/visit|meeting/.test(kind)) e.visits++;
      }
      for (const q2 of quotes2) { const e = at(q2.owner_id); e.quotes++; e.quoteAmt += Number(q2.grand_total) > 0 ? Number(q2.grand_total) : Number(q2.quoted_value) || 0; }
      for (const o2 of opps2) at(o2.owner_id).opps++;
      const people = await pageAll((a, b) => db.from("profile").select("id, full_name, email").range(a, b));
      const nameOf2 = new Map(people.map((p) => [String(p.id), String(p.full_name || String(p.email || "").split("@")[0])]));
      const rows = [...eff.entries()]
        .map(([k, e]) => ({ key: k, name: k === "none" ? "Unassigned" : nameOf2.get(k) ?? "Unknown", ...e }))
        .filter((r) => r.touches + r.quotes + r.opps > 0)
        .sort((a, b) => b.touches - a.touches);
      return NextResponse.json({ rows });
    }

    const sectors = await pageAll((a, b) =>
      db.from("sector").select("id, code, name, sort_order").order("sort_order").range(a, b));
    const stages = await pageAll((a, b) =>
      db.from("stage").select("id, name, colour, sort_order, entity").range(a, b));

    // Lane resolution needs every opportunity, not only the in-range ones —
    // a quote made today may answer an enquiry from last year.
    const allOpps = await pageAll((a, b) =>
      db.from("opportunity").select("id, sector_id, owner_id").range(a, b));
    const oppSector = new Map(allOpps.map((o) => [String(o.id), o.sector_id as number | null]));
    const oppOwner = new Map(allOpps.map((o) => [String(o.id), (o.owner_id as string | null) ?? null]));

    // BUSINESS dates, never created_at (Dr Raghu, 30 Aug 2026): an imported
    // enquiry keeps its real Opportunity Date, and that is the date it counts by.
    const opps = await pageAll((a, b) =>
      db.from("opportunity").select("id, sector_id, owner_id")
        .gte("opportunity_on", from.slice(0, 10)).lte("opportunity_on", to.slice(0, 10)).range(a, b));
    const quotes = await pageAll((a, b) =>
      db.from("quotation").select("id, stage_id, opportunity_id, owner_id, grand_total, quoted_value")
        .gte("quoted_on", from.slice(0, 10)).lte("quoted_on", to.slice(0, 10)).range(a, b));
    const sos = await pageAll((a, b) =>
      db.from("sales_order").select("id, sector_id, opportunity_id, owner_id, amount")
        .gte("ordered_on", from.slice(0, 10)).lte("ordered_on", to.slice(0, 10)).range(a, b));

    type LaneAcc = { opps: number; quotes: number; sos: number; quoteAmt: number; soAmt: number; stageCounts: Map<number, number> };
    const mk = (): LaneAcc => ({ opps: 0, quotes: 0, sos: 0, quoteAmt: 0, soAmt: 0, stageCounts: new Map() });
    const byKey = new Map<string | number | null, LaneAcc>();
    const all = mk();
    const lane = (k: string | number | null) => {
      if (!byKey.has(k)) byKey.set(k, mk());
      return byKey.get(k) as LaneAcc;
    };
    // one keying for both cuts: sector id, or the owner profile id
    const keyOpp = (o: Row) => byPerson ? ((o.owner_id as string | null) ?? null) : ((o.sector_id as number | null) ?? null);
    const keyQuote = (q: Row) => byPerson
      ? ((q.owner_id as string | null) ?? oppOwner.get(String(q.opportunity_id)) ?? null)
      : (oppSector.get(String(q.opportunity_id)) ?? null);
    const keySo = (s: Row) => byPerson
      ? ((s.owner_id as string | null) ?? oppOwner.get(String(s.opportunity_id)) ?? null)
      : ((s.sector_id as number | null) ?? oppSector.get(String(s.opportunity_id)) ?? null);

    for (const o of opps) {
      lane(keyOpp(o)).opps++; all.opps++;
    }
    for (const q of quotes) {
      const l = lane(keyQuote(q));
      l.quotes++; all.quotes++;
      // the quote's money: the computed total once lines exist, else the typed value
      const qa = Number(q.grand_total) > 0 ? Number(q.grand_total) : Number(q.quoted_value) || 0;
      l.quoteAmt += qa; all.quoteAmt += qa;
      const st = q.stage_id as number | null;
      if (st !== null) {
        l.stageCounts.set(st, (l.stageCounts.get(st) ?? 0) + 1);
        all.stageCounts.set(st, (all.stageCounts.get(st) ?? 0) + 1);
      }
    }
    for (const s of sos) {
      const l = lane(keySo(s));
      l.sos++; all.sos++;
      const sa = Number(s.amount) || 0;
      l.soAmt += sa; all.soAmt += sa;
    }

    const qStages = stages
      .filter((s) => s.entity === "quotation")
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const breakdown = (acc: LaneAcc) =>
      qStages
        .map((s) => ({ name: String(s.name), colour: (s.colour as string) ?? null, count: acc.stageCounts.get(s.id as number) ?? 0 }))
        .filter((s) => s.count > 0);

    let lanes;
    if (byPerson) {
      const people = await pageAll((a, b) =>
        db.from("profile").select("id, full_name, email").range(a, b));
      const nameOf = new Map(people.map((p) => [String(p.id), String(p.full_name || String(p.email || "").split("@")[0])]));
      lanes = [...byKey.entries()]
        .map(([k, acc]) => ({
          key: String(k ?? "none"),
          name: k === null ? "No salesperson" : (nameOf.get(String(k)) ?? "Unknown"),
          opps: acc.opps, quotes: acc.quotes, sos: acc.sos, quoteAmt: acc.quoteAmt, soAmt: acc.soAmt, quoteStages: breakdown(acc),
        }))
        .sort((a, b) => (b.opps + b.quotes + b.sos) - (a.opps + a.quotes + a.sos));
    } else {
      lanes = [
        ...sectors.map((s) => {
          const acc = byKey.get(s.id as number) ?? mk();
          return { key: String(s.code), name: String(s.name), opps: acc.opps, quotes: acc.quotes, sos: acc.sos, quoteAmt: acc.quoteAmt, soAmt: acc.soAmt, quoteStages: breakdown(acc) };
        }),
        ...(byKey.has(null)
          ? [{ key: "none", name: "No sector", ...(() => { const a = byKey.get(null) as LaneAcc; return { opps: a.opps, quotes: a.quotes, sos: a.sos, quoteAmt: a.quoteAmt, soAmt: a.soAmt, quoteStages: breakdown(a) }; })() }]
          : []),
      ];
    }

    return NextResponse.json({
      lanes,
      all: { key: "all", name: byPerson ? "Everyone" : "All sectors", opps: all.opps, quotes: all.quotes, sos: all.sos, quoteAmt: all.quoteAmt, soAmt: all.soAmt, quoteStages: breakdown(all) },
    });
  } catch (e) {
    return errJson(e);
  }
}
