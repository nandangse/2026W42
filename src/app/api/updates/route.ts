import { NextResponse } from "next/server";
import { requireUser, errJson } from "@/lib/auth";
import { UPDATES, EFFORT } from "@/lib/changelog";

export const dynamic = "force-dynamic";

/** GET /api/updates — the release log and the effort figures, for Admin →
 *  Updates and the Software Description. Served, not bundled (5.0.0.1). */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ updates: UPDATES, effort: EFFORT });
  } catch (e) {
    return errJson(e);
  }
}
