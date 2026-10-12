import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";
import { accessTokenFor, gmailSendMixed, mailboxByAddress } from "@/crm/gmail";

/**
 * SERVICE ORDER (Dr Raghu, 12 Oct 2026) — the shared pieces.
 *
 * A line is SPARES or SERVICE. From a quotation the ERP says which: the item
 * group — Services, AGSE- Services, Nandan Buying Services — is service;
 * everything else is a spare. The amounts are the rupee ones (base_net_*),
 * so an export quote in dollars still lands in rupees.
 */
export type Line = { kind: "spares" | "service"; item_code: string | null; description: string; qty: number; uom: string | null; rate: number; amount: number };
const S = (v: unknown) => String(v ?? "").trim();
const strip = (h: unknown) => S(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const isService = (group: string, code = "", name = "") => /servic/i.test(group) || /^(service|visit|labour|labor|manpower|transport|travel|audit|amc)\b/i.test(name) || /servic/i.test(code);

/** "accounts for billing" — the address the rest of Genie bills to */
export const BILLING_TO = ["accounts@nandan.co.in"];

export async function quoteLines(name: string): Promise<{ customer: string; lines: Line[]; currency: string; erpTotal: number }> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const r = await fetch(`${a.base}/api/resource/Quotation/${encodeURIComponent(name)}`, { headers: a.H, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for ${name}.`);
  const d = ((await r.json()) as { data?: Record<string, unknown> }).data;
  if (!d) throw new HttpError(404, "No such quotation on the ERP.");
  const items = (Array.isArray(d.items) ? d.items : []) as Record<string, unknown>[];
  const lines: Line[] = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const amount = Number(it.base_net_amount ?? it.base_amount ?? it.amount) || 0;
    const rate = qty ? Math.round((amount / qty) * 100) / 100 : Number(it.base_net_rate ?? it.base_rate ?? it.rate) || 0;
    return { kind: isService(S(it.item_group), S(it.item_code), S(it.item_name)) ? "service" : "spares", item_code: S(it.item_code) || null, description: S(it.item_name) || strip(it.description).slice(0, 300), qty, uom: S(it.uom) || null, rate, amount };
  });
  return { customer: S(d.customer_name) || S(d.party_name), lines, currency: S(d.currency), erpTotal: Number(d.base_net_total) || 0 };
}

export const totals = (lines: { kind: string; amount: number }[]) => ({
  spares_amount: Math.round(lines.filter((l) => l.kind === "spares").reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100,
  service_amount: Math.round(lines.filter((l) => l.kind === "service").reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100,
});

/** From the asker's own Gmail when connected; else sales@, with the asker in CC and as Reply-To. */
export async function sevaMail(asker: string, askerName: string | null, to: string[], cc: string[], subject: string, html: string, attachments: { name: string; mime: string; base64: string }[]): Promise<{ from: string; gmailId: string }> {
  const own = await mailboxByAddress(asker);
  const ownOk = own && own.status === "active";
  const box = ownOk ? own : await mailboxByAddress("sales@nandan.co.in");
  if (!box || box.status !== "active") throw new HttpError(503, "No mailbox to send from — connect your Gmail on the CRM's Integrations, or sales@ has to be reconnected.");
  const token = await accessTokenFor(String(box.id));
  const ccAll = [...cc, ...(ownOk ? [] : [asker])].filter((x, i, arr) => x && arr.indexOf(x) === i);
  const gmailId = await gmailSendMixed(token, String(box.email_address), to.join(", "), subject, html, attachments, ccAll.join(", ") || undefined, undefined, askerName ? `${askerName} — Nandan GSE` : "Nandan GSE", ownOk ? null : asker);
  return { from: String(box.email_address), gmailId };
}

export async function log(admin: SupabaseClient, so_id: string, body: string, by: string) {
  await admin.from("seva_so_log").insert({ so_id, body, by });
}
