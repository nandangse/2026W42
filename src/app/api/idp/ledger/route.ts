import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fieldPerson } from "@/lib/field-person";
import { ledgerOf, syncFromKuber, KINDS, type Entry } from "@/lib/seva-admin";

export const dynamic = "force-dynamic";

/** GET /api/idp/ledger — MY ADVANCES AND EXPENSES (Dr Raghu, 12 Oct 2026: "the service person can see it himself"). Only his own; no parameter names another. */
export async function GET() {
  try {
    const admin = adminClient();
    const me = await fieldPerson(admin);
    if (!me) throw new HttpError(401, "Sign in first.");
    try { await syncFromKuber(admin); } catch { /* before 0230 */ }
    const [{ data: es, error }, { data: op }] = await Promise.all([
      admin.from("seva_admin_entry").select("*").eq("employee_id", me.id).order("on_date", { ascending: false }),
      admin.from("seva_ledger_opening").select("*").eq("employee_id", me.id).maybeSingle(),
    ]);
    if (error) return NextResponse.json({ installed: false, me: { name: me.name } });
    return NextResponse.json({ installed: true, me: { name: me.name }, entries: (es || []).filter((e) => e.status !== "draft").map((e) => ({ no: e.no, kind: KINDS[e.kind as keyof typeof KINDS], on_date: e.on_date, amount: e.amount, status: e.status, paid_on: e.paid_on, description: e.description })), ...ledgerOf((es || []) as Entry[], op ? { amount: Number(op.amount), as_of: String(op.as_of) } : null) });
  } catch (e) { return errJson(e); }
}
