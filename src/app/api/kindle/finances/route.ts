import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleTreasurer, kindleAudit, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * Finances (Dr Raghu, 1 Oct 2026: "month on month, the collections, as well
 * as the budget"). Everyone reads; the treasurer and the facilitator write.
 * GET → ledger, budget, fines with what is due
 * POST entry    { entry_on, kind, amount, head, note, member_id, meeting_id }   — treasurer
 *      remove   { id }                                                          — treasurer
 *      budget   { year, head, amount, note }                                    — treasurer (upsert; amount 0 removes)
 *      fine_pay { fine_id, paid_on, paid_amount }  — treasurer: marks the fine paid and books the collection
 *      fine_waive { fine_id, waived }               — facilitator or treasurer
 *      fine_add { member_id, rule_code, amount, reason, meeting_id, levied_on } — treasurer or facilitator
 */
export async function GET() {
  try {
    await requireKindler();
    const admin = adminClient();
    const [l, b, f, r] = await Promise.all([
      admin.from("kindle_ledger").select("id,entry_on,kind,member_id,meeting_id,fine_id,head,amount,note,created_by,created_at").order("entry_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
      admin.from("kindle_budget").select("id,year,head,amount,note").order("year", { ascending: false }),
      admin.from("kindle_fine").select("id,member_id,meeting_id,rule_code,amount,reason,levied_on,paid_on,paid_amount,waived,note").order("levied_on", { ascending: false }),
      admin.from("kindle_fine_rule").select("code,label,amount,sort_order").order("sort_order"),
    ]);
    const err = [l, b, f, r].find((x) => x.error)?.error; if (err) throw err;
    return NextResponse.json({ ledger: l.data || [], budget: b.data || [], fines: f.data || [], rules: r.data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    if (!isKindleTreasurer(k)) throw new HttpError(403, "The treasurer or the facilitator keeps the books.");
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    if (action === "entry") {
      const kind = String(b.kind || ""); const amount = num(b.amount);
      if (!["collection", "fine", "expense", "opening", "adjustment"].includes(kind) || amount == null || amount === 0) throw new HttpError(400, "A kind and an amount.");
      const signed = kind === "expense" ? -Math.abs(amount) : kind === "adjustment" ? amount : Math.abs(amount);
      const { data, error } = await admin.from("kindle_ledger").insert({ entry_on: String(b.entry_on || new Date().toISOString().slice(0, 10)), kind, amount: signed, head: txt(b.head), note: txt(b.note), member_id: txt(b.member_id), meeting_id: txt(b.meeting_id), created_by: k.email }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "ledger_entry", { id: data.id, kind, amount: signed });
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (action === "remove") { await admin.from("kindle_ledger").delete().eq("id", String(b.id)); await kindleAudit(k, "ledger_removed", { id: b.id }); return NextResponse.json({ ok: true }); }
    if (action === "budget") {
      const year = Number(b.year); const head = txt(b.head); const amount = num(b.amount);
      if (!year || !head || amount == null) throw new HttpError(400, "Year, head and amount.");
      if (amount === 0) await admin.from("kindle_budget").delete().eq("year", year).eq("head", head);
      else { const { error } = await admin.from("kindle_budget").upsert({ year, head, amount, note: txt(b.note) }, { onConflict: "year,head" }); if (error) throw error; }
      return NextResponse.json({ ok: true });
    }
    if (action === "fine_pay") {
      const fine_id = String(b.fine_id || "");
      const { data: f } = await admin.from("kindle_fine").select("id,member_id,meeting_id,amount,reason,paid_on,rule_code").eq("id", fine_id).maybeSingle();
      if (!f) throw new HttpError(404, "No such fine.");
      const paid_on = String(b.paid_on || new Date().toISOString().slice(0, 10)); const paid_amount = num(b.paid_amount) ?? Number(f.amount);
      await admin.from("kindle_fine").update({ paid_on, paid_amount }).eq("id", fine_id);
      await admin.from("kindle_ledger").delete().eq("fine_id", fine_id);
      const isDue = f.rule_code === "due";
      await admin.from("kindle_ledger").insert({ entry_on: paid_on, kind: isDue ? "collection" : "fine", amount: Math.abs(paid_amount), head: isDue ? "Dues" : "Fine", note: f.reason, member_id: f.member_id, meeting_id: f.meeting_id, fine_id, created_by: k.email });
      await kindleAudit(k, "fine_paid", { fine_id, paid_amount });
      return NextResponse.json({ ok: true });
    }
    if (action === "fine_waive") {
      await admin.from("kindle_fine").update({ waived: !!b.waived, waived_by: b.waived ? k.email : null }).eq("id", String(b.fine_id));
      await kindleAudit(k, "fine_waived", { fine_id: b.fine_id, waived: !!b.waived });
      return NextResponse.json({ ok: true });
    }
    if (action === "fine_add") {
      const member_id = txt(b.member_id); const rule_code = txt(b.rule_code);
      let amount = num(b.amount);
      if (rule_code && amount == null) { const { data: r } = await admin.from("kindle_fine_rule").select("amount").eq("code", rule_code).maybeSingle(); amount = r ? Number(r.amount) : null; }
      if (!member_id || amount == null) throw new HttpError(400, "Whom, and how much.");
      const { data, error } = await admin.from("kindle_fine").insert({ member_id, rule_code, amount, reason: txt(b.reason), meeting_id: txt(b.meeting_id), levied_on: String(b.levied_on || new Date().toISOString().slice(0, 10)), created_by: k.email }).select("id").single();
      if (error) throw error;
      await kindleAudit(k, "fine_added", { id: data.id, member_id, amount });
      return NextResponse.json({ ok: true, id: data.id });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
