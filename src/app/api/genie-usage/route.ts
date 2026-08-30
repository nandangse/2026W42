import { NextResponse } from "next/server";
import { requireOwner, errJson } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SETTINGS → GENIE (Dr Raghu, 30 Aug 2026, owner alone): who uses Genie and
 * roughly what the AI costs. Counted from the CRM audit trail — the one
 * place every hand leaves a mark — with the AI actions costed at measured
 * per-run estimates (EVA ~₹85 with its web searches; the quick Opus reads
 * a few rupees each). Approximations, honestly labelled.
 */
const COST_INR: Record<string, number> = {
  eva_brief: 85, opp_brief: 8, situational_run: 6, letter_beautify: 4,
};
const AI_ACTIONS = Object.keys(COST_INR);

export async function GET() {
  try {
    await requireOwner();
    if (!crmConfigured()) return NextResponse.json({ rows: [], note: "CRM database not configured." });
    const db = crmDb();

    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    type A = { by_user: string | null; action: string; at: string };
    const audit: A[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await db.from("crm_audit").select("by_user, action, at")
        .order("at", { ascending: false }).range(a, a + 999);
      if (error) throw new Error(error.message);
      audit.push(...((data ?? []) as A[]));
      if (!data || data.length < 1000 || audit.length >= 50000) break;
    }

    const { data: profs } = await db.from("profile").select("id, full_name, email");
    const nameOf = new Map((profs ?? []).map((p) => [String(p.id), String(p.full_name || p.email || p.id)]));

    type RowAgg = { name: string; total: number; last30: number; ai: Record<string, number>; costInr: number; costInr30: number; hours30: number; hoursAll: number };
    const byUser = new Map<string, RowAgg>();
    const stamps = new Map<string, number[]>();
    let system = 0;
    for (const a of audit) {
      const key = a.by_user ? String(a.by_user) : "system";
      if (key === "system") { system++; continue; }
      const r = byUser.get(key) ?? { name: nameOf.get(key) ?? key.slice(0, 8), total: 0, last30: 0, ai: {}, costInr: 0, costInr30: 0, hours30: 0, hoursAll: 0 };
      r.total++;
      const recent = a.at >= since30;
      if (recent) r.last30++;
      if (AI_ACTIONS.includes(a.action)) {
        r.ai[a.action] = (r.ai[a.action] || 0) + 1;
        r.costInr += COST_INR[a.action];
        if (recent) r.costInr30 += COST_INR[a.action];
      }
      byUser.set(key, r);
      (stamps.get(key) ?? stamps.set(key, []).get(key)!).push(new Date(a.at).getTime());
    }
    // ACTIVE HOURS, honestly estimated (Dr Raghu, 30 Aug 2026: "show how many
    // hours I worked"): actions clustered into sessions — a gap over 30
    // minutes starts a new one; each session counts its span plus 5 minutes.
    const GAP = 30 * 60000, FLOOR = 5 * 60000;
    const since30ms = new Date(since30).getTime();
    for (const [key, ts] of stamps) {
      ts.sort((x, y) => x - y);
      let all = 0, recent = 0, start = ts[0], prev = ts[0];
      const close = (endT: number, startT: number) => {
        const span = endT - startT + FLOOR;
        all += span;
        if (endT >= since30ms) recent += Math.min(span, Math.max(0, endT - Math.max(startT, since30ms) + FLOOR));
      };
      for (let i = 1; i < ts.length; i++) {
        if (ts[i] - prev > GAP) { close(prev, start); start = ts[i]; }
        prev = ts[i];
      }
      close(prev, start);
      const r = byUser.get(key)!;
      r.hoursAll = Math.round(all / 360000) / 10;
      r.hours30 = Math.round(recent / 360000) / 10;
    }
    // CONSULT RAGHU, counted from the chairs themselves (Dr Raghu, 30 Aug
    // 2026: "data is good to measure!") — each user message is one advisor
    // call, ~₹5 with the knowledgebase riding along. Pre-0044 the tables
    // don't exist; the panel simply shows none.
    const CONSULT_INR = 5;
    try {
      const { data: chats } = await db.from("consult_chat").select("id, profile_id");
      const owner = new Map((chats ?? []).map((c) => [String(c.id), String(c.profile_id)]));
      if (owner.size) {
        const { data: cm } = await db.from("consult_msg").select("chat_id, at")
          .eq("role", "user").limit(20000);
        for (const m of cm ?? []) {
          const key = owner.get(String(m.chat_id));
          if (!key) continue;
          const r = byUser.get(key) ?? { name: nameOf.get(key) ?? key.slice(0, 8), total: 0, last30: 0, ai: {}, costInr: 0, costInr30: 0, hours30: 0, hoursAll: 0 };
          r.ai.consult = (r.ai.consult || 0) + 1;
          r.costInr += CONSULT_INR;
          if (String(m.at) >= since30) r.costInr30 += CONSULT_INR;
          byUser.set(key, r);
        }
      }
    } catch { /* pre-0044 — nothing to count yet */ }

    const rows = [...byUser.values()].sort((x, y) => y.last30 - x.last30);
    const totals = rows.reduce((t, r) => ({
      actions: t.actions + r.total, last30: t.last30 + r.last30,
      costInr: t.costInr + r.costInr, costInr30: t.costInr30 + r.costInr30,
    }), { actions: 0, last30: 0, costInr: 0, costInr30: 0 });

    return NextResponse.json({
      rows, totals, systemActions: system, sampled: audit.length,
      note: "Counted from the CRM audit trail (the trail every click leaves). ACTIVE HOURS are estimated by clustering a person's actions into sessions (a 30-minute silence starts a new one) — honest about its limits: reading without writing leaves no trail and does not count. AI runs costed at per-run estimates: EVA ₹85, Ask Genie ₹8, Situational ₹6, Letter ₹4, Consult Raghu ₹5 a message — approximations. Apollo consumes Apollo credits, not API money.",
    });
  } catch (e) {
    return errJson(e);
  }
}
