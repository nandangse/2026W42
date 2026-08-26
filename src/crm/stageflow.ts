/**
 * The first touch matters (Dr Raghu, 26 Aug 2026): an opportunity is born
 * NEW, and the moment somebody speaks with the customer — an interaction is
 * logged, or a mail goes out against it — it becomes HANDLED OPPORTUNITY on
 * its own. Only the New→Handled step is automatic; every other move stays a
 * human decision.
 */
import type { crmDb } from "./db";

export async function advanceNewToHandled(db: ReturnType<typeof crmDb>, opportunityId: string): Promise<void> {
  const { data: st } = await db.from("stage").select("id, code").in("code", ["new", "handled_opportunity"]);
  const byCode: Record<string, number> = {};
  for (const r of st ?? []) byCode[String(r.code)] = Number(r.id);
  if (!byCode.new || !byCode.handled_opportunity) return;
  await db.from("opportunity")
    .update({ stage_id: byCode.handled_opportunity, stage_entered_at: new Date().toISOString() })
    .eq("id", opportunityId)
    .eq("stage_id", byCode.new);
}
