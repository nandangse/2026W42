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
      pageAll((a, b) => db.from("stage").select("id, name, colour, sort_order, entity").eq("entity", "opportunity").order("sort_order").range(a, b)),
      pageAll((a, b) => db.from("opportunity").select("id, name, amount, expected_close_on, stage_id, owner_id, company_id").range(a, b)),
      pageAll((a, b) => db.from("quotation").select("opportunity_id, grand_total, quoted_value, created_at").range(a, b)),
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

    const laneStages = stages.filter((s) => !/lost|drop|cancel/i.test(String(s.name)));
    const defaultWeight = (i: number, n: number) => Math.round((10 + (70 * i) / Math.max(1, n - 1)) / 5) * 5;

    const cells: Record<string, Record<string, { value: number; n: number }>> = {};
    const deals: { id: string; name: string; value: number; month: string; stage_id: string; owner_id: string | null }[] = [];
    for (const o of opps) {
      const id = String(o.id);
      if (won.has(id)) continue;
      const sid = String(o.stage_id ?? "");
      if (!laneStages.some((s) => String(s.id) === sid)) continue;
      if (owner !== "all" && String(o.owner_id ?? "") !== owner) continue;
      const value = Number(o.amount) || quoteVal.get(id) || 0;
      const m = monthOf(o.expected_close_on);
      (cells[sid] ??= {});
      (cells[sid][m] ??= { value: 0, n: 0 });
      cells[sid][m].value += value;
      cells[sid][m].n += 1;
      deals.push({ id, name: String(o.name || ""), value, month: m, stage_id: sid, owner_id: (o.owner_id as string) ?? null });
    }

    const lanes = laneStages.map((s, i) => ({
      id: String(s.id),
      name: String(s.name),
      colour: (s.colour as string) ?? null,
      weight: cfg.weights[String(s.id)] ?? defaultWeight(i, laneStages.length),
      months: Object.fromEntries([...months, "later", "none"].map((m) => [m, cells[String(s.id)]?.[m] ?? { value: 0, n: 0 }])),
    }));

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
      dealsCount: deals.length,
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
