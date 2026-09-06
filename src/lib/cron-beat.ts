import { crmDb, crmConfigured } from "@/crm/db";
import { swallow } from "@/lib/swallow";

/**
 * A HEARTBEAT FOR EVERY CRON (4 Sep 2026).
 *
 * The question "does the hourly cron actually run?" had no answer in the
 * database: the pull's cursor is only written on a clean finish, the sync
 * ledger only knew hands, and the rest leave no trace. So each cron now
 * writes one row into the CRM's audit log the moment it is called and one
 * when it ends -- entity "cron", the cron's name, and what it did. A cron
 * that never beats has never fired; one that beats "fired" and never
 * "done" is failing inside. Either way the answer is a query, not a guess.
 *
 * Best effort by design: a heartbeat must never be the reason a cron fails.
 */
export async function beat(name: string, action: "fired" | "done" | "failed", after?: Record<string, unknown>): Promise<void> {
  try {
    if (!crmConfigured()) return;
    await crmDb().from("crm_audit").insert({ entity: "cron", entity_id: name, action, after: after ?? null });
  } catch (e) { swallow("lib/cron-beat", e); /* never the reason a cron fails */ }
}
