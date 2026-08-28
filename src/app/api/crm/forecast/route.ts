import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/forecast — the pipeline as a forecast, the OnePageCRM way
 * (Dr Raghu, 28 Aug 2026, with the screenshot): open opportunities laid out
 * stage × expected-close month, each stage carrying a probability WEIGHT, the
 * top row the weighted expectation against an editable monthly TARGET.
 *
 * An opportunity leaves the forecast when a sales order exists on it (won —
 * it is billing now, not pipeline) or its stage name says lost/dropped.
 * Value = its own amount, else its newest quotation's total.
 *
 * Weights and targets live in integration_setting as JSON — settings, not
 * schema. POST {weights} or {targets} saves them (managers only).
 */

type Row = Record<string, unknown>;

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

const MANAGE = new Set(["admin", "ceo", "sales_head"]);
const SETTING_KEY = "forecast_config";

async function readConfig(db: ReturnType<typeof crmDb>): Promise<{ weights: Record<string, number>; targets: Record<string, number> }> {
  try {
    const { data } = await db.from("integration_setting").select("config").eq("key", SETTING_KEY).maybeSingle();
    const v = (data?.config ?? {}) as { weights?: Record<string, number>; targets?: Record<string, number> };
    return { weights: v.weights || {}, targets: v.targets || {} };
  } catch {
    return { weights: {}, targets: {} };
  }
}

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const owner = u.searchParams.get("owner") || "all";
    const monthsN = Math.min(12, Math.max(3, Number(u.searchParams.get("months")) || 6));

    const [stages, opps, quotes, sos, people, cfg] = await Promise.all([
      pageAll((a, b) => db.from("stage").select("id, name, colour, sort_order, entity").in("entity", ["opportunity", "quotation"]).order("sort_order").range(a, b)),
      pageAll((a, b) => db.from("opportunity").select("id, name, amount, expected_close_on, stage_id, owner_id, company_id").range(a, b)),
      pageAll((a, b) => db.from("quotation").select("id, opportunity_id, stage_id, owner_id, grand_total, quoted_value, quoted_on, status, created_at").range(a, b)),
      pageAll((a, b) => db.from("sales_order").select("opportunity_id").range(a, b)),
      pageAll((a, b) => db.from("profile").select("id, full_name, email").range(a, b)),
      readConfig(db),
    ]);

    const won = new Set(sos.map((s) => String(s.opportunity_id)).filter((x) => x && x !== "null"));
    const quoteVal = new Map<string, number>();
    for (const q of quotes.sort((a, b2) => String(a.created_at).localeCompare(String(b2.created_at)))) {
      const k = String(q.opportunity_id);
      const v = Number(q.grand_total) || Number(q.quoted_value) || 0;
      if (k && v > 0) quoteVal.set(k, v); // newest (sorted ascending) wins
    }

    // months: this month forward, YYYY-MM keys, plus the unscheduled bucket
    const now = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00Z");
    const months: string[] = [];
    for (let i = 0; i < monthsN; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const monthOf = (iso: unknown) => {
      const s = String(iso || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(s)) return "none";
      if (s < months[0]) return months[0]; // slipped deals land in the current month
      return months.includes(s) ? s : "later";
    };

    // TWO GROUPS (Dr Raghu, 28 Aug 2026): OPPORTUNITY, collapsible, holds
    // only deals not yet quoted; QUOTATIONS carries his ladder — Quoted ·
    // After two months · Next Month · This Month · Bucket B · Bucket A ·
    // Bucket 0 · Order in Progress. Once quoted, a deal lives on the quote
    // rung — one deal, one row, never both.
    const oppStages = stages.filter((s) => s.entity === "opportunity" && !/lost|drop|cancel/i.test(String(s.name)));
    const quoteStages = stages.filter((s) => s.entity === "quotation" && !/lost|expired|cancel/i.test(String(s.name)));
    const defaultWeight = (i: number, n: number, base: number, span: number) =>
      Math.round((base + (span * i) / Math.max(1, n - 1)) / 5) * 5;

    const liveQuotes = quotes.filter((q) => !/lost|expired/i.test(String(q.status || "")));
    const quotedOpps = new Set(liveQuotes.map((q) => String(q.opportunity_id)).filter((x) => x && x !== "null"));
    const oppById = new Map(opps.map((o) => [String(o.id), o]));

    const cells: Record<string, Record<string, { value: number; n: number }>> = {};
    let dealsCount = 0;
    const put = (sid: string, m: string, value: number) => {
      (cells[sid] ??= {});
      (cells[sid][m] ??= { value: 0, n: 0 });
      cells[sid][m].value += value;
      cells[sid][m].n += 1;
      dealsCount++;
    };
    for (const o of opps) {
      const id = String(o.id);
      if (won.has(id) || quotedOpps.has(id)) continue; // billing, or living on a quote rung
      const sid = String(o.stage_id ?? "");
      if (!oppStages.some((s) => String(s.id) === sid)) continue;
      if (owner !== "all" && String(o.owner_id ?? "") !== owner) continue;
      put(sid, monthOf(o.expected_close_on), Number(o.amount) || quoteVal.get(id) || 0);
    }
    for (const q of liveQuotes) {
      const sid = String(q.stage_id ?? "");
      if (!quoteStages.some((s) => String(s.id) === sid)) continue;
      const opp = oppById.get(String(q.opportunity_id));
      const qOwner = String(q.owner_id ?? opp?.owner_id ?? "");
      if (owner !== "all" && qOwner !== owner) continue;
      put(sid, monthOf(opp?.expected_close_on ?? q.quoted_on), Number(q.grand_total) || Number(q.quoted_value) || 0);
    }

    const mkLane = (s: Row, i: number, n: number, group: string, base: number, span: number) => ({
      id: String(s.id),
      name: String(s.name),
      colour: (s.colour as string) ?? null,
      group,
      weight: cfg.weights[String(s.id)] ?? defaultWeight(i, n, base, span),
      months: Object.fromEntries([...months, "later", "none"].map((m) => [m, cells[String(s.id)]?.[m] ?? { value: 0, n: 0 }])),
    });
    const lanes = [
      ...oppStages.map((s, i) => mkLane(s, i, oppStages.length, "opportunity", 10, 40)),
      ...quoteStages.map((s, i) => mkLane(s, i, quoteStages.length, "quotation", 50, 45)),
    ];

    const expected = Object.fromEntries([...months, "later", "none"].map((m) => [
      m,
      lanes.reduce((s, l) => s + (l.months[m].value * l.weight) / 100, 0),
    ]));
    const raw = Object.fromEntries([...months, "later", "none"].map((m) => [
      m,
      lanes.reduce((s, l) => s + l.months[m].value, 0),
    ]));

    const owners = people
      .map((p) => ({ id: String(p.id), name: String(p.full_name || String(p.email || "").split("@")[0]) }))
      .sort((a, b2) => a.name.localeCompare(b2.name));

    return NextResponse.json({
      months, lanes, expected, raw,
      targets: cfg.targets,
      owners,
      mayEdit: MANAGE.has(me.crmRole),
      dealsCount,
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { weights?, targets? } — managers set the probabilities and the bar. */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!MANAGE.has(me.crmRole)) throw new HttpError(403, "Weights and targets are the Sales Head's to set.");
    const db = crmDb();
    const body = await req.json();
    const cfg = await readConfig(db);
    if (body.weights && typeof body.weights === "object") cfg.weights = { ...cfg.weights, ...body.weights };
    if (body.targets && typeof body.targets === "object") cfg.targets = { ...cfg.targets, ...body.targets };
    const { error } = await db.from("integration_setting").upsert(
      { key: SETTING_KEY, config: cfg, updated_by: me.email },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
