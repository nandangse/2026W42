import type { SupabaseClient } from "@supabase/supabase-js";
import type { Caller } from "@/lib/mcp/auth";

/**
 * THE TOOL REGISTRY. A tool names the door it stands behind; tools/list shows
 * a caller only the tools of doors they hold, and tools/call refuses the rest.
 * Each module adds its tools in its own file under src/lib/mcp/tools/.
 */
export type ToolDef = {
  name: string; door: string; description: string; write?: boolean;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (ctx: { admin: SupabaseClient; caller: Caller; today: string }, args: Record<string, unknown>) => Promise<ToolResult>;
};
export type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: unknown; isError?: boolean };
export const text = (s: string, data?: unknown): ToolResult => ({ content: [{ type: "text", text: s }], ...(data !== undefined ? { structuredContent: data } : {}) });

export const S = (v: unknown) => String(v ?? "").trim();
export const N = (v: unknown) => Number(v) || 0;
export const cr = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const lim = (v: unknown, d = 50, max = 200) => Math.min(max, Math.max(1, Math.round(Number(v)) || d));
export const jobId = (s: string) => { const d = S(s).replace(/\D/g, ""); return d.length === 10 ? d : d.length === 4 ? `202627${d}` : d; };
export const projId = (s: string) => (S(s).toUpperCase().startsWith("NGSE-PROJ-") ? S(s).toUpperCase() : S(s) ? `NGSE-PROJ-${S(s).replace(/\D/g, "")}` : "");
export async function all<T = Record<string, unknown>>(q: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; a < cap; a += 1000) { const { data, error } = await q(a, a + 999); if (error) throw new Error(error.message); const rows = (data || []) as T[]; out.push(...rows); if (rows.length < 1000) break; }
  return out;
}
export const DOOR_LABEL: Record<string, string> = { planning: "Planning", queries: "Query Solver", ceo: "CEO", kuber: "Kuber (accounts)", crm: "CRM", hrms: "HRMS", seva: "Seva (service)", saamaan: "Saamaan (materials)", ims: "IMS", lc: "Leaders Council", vishwakarma: "Vishwakarma (design)", portal: "Customer portal", lms: "LMS" };
