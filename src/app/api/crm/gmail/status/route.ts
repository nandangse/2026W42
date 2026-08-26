import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { myMailbox, oauthConfigured } from "@/crm/gmail";

export const dynamic = "force-dynamic";

/** GET /api/crm/gmail/status — is MY mailbox connected? */
export async function GET() {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    return NextResponse.json({
      configured: oauthConfigured(),
      connected: !!mb && mb.status === "active",
      email: mb?.email_address ?? null,
      status: mb?.status ?? null,
    });
  } catch (e) {
    return errJson(e);
  }
}
