import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { people, sheetFor, renderFor, queueMessages, type Person } from "@/lib/hrms-wa";
import { crmDb } from "@/crm/db";
import { periskopeConfig, throttleState, periskopeStatus } from "@/crm/periskope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * WhatsApp broadcast from HRMS (Dr Raghu, 4 Sep 2026): "send one message to
 * everybody with a template ... I would like to send the attendance of
 * this month to them. Set up the piping."
 *
 * GET   templates of kind whatsapp, the months that have a salary sheet,
 *       the audience by type, and the queue's state for HRMS rows
 * POST  { action: "preview", template_key | body, month, year, types[], departments[], ids[] }
 *       { action: "queue",   ...same }            → parks the finished texts
 *       { action: "send", n }                     → releases up to n HRMS rows within the ceilings
 *       { action: "check" }                       → asks Periskope what became of the sent ones
 *
 * The queue is the CRM's (wa_queue); this route only fills it and, for the
 * hand that presses Send, drains it a few at a time. The ceilings — per
 * hour, per day, the gap — are Periskope's settings and are honoured here
 * exactly as the CRM's screen honours them.
 */
const pick = (all: Person[], b: { types?: string[]; departments?: string[]; ids?: string[] }) => {
  const types = new Set((b.types || []).map(String));
  const depts = new Set((b.departments || []).map(String));
  const ids = new Set((b.ids || []).map(String));
  return all.filter((p) => (ids.size ? ids.has(p.id) : true) && (types.size ? types.has(p.type) : true) && (depts.size ? depts.has(String(p.department || "")) : true));
};

export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const [{ data: texts }, { data: sheets }, all] = await Promise.all([
      admin.from("hrms_text_master").select("key, title, body, note, kind").eq("kind", "whatsapp").order("title"),
      admin.from("hrms_salary_sheet").select("id, month, year, status").order("year", { ascending: false }).order("month", { ascending: false }).limit(24),
      people(admin),
    ]);
    const byType: Record<string, { n: number; withPhone: number }> = {};
    const byDept: Record<string, number> = {};
    for (const p of all) {
      const t = p.type || "(no type)";
      byType[t] = byType[t] || { n: 0, withPhone: 0 };
      byType[t].n++; if (p.phone.length >= 8) byType[t].withPhone++;
      const d = String(p.department || "(no department)"); byDept[d] = (byDept[d] || 0) + 1;
    }
    let queue: { counts: Record<string, number>; throttle: unknown; configured: boolean; configError: string | null; recent: unknown[] } = { counts: {}, throttle: null, configured: false, configError: null, recent: [] };
    try {
      const crm = crmDb();
      const { data: q } = await crm.from("wa_queue").select("id, ref, status, error, queued_at, sent_at, delivered_at, template_name, phone").eq("source", "hrms").order("queued_at", { ascending: false }).limit(300);
      const counts: Record<string, number> = {};
      for (const r of q || []) counts[String(r.status)] = (counts[String(r.status)] || 0) + 1;
      const cfg = await periskopeConfig(crm);
      queue = { counts, throttle: "error" in cfg ? null : await throttleState(crm, cfg), configured: !("error" in cfg), configError: "error" in cfg ? cfg.error : null, recent: (q || []).slice(0, 60) };
    } catch (e) { queue.configError = e instanceof Error ? e.message : String(e); }
    const names = new Map(all.map((p) => [p.id, p.name]));
    queue.recent = (queue.recent as { ref?: string }[]).map((r) => ({ ...r, name: names.get(String(r.ref || "")) || r.ref }));
    return NextResponse.json({ templates: texts || [], sheets: sheets || [], byType, byDept, total: all.length, queue });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;

    if (action === "preview" || action === "queue") {
      let template = String(body.body || "");
      const key = String(body.template_key || "") || null;
      if (key && !template.trim()) {
        const { data: t } = await admin.from("hrms_text_master").select("body").eq("key", key).maybeSingle();
        template = String(t?.body || "");
      }
      if (!template.trim()) throw new HttpError(400, "Nothing to send — pick a template or write the message.");
      const sheet = await sheetFor(admin, Number(body.month) || undefined, Number(body.year) || undefined);
      const all = await people(admin);
      const chosen = pick(all, body);
      if (!chosen.length) throw new HttpError(400, "Nobody matches that audience.");
      const rendered = chosen.map((p) => renderFor(p, template, sheet));
      if (action === "preview") {
        const noPhone = rendered.filter((r) => !r.phone || r.phone.length < 8).length;
        const blanks: Record<string, number> = {};
        for (const r of rendered) for (const m of r.missing) blanks[m] = (blanks[m] || 0) + 1;
        return NextResponse.json({ count: rendered.length, noPhone, blanks, sheet: sheet ? { month: sheet.month, year: sheet.year, status: sheet.status } : null, sample: rendered.slice(0, 5) });
      }
      // the CRM profile of the sender, so the queue knows whose it is
      let crmProfileId: string | null = null;
      try { const { data: rp } = await crmDb().from("profile").select("id").ilike("email", me.email).maybeSingle(); crmProfileId = rp?.id ? String(rp.id) : null; } catch { /* fine */ }
      const res = await queueMessages(admin, rendered, { templateKey: key, by: stamp, crmProfileId });
      return NextResponse.json({ ok: true, ...res, sheet: sheet ? { month: sheet.month, year: sheet.year } : null });
    }

    if (action === "send") {
      const { drainHrmsQueue } = await import("@/lib/hrms-wa");
      const r = await drainHrmsQueue(admin, { n: Math.max(1, Math.min(25, Number(body.n) || 10)) });
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "check") {
      const crm = crmDb();
      const cfg = await periskopeConfig(crm);
      if ("error" in cfg) throw new HttpError(400, cfg.error);
      const { data: rows } = await crm.from("wa_queue").select("id, external_id").eq("source", "hrms").eq("status", "sent").not("external_id", "is", null).limit(100);
      let delivered = 0, failed = 0;
      for (const row of rows || []) {
        const st = await periskopeStatus(cfg, String(row.external_id));
        if (st.failed) { failed++; await crm.from("wa_queue").update({ status: "failed", error: `Periskope: ${st.status}` }).eq("id", row.id); try { await admin.from("hrms_communication").update({ status: "failed", error: `Periskope: ${st.status}` }).eq("channel", "whatsapp").contains("meta", { queue_id: String(row.id) }); } catch { /* */ } }
        else if (st.delivered) { delivered++; await crm.from("wa_queue").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", row.id); try { await admin.from("hrms_communication").update({ status: "delivered" }).eq("channel", "whatsapp").contains("meta", { queue_id: String(row.id) }); } catch { /* */ } }
      }
      return NextResponse.json({ ok: true, checked: (rows || []).length, delivered, failed });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
