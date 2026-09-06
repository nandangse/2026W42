import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/board?from&to&owner&sector
 *
 * The deal board: one LIVE view across the three stations. Dr Raghu's ten
 * columns (26 Aug 2026):
 *
 *   Opportunity Received · Opportunity In Process · Quotation Sent ·
 *   Long Term · Next Month · This Month · Bucket B · A · 0 ·
 *   Order Received (Sales Order)
 *
 * An opportunity whose quotation is live shows as its QUOTE — the deal is
 * wherever it currently breathes. Weighted value = each card's own stage
 * weight. The date range applies to Order Received only; the rest is live.
 */
const OPP_COLS: Record<string, string> = { new: "opp_received", waiting_for_data: "opp_process", consultative_presentation: "opp_process" };
const QTN_COLS: Record<string, string> = {
  sent: "quote_sent", budgetory: "quote_sent",
  long_term: "long_term", after_two_months: "long_term",
  next_month: "next_month", this_month: "this_month",
  bucket_b: "bucket_b", bucket_a: "bucket_a", bucket_0: "bucket_0",
};
// (not exported — a route file may only export handlers, and this being
// exported is exactly what broke the Vercel build from 3.23.1.12 to .17)
const COLUMNS = [
  { key: "opp_received", label: "Opportunity Received" },
  { key: "opp_process", label: "Opportunity In Process" },
  { key: "quote_sent", label: "Quotation Sent" },
  { key: "long_term", label: "Long Term" },
  { key: "next_month", label: "Next Month" },
  { key: "this_month", label: "This Month" },
  { key: "bucket_b", label: "Bucket B" },
  { key: "bucket_a", label: "Bucket A" },
  { key: "bucket_0", label: "Bucket 0" },
  { key: "order_received", label: "Order Received" },
];

type Row = Record<string, unknown>;

async function pageAll(build: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
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
    const to = u.searchParams.get("to") ?? "2999-12-31";
    const owner = u.searchParams.get("owner");
    const sector = u.searchParams.get("sector");

    const stages = await pageAll((a, b) => db.from("stage").select("id, code, weight_pct").range(a, b));
    const stageByCode = new Map(stages.map((s) => [String(s.code), s]));
    const weightOf = new Map(stages.map((s) => [Number(s.id), Number(s.weight_pct) || 0]));

    const liveQtnStageIds = Object.keys(QTN_COLS).map((c) => stageByCode.get(c)?.id).filter(Boolean) as number[];
    const oppStageIds = Object.keys(OPP_COLS).map((c) => stageByCode.get(c)?.id).filter(Boolean) as number[];

    // Live quotations first — they claim their opportunities off the board.
    let qq = db.from("quotation")
      .select("id, quote_no, grand_total, quoted_value, owner_id, company_id, opportunity_id, stage_id")
      .in("stage_id", liveQtnStageIds);
    const quotes = await pageAll((a, b) => qq.range(a, b));

    const oppIds = [...new Set(quotes.map((q) => q.opportunity_id).filter(Boolean).map(String))];
    const oppInfo = new Map<string, Row>();
    for (let i = 0; i < oppIds.length; i += 150) {
      const { data } = await db.from("opportunity")
        .select("id, name, amount, sector_id, owner_id, company_id")
        .in("id", oppIds.slice(i, i + 150));
      for (const o of data ?? []) oppInfo.set(String(o.id), o as Row);
    }

    let oq = db.from("opportunity")
      .select("id, name, amount, owner_id, sector_id, company_id, stage_id")
      .in("stage_id", oppStageIds).is("deleted_at", null);
    const opps = await pageAll((a, b) => oq.range(a, b));
    const claimed = new Set(oppIds);

    const sos = await pageAll((a, b) => db.from("sales_order")
      .select("id, so_no, amount, owner_id, sector_id, company_id")
      .gte("ordered_on", from).lte("ordered_on", to).range(a, b));

    // ---- cards -----------------------------------------------------------
    type Card = {
      kind: "opportunity" | "quotation" | "sales_order"; id: string; col: string;
      title: string; company_id: string | null; owner_id: string | null;
      sector_id: number | null; amount: number; weight: number;
    };
    const cards: Card[] = [];
    const stageCodeById = new Map(stages.map((s) => [Number(s.id), String(s.code)]));

    for (const o of opps) {
      if (claimed.has(String(o.id))) continue;
      const col = OPP_COLS[stageCodeById.get(Number(o.stage_id)) ?? ""];
      if (!col) continue;
      cards.push({
        kind: "opportunity", id: String(o.id), col,
        title: String(o.name ?? ""), company_id: o.company_id ? String(o.company_id) : null,
        owner_id: o.owner_id ? String(o.owner_id) : null,
        sector_id: (o.sector_id as number) ?? null,
        amount: Number(o.amount) || 0,
        weight: weightOf.get(Number(o.stage_id)) ?? 0,
      });
    }
    for (const q of quotes) {
      const col = QTN_COLS[stageCodeById.get(Number(q.stage_id)) ?? ""];
      if (!col) continue;
      const o = q.opportunity_id ? oppInfo.get(String(q.opportunity_id)) : undefined;
      const amount = Number(q.grand_total) || Number(q.quoted_value) || Number(o?.amount) || 0;
      cards.push({
        kind: "quotation", id: String(q.id), col,
        title: String(o?.name ?? q.quote_no ?? ""),
        company_id: (q.company_id ?? o?.company_id) ? String(q.company_id ?? o?.company_id) : null,
        owner_id: (q.owner_id ?? o?.owner_id) ? String(q.owner_id ?? o?.owner_id) : null,
        sector_id: (o?.sector_id as number) ?? null,
        amount,
        weight: weightOf.get(Number(q.stage_id)) ?? 0,
      });
    }
    for (const s of sos) {
      cards.push({
        kind: "sales_order", id: String(s.id), col: "order_received",
        title: String(s.so_no ?? ""), company_id: s.company_id ? String(s.company_id) : null,
        owner_id: s.owner_id ? String(s.owner_id) : null,
        sector_id: (s.sector_id as number) ?? null,
        amount: Number(s.amount) || 0, weight: 100,
      });
    }

    // ---- filters ---------------------------------------------------------
    const filtered = cards.filter((c) =>
      (!owner || c.owner_id === owner) && (!sector || String(c.sector_id ?? "") === sector));

    // ---- labels ----------------------------------------------------------
    const coIds = [...new Set(filtered.map((c) => c.company_id).filter(Boolean))] as string[];
    const coName = new Map<string, string>();
    for (let i = 0; i < coIds.length; i += 150) {
      const { data } = await db.from("company").select("id, name").in("id", coIds.slice(i, i + 150));
      for (const c of data ?? []) coName.set(String(c.id), String(c.name));
    }
    const { data: profs } = await db.from("profile").select("id, full_name, initials");
    const { data: secs } = await db.from("sector").select("id, code, name").order("sort_order");

    return NextResponse.json({
      columns: COLUMNS,
      cards: filtered.map((c) => ({
        ...c, company: c.company_id ? coName.get(c.company_id) ?? null : null,
      })),
      owners: (profs ?? []).filter((p) => cards.some((c) => c.owner_id === String(p.id)))
        .map((p) => ({ id: String(p.id), name: String(p.full_name), initials: p.initials })),
      sectors: (secs ?? []).map((s) => ({ id: Number(s.id), code: String(s.code), name: String(s.name) })),
    });
  } catch (e) {
    return errJson(e);
  }
}


/**
 * POST /api/crm/board — { kind, id, toCol }: a card dragged to another column.
 *
 * The drop writes the STAGE, nothing else — the stage-history triggers do
 * their own bookkeeping. The rules live here, not in the mouse: an
 * opportunity moves only between the two opportunity columns, a quotation
 * only along the quotation rungs, and nothing drags into Order Received —
 * an order is recorded from the quotation, not conjured by a gesture.
 */
const DROP_STAGE: Record<string, Record<string, string>> = {
  opportunity: { opp_received: "new", opp_process: "waiting_for_data" },
  quotation: {
    quote_sent: "sent", long_term: "long_term", next_month: "next_month",
    this_month: "this_month", bucket_b: "bucket_b", bucket_a: "bucket_a", bucket_0: "bucket_0",
  },
};

export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});
    const kind = String(body.kind || "");
    const id = String(body.id || "");
    const toCol = String(body.toCol || "");
    if (!id) throw new HttpError(400, "Which card?");

    if (kind === "sales_order") throw new HttpError(409, "An order does not move — it has arrived.");
    if (toCol === "order_received")
      throw new HttpError(409, "Order Received is written from the quotation, not by dragging.");
    const code = DROP_STAGE[kind]?.[toCol];
    if (!code) {
      throw new HttpError(409,
        kind === "opportunity"
          ? "An opportunity moves between the two opportunity columns. Send a quotation to put it on the quotation rungs."
          : "A quotation moves along the quotation rungs only.");
    }

    const { data: stage } = await db.from("stage").select("id").eq("code", code).maybeSingle();
    if (!stage) throw new HttpError(500, `No stage with code ${code} — check the stage master.`);

    const { error } = await db.from(kind === "opportunity" ? "opportunity" : "quotation")
      .update({ stage_id: stage.id }).eq("id", id);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
