import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { placeOf } from "@/lib/seva-geo";

export const dynamic = "force-dynamic";

/**
 * GET /api/seva/locations?from=&to= — where the customers are (Dr Raghu,
 * 3 Oct 2026: "make locations. On clicking this it will show India | Out
 * of India. In India the map of India will show and each location marked
 * there with the dot proportionate to the no of customers there. From
 * 1-4-2026 (default and can change). Show the Customer | Location | no of
 * assets | No of Issues | Cost spent | AMCs | AMC Value").
 *
 * A row is a customer at a place, over the dates: the tickets opened there
 * in the window, the cost the ERP spent on them, the distinct machines they
 * were about (the assets Genie can see), and the customer's contracts —
 * every AMC alive at any point in the window, with its value. The place is
 * read off the ticket's free-text location by the gazetteer; a ticket that
 * matches nothing is counted under "(unplaced)" and listed, never guessed.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const url = new URL(req.url);
    const t = today();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(S(url.searchParams.get("from"))) ? S(url.searchParams.get("from")) : "2026-04-01";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(S(url.searchParams.get("to"))) ? S(url.searchParams.get("to")) : t;

    const issues: Doc[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await admin.from("seva_issue").select("customer, location, title, equipment, machine, cost_spent, amount_billed, issue_date, opening_date, at, status").range(a, a + 999);
      if (error) { if (/does not exist|schema cache/i.test(error.message)) break; throw new Error(error.message); }
      issues.push(...((data ?? []) as unknown as Doc[]));
      if (!data || data.length < 1000) break;
    }
    const { data: amcRows } = await admin.from("seva_amc").select("customer, location, territory, machine, serial_no, value, start_date, end_date, status").limit(5000);
    const amcs = (amcRows ?? []) as Doc[];

    const dateOf = (r: Doc) => (S(r.issue_date) || S(r.opening_date) || S(r.at)).slice(0, 10);
    const inWindow = issues.filter((r) => { const d = dateOf(r); return d >= from && d <= to; });

    /* customer × place */
    interface Cell { customer: string; place: string; state: string; country: string; lat: number; lon: number; raw: Set<string>; assets: Set<string>; issues: number; open: number; cost: number; billed: number }
    const cells = new Map<string, Cell>();
    const unplaced = new Map<string, number>();
    for (const r of inWindow) {
      const p = placeOf(r.location, r.title);
      const place = p?.city || "(unplaced)";
      if (!p) unplaced.set(S(r.location) || "(blank)", (unplaced.get(S(r.location) || "(blank)") || 0) + 1);
      const cust = S(r.customer) || "(no customer)";
      const k = `${cust}|${place}`;
      const c = cells.get(k) ?? { customer: cust, place, state: p?.state || "", country: p?.country || "India", lat: p?.lat ?? 0, lon: p?.lon ?? 0, raw: new Set<string>(), assets: new Set<string>(), issues: 0, open: 0, cost: 0, billed: 0 };
      if (S(r.location)) c.raw.add(S(r.location));
      const asset = S(r.equipment) || S(r.machine); if (asset) c.assets.add(asset);
      c.issues++; if (!/closed|resolved/i.test(S(r.status))) c.open++;
      c.cost += N(r.cost_spent); c.billed += N(r.amount_billed);
      cells.set(k, c);
    }

    /* the customer's contracts alive at any point in the window, and their value */
    const amcOf = new Map<string, { n: number; value: number; live: number; live_value: number; machines: Set<string> }>();
    for (const a of amcs) {
      const cust = S(a.customer); if (!cust) continue;
      const s = S(a.start_date).slice(0, 10), e = S(a.end_date).slice(0, 10);
      const overlaps = (!e || e >= from) && (!s || s <= to);
      if (!overlaps) continue;
      const o = amcOf.get(cust) ?? { n: 0, value: 0, live: 0, live_value: 0, machines: new Set<string>() };
      o.n++; o.value += N(a.value);
      if (e >= t && (!s || s <= t)) { o.live++; o.live_value += N(a.value); }
      const m = S(a.serial_no) || S(a.machine); if (m) o.machines.add(m);
      amcOf.set(cust, o);
    }

    const rows = [...cells.values()].map((c) => {
      const a = amcOf.get(c.customer);
      return {
        customer: c.customer, place: c.place, state: c.state, country: c.country, raw: [...c.raw].slice(0, 6).join(" · "),
        assets: new Set([...c.assets, ...(a?.machines ?? [])]).size, issues: c.issues, open: c.open, cost: c.cost, billed: c.billed,
        amcs: a?.n ?? 0, amc_value: a?.value ?? 0, amc_live: a?.live ?? 0, amc_live_value: a?.live_value ?? 0,
      };
    }).sort((x, y) => y.issues - x.issues || x.customer.localeCompare(y.customer));

    /* the dots: one per place, sized by customers */
    const dots = new Map<string, { place: string; state: string; country: string; lat: number; lon: number; customers: Set<string>; issues: number; cost: number; assets: number }>();
    for (const c of cells.values()) {
      if (c.place === "(unplaced)") continue;
      const d = dots.get(c.place) ?? { place: c.place, state: c.state, country: c.country, lat: c.lat, lon: c.lon, customers: new Set<string>(), issues: 0, cost: 0, assets: 0 };
      d.customers.add(c.customer); d.issues += c.issues; d.cost += c.cost; d.assets += c.assets.size;
      dots.set(c.place, d);
    }
    const places = [...dots.values()].map((d) => ({ ...d, customers: d.customers.size })).sort((a, b) => b.customers - a.customers || b.issues - a.issues);

    const india = rows.filter((r) => r.country === "India"), abroad = rows.filter((r) => r.country !== "India");
    const sum = (list: typeof rows, k: "issues" | "cost" | "assets") => list.reduce((a, r) => a + r[k], 0);
    return NextResponse.json({
      ok: true, from, to, today: t,
      india: { customers: new Set(india.map((r) => r.customer)).size, places: places.filter((p) => p.country === "India").length, issues: sum(india, "issues"), cost: sum(india, "cost"), assets: sum(india, "assets") },
      abroad: { customers: new Set(abroad.map((r) => r.customer)).size, countries: new Set(abroad.map((r) => r.country)).size, issues: sum(abroad, "issues"), cost: sum(abroad, "cost") },
      places, rows,
      unplaced: [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([location, n]) => ({ location, n })),
      unplaced_total: [...unplaced.values()].reduce((a, b) => a + b, 0),
    });
  } catch (e) {
    return errJson(e);
  }
}
