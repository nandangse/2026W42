import type { SupabaseClient } from "@supabase/supabase-js";
import { hrmsTables } from "@/lib/hrms";

/**
 * EVERYTHING WAITING FOR AN APPROVAL, IN ONE PLACE (Dr Raghu, 15 Oct 2026:
 * "consolidate all the places that have asked me for approvals — leave, loan,
 * records, etc. Show as aggregated and then can open in new tab").
 *
 * Each queue is read exactly as its own screen reads it — the same table, the
 * same "waiting" condition — and carries the link to that screen, where the
 * approving is done. Nothing is approved from here: the room is the list of
 * doors, not another door. A queue whose table is not installed yet simply
 * counts nothing.
 *
 *   on: "you"   waits on Dr Raghu (the owner's word, nobody else's)
 *   on: "team"  waits on somebody else (accounts, the service manager, the store)
 */
export type QueueItem = { title: string; sub: string; amount: number | null; at: string | null; href: string | null };
export type Queue = { key: string; label: string; module: string; on: "you" | "team"; who: string; href: string; count: number; amount: number; items: QueueItem[] };

const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
type R = Record<string, unknown>;

export async function approvalQueues(admin: SupabaseClient): Promise<Queue[]> {
  const out: Queue[] = [];
  const add = async (q: Omit<Queue, "count" | "amount" | "items">, read: () => Promise<QueueItem[]>) => {
    let items: QueueItem[] = [];
    try { items = await read(); } catch { /* the table is not there yet, or empty — nothing waits */ }
    out.push({ ...q, items: items.slice(0, 50), count: items.length, amount: items.reduce((s, i) => s + (i.amount || 0), 0) });
  };
  const T = await hrmsTables(admin).catch(() => null);
  const emps = new Map<string, string>();
  if (T) { try { const { data } = await admin.from(T.employees).select("id, name").limit(5000); for (const e of data || []) emps.set(S(e.id), S(e.name) || S(e.id)); } catch { /* no HRMS */ } }
  const nameOf = (id: unknown) => emps.get(S(id)) || S(id);

  /* ---- HRMS: the owner's three approval desks ---- */
  await add({ key: "records", label: "Changes to people's records", module: "HRMS", on: "you", who: "Dr Raghu", href: "/hrms#approvals.records" }, async () => {
    if (!T) return [];
    const { data, error } = await admin.from(T.edits).select("employee_id, field, value, edited_by, edited_at").is("approved_at", null).order("edited_at", { ascending: false }).limit(2000);
    if (error) throw error;
    const by = new Map<string, { n: number; last: string; who: string; fields: string[] }>();
    for (const p of data || []) { const k = S(p.employee_id); const x = by.get(k) || { n: 0, last: "", who: "", fields: [] }; x.n++; x.fields.push(S(p.field)); if (S(p.edited_at) > x.last) { x.last = S(p.edited_at); x.who = S(p.edited_by); } by.set(k, x); }
    return [...by.entries()].map(([id, x]) => ({ title: nameOf(id), sub: `${x.n} change${x.n === 1 ? "" : "s"} · ${[...new Set(x.fields)].slice(0, 4).join(", ")} · by ${x.who || "—"}`, amount: null, at: x.last, href: `/hrms#employee:${id}` })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  });
  await add({ key: "roles", label: "Role definitions changed", module: "HRMS", on: "you", who: "Dr Raghu", href: "/hrms#approvals.records" }, async () => {
    const { data, error } = await admin.from("hrms_role").select("id, role, department, pending_by, pending_since").not("pending_since", "is", null).order("pending_since", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.role), sub: `${S(r.department) || "—"} · by ${S(r.pending_by) || "—"}`, amount: null, at: S(r.pending_since) || null, href: "/hrms#approvals.records" }));
  });
  await add({ key: "salary", label: "Salary decisions (appraisals)", module: "HRMS", on: "you", who: "Dr Raghu", href: "/hrms#approvals.commercial" }, async () => {
    const { data, error } = await admin.from("hrms_appraisal").select("employee_id, new_gross, prev_gross, pending_since, pending_by, approved_at").not("pending_since", "is", null).is("approved_at", null).order("pending_since", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: nameOf(r.employee_id), sub: `₹${N(r.prev_gross).toLocaleString("en-IN")} → ₹${N(r.new_gross).toLocaleString("en-IN")} a month · by ${S(r.pending_by) || "—"}`, amount: (N(r.new_gross) - N(r.prev_gross)) * 12, at: S(r.pending_since) || null, href: "/hrms#approvals.commercial" }));
  });
  await add({ key: "loans", label: "Loans and salary advances", module: "HRMS", on: "you", who: "Dr Raghu", href: "/hrms#approvals.commercial" }, async () => {
    const { data, error } = await admin.from("hrms_loan").select("id, employee_id, amount, kind, reason, months, requested_by, requested_at").eq("status", "Requested").order("requested_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: nameOf(r.employee_id), sub: `${S(r.kind)} · ${S(r.reason) || "—"}${r.months ? ` · ${r.months} months` : ""} · by ${S(r.requested_by) || "—"}`, amount: N(r.amount), at: S(r.requested_at) || null, href: "/hrms#approvals.commercial" }));
  });
  await add({ key: "queries", label: "Salary queries from HR", module: "HRMS", on: "you", who: "Dr Raghu", href: "/hrms#approvals.salary" }, async () => {
    const { data, error } = await admin.from("hrms_query").select("id, employee_id, subject, topic, raised_by, raised_at").eq("status", "Open").order("raised_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.subject), sub: `${S(r.topic) || "—"}${r.employee_id ? ` · ${nameOf(r.employee_id)}` : ""} · by ${S(r.raised_by) || "—"}`, amount: null, at: S(r.raised_at) || null, href: "/hrms#approvals.salary" }));
  });
  await add({ key: "fnf", label: "Full & final settlements open", module: "HRMS", on: "team", who: "HR and accounts", href: "/hrms#fnf" }, async () => {
    const { data, error } = await admin.from("hrms_fnf").select("id, employee_id, name, department, exit_date, created_at").eq("status", "Open").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.name) || nameOf(r.employee_id), sub: `${S(r.department) || "—"} · exit ${S(r.exit_date) || "—"}`, amount: null, at: S(r.created_at) || null, href: `/hrms/fnf/${S(r.id)}` }));
  });

  /* ---- Kuber: the payment plan ---- */
  await add({ key: "payplan", label: "Payments planned, awaiting approval", module: "Kuber", on: "team", who: "Accounts (Suresh's team)", href: "/kuber#payplan" }, async () => {
    const { data, error } = await admin.from("kuber_payment_plan").select("id, plan_date, party, amount, purpose, by, at").eq("status", "planned").order("plan_date").limit(500);
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.party) || "—", sub: `${S(r.purpose) || "—"} · planned for ${S(r.plan_date)} · by ${S(r.by) || "—"}`, amount: N(r.amount), at: S(r.at) || null, href: "/kuber#payplan" }));
  });

  /* ---- Seva ---- */
  await add({ key: "quotes", label: "Service quotations waiting to be sent", module: "Seva", on: "team", who: "Aakash or Sunder (service managers)", href: "/seva#quotes" }, async () => {
    const { data, error } = await admin.from("seva_quote_send").select("id, erp_name, subject, mail_to, asked_by, asked_at").eq("status", "awaiting_approval").order("asked_at", { ascending: false });
    if (error) throw error;
    const names = (data || []).map((r) => S(r.erp_name));
    const { data: qs } = names.length ? await admin.from("seva_quotation").select("erp_name, customer, grand_total").in("erp_name", names) : { data: [] as R[] };
    const q = new Map((qs || []).map((x) => [S((x as R).erp_name), x as R]));
    return (data || []).map((r) => { const x = q.get(S(r.erp_name)); return { title: `${S(r.erp_name)} · ${S(x?.customer) || "—"}`, sub: `to ${(r.mail_to as string[] | null || []).join(", ") || "—"} · asked by ${S(r.asked_by)}`, amount: N(x?.grand_total) || null, at: S(r.asked_at) || null, href: "/seva#quotes" }; });
  });
  await add({ key: "sevaadmin", label: "Service team claims sent to accounts", module: "Seva", on: "team", who: "Accounts (Suresh's team)", href: "/seva#admin" }, async () => {
    const { data, error } = await admin.from("seva_admin_entry").select("no, kind, person_name, on_date, amount, description, sent_at").eq("status", "sent").order("sent_at", { ascending: false });
    if (error) throw error;
    const K: Record<string, string> = { expense: "Expense claim", od: "OD slip", ticket: "Ticket booking", payment: "Payment to team" };
    return (data || []).map((r) => ({ title: `${S(r.no)} · ${S(r.person_name)}`, sub: `${K[S(r.kind)] || S(r.kind)} · ${S(r.description).slice(0, 80)} · ${S(r.on_date)}`, amount: N(r.amount) || null, at: S(r.sent_at) || null, href: "/seva#admin" }));
  });

  /* ---- Leaders Council: principles written, not yet approved ---- */
  await add({ key: "principles", label: "Council principles awaiting your approval", module: "Leaders Council", on: "you", who: "Dr Raghu", href: "/lc#philosophy" }, async () => {
    const { data, error } = await admin.from("lc_section").select("id, title, created_by, updated_at, created_at").is("approved_at", null).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.title) || "(untitled)", sub: `written by ${S(r.created_by) || "—"}`, amount: null, at: S(r.updated_at || r.created_at) || null, href: "/lc#philosophy" }));
  });

  /* ---- Portal: vendor registrations ---- */
  await add({ key: "vrf", label: "Vendor registrations to review", module: "Portal", on: "team", who: "Purchase", href: "/portal/nandan-vrf" }, async () => {
    const { data, error } = await admin.from("portal_vrf").select("id, company_name, contact_name, email, created_at").eq("status", "new").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ title: S(r.company_name) || S(r.email), sub: `${S(r.contact_name) || "—"} · ${S(r.email)}`, amount: null, at: S(r.created_at) || null, href: "/portal/nandan-vrf" }));
  });

  return out;
}
