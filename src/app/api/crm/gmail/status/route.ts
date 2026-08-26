import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { myMailbox, oauthConfigured } from "@/crm/gmail";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/** GET /api/crm/gmail/status — is MY mailbox connected? */
export async function GET() {
  try {
    const user = await requireCrm();
    const mb = user.profileId ? await myMailbox(user.profileId) : null;
    // Templates are Message Variables whose key starts template_ — readable
    // by every sender, editable only where the master is.
    let templates: { key: string; value: string; description: string | null }[] = [];
    if (crmConfigured()) {
      const { data } = await crmDb().from("message_variable")
        .select("key, value, description").like("key", "template\_%").order("key");
      templates = (data ?? []).map((t) => ({ key: String(t.key), value: String(t.value ?? ""), description: t.description ? String(t.description) : null }));
    }
    return NextResponse.json({
      templates,
      configured: oauthConfigured(),
      connected: !!mb && mb.status === "active",
      email: mb?.email_address ?? null,
      status: mb?.status ?? null,
    });
  } catch (e) {
    return errJson(e);
  }
}
