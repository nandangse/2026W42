/**
 * ONE LEDGER, ONE ROW — WHATEVER THE BOOKS HOLD.
 *
 * Dr Raghu, 30 Sep 2026: "this P&L is wrong!!! sales is only about 31.99!!!"
 * It read Rs 63.98 Cr — exactly twice.
 *
 * `kuber_ledger` is scoped by financial year (0178): loading 2025-26 beside
 * 2026-27 wrote a SECOND row for every one of the 3,620 ledgers that exist in
 * both years' masters. Nothing about the vouchers changed. But every
 * statement walks the ledger list and asks the period map what that NAME
 * moved — so a ledger present twice was answered twice, and every head of the
 * P&L, every root of the balance sheet, doubled the moment last year loaded.
 *
 * The masters are a snapshot of the chart of accounts, not a transaction: two
 * years' masters describe the same ledger twice, they do not describe two
 * ledgers. So the newest year's row wins and the older one is dropped —
 * exactly the rule the bill-wise outstanding already follows.
 *
 * Every read of kuber_ledger goes through here. There is no correct way to
 * walk that table raw any more.
 */
export function newestByName<T extends { name?: unknown; fy?: unknown }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = String(r.name ?? "");
    const prev = best.get(k);
    if (!prev || String(r.fy ?? "") > String(prev.fy ?? "")) best.set(k, r);
  }
  return [...best.values()];
}
