import { HttpError } from "@/lib/auth";
import { swallow } from "@/lib/swallow";
import { adminClient } from "@/lib/supabase/admin";

/**
 * THE AI MASTER SWITCH (Dr Raghu, 30 Aug 2026: "stop all the genie on
 * planning and crm also") — one owner-held flag in app_settings pauses
 * every route that spends AI money, across Planning, CRM, HRMS, LMS,
 * Kuber, Vishwakarma and the playbooks. Flip it in Settings → Genie.
 * Pre-0106 (no column yet) the gate stands open.
 */
export async function assertAiOn(): Promise<void> {
  let paused = false;
  try {
    const { data } = await adminClient().from("app_settings").select("ai_paused").eq("id", true).maybeSingle();
    paused = !!(data as { ai_paused?: boolean } | null)?.ai_paused;
  } catch (e) { swallow("lib/ai-gate", e); /* pre-0106 — the switch does not exist yet */ }
  if (paused) throw new HttpError(503, "Genie's AI is paused by Dr Raghu. Settings → Genie holds the switch.");
}
