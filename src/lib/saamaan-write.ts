import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";

/**
 * SAAMAAN'S FIRST WRITES TO THE ERP (Dr Raghu, 3 Oct 2026: "go" — "yes add
 * the item changes").
 *
 * Three verbs, nothing else: set fields on an Item, set its buying price,
 * and merge one Item into another through the ERP's own Rename-and-Merge.
 * Every caller logs what it asked and what the ERP answered; nothing here
 * is retried quietly.
 */
type Doc = Record<string, unknown>;

async function auth() {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  return a;
}
async function readErr(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as Doc;
    const m = (j._server_messages as string) || (j.exception as string) || (j.message as string) || "";
    return `${r.status} ${String(m).replace(/\\"/g, '"').slice(0, 400)}`.trim();
  } catch { return `${r.status}`; }
}

/** PUT /api/resource/Item/<code> with the fields given. */
export async function erpPutItem(code: string, patch: Doc): Promise<void> {
  const { base, H } = await auth();
  const r = await fetch(`${base}/api/resource/Item/${encodeURIComponent(code)}`, {
    method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(patch), signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new HttpError(502, `The ERP refused: ${await readErr(r)}`);
}

/**
 * The buying price: an Item Price row on "Standard Buying", made or updated,
 * and the item's own standard_rate and date_price_updated beside it so the
 * mirror's Fields read the same number the next pull brings.
 */
export async function erpSetBuyingPrice(code: string, rate: number, today: string): Promise<string> {
  const { base, H } = await auth();
  const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));
  const q = await fetch(`${base}/api/resource/${encodeURIComponent("Item Price")}?filters=${J([["item_code", "=", code], ["price_list", "=", "Standard Buying"]])}&fields=${J(["name"])}&limit_page_length=1`, { headers: H, signal: AbortSignal.timeout(20000) });
  if (!q.ok) throw new HttpError(502, `The ERP refused to list prices: ${await readErr(q)}`);
  const have = (((await q.json()) as { data?: Doc[] }).data ?? [])[0];
  let r: Response;
  if (have) {
    r = await fetch(`${base}/api/resource/${encodeURIComponent("Item Price")}/${encodeURIComponent(String(have.name))}`, {
      method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ price_list_rate: rate }), signal: AbortSignal.timeout(30000),
    });
  } else {
    r = await fetch(`${base}/api/resource/${encodeURIComponent("Item Price")}`, {
      method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ item_code: code, price_list: "Standard Buying", buying: 1, price_list_rate: rate }), signal: AbortSignal.timeout(30000),
    });
  }
  if (!r.ok) throw new HttpError(502, `The ERP refused the price: ${await readErr(r)}`);
  await erpPutItem(code, { standard_rate: rate, date_price_updated: today });
  return have ? `Item Price ${String(have.name)} updated` : "Item Price (Standard Buying) created";
}

/**
 * MERGE loser INTO master, on the ERP, by its own machinery:
 * frappe.client.rename_doc(doctype="Item", old_name=loser, new_name=master,
 * merge=1) — the ERP rewrites every stock ledger entry, BOM line, purchase
 * and sales row that carried the loser. Irreversible once done.
 */
export async function erpMergeItem(loser: string, master: string): Promise<void> {
  const { base, H } = await auth();
  const r = await fetch(`${base}/api/method/frappe.client.rename_doc`, {
    method: "POST", headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ doctype: "Item", old_name: loser, new_name: master, merge: 1 }), signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new HttpError(502, `The ERP refused the merge: ${await readErr(r)}`);
}
