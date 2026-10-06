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

/**
 * THE COUNT GOES BACK TO THE ERP (Dr Raghu, 6 Oct 2026: "this has to go back
 * into the ERP, so that the count between the two has to be perfect… so
 * that the ERP is not confused").
 *
 * The ERP's own document for a physical count — a Stock Reconciliation —
 * made as a DRAFT first, looked at, then submitted from Genie. Never a
 * Material Receipt or Issue: those would read as real movement. Two verbs
 * and a read: create the draft, submit it, read it back.
 */
export interface RecoLine { item_code: string; warehouse: string; qty: number; valuation_rate: number }

export async function erpWarehouseBooks(warehouse: string): Promise<{ company: string; expense_account: string; cost_center: string }> {
  const { base, H } = await auth();
  const w = await fetch(`${base}/api/resource/Warehouse/${encodeURIComponent(warehouse)}`, { headers: H, signal: AbortSignal.timeout(30000) });
  if (!w.ok) throw new HttpError(502, `The ERP would not give warehouse ${warehouse}: ${await readErr(w)}`);
  const company = String(((await w.json()) as { data?: Doc }).data?.company ?? "");
  if (!company) throw new HttpError(502, `Warehouse ${warehouse} has no company in the ERP.`);
  const c = await fetch(`${base}/api/resource/Company/${encodeURIComponent(company)}`, { headers: H, signal: AbortSignal.timeout(30000) });
  if (!c.ok) throw new HttpError(502, `The ERP would not give company ${company}: ${await readErr(c)}`);
  const d = ((await c.json()) as { data?: Doc }).data ?? {};
  const expense_account = String(d.stock_adjustment_account ?? "");
  if (!expense_account) throw new HttpError(502, `${company} has no Stock Adjustment Account set in the ERP — set it on the Company, then post again.`);
  return { company, expense_account, cost_center: String(d.cost_center ?? "") };
}

/** Which of these items the ERP tracks by batch or serial — those are counted in the ERP itself. */
export async function erpBatchOrSerial(codes: string[]): Promise<Set<string>> {
  const { base, H } = await auth();
  const out = new Set<string>();
  for (let i = 0; i < codes.length; i += 200) {
    const f = encodeURIComponent(JSON.stringify([["name", "in", codes.slice(i, i + 200)]]));
    const r = await fetch(`${base}/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(["name", "has_batch_no", "has_serial_no"]))}&filters=${f}&limit_page_length=500`, { headers: H, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} reading items.`);
    for (const x of ((await r.json()) as { data?: Doc[] }).data ?? []) if (Number(x.has_batch_no) || Number(x.has_serial_no)) out.add(String(x.name));
  }
  return out;
}

export async function erpCreateStockReco(p: { company: string; expense_account: string; cost_center: string; posting_date: string; posting_time: string; lines: RecoLine[] }): Promise<string> {
  const { base, H } = await auth();
  const doc: Doc = {
    company: p.company, purpose: "Stock Reconciliation", set_posting_time: 1, posting_date: p.posting_date, posting_time: p.posting_time,
    expense_account: p.expense_account, ...(p.cost_center ? { cost_center: p.cost_center } : {}),
    items: p.lines.map((l) => ({ item_code: l.item_code, warehouse: l.warehouse, qty: l.qty, valuation_rate: l.valuation_rate })),
  };
  const r = await fetch(`${base}/api/resource/${encodeURIComponent("Stock Reconciliation")}`, {
    method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(doc), signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new HttpError(502, `The ERP refused the Stock Reconciliation: ${await readErr(r)}`);
  return String(((await r.json()) as { data?: Doc }).data?.name ?? "");
}

/** The draft's state in the ERP: 0 draft, 1 submitted, 2 cancelled, null gone. */
export async function erpRecoState(name: string): Promise<number | null> {
  const { base, H } = await auth();
  const r = await fetch(`${base}/api/resource/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(name)}`, { headers: H, signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `The ERP answered ${await readErr(r)} reading ${name}.`);
  return Number(((await r.json()) as { data?: Doc }).data?.docstatus ?? 0);
}

export async function erpSubmitStockReco(name: string): Promise<void> {
  const { base, H } = await auth();
  const r = await fetch(`${base}/api/resource/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(name)}`, {
    method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ docstatus: 1 }), signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new HttpError(502, `The ERP would not submit ${name}: ${await readErr(r)}`);
}
