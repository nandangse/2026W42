import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SEVA ADMIN — the shared pieces (12 Oct 2026).
 *
 * KUBER IS WHERE IT IS PAID. A sent entry becomes a request in Kuber's payment
 * plan (planned → approved → paid, or dropped); Seva reads the status and the
 * paid date back from there, so the service team never opens Kuber and
 * accounts never open Seva.
 *
 * THE LEDGER, per person, from the opening balance (1 Nov 2026 unless set):
 *   spent    — an expense claim, OD slip or ticket, once sent (not a draft, not dropped)
 *   received — any entry Kuber has PAID: a payment to the team, or a claim reimbursed
 *   balance  = opening + received − spent
 * Positive: money still with the person. Negative: the company owes him.
 */
export const KINDS = { expense: "Expense claim", od: "OD slip", ticket: "Ticket booking", payment: "Payment to team" } as const;
export type Kind = keyof typeof KINDS;
export const LEDGER_FROM = "2026-11-01";

export type Entry = { id: string; no: string; kind: Kind; employee_id: string; person_name: string; on_date: string; amount: number; status: string; plan_id: string | null; paid_on: string | null; description: string; related_kind: string | null; related_ref: string | null; customer: string | null };

/** read Kuber's word on every entry still waiting, and write it here */
export async function syncFromKuber(admin: SupabaseClient): Promise<number> {
  const { data: open } = await admin.from("seva_admin_entry").select("id, plan_id, status").in("status", ["sent", "approved"]).not("plan_id", "is", null);
  if (!open?.length) return 0;
  const { data: plans } = await admin.from("kuber_payment_plan").select("id, status, paid_on").in("id", open.map((o) => String(o.plan_id)));
  let n = 0;
  for (const o of open) {
    const p = (plans || []).find((x) => String(x.id) === String(o.plan_id));
    if (!p) continue;
    const status = p.status === "paid" ? "paid" : p.status === "approved" ? "approved" : p.status === "dropped" ? "dropped" : "sent";
    if (status !== o.status) {
      await admin.from("seva_admin_entry").update({ status, paid_on: p.status === "paid" ? p.paid_on || new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() }).eq("id", o.id);
      n++;
    }
  }
  return n;
}

export function ledgerOf(entries: Entry[], opening: { amount: number; as_of: string } | null) {
  const from = opening?.as_of || LEDGER_FROM;
  const lines: { date: string; no: string; kind: string; text: string; spent: number; received: number; balance: number }[] = [];
  const evts: { date: string; no: string; kind: string; text: string; spent: number; received: number }[] = [];
  for (const e of entries) {
    if (e.status === "draft" || e.status === "dropped") continue;
    if (e.kind !== "payment" && e.on_date >= from) evts.push({ date: e.on_date, no: e.no, kind: KINDS[e.kind], text: e.description, spent: Number(e.amount) || 0, received: 0 });
    if (e.status === "paid" && (e.paid_on || e.on_date) >= from) evts.push({ date: e.paid_on || e.on_date, no: e.no, kind: e.kind === "payment" ? "Paid to him" : `${KINDS[e.kind]} reimbursed`, text: e.description, spent: 0, received: Number(e.amount) || 0 });
  }
  evts.sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
  let bal = Number(opening?.amount) || 0;
  for (const v of evts) { bal += v.received - v.spent; lines.push({ ...v, balance: Math.round(bal * 100) / 100 }); }
  return { from, opening: Number(opening?.amount) || 0, received: evts.reduce((s, v) => s + v.received, 0), spent: evts.reduce((s, v) => s + v.spent, 0), balance: Math.round(bal * 100) / 100, lines };
}
