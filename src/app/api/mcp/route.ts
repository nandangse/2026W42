import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadPolicy, refusal, logCall, instructionsFor } from "@/lib/mcp/policy";
import { resolveCaller, touchToken, type Caller } from "@/lib/mcp/auth";
import { DOOR_LABEL, type ToolDef } from "@/lib/mcp/registry";
import { PLANNING_TOOLS } from "@/lib/mcp/tools/planning";
import { CEO_TOOLS, KUBER_TOOLS } from "@/lib/mcp/tools/money";
import { CRM_TOOLS } from "@/lib/mcp/tools/crm";
import { HRMS_TOOLS, SEVA_TOOLS, SAAMAAN_TOOLS, IMS_TOOLS, LC_TOOLS, VISHWA_TOOLS, PORTAL_TOOLS, LMS_TOOLS } from "@/lib/mcp/tools/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GENIE AS AN MCP SERVER (Dr Raghu, 16 Oct 2026: "I want to connect this to
 * Perisclaw"; then "the Genie should be wired to ALL the modules … this
 * currently is only for me"). One endpoint, the Model Context Protocol over
 * Streamable HTTP. Every person mints their own key at /connect; the key is
 * their login, the tools offered are their module doors, and what they write
 * is written in their name. GENIE_MCP_TOKEN is Dr Raghu's master key.
 *
 * Reads across Planning, the Query Solver, CEO, Kuber, CRM, HRMS, Seva,
 * Saamaan, IMS, the Leaders Council, Vishwakarma, the Portal and the LMS.
 * Writes: raise a task, write a job's current update. Nothing approves, pays,
 * releases or deletes.
 */
const ALL: ToolDef[] = [...PLANNING_TOOLS, ...CEO_TOOLS, ...KUBER_TOOLS, ...CRM_TOOLS, ...HRMS_TOOLS, ...SEVA_TOOLS, ...SAAMAAN_TOOLS, ...IMS_TOOLS, ...LC_TOOLS, ...VISHWA_TOOLS, ...PORTAL_TOOLS, ...LMS_TOOLS];
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const mine = (c: Caller) => ALL.filter((t) => c.doors[t.door]);
const unauthorised = () => NextResponse.json({ error: "A Genie key is required — mint one at https://genie.nandan.co.in/connect and send it as Authorization: Bearer." }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="genie"' } });

export async function GET(req: Request) {
  const admin = adminClient();
  const c = await resolveCaller(admin, req).catch(() => null);
  if (!c) return unauthorised();
  return NextResponse.json({ name: "genie", transport: "streamable-http", post: "/api/mcp", you: c.email, doors: Object.entries(c.doors).filter(([, v]) => v).map(([k]) => k), tools: mine(c).map((t) => t.name) }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: Request) {
  const admin = adminClient();
  const c = await resolveCaller(admin, req).catch(() => null);
  if (!c) return unauthorised();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  if (Array.isArray(body)) { const out = []; for (const m of body) out.push(await handle(admin, c, m as R)); return NextResponse.json(out.filter(Boolean)); }
  const r = await handle(admin, c, body as R);
  return r ? NextResponse.json(r) : new NextResponse(null, { status: 202 });
}

async function handle(admin: ReturnType<typeof adminClient>, c: Caller, m: R): Promise<R | null> {
  const id = m.id; const method = S(m.method); const params = (m.params || {}) as R;
  try {
    if (method === "initialize") {
      const doors = Object.entries(c.doors).filter(([, v]) => v).map(([k]) => DOOR_LABEL[k] || k);
      return { jsonrpc: "2.0", id, result: { protocolVersion: S(params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "genie", title: "Nandan Genie", version: "2.0.0" }, instructions: instructionsFor(await loadPolicy(admin), c, doors) } };
    }
    if (method.startsWith("notifications/")) return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: mine(c).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } };
    if (method === "tools/call") {
      const name = S(params.name); const args = (params.arguments || {}) as R;
      const tool = ALL.find((t) => t.name === name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `No such tool: ${name}` } };
      if (!c.doors[tool.door]) return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `${c.name}'s Genie login does not open ${DOOR_LABEL[tool.door] || tool.door}, so ${name} is not available to this key.` }], isError: true } };
      const policy = await loadPolicy(admin);
      const why = await refusal(admin, policy, c, tool);
      if (why) { void logCall(admin, { email: c.email, key_label: c.tokenLabel, tool: name, args, ok: false, note: why }); return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: why }], isError: true } }; }
      void touchToken(admin, c, name);
      const t0 = Date.now();
      try { const result = await tool.run({ admin, caller: c, today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) }, args); void logCall(admin, { email: c.email, key_label: c.tokenLabel, tool: name, args, ok: true, ms: Date.now() - t0 }); return { jsonrpc: "2.0", id, result }; }
      catch (e) { const msg = e instanceof Error ? e.message : String(e); void logCall(admin, { email: c.email, key_label: c.tokenLabel, tool: name, args, ok: false, note: msg, ms: Date.now() - t0 }); return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Genie could not answer: ${msg}` }], isError: true } }; }
    }
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
    if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) { return { jsonrpc: "2.0", id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }; }
}
