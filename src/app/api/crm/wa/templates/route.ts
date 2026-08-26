import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/** GET /api/crm/wa/templates — the WhatsApp Templates master (0014), for the
 *  composer. Tolerant before the migration runs: an empty list, not an error. */
export async function GET() {
  try {
    await requireCrm();
    type Tpl = { id: string; label: string; body: string; attachments: { name: string; link: string }[] };
    let templates: Tpl[] = [];
    if (crmConfigured()) {
      const { data, error } = await crmDb().from("whatsapp_template")
        .select("id, module, name, body, attachments")
        .order("module").order("name");
      if (!error) {
        templates = (data ?? []).map((t) => ({
          id: String(t.id),
          label: `${t.module} - ${t.name}`,
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
    return NextResponse.json({ templates });
  } catch (e) {
    return errJson(e);
  }
}
