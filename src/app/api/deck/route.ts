import { requireReader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fyStart } from "@/lib/delivered";
import { fyLabel } from "@/lib/delivered";
import { today } from "@/lib/schedule";
import { deckHtml } from "@/lib/deck";
import { buildDeck, type JobRow, type TaskRow, type DelRow } from "@/lib/deck-build";

export const dynamic = "force-dynamic";

/**
 * GET /api/deck — the review deck, as a printable page.
 *
 * This route only fetches. Every figure is worked out in buildDeck() and every
 * page is drawn in deckHtml(), both of which are pure — which is what lets the
 * deck be checked without a running server (see scratchpad/deck/README.md).
 *
 * Nothing is cached, so what is presented is what the boards said at the
 * moment the button was pressed. That is also why the report carries its own
 * date on the first page.
 */

/** PostgREST hands over 1000 rows at a time regardless of what .limit() says. */
const PAGE = 1000;
const MAX_ROWS = 20000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function all<T>(table: string, select: string, tweak: (q: any) => any = (q) => q): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < MAX_ROWS; off += PAGE) {
    const { data, error } = await tweak(
      adminClient().from(table).select(select).order("id", { ascending: true }),
    ).range(off, off + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    // Anybody who may read the boards may read a summary of them — the deck
    // shows nothing the Job Delivery Board does not already show.
    await requireReader();
    const on = today();

    const [jobs, dels, erp, man, tgt] = await Promise.all([
      all<JobRow>("jobs", "id,tag,cust,fam,val,tp,tpv,kit,pct,tdd,active,escalation"),
      all<DelRow>("delivered_jobs", "delivered_on,val,tp,tpv,fam", (q) =>
        q.gte("delivered_on", fyStart(on)).lte("delivered_on", on)),
      all<TaskRow>("erp_tasks", "job_id,title,who,due,cat,esc,done", (q) => q.eq("done", false)),
      all<TaskRow>("manual_tasks", "job_id,title,who,due,cat,esc,done", (q) => q.eq("done", false)),
      adminClient().from("fy_targets").select("sales_target,throughput_target").eq("fy", fyLabel(on)).maybeSingle(),
    ]);

    const deck = buildDeck({
      on,
      jobs,
      dels,
      tasks: [...erp, ...man],
      // No row for this FY is a real state, not an error: on 1 April the year
      // rolls over before anybody has set a target. The first page says "no
      // target set" rather than reporting a 0% year.
      targets: {
        sales: Number(tgt.data?.sales_target) || 0,
        throughput: Number(tgt.data?.throughput_target) || 0,
      },
    });

    // The figures on their own, for checking them without reading a slide.
    if (new URL(req.url).searchParams.get("format") === "json")
      return new Response(JSON.stringify(deck, null, 1), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });

    return new Response(deckHtml(deck), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return errJson(e);
  }
}
