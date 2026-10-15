import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireCeo } from "@/lib/ceo/auth";
import { approvalQueues } from "@/lib/ceo/approvals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/ceo/approvals — every approval queue in Genie, counted and listed, with the door to each (see approvals.ts). */
export async function GET() {
  try {
    await requireCeo();
    const queues = await approvalQueues(adminClient());
    return NextResponse.json({ queues, you: queues.filter((q) => q.on === "you").reduce((s, q) => s + q.count, 0), team: queues.filter((q) => q.on === "team").reduce((s, q) => s + q.count, 0) });
  } catch (e) { return errJson(e); }
}
