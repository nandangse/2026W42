import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/changelog";

export const dynamic = "force-dynamic";

/** GET /api/version — which Genie is live. Public, tiny, and the answer to
 *  "not live yet" without a login (30 Aug 2026). */
export async function GET() {
  return NextResponse.json({ v: APP_VERSION });
}
