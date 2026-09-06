import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { currentUser, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * WHO OPENED WHAT (Dr Raghu, 2 Sep 2026: "Please take a count of how many
 * people are clicking it").
 *
 * POST { feature, ref? } — one row per deliberate open.
 * GET  ?feature=…&days=30 — how many PEOPLE opened it, and how often.
 *
 * The write NEVER fails the thing it measures: a missing table or a broken
 * insert still answers ok. A panel that refused to open because its own
 * analytics broke would be a worse feature than one nobody counted.
 */
export async function POST(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.disabled) return NextResponse.json({ ok: true });
    const b = await readBody(req, {}).catch((): AnyBody => ({}));
    const feature = String(b.feature || "").slice(0, 80);
    if (!feature) return NextResponse.json({ ok: true });
    await adminClient().from("feature_click").insert({
      feature, ref: String(b.ref || "").slice(0, 120), by: u.email.toLowerCase(),
    }).then(() => null, () => null);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.disabled) return NextResponse.json({ people: 0, clicks: 0, features: [] });
    const url = new URL(req.url);
    const feature = String(url.searchParams.get("feature") || "");
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const admin = adminClient();
    let q = admin.from("feature_click").select("feature, ref, by, at").gte("at", since).limit(5000);
    if (feature) q = q.eq("feature", feature);
    const { data, error } = await q;
    if (error) return NextResponse.json({ installed: false, people: 0, clicks: 0, features: [] });
    const rows = data ?? [];
    // PEOPLE, not renders — the question was how many are using it.
    const byFeature = new Map<string, { clicks: number; who: Set<string> }>();
    for (const r of rows) {
      const k = String(r.feature);
      const cur = byFeature.get(k) || { clicks: 0, who: new Set<string>() };
      cur.clicks++; cur.who.add(String(r.by || ""));
      byFeature.set(k, cur);
    }
    return NextResponse.json({
      installed: true, days,
      people: new Set(rows.map((r) => String(r.by || ""))).size,
      clicks: rows.length,
      features: [...byFeature.entries()]
        .map(([f, v]) => ({ feature: f, clicks: v.clicks, people: v.who.size }))
        .sort((a, b) => b.people - a.people),
    });
  } catch (e) {
    return errJson(e);
  }
}
