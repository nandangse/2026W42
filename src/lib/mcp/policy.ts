/**
 * AGENT RULES — the standing orders every agent key obeys (Dr Raghu, 16 Oct
 * 2026: "currently Genie and Perisclaw can only be working through Raghu's
 * commands. In Admin also make the rules that it has to follow").
 *
 * One row (agent_policy) read on every call: the prose rules are handed to
 * the agent verbatim as the server's instructions; the switches are enforced
 * here, whatever the agent was told. Every call is logged (agent_log).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Caller } from "./auth";

export type Policy = {
  rules: string; reads_on: boolean; writes_on: boolean; write_people: string[];
  whatsapp_on: boolean; whatsapp_to: "staff" | "anyone" | "none"; whatsapp_from: number; whatsapp_till: number; whatsapp_daily: number;
  max_calls_daily: number; updated_at: string | null; updated_by: string | null; installed: boolean;
};
export const DEFAULT_POLICY: Policy = { rules: "", reads_on: true, writes_on: true, write_people: [], whatsapp_on: true, whatsapp_to: "staff", whatsapp_from: 8, whatsapp_till: 21, whatsapp_daily: 200, max_calls_daily: 2000, updated_at: null, updated_by: null, installed: false };

export async function loadPolicy(admin: SupabaseClient): Promise<Policy> {
  const { data, error } = await admin.from("agent_policy").select("*").eq("id", true).maybeSingle();
  if (error || !data) return DEFAULT_POLICY; // pre-0240: the defaults rule
  const r = data as Record<string, unknown>;
  return { ...DEFAULT_POLICY, ...(r as Partial<Policy>), write_people: Array.isArray(r.write_people) ? (r.write_people as string[]).map((e) => String(e).toLowerCase()) : [], installed: true };
}

const istHour = (d = new Date()) => Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
const istDayStart = () => { const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); return new Date(`${s}T00:00:00+05:30`).toISOString(); };

/** Why this caller may not run this tool now — or null when they may. */
export async function refusal(admin: SupabaseClient, p: Policy, c: Caller, tool: { name: string; write?: boolean }): Promise<string | null> {
  if (!p.reads_on && !c.isOwner) return "Admin has switched agents off for now — Genie is not answering agents until it is switched back on.";
  if (tool.write) {
    if (!p.writes_on) return "Admin has switched off writing through agents — read freely, but tasks and updates are raised inside Genie for now.";
    if (p.write_people.length && !p.write_people.includes(c.email.toLowerCase()) && !c.isOwner) return `Writing through an agent is allowed only for ${p.write_people.join(", ")} — ${c.name} may read, not write.`;
  }
  if (p.max_calls_daily > 0 && p.installed) {
    const { count } = await admin.from("agent_log").select("id", { count: "exact", head: true }).eq("email", c.email).gte("at", istDayStart());
    if ((count || 0) >= p.max_calls_daily) return `${c.name}'s key has made ${count} calls today, the daily limit Admin set. It opens again at midnight IST.`;
  }
  return null;
}

/** Why Genie may not send a WhatsApp message now — or null when it may. */
export async function whatsAppRefusal(admin: SupabaseClient, p: Policy, to: string, staffNumbers?: Set<string>): Promise<string | null> {
  if (!p.whatsapp_on || p.whatsapp_to === "none") return "Admin has switched off Genie's WhatsApp sending.";
  const h = istHour();
  const inHours = p.whatsapp_from < p.whatsapp_till ? h >= p.whatsapp_from && h < p.whatsapp_till : h >= p.whatsapp_from || h < p.whatsapp_till;
  if (!inHours) return `Genie sends only between ${String(p.whatsapp_from).padStart(2, "0")}:00 and ${String(p.whatsapp_till).padStart(2, "0")}:00 IST (Admin → Agent rules); it is ${String(h).padStart(2, "0")}:xx now.`;
  if (p.whatsapp_to === "staff" && staffNumbers && !staffNumbers.has(to.replace(/\D/g, "").slice(-10))) return "Admin allows Genie to message Nandan staff only; this number is not on a staff record.";
  if (p.installed && p.whatsapp_daily > 0) {
    const { count } = await admin.from("agent_log").select("id", { count: "exact", head: true }).eq("tool", "whatsapp_send").eq("ok", true).gte("at", istDayStart());
    if ((count || 0) >= p.whatsapp_daily) return `Genie has sent ${count} messages today, the daily cap Admin set.`;
  }
  return null;
}

export async function logCall(admin: SupabaseClient, row: { email: string; key_label?: string | null; tool: string; args?: unknown; ok: boolean; note?: string | null; ms?: number }) {
  try { await admin.from("agent_log").insert({ ...row, args: row.args ?? null, note: row.note ? String(row.note).slice(0, 500) : null }); } catch { /* pre-0240 */ }
}

/** The instructions block an agent receives on initialize. */
export function instructionsFor(p: Policy, c: Caller, doors: string[]): string {
  const head = `Nandan GSE's Genie, speaking for ${c.name} (${c.email}). Doors open to this key: ${doors.join(", ")}. Amounts are in rupees; dates are YYYY-MM-DD; a job is its 4-digit number.`;
  const sw = [
    p.writes_on ? (p.write_people.length ? `Writing is allowed only for ${p.write_people.join(", ")}.` : "Writing (a task, a job update) only when asked.") : "Writing through agents is switched off; read only.",
    p.whatsapp_on && p.whatsapp_to !== "none" ? `Genie's own WhatsApp sends: ${p.whatsapp_to === "staff" ? "Nandan staff only" : "any number"}, ${p.whatsapp_from}:00–${p.whatsapp_till}:00 IST.` : "Genie's own WhatsApp sending is switched off.",
  ].join(" ");
  return [head, sw, p.rules.trim() ? `RULES SET BY ADMIN (binding):\n${p.rules.trim()}` : ""].filter(Boolean).join("\n\n");
}
