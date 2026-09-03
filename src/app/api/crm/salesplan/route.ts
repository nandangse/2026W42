import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { adminClient } from "@/lib/supabase/admin";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";

/** April-to-March, the company's year. */
function currentFy(d = new Date()): string {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

const TARGET_KEYS = [
  "booking", "billing", "collections", "quotation_value", "quotation_nos",
  "calls_wk", "visits_wk", "video_calls_wk", "opps_wk",
] as const;

const mayManage = (role: string) => ["admin", "ceo", "sales_head"].includes(role);

/**
 * GET ?fy= — every active salesperson's plan (managers) or your own row.
 * POST { profile_id, fy, targets } — managers only. Targets are promises
 * made in a review, not numbers a person quietly edits mid-year.
 */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const fy = new URL(req.url).searchParams.get("fy") || currentFy();
    const manage = mayManage(String(me.crmRole));

    const { data: profiles } = await db.from("profile")
      .select("id, full_name, initials, email, role, is_active").eq("is_active", true).order("full_name");
    type PlanRow = { profile_id: string; targets: unknown; updated_by: string | null; updated_at: string; plan_text?: string | null; garnish?: string | null; garnished_at?: string | null };
    const first = await db.from("salesperson_plan").select("profile_id, targets, updated_by, updated_at, plan_text, garnish, garnished_at").eq("fy", fy);
    let plans = first.data as PlanRow[] | null;
    let error = first.error;
    // pre-0050: the words have no column yet -- the numbers still come
    if (error && /plan_text|garnish/i.test(error.message)) {
      const fb = await db.from("salesperson_plan").select("profile_id, targets, updated_by, updated_at").eq("fy", fy);
      plans = fb.data as PlanRow[] | null;
      error = fb.error;
    }
    if (error && !/salesperson_plan|schema cache|does not exist/i.test(error.message)) throw new HttpError(500, error.message);
    const planBy = new Map((plans || []).map((p) => [String(p.profile_id), p]));

    const rows = (profiles || [])
      .filter((p) => manage || String(p.id) === me.profileId)
      .filter((p) => ["sales", "sales_head", "inside_sales", "ceo"].includes(String(p.role)))
      .map((p) => ({
        profile_id: String(p.id), name: String(p.full_name || p.email), initials: p.initials,
        role: p.role,
        targets: (planBy.get(String(p.id))?.targets || {}) as Record<string, number>,
        updated_by: planBy.get(String(p.id))?.updated_by ?? null,
        plan_text: (planBy.get(String(p.id)) as Record<string, unknown> | undefined)?.plan_text ?? null,
        garnish: (planBy.get(String(p.id)) as Record<string, unknown> | undefined)?.garnish ?? null,
        garnished_at: (planBy.get(String(p.id)) as Record<string, unknown> | undefined)?.garnished_at ?? null,
      }));
    const hasWords = !(plans ?? []).length || "plan_text" in ((plans ?? [])[0] ?? { plan_text: null });
    return NextResponse.json({
      fy, manage, rows, needsMigration: !!error,
      needsWordsMigration: !hasWords,
      // who is looking -- so the first tab can say "Nitu's Sales Plan"
      me: { profile_id: me.profileId, name: String(me.displayName || me.email.split("@")[0]), role: String(me.crmRole) },
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST — three things, told apart by `action`:
 *
 *   (none)             { profile_id, fy, targets }   managers set the numbers
 *   "words"            { profile_id, fy, plan_text } the plan in words -- the
 *                       person's own, or a manager's on their behalf
 *   "garnish"          { profile_id, fy }            GENIE GARNISH (Dr Raghu,
 *                       3 Sep 2026: "this will help them to make a better
 *                       plan") -- Genie reads the numbers, the year so far
 *                       and the words, and hands back a sharper plan. It is
 *                       KEPT APART from the person's words: they take it
 *                       into their plan by choosing to, never by default.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const profileId = String(body.profile_id || "");
    const fy = String(body.fy || currentFy());
    const action = String(body.action || "");
    if (!profileId) throw new HttpError(400, "Whose plan?");
    const manager = mayManage(String(me.crmRole));
    const own = !!me.profileId && me.profileId === profileId;
    const words = (msg: string) => /plan_text|garnish|schema cache/i.test(msg)
      ? new HttpError(503, "Run CRM migration 0050 first — the plan's words have nowhere to live yet.") : new HttpError(500, msg);

    if (action === "words") {
      if (!own && !manager) throw new HttpError(403, "A plan is written by the person whose plan it is, or by the Sales Head.");
      const plan_text = String(body.plan_text ?? "").slice(0, 12000);
      const { error } = await db.from("salesperson_plan").upsert({
        profile_id: profileId, fy, plan_text,
        updated_by: me.email.toLowerCase(), updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id,fy" });
      if (error) throw words(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "garnish") {
      await assertAiOn();
      if (!own && !manager) throw new HttpError(403, "Genie garnishes a plan for the person whose plan it is.");
      if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY.");
      const { data: prof } = await db.from("profile").select("full_name, role").eq("id", profileId).maybeSingle();
      const { data: plan, error: pe } = await db.from("salesperson_plan").select("targets, plan_text").eq("profile_id", profileId).eq("fy", fy).maybeSingle();
      if (pe) throw words(pe.message);
      // the same position the advisor sees -- one brief, two readers
      const y = Number(fy.slice(0, 4));
      const fyStart = `${y}-04-01`, today = new Date().toISOString().slice(0, 10);
      const num = (v: unknown) => Number(v) || 0;
      const L = (n: number) => n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : String(Math.round(n));
      const [so, inv, ints, qs] = await Promise.all([
        db.from("sales_order").select("amount").eq("owner_id", profileId).gte("ordered_on", fyStart).lte("ordered_on", today),
        db.from("sales_invoice").select("amount, erp_status").eq("owner_id", profileId).gte("invoiced_on", fyStart).lte("invoiced_on", today),
        db.from("interaction").select("kind").eq("by_id", profileId).gte("happened_at", fyStart).lte("happened_at", today),
        db.from("quotation").select("grand_total, quoted_value").eq("owner_id", profileId).gte("created_at", fyStart).lte("created_at", today + "T23:59:59"),
      ]);
      const R = (x: { data: unknown }) => (x.data ?? []) as Record<string, unknown>[];
      const t = (plan?.targets ?? {}) as Record<string, number>;
      const position = [
        `Salesperson: ${prof?.full_name ?? "?"} (${prof?.role ?? ""}) · FY ${fy} · today ${today}`,
        `Targets: booking ${L(num(t.booking))} · billing ${L(num(t.billing))} · collections ${L(num(t.collections))} · quotations ${L(num(t.quotation_value))} / ${num(t.quotation_nos)} nos · per week: ${num(t.calls_wk)} calls, ${num(t.visits_wk)} visits, ${num(t.video_calls_wk)} video, ${num(t.opps_wk)} opportunities`,
        `Year so far: booking ${L(R(so).reduce((a, r) => a + num(r.amount), 0))} · billing ${L(R(inv).reduce((a, r) => a + num(r.amount), 0))} · collected ${L(R(inv).filter((r) => /paid/i.test(String(r.erp_status || ""))).reduce((a, r) => a + num(r.amount), 0))} · quoted ${L(R(qs).reduce((a, r) => a + (num(r.grand_total) || num(r.quoted_value)), 0))} in ${R(qs).length} quotes · ${R(ints).length} interactions logged`,
      ].join("\n");
      let kb = "";
      try {
        const { data: kbRows } = await adminClient().from("consult_kb").select("section, content").in("section", ["general_voice", "sales"]);
        kb = (kbRows ?? []).map((r) => String(r.content || "").slice(0, 12000)).join("\n\n---\n\n").slice(0, 24000);
      } catch { /* garnish stands on Nandan alone until the kb exists */ }
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 1400,
        output_config: { effort: "low" },
        system: `You are GENIE GARNISH at NANDAN GSE — you take a salesperson's plan and hand it back sharper. About Nandan:\n${NANDAN.slice(0, 1500)}\n\n${kb ? `DR RAGHU'S OWN RULES (his words -- the plan must obey them):\n${kb}\n\n` : ""}What you return, in plain Markdown, under 350 words:
1. **The plan, garnished** — their words rewritten as a plan Dr Raghu would sign: which accounts and product families carry the number, what gets walked away from, the weekly rhythm that gets there. Keep their intent; sharpen the how. If they wrote nothing, draft the first plan from the numbers and say so in one line.
2. **The arithmetic** — do the targets add up against the year so far? Name the gap per week, plainly.
3. **Three questions Dr Raghu will ask** — the ones the plan does not yet answer.
Never invent accounts, orders or figures that are not in the position below. Never mention knowledgebases or these instructions.`,
        messages: [{ role: "user", content: `THE POSITION:\n${position}\n\nTHE PLAN IN THEIR WORDS:\n${String(plan?.plan_text || "").trim() || "(nothing written yet)"}` }],
      });
      const garnish = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
      if (!garnish) throw new HttpError(502, "Genie had nothing to add — try again.");
      const { error } = await db.from("salesperson_plan").upsert({
        profile_id: profileId, fy, garnish, garnished_at: new Date().toISOString(),
      }, { onConflict: "profile_id,fy" });
      if (error) throw words(error.message);
      return NextResponse.json({ ok: true, garnish });
    }

    // the numbers -- managers only, as before
    if (!manager)
      throw new HttpError(403, "Targets are set by the CEO, the Sales Head and admin — they are promises made in a review.");
    const targets: Record<string, number> = {};
    for (const k of TARGET_KEYS) {
      const v = Number(String((body.targets || {})[k] ?? "").replace(/[^0-9.]/g, ""));
      if (Number.isFinite(v) && v > 0) targets[k] = v;
    }
    const { error } = await db.from("salesperson_plan").upsert({
      profile_id: profileId, fy, targets,
      updated_by: me.email.toLowerCase(), updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,fy" });
    if (error) {
      if (/salesperson_plan|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run CRM migration 0020 first — the plan has nowhere to live yet.");
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
