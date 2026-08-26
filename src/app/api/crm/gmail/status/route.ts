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
    // Templates come from the Email Templates master (0013): Module - Name,
    // with subject, cc, body and attachments fixed on the template.
    type Tpl = { id: string; label: string; subject: string | null; cc: string | null; body: string; attachments: { name: string; link: string }[] };
    let templates: Tpl[] = [];
    if (crmConfigured()) {
      const { data, error } = await crmDb().from("email_template")
        .select("id, module, name, subject, cc, body, attachments")
        .order("module").order("name");
      if (!error) {
        templates = (data ?? []).map((t) => ({
          id: String(t.id),
          label: `${t.module} - ${t.name}`,
          subject: t.subject ? String(t.subject) : null,
          cc: t.cc ? String(t.cc) : null,
          body: String(t.body ?? ""),
          attachments: String(t.attachments ?? "").split("\n")
            .map((l) => {
              const [name, link] = l.split("|").map((x) => x.trim());
              return link ? { name: name || "attachment", link } : null;
            })
            .filter((x): x is { name: string; link: string } => !!x),
        }));
      }
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
