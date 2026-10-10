import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * KPIs (Dr Raghu, 10 Oct 2026): "a KPI on the left, Assigned To, and Type —
 * number or currency … crowdsourced to all the leaders to feed it in for now
 * … seen by month or by quarter … These are company-wide KPIs."
 *
 * The board is KPI rows × month columns. Every leader may add a KPI and
 * enter any month's value (crowdsourced); the assigned leader is who is
 * expected to. A quarter is read from its months by the KPI's own rule —
 * sum for a flow (sales, enquiries), avg for a rate (OTD %), last for a
 * level (headcount, cash) — so a quarter column is never a wrong total.
 *
 *   GET ?months=12&to=YYYY-MM   → kpis with their values for the window
 *   POST create { name, assigned_to, type, unit, agg, target }   — any leader
 *        edit { id, … } · remove { id }       — creator or owner
 *        value { id, month: YYYY-MM, value, note }   — any leader; blank value clears
 */
export async function GET(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const q = new URL(req.url).searchParams;
    const n = Math.min(36, Math.max(3, Number(q.get("months") || 12)));
    const to = /^\d{4}-\d{2}$/.test(q.get("to") || "") ? q.get("to")! : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
    const months: string[] = [];
    { let [y, m] = to.split("-").map(Number); for (let i = 0; i < n; i++) { months.unshift(`${y}-${String(m).padStart(2, "0")}-01`); m--; if (m === 0) { m = 12; y--; } } }
    /* a KPI is returned only to the room it is marked for; the owner sees every one */
    const sees = (vis: string) => u.isOwner || vis === "all" || vis === "staff" || vis === "lc" || (vis === "mancom" && u.management) || (vis === "stratcom" && u.stratcom);
    const [{ data: kpis, error }, { data: values }] = await Promise.all([
      admin.from("lc_kpi").select("*").order("sort").order("created_at"),
      admin.from("lc_kpi_value").select("kpi_id,month,value,note,entered_by,updated_at").gte("month", months[0]).lte("month", months[months.length - 1]),
    ]);
    if (error) throw error;
    const mine = (kpis || []).filter((k) => sees(String(k.visibility || "all")));
    const ids = new Set(mine.map((k) => k.id));
    return NextResponse.json({ months, kpis: mine, values: (values || []).filter((v) => ids.has(v.kpi_id)), me: { management: u.management, stratcom: u.stratcom, isOwner: u.isOwner } });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    const fields = () => {
      const name = String(b.name || "").trim(); if (!name) throw new HttpError(400, "Name the KPI.");
      const type = b.type === "currency" ? "currency" : "number";
      const agg = ["sum", "avg", "last"].includes(String(b.agg)) ? String(b.agg) : "sum";
      const target = b.target === undefined || b.target === null || b.target === "" ? null : Number(b.target);
      if (target !== null && !Number.isFinite(target)) throw new HttpError(400, "The target must be a number.");
      const visibility = ["all", "mancom", "stratcom", "lc", "staff"].includes(String(b.visibility)) ? String(b.visibility) : "all";
      const group = ["Revenue", "Profits", "Inventory", "Cash", "People", "Other"].includes(String(b.group)) ? String(b.group) : null;
      return { name, group, assigned_to: txt(b.assigned_to)?.toLowerCase() || null, type, unit: txt(b.unit), agg, target, visibility };
    };
    if (b.action === "create") {
      const { data: last } = await admin.from("lc_kpi").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("lc_kpi").insert({ ...fields(), sort: Number(last?.sort || 0) + 1, created_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit" || b.action === "remove") {
      const id = String(b.id || "");
      const { data: k } = await admin.from("lc_kpi").select("created_by").eq("id", id).maybeSingle();
      if (!k) throw new HttpError(404, "No such KPI.");
      if (!mayEdit(u, k.created_by)) throw new HttpError(403, "The one who added the KPI, or Dr Raghu.");
      if (b.action === "remove") {
        const { data: kk } = await admin.from("lc_kpi").select("code").eq("id", id).maybeSingle();
        if (kk?.code) throw new HttpError(400, "A KPI the ratios lean on is retired, not removed.");
        await admin.from("lc_kpi").delete().eq("id", id); return NextResponse.json({ ok: true });
      }
      const { error } = await admin.from("lc_kpi").update({ ...fields(), active: b.active === undefined ? true : !!b.active }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "move") {
      const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
      await Promise.all(ids.map((id, i) => admin.from("lc_kpi").update({ sort: i + 1 }).eq("id", id)));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "value") {
      const id = String(b.id || ""); const m = String(b.month || "");
      { const { data: kk } = await admin.from("lc_kpi").select("formula").eq("id", id).maybeSingle(); if (kk?.formula) throw new HttpError(400, "This figure is worked out from the others — enter those."); }
      if (!/^\d{4}-\d{2}$/.test(m)) throw new HttpError(400, "A month, YYYY-MM.");
      const month = `${m}-01`;
      if (b.value === "" || b.value === null || b.value === undefined) {
        await admin.from("lc_kpi_value").delete().eq("kpi_id", id).eq("month", month);
        return NextResponse.json({ ok: true });
      }
      const value = Number(String(b.value).replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(value)) throw new HttpError(400, "The value must be a number.");
      const { error } = await admin.from("lc_kpi_value").upsert({ kpi_id: id, month, value, note: txt(b.note), entered_by: u.email, updated_at: new Date().toISOString() }, { onConflict: "kpi_id,month" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
