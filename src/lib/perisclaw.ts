import { createHash, randomBytes } from "node:crypto";
import { crmDb, crmConfigured } from "@/crm/db";
import { adminClient } from "@/lib/supabase/admin";
import { loadPolicy, whatsAppRefusal, logCall } from "@/lib/mcp/policy";

/**
 * GENIE SPEAKS THROUGH PERISCLAW (Dr Raghu, 16 Oct 2026: "I will want Genie
 * to send messages through Perisclaw automatically — hence that config is
 * also a must"). Perisclaw's MCP server (api.perisclaw.com/mcp/plugin) is
 * OAuth-protected, with dynamic client registration and refresh tokens, so
 * Genie registers itself once, Dr Raghu signs in once in his browser, and
 * Genie keeps the refresh token and calls the tools on its own after that.
 * Everything is kept in the CRM's integration_setting under 'perisclaw', the
 * same shelf the ERP's key sits on.
 */
export const PERISCLAW = { issuer: "https://api.perisclaw.com", mcp: "https://api.perisclaw.com/mcp/plugin", scopes: "whatsapp.read whatsapp.write" };
type Cfg = { client_id?: string; client_secret?: string; access_token?: string; refresh_token?: string; expires_at?: string; connected_by?: string; connected_at?: string; pkce_verifier?: string; state?: string; tools?: string[]; last_error?: string };
const S = (v: unknown) => String(v ?? "").trim();
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function load(): Promise<Cfg> {
  if (!crmConfigured()) throw new Error("The CRM database is not configured — Perisclaw's key has nowhere to live.");
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "perisclaw").maybeSingle();
  return ((data?.config as Cfg) || {});
}
async function save(patch: Cfg) {
  const cur = await load(); const next = { ...cur, ...patch };
  const { error } = await crmDb().from("integration_setting").upsert({ key: "perisclaw", config: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}
const meta = async () => (await fetch(`${PERISCLAW.issuer}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15000) })).json() as Promise<{ authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; revocation_endpoint?: string }>;

/** Register Genie as a client once (RFC 7591), unless already registered. */
async function client(redirect: string): Promise<{ client_id: string; client_secret?: string }> {
  const cfg = await load();
  if (cfg.client_id) return { client_id: cfg.client_id, client_secret: cfg.client_secret };
  const m = await meta(); if (!m.registration_endpoint) throw new Error("Perisclaw offers no client registration — a client id must be issued by them.");
  const r = await fetch(m.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Nandan Genie", client_uri: "https://genie.nandan.co.in", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "client_secret_post", scope: PERISCLAW.scopes }), signal: AbortSignal.timeout(20000) });
  const j = (await r.json().catch(() => ({}))) as { client_id?: string; client_secret?: string; error?: string; error_description?: string };
  if (!r.ok || !j.client_id) throw new Error(`Perisclaw refused the registration: ${j.error_description || j.error || r.status}`);
  await save({ client_id: j.client_id, client_secret: j.client_secret });
  return { client_id: j.client_id, client_secret: j.client_secret };
}

/** Where to send Dr Raghu's browser; the verifier and state are kept for the callback. */
export async function authorizeUrl(redirect: string): Promise<string> {
  const c = await client(redirect); const m = await meta();
  const verifier = b64url(randomBytes(48)); const challenge = b64url(createHash("sha256").update(verifier).digest()); const state = b64url(randomBytes(16));
  await save({ pkce_verifier: verifier, state });
  const u = new URL(m.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: c.client_id, redirect_uri: redirect, scope: PERISCLAW.scopes, state, code_challenge: challenge, code_challenge_method: "S256", resource: PERISCLAW.mcp })) u.searchParams.set(k, v);
  return u.toString();
}

/** The callback: code → tokens, kept. */
export async function finishAuth(code: string, state: string, redirect: string, by: string): Promise<void> {
  const cfg = await load();
  if (!cfg.state || state !== cfg.state) throw new Error("The sign-in did not start from Genie (state mismatch) — start again from /connect.");
  const c = await client(redirect); const m = await meta();
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: c.client_id, code_verifier: cfg.pkce_verifier || "", resource: PERISCLAW.mcp });
  if (c.client_secret) body.set("client_secret", c.client_secret);
  const r = await fetch(m.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20000) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Perisclaw did not issue a token: ${j.error_description || j.error || r.status}`);
  await save({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(), connected_by: by, connected_at: new Date().toISOString(), pkce_verifier: undefined, state: undefined, last_error: undefined });
}

async function accessToken(): Promise<string> {
  const cfg = await load();
  if (!cfg.access_token) throw new Error("Genie is not connected to Perisclaw — connect it from /connect.");
  if (cfg.expires_at && Date.parse(cfg.expires_at) - Date.now() > 120000) return cfg.access_token;
  if (!cfg.refresh_token) throw new Error("Perisclaw's token has expired and there is no refresh token — connect again from /connect.");
  const m = await meta();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: cfg.client_id || "", resource: PERISCLAW.mcp });
  if (cfg.client_secret) body.set("client_secret", cfg.client_secret);
  const r = await fetch(m.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20000) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) { await save({ last_error: `refresh failed: ${j.error_description || j.error || r.status}` }); throw new Error(`Perisclaw would not refresh the token: ${j.error_description || j.error || r.status} — connect again from /connect.`); }
  await save({ access_token: j.access_token, refresh_token: j.refresh_token || cfg.refresh_token, expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(), last_error: undefined });
  return j.access_token;
}

/** One JSON-RPC call to Perisclaw's MCP server, Streamable HTTP; SSE answers are read to their first message. */
export async function perisclawRpc(method: string, params?: unknown): Promise<unknown> {
  const tok = await accessToken();
  const r = await fetch(PERISCLAW.mcp, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }), signal: AbortSignal.timeout(45000) });
  const ct = r.headers.get("content-type") || ""; const raw = await r.text();
  if (!r.ok) throw new Error(`Perisclaw answered ${r.status}: ${raw.slice(0, 200)}`);
  let j: { result?: unknown; error?: { message?: string } } = {};
  if (ct.includes("text/event-stream")) { const line = raw.split("\n").find((l) => l.startsWith("data:")); j = line ? JSON.parse(line.slice(5)) : {}; } else if (raw) j = JSON.parse(raw);
  if (j.error) throw new Error(`Perisclaw: ${j.error.message || "error"}`);
  return j.result;
}

export async function perisclawTools(): Promise<string[]> {
  const r = (await perisclawRpc("tools/list")) as { tools?: { name: string }[] } | undefined;
  const names = (r?.tools || []).map((t) => t.name); await save({ tools: names }); return names;
}

/**
 * Send a WhatsApp message through Perisclaw — the tool is whichever its
 * server names for sending (message_send today); the first call looks it up.
 */
export async function sendWhatsApp(to: string, text: string, by = "genie"): Promise<unknown> {
  // Admin's rules first (Admin → Agent rules): switch, hours, who, daily cap
  const admin = adminClient(); const policy = await loadPolicy(admin);
  const staff = policy.whatsapp_to === "staff" ? await staffNumbers(admin) : undefined;
  const why = await whatsAppRefusal(admin, policy, to, staff);
  if (why) { void logCall(admin, { email: by, key_label: "perisclaw", tool: "whatsapp_send", args: { to, chars: text.length }, ok: false, note: why }); throw new Error(why); }
  try { const r = await sendWhatsAppRaw(to, text); void logCall(admin, { email: by, key_label: "perisclaw", tool: "whatsapp_send", args: { to, chars: text.length }, ok: true }); return r; }
  catch (e) { void logCall(admin, { email: by, key_label: "perisclaw", tool: "whatsapp_send", args: { to, chars: text.length }, ok: false, note: e instanceof Error ? e.message : String(e) }); throw e; }
}

/** Every staff mobile Genie knows (HRMS records + profiles), last 10 digits. */
async function staffNumbers(admin: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const out = new Set<string>();
  const take = (v: unknown) => { const d = String(v || "").replace(/\D/g, ""); if (d.length >= 10) out.add(d.slice(-10)); };
  try { const { data } = await admin.from("hrms_employee").select("mobile, personal_mobile, phone").limit(5000); for (const r of (data || []) as Record<string, unknown>[]) { take(r.mobile); take(r.personal_mobile); take(r.phone); } } catch { /* columns vary */ }
  try { const { data } = await admin.from("profiles").select("phone, mobile").limit(5000); for (const r of (data || []) as Record<string, unknown>[]) { take(r.phone); take(r.mobile); } } catch { /* fine */ }
  return out;
}

async function sendWhatsAppRaw(to: string, text: string): Promise<unknown> {
  const cfg = await load(); const names = cfg.tools?.length ? cfg.tools : await perisclawTools();
  const tool = names.find((n) => /^(message_send|send_message|whatsapp_send)$/i.test(n)) || names.find((n) => /send/i.test(n) && /message|text/i.test(n));
  if (!tool) throw new Error(`Perisclaw offers no sending tool to this login (tools: ${names.join(", ")}).`);
  const res = (await perisclawRpc("tools/call", { name: tool, arguments: { to, text, message: text, chat_id: to } })) as { isError?: boolean; content?: { text?: string }[] };
  if (res?.isError) throw new Error(`Perisclaw refused the send: ${res.content?.[0]?.text || "no reason given"}`);
  return res;
}

export async function perisclawStatus() {
  const cfg = await load();
  return { registered: !!cfg.client_id, connected: !!cfg.refresh_token || !!cfg.access_token, connected_by: cfg.connected_by || null, connected_at: cfg.connected_at || null, expires_at: cfg.expires_at || null, tools: cfg.tools || [], last_error: cfg.last_error || null, mcp: PERISCLAW.mcp };
}
export async function perisclawDisconnect() { await save({ access_token: undefined, refresh_token: undefined, expires_at: undefined, connected_by: undefined, connected_at: undefined, tools: undefined }); }
