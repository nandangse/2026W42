import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { requireStratcom, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 0020 has not been run yet — the workspace says so rather than erroring. */
const NOT_INSTALLED = /delivered_jobs|does not exist|schema cache/i;

/**
 * GET /api/delivered — the whole delivered ledger.
 *
 * Served in one payload rather than filtered server-side per period. The
 * ledger is one row per delivery for the life of the company, and the page
 * offers MTD/QTD/YTD/12-month/custom cuts over it — round-tripping on every
 * chip press would make the page feel broken for data that fits in memory
 * many times over. The row cap below is the backstop if that ever stops
 * being true.
 */
const MAX_ROWS = 20000;
/**
 * PostgREST caps a single response at 1000 rows and IGNORES a larger .limit().
 * The ledger holds 2,728, so the first cut of this route silently served the
 * most recent 1000 and the page reported "1000 dated · 0 undated" — a truncation
 * that reads as a complete answer, which is the worst kind. Page explicitly.
 */
const PAGE = 1000;

export async function GET() {
  try {
    // STRATCOM ONLY (Dr Raghu, 30 Aug 2026) — narrowed from the LC
    await requireStratcom();
    const db = supabaseServer();

    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await db
        .from("delivered_jobs")
        .select("id, tag, fam, cust, val, delivered_on, date_source, tdd, otd, start_date, proj, stat, own, tp, tpv, tpp")
        .order("delivered_on", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true }) // stable tiebreak, so pages can't overlap or skip
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    /**
     * GENIE IS THE SOURCE OF THE THROUGHPUT, NOT THE ERP EXPORT (Dr Raghu,
     * 7 Sep 2026: "all data is now to be taken from the Genie only, and there
     * is no upload that is happening from the ERP ... whichever one they put
     * an actual delivery date, the throughput numbers will carry on from
     * there").
     *
     * The two jobs delivered on 7 September showed a throughput of zero
     * because the export carried zero — while Genie's own board held both at
     * 45%, Rs 17,31,678 each. The delivery date may be recorded in either
     * place; the MONEY is Genie's. So each delivered row is overlaid with
     * what the job board says: its throughput percent, its throughput value,
     * and — where the export never carried one — its order value.
     */
    const board = new Map<string, { val: number | null; tp: number | null; tpv: number | null; tpp: number | null }>();
    try {
      const ids = [...new Set(rows.map((r) => String(r.id)))];
      for (let i = 0; i < ids.length; i += 500) {
        const { data: js } = await adminClient()
          .from("jobs").select("id, val, tp, tpv, tpp").in("id", ids.slice(i, i + 500));
        for (const j of (js || []) as { id: string; val: number | null; tp: number | null; tpv: number | null; tpp: number | null }[])
          board.set(String(j.id), { val: j.val, tp: j.tp, tpv: j.tpv, tpp: j.tpp });
      }
    } catch (e) { swallow("delivered/board", e); /* the export still stands on its own */ }

    let fromGenie = 0;
    for (const r of rows) {
      const b = board.get(String(r.id));
      if (!b) continue;
      const val = Number(r.val) || Number(b.val) || 0;
      // the percent Genie holds, applied to the value — and where no percent
      // is set, whatever throughput Genie already worked out
      const fromPct = b.tpp != null && Number(b.tpp) > 0 ? (val * Number(b.tpp)) / 100 : 0;
      const genie = fromPct || Number(b.tpv) || Number(b.tp) || 0;
      const had = Number(r.tpv) || Number(r.tp) || 0;
      if (genie > 0 && Math.round(genie) !== Math.round(had)) {
        r.tpv = genie; r.tpp = b.tpp ?? r.tpp; fromGenie++;
      }
      if (!Number(r.val) && b.val) r.val = b.val;
    }

    // When the report last landed, and which header the date was read from —
    // both belong on the page, because a dashboard whose source silently
    // stopped updating looks exactly like a quarter with no deliveries.
    let lastUpload: string | null = null;
    try {
      const { data: b } = await adminClient()
        .from("import_batches")
        .select("uploaded_at")
        .eq("kind", "delivered")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastUpload = b?.uploaded_at ?? null;
    } catch (e) { swallow("delivered", e); /* the stamp is context, never the point */ }

    const dateSources = [...new Set(rows.map((r) => r.date_source).filter(Boolean))] as string[];
    void fromGenie;   // counted for the log; the page reads the rows themselves

    // THE PIPELINE (Dr Raghu, 29 Aug 2026): what more the period could still
    // produce — every active, undelivered job with its target date, value,
    // throughput and family. The page windows it by whatever period is shown.
    let pipeline: Record<string, unknown>[] = [];
    try {
      const { data: act } = await adminClient()
        .from("jobs")
        .select("id, tag, fam, val, tp, tpv, tdd")
        .eq("active", true)
        // NULL != true is NULL in SQL — neq would silently drop the undated
        .or("delivered.is.null,delivered.eq.false");
      pipeline = (act || []).map((j) => ({
        ...j, val: Number(j.val) || 0, tp: Number(j.tp) || 0, tpv: Number(j.tpv) || 0,
      }));
    } catch (e) { swallow("delivered", e); /* the board is optional context here */ }

    // INSTALLATION STAGE (Dr Raghu, 30 Aug 2026): delivered from the factory,
    // standing at site — the ledger names them, the live board lends their
    // project, status and the money still to come.
    let installation: Record<string, unknown>[] = [];
    try {
      const inst = rows.filter((r) => String(r.stat || "") === "Installation Stage");
      const ids = inst.map((r) => String(r.id));
      const { data: live } = ids.length
        ? await adminClient().from("jobs").select("id, proj, client_update, pay_on_delivery, val").in("id", ids)
        : { data: [] as Record<string, unknown>[] };
      const liveBy = new Map((live || []).map((j) => [String(j.id), j]));
      installation = inst.map((r) => {
        const j = liveBy.get(String(r.id));
        const val = Number(j?.val ?? r.val) || 0;
        const pending = j?.pay_on_delivery != null ? Number(j.pay_on_delivery) || 0 : null;
        return {
          id: r.id, tag: r.tag, cust: r.cust, delivered_on: r.delivered_on,
          proj: String(j?.proj || r.proj || "") || null,
          val,
          pending,
          billed: pending != null && val > 1 ? Math.max(0, val - pending) : null,
          status: String(j?.client_update || "").replace(/[#*|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) || null,
        };
      });
    } catch (e) { swallow("delivered", e); /* the board is optional context here */ }

    // the monthly TARGET the run-rate box measures against — from settings
    // once 0102 is in; the stated numbers (10 Cr value, 4 Cr throughput,
    // Dr Raghu, 30 Aug 2026) carry until then
    let targets: { value_cr: number; tp_cr: number; nos?: number | null } = { value_cr: 10, tp_cr: 4, nos: null };
    try {
      const { data: st } = await adminClient().from("app_settings").select("delivered_targets").eq("id", true).maybeSingle();
      const t = (st?.delivered_targets ?? null) as { value_cr?: number; tp_cr?: number; nos?: number } | null;
      if (t && (Number(t.value_cr) || Number(t.tp_cr)))
        targets = { value_cr: Number(t.value_cr) || 10, tp_cr: Number(t.tp_cr) || 4, nos: Number(t.nos) || null };
    } catch (e) { swallow("delivered", e); /* pre-0102 — the defaults stand */ }

    return NextResponse.json({
      pipeline,
      installation,
      targets,
      jobs: rows.map((r) => ({
        ...r,
        val: Number(r.val) || 0,
        tp: Number(r.tp) || 0,
        tpv: Number(r.tpv) || 0,
        tpp: Number(r.tpp) || 0,
      })),
      lastUpload,
      dateSources,
      truncated: rows.length >= MAX_ROWS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NOT_INSTALLED.test(msg))
      return NextResponse.json({ error: "not_installed", message: msg }, { status: 503 });
    return errJson(e);
  }
}
