import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireCeo } from "@/lib/ceo/auth";
import { internalKuber } from "@/lib/ceo/internal-figures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/ceo/internal — INTERNAL KUBER: where money can be generated, and where it is wasted (see internal-figures.ts). */
export async function GET() {
  try {
    await requireCeo();
    return NextResponse.json(await internalKuber(adminClient()));
  } catch (e) { return errJson(e); }
}
