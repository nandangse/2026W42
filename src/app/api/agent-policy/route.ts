import { NextResponse } from "next/server";
import { requireAdmin, errJson } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { adminClient } from "@/lib/supabase/admin";
import { loadPolicy } from "@/lib/mcp/policy";

export const dynamic = "force-dynamic";

/** GET /api/agent-policy — the rules + the last 200 agent calls (admins). */
export async function GET() {
  try {
    await requireAdmin();
    const admin = adminClient();
    const policy = await loadPolicy(admin);
    const { data: log } = await admin.from("agent_log").select("at, email, key_label, tool, ok, note, ms").order("at", { ascending: false }).limit(200);
    const { data: keys } = await admin.from("genie_api_token").select("email, label, calls, last_used_at, last_tool, revoked_at").order("created_at", { ascending: false });
    return NextResponse.json({ policy, log: log || [], keys: keys || [] });
  } catch (e) { return errJson(e); }
}

/** POST /api/agent-policy — save the rules (admins; every save is signed). */
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const b = await readBody(req, {}) as Record<string, unknown>;
    const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d; };
    const patch: Record<string, unknown> = { id: true, updated_at: new Date().toISOString(), updated_by: user.email };
    if ("rules" in b) patch.rules = String(b.rules || "").slice(0, 20000);
    for (const k of ["reads_on", "writes_on", "whatsapp_on"]) if (k in b) patch[k] = !!b[k];
    if ("write_people" in b) patch.write_people = String(Array.isArray(b.write_people) ? b.write_people.join(",") : b.write_people || "").split(/[,\s;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
    if ("whatsapp_to" in b) patch.whatsapp_to = ["staff", "anyone", "none"].includes(String(b.whatsapp_to)) ? String(b.whatsapp_to) : "staff";
    if ("whatsapp_from" in b) patch.whatsapp_from = n(b.whatsapp_from, 0, 23, 8);
    if ("whatsapp_till" in b) patch.whatsapp_till = n(b.whatsapp_till, 1, 24, 21);
    if ("whatsapp_daily" in b) patch.whatsapp_daily = n(b.whatsapp_daily, 0, 100000, 200);
    if ("max_calls_daily" in b) patch.max_calls_daily = n(b.max_calls_daily, 0, 1000000, 2000);
    const { error } = await adminClient().from("agent_policy").upsert(patch, { onConflict: "id" });
    if (error) throw new Error(/agent_policy/.test(error.message) ? "Run migration 0240_agent_rules.sql first." : error.message);
    return NextResponse.json({ ok: true, policy: await loadPolicy(adminClient()) });
  } catch (e) { return errJson(e); }
}
