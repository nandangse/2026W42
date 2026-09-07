/**
 * HRMS → the WhatsApp queue (Dr Raghu, 4 Sep 2026): "Add the queue called
 * WhatsApp and let it send from there. Any WhatsApp sending will happen
 * through Periskope for now ... there's a default number. Let it go with
 * that."
 *
 * HRMS never talks to Periskope directly for sending. It personalises a
 * template per employee, parks the finished text in the CRM's wa_queue with
 * source 'hrms' and the employee id as ref, and logs a row in
 * hrms_communication pointing at the queue row. Sending is the queue's:
 * the same ceilings, the same default number, the same delivery check —
 * whether the message was queued from the CRM or from here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/all-rows";
import { swallow } from "@/lib/swallow";
import { ALL_FIELDS, fieldSpec, hrmsTables, type FieldSpec } from "@/lib/hrms";
import { employeeVars, payrollVars, renderTemplate, MONTHS } from "@/lib/hrms-template";
import { musterVars, OPTIONAL_MUSTER_VARS, type MusterRow } from "@/lib/muster";
import { crmDb } from "@/crm/db";
import { periskopeConfig, throttleState, periskopeSend, isPaused } from "@/crm/periskope";
import { aisensyConfig, aisensySend, aisensyReady, type AisensyCfg } from "@/crm/aisensy";

export interface EmpRow {
  id: string; name: string; email: string | null; dob: string | null; doj: string | null;
  department: string | null; designation: string | null; location: string | null; active: boolean;
  extra: Record<string, string> | null;
}
function baseValue(row: EmpRow, f: FieldSpec): string | null {
  if (f.column) {
    if (f.column === "active") return row.active ? "yes" : "no";
    const v = (row as unknown as Record<string, unknown>)[f.column];
    return v == null || v === "" ? null : String(v);
  }
  if (f.sheetHeader) {
    const v = (row.extra || {})[f.sheetHeader];
    return v == null || String(v).trim() === "" ? null : String(v);
  }
  return null;
}

export interface Person { id: string; name: string; type: string; department: string | null; phone: string; value: Record<string, string | null> }

/** Active people, overrides applied, with the personal mobile picked out. */
export async function people(admin: SupabaseClient, ids?: string[]): Promise<Person[]> {
  const T = await hrmsTables(admin);
  let q = admin.from(T.employees).select("id, name, email, dob, doj, department, designation, location, active, extra").order("name");
  if (ids?.length) q = q.in("id", ids); else q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data || []) as EmpRow[];
  const overrides = new Map<string, Map<string, string | null>>();
  try {
    // every override, not the first thousand — see src/lib/all-rows.ts
    const eds = await allRows<{ employee_id: string; field: string; value: string | null }>(() => {
      const e = admin.from(T.edits).select("employee_id, field, value");
      return ids?.length ? e.in("employee_id", ids) : e;
    });
    for (const x of eds || []) {
      const k = String(x.employee_id);
      if (!overrides.has(k)) overrides.set(k, new Map());
      overrides.get(k)!.set(String(x.field), x.value == null ? null : String(x.value));
    }
  } catch (e) { swallow("lib/hrms-wa", e); /* pre-0047 */ }
  return rows.map((r) => {
    const value: Record<string, string | null> = {};
    for (const f of ALL_FIELDS) value[f.key] = baseValue(r, f);
    for (const [k, v] of overrides.get(r.id) || []) if (fieldSpec(k)) value[k] = v;
    return { id: r.id, name: r.name, type: String(value.type || ""), department: r.department, phone: String(value.phone || "").replace(/\D/g, ""), value };
  });
}

export interface Sheet { id: string; month: number; year: number; status: string; rows: unknown; muster?: { rows?: { employee_id: string }[] } | null }

/** The month's salary sheet — with its uploaded muster, when the run has one, so the attendance lines can be filled. */
export async function sheetFor(admin: SupabaseClient, month?: number, year?: number): Promise<Sheet | null> {
  const cols = "id, month, year, status, rows, muster";
  let q = admin.from("hrms_salary_sheet").select(cols).order("year", { ascending: false }).order("month", { ascending: false }).limit(1);
  if (month && year) q = admin.from("hrms_salary_sheet").select(cols).eq("month", month).eq("year", year).limit(1);
  const first = await q;
  let data = first.data as Sheet[] | null;
  if (first.error && /muster/i.test(first.error.message)) {
    // pre-0133
    const cols2 = "id, month, year, status, rows";
    let q2 = admin.from("hrms_salary_sheet").select(cols2).order("year", { ascending: false }).order("month", { ascending: false }).limit(1);
    if (month && year) q2 = admin.from("hrms_salary_sheet").select(cols2).eq("month", month).eq("year", year).limit(1);
    data = (await q2).data as Sheet[] | null;
  }
  return (data && data[0]) || null;
}

export interface Rendered { id: string; name: string; phone: string; text: string; missing: string[] }

/** The template, filled for each person. `missing` names the variables that came out blank. */
export function renderFor(p: Person, template: string, sheet: Sheet | null, extra: Record<string, string> = {}, phoneOverride?: string | null): Rendered {
  // {{employee_id}} is the four-digit number (Dr Raghu, 4 Sep 2026) — the record's id, not a field
  // the run's muster, when there is one, fills the attendance lines for this person
  const m = sheet?.muster?.rows?.find((x) => String(x.employee_id) === String(p.id)) as MusterRow | undefined;
  const monthLabel = sheet ? `${MONTHS[(sheet.month || 1) - 1] || sheet.month} ${sheet.year}` : "";
  const vars = { ...employeeVars(p.value, { employee_id: p.id }), ...payrollVars(sheet, p.id), ...(m ? musterVars(m, monthLabel) : {}), ...extra };
  const phone = String(phoneOverride || p.phone || "").replace(/\D/g, "");
  const text = renderTemplate(template, vars);
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = new Map(Object.entries(vars).map(([k, v]) => [norm(k), v]));
  const missing = [...new Set([...String(template).matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)].map((m) => m[1]).filter((k) => !known.get(norm(k)) && !OPTIONAL_MUSTER_VARS.has(norm(k))))];
  return { id: p.id, name: p.name, phone: phone.length <= 10 && phone ? `91${phone}` : phone, text, missing };
}

export interface QueueResult { queued: number; skipped: { id: string; name: string; why: string }[]; batch_id: string }

/** Park the rendered messages in the CRM queue and log each on the record. */
export async function queueMessages(admin: SupabaseClient, list: Rendered[], opts: { templateKey: string | null; by: string; crmProfileId: string | null; runId?: string | null }): Promise<QueueResult> {
  const crm = crmDb();
  const batch = crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  const skipped: QueueResult["skipped"] = [];
  const logs: Record<string, unknown>[] = [];
  for (const r of list) {
    if (!r.phone || r.phone.length < 8) { skipped.push({ id: r.id, name: r.name, why: "no personal mobile on the record" }); continue; }
    if (!r.text.trim()) { skipped.push({ id: r.id, name: r.name, why: "the message came out empty" }); continue; }
    rows.push({ phone: r.phone, body: r.text, template_name: opts.templateKey ? `hrms:${opts.templateKey}` : "hrms", batch_id: batch, queued_by: opts.crmProfileId, status: "queued", source: "hrms", ref: r.id });
  }
  if (rows.length) {
    const { data, error } = await crm.from("wa_queue").insert(rows).select("id, ref");
    if (error) {
      if (/source|ref/i.test(error.message) && /column/i.test(error.message)) throw new Error("Run CRM migration 0054 first — the queue cannot yet tell an HRMS message from a CRM one.");
      if (/wa_queue|schema cache|does not exist/i.test(error.message)) throw new Error("Run CRM migration 0049 first — the WhatsApp queue has nowhere to live yet.");
      throw new Error(error.message);
    }
    const qid = new Map((data || []).map((d) => [String(d.ref), String(d.id)]));
    for (const r of list) {
      if (!qid.has(r.id)) continue;
      logs.push({ employee_id: r.id, channel: "whatsapp", to_address: r.phone, subject: opts.templateKey || "WhatsApp", body: r.text, template_key: opts.templateKey, status: "queued", sent_by: opts.by, meta: { queue_id: qid.get(r.id), batch_id: batch, run_id: opts.runId || null }, ...(opts.runId ? { run_id: opts.runId, direction: "out" } : {}) });
    }
    if (logs.length) {
      const { error: le } = await admin.from("hrms_communication").insert(logs);
      // pre-0133 the run columns do not exist — log without them rather than not at all
      if (le && /run_id|direction/i.test(le.message)) {
        await admin.from("hrms_communication").insert(logs.map((l) => { const { run_id: _r, direction: _d, ...rest } = l as Record<string, unknown>; return rest; }));
      }
    }
  }
  return { queued: rows.length, skipped, batch_id: batch };
}

/** The queue's word on HRMS rows, keyed by queue id — for the Communication tab and the broadcast screen. */
export async function queueStatuses(ids: string[]): Promise<Map<string, { status: string; error: string; sent_at: string | null; delivered_at: string | null }>> {
  const out = new Map<string, { status: string; error: string; sent_at: string | null; delivered_at: string | null }>();
  if (!ids.length) return out;
  try {
    const { data } = await crmDb().from("wa_queue").select("id, status, error, sent_at, delivered_at").in("id", ids);
    for (const r of data || []) out.set(String(r.id), { status: String(r.status), error: String(r.error || ""), sent_at: r.sent_at, delivered_at: r.delivered_at });
  } catch (e) { swallow("lib/hrms-wa", e); /* the CRM is not reachable — the log's own status stands */ }
  return out;
}

/**
 * Warm-up stage: how many distinct hours HRMS messages have gone out in,
 * over the last three days — 0 before the first, then 1, 2, 3, 4, capped at
 * 5. The hour's quota is (stage + 1) × 10 for the hour now beginning, or
 * stage × 10 once this hour already has sends in it.
 */
async function warmupQuota(perHour: number): Promise<{ stage: number; quota: number }> {
  const crm = crmDb();
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data } = await crm.from("wa_queue").select("sent_at").eq("source", "hrms").not("sent_at", "is", null).gte("sent_at", since);
  const hours = new Set((data || []).map((r) => String(r.sent_at).slice(0, 13)));
  const thisHour = new Date().toISOString().slice(0, 13);
  const priorHours = [...hours].filter((h) => h !== thisHour).length;
  const stage = Math.min(5, priorHours + 1);
  return { stage, quota: Math.min(perHour, stage * 10) };
}

export interface DrainResult { sent: number; failed: number; stage: number; quota: number; tried: number; stopped: string | null; left: number }

/**
 * Release HRMS rows from the queue: up to `n`, or a fraction of the hour's
 * warm-up quota when the cron calls. Each send is checked against the
 * ceilings at that moment; a short wait for the gap is honoured, a reached
 * ceiling stops the run. The record's Communication line is updated as
 * each one goes.
 */
export async function drainHrmsQueue(admin: SupabaseClient, opts: { n?: number; perRunFraction?: number }): Promise<DrainResult> {
  const crm = crmDb();

  /**
   * TWO PROVIDERS, ONE QUEUE (Dr Raghu, 8 Sep 2026: "AI sensy can we try to
   * integrate").
   *
   * AiSensy is preferred where it is switched on, because it goes through
   * Meta's own Business API rather than driving a phone — and the Periskope
   * number is restricted anyway. Periskope stays as it is, and a row can
   * still name its own provider, so the two run side by side while the
   * templates are being approved.
   *
   * The throttle and the warm-up remain Periskope's, deliberately: they are
   * about not alarming Meta, and that caution applies to either road.
   */
  const ai = await aisensyConfig(crm);
  const useAi = aisensyReady(ai);
  const cfg = await periskopeConfig(crm);
  if (!useAi) {
    if ("error" in cfg) throw new Error(cfg.error);
    if (isPaused(cfg)) return { sent: 0, failed: 0, stage: 0, quota: 0, tried: 0, stopped: "WhatsApp sending is PAUSED on the Periskope card (paused = yes), and AiSensy is not switched on.", left: 0 };
  }
  const perHour = useAi ? (ai as AisensyCfg).perHour : (cfg as { perHour: number }).perHour;
  const { stage, quota } = await warmupQuota(perHour);
  const n = opts.n ? Math.max(1, Math.min(opts.n, quota)) : Math.max(1, Math.ceil(quota / (opts.perRunFraction || 6)));
  const { data: rows } = await crm.from("wa_queue")
    .select("id, phone, body, ref, template_name, params, media, provider")
    .eq("source", "hrms").eq("status", "queued").order("queued_at", { ascending: true }).limit(n);
  let sent = 0, failed = 0, stopped: string | null = null, tried = 0;
  for (const row of rows || []) {
    const t = "error" in cfg ? { blocked: null as string | null, waitSeconds: 0 } : await throttleState(crm, cfg);
    if (t.blocked) {
      if (t.waitSeconds && t.waitSeconds <= 30) await new Promise((r) => setTimeout(r, (t.waitSeconds + 1) * 1000));
      else { stopped = t.blocked; break; }
    }
    const { data: claimed } = await crm.from("wa_queue").update({ status: "sending" }).eq("id", row.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) continue;
    tried++;
    /* the row may name its own road; otherwise whichever is switched on */
    const viaAi = String(row.provider || "").toLowerCase() === "aisensy" || (useAi && !row.provider);
    let res: { ok: boolean; uniqueId?: string; error?: string };
    if (viaAi) {
      if (!useAi) res = { ok: false, error: "error" in ai ? ai.error : "AiSensy is paused" };
      else {
        const a = ai as AisensyCfg;
        const r = await aisensySend(a, {
          campaign: String(row.template_name || a.defaultCampaign || ""),
          phone: String(row.phone),
          userName: String(row.ref || "").slice(0, 60) || String(row.phone),
          params: Array.isArray(row.params) ? (row.params as string[]) : undefined,
          media: (row.media as { url: string; filename: string } | null) || null,
        });
        res = { ok: r.ok, uniqueId: r.id, error: r.error };
      }
    } else if ("error" in cfg) {
      res = { ok: false, error: cfg.error };
    } else {
      res = await periskopeSend(cfg, String(row.phone), String(row.body));
    }
    if (!res.ok) { failed++; await crm.from("wa_queue").update({ status: "failed", error: String(res.error || "").slice(0, 500) }).eq("id", row.id); }
    else { sent++; await crm.from("wa_queue").update({ status: "sent", provider: viaAi ? "aisensy" : "periskope", external_id: res.uniqueId ?? null, sent_at: new Date().toISOString(), error: "" }).eq("id", row.id); }
    try { await admin.from("hrms_communication").update({ status: res.ok ? "sent" : "failed", error: res.ok ? null : String(res.error || "").slice(0, 500) }).eq("channel", "whatsapp").contains("meta", { queue_id: String(row.id) }); } catch (e) { swallow("lib/hrms-wa", e); /* best effort */ }
  }
  const { count } = await crm.from("wa_queue").select("id", { count: "exact", head: true }).eq("source", "hrms").eq("status", "queued");
  return { sent, failed, stage, quota, tried, stopped, left: count || 0 };
}
