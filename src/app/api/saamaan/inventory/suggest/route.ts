import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { assertAiOn } from "@/lib/ai-gate";
import { AI, anthropicClient } from "@/lib/ai";
import { inventoryDashboard, mayLeadInventory } from "@/lib/saamaan-inventory";
import { INVENTORY_SYSTEM } from "@/lib/saamaan-inventory-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GENIE SUGGESTS (Dr Raghu, 6 Oct 2026: "put a Genie suggestion in the
 * Inventory module so that we can start giving the suggestions there and
 * getting it done").
 *
 * POST — Genie reads the inventory as it stands (the dashboard, the open
 * suspense, the last two months of counts, what is already suggested) and
 * files up to eight suggestions on the same list people write on. They are
 * worked like any other: open → doing → done, with an owner.
 */
const Suggestions = z.object({
  suggestions: z.array(z.object({
    title: z.string().describe("The suggestion in one line, an instruction"),
    why: z.string().describe("The figures that prompt it, quoted from the data"),
    action: z.string().describe("What to do, by whom, in which Saamaan screen"),
    priority: z.enum(["high", "normal", "low"]),
  })).max(8),
});

export async function POST() {
  try {
    await assertAiOn();
    const me = await requireSaamaan();
    if (!mayLeadInventory(me.email, me.isOwner)) throw new HttpError(403, "Asking Genie for suggestions is Mukesh's, Rameez's or Dr Raghu's.");
    const admin = adminClient();
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const [dash, susp, counts, already] = await Promise.all([
      inventoryDashboard(admin),
      admin.from("material_suspense").select("item_code, item_name, warehouse, qty, released_qty, rate, counted_at, remark").eq("status", "open").limit(500),
      admin.from("material_count").select("id, kind, warehouse, item_group, assigned_name, status, created_at, submitted_at").gte("created_at", since).limit(200),
      admin.from("material_inv_suggestion").select("title, status").in("status", ["open", "doing"]).limit(200),
    ]);
    const open = (susp.data ?? []).map((s) => ({ ...s, open_qty: Number(s.qty) - Number(s.released_qty), open_value: (Number(s.qty) - Number(s.released_qty)) * (Number(s.rate) || 0) }))
      .sort((a, b) => Math.abs(b.open_value) - Math.abs(a.open_value));
    const ids = (counts.data ?? []).map((c) => c.id);
    const { data: lines } = ids.length ? await admin.from("material_count_line").select("count_id, physical_qty, erp_qty, erp_qty_at_count, erp_rate").in("count_id", ids) : { data: [] as Record<string, unknown>[] };
    let counted = 0, variances = 0, varValue = 0;
    for (const l of lines ?? []) if (l.physical_qty !== null) { counted++; const v = Number(l.physical_qty) - Number(l.erp_qty_at_count ?? l.erp_qty ?? 0); if (Math.abs(v) > 1e-9) { variances++; varValue += Math.abs(v * (Number(l.erp_rate) || 0)); } }

    const snapshot = {
      today: new Date().toISOString().slice(0, 10),
      stock: { rm: dash.rm, wip: dash.wip, total: dash.total, finished_goods_value: dash.finished, vendor_value: dash.vendor, untyped: dash.untyped, ignored_left_out: dash.ignored, classes: dash.classes },
      warehouses: dash.warehouses.slice(0, 25),
      suspense_open: { lines: open.length, value_abs: open.reduce((a, s) => a + Math.abs(s.open_value), 0), largest: open.slice(0, 15) },
      counts_last_60_days: { sheet_count: (counts.data ?? []).length, by_status: (counts.data ?? []).reduce((m: Record<string, number>, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {}), items_counted: counted, items_with_variance: variances, variance_value_abs: varValue, sheets: counts.data ?? [] },
      already_suggested: (already.data ?? []).map((s) => s.title),
    };

    const res = await anthropicClient().beta.messages.parse({
      model: AI.NEWEST,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(Suggestions) },
      system: INVENTORY_SYSTEM,
      messages: [{ role: "user", content: `Here is Saamaan's inventory as it stands. Suggest what the store and purchase team should do next to get the books and the shelves to agree and the stock under control — counting, the suspense, warehouses nobody has typed, idle money in class A, WIP that has sat. Each suggestion must rest on figures in this data; quote them. Do not repeat anything already suggested. Fewer, sharper suggestions beat many; return none rather than padding.\n\n${JSON.stringify(snapshot)}` }],
    });
    if (res.stop_reason === "refusal") throw new HttpError(502, "Genie declined to suggest anything this time.");
    const out = res.parsed_output?.suggestions ?? [];
    if (out.length) {
      const { error } = await admin.from("material_inv_suggestion").insert(out.map((s) => ({
        title: s.title.slice(0, 200), body: `${s.why}\n\nWhat to do: ${s.action}`, source: "genie", priority: s.priority, by_email: "genie@genie",
      })));
      if (error) throw new HttpError(503, /does not exist|schema cache/i.test(error.message) ? "Run migration 0201 first." : error.message);
    }
    return Response.json({ ok: true, added: out.length });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return errJson(new HttpError(502, `Genie could not be reached (${e.status}).`));
    return errJson(e);
  }
}
