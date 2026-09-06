import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { missingEnv } from "@/lib/env";
import { APP_VERSION } from "@/lib/changelog";

export const dynamic = "force-dynamic";

/** GET /api/health — admin only: the running version and every environment
 *  key that is absent, with the feature each one powers (5.0.0.1). */
export async function GET() {
  try {
    await requireAdmin();
    const missing = missingEnv();
    return NextResponse.json({ v: APP_VERSION, missing, ok: !missing.some((m) => m.required) });
  } catch (e) {
    return errJson(e);
  }
}
