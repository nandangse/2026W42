import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { ceoFigures, istDay, fyStartOf, lastMonthEnd } from "@/lib/ceo/figures";
import { pnlOf } from "@/lib/kuber-oe";
import { approvalQueues } from "@/lib/ceo/approvals";
import { queryRows } from "@/lib/query-solver";
import { internalKuber } from "@/lib/ceo/internal-figures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GENIE AS AN MCP SERVER (Dr Raghu, 16 Oct 2026: "I want to connect this to
 * Perisclaw … how can Genie connect to this"). One endpoint, the Model
 * Context Protocol over Streamable HTTP: POST JSON-RPC here, a JSON answer
 * back. Any MCP client — Perisclaw, Claude, a phone agent — adds
 * https://genie.nandan.co.in/api/mcp with the bearer token and gets Genie's
 * tools.
 *
 * THE TOKEN IS THE DOOR. GENIE_MCP_TOKEN in the environment; no token set,
 * no door. The caller acts as GENIE_MCP_ACTOR (Dr Raghu by default): what it
 * reads is what he reads, and what it writes is written in his name.
 *
 * READ FIRST. Seven tools read; one raises a task. Nothing here approves,
 * pays, releases or deletes — those stay behind a person's click in Genie.
 */
type R = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => Number(v) || 0;
const cr = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

const TOOLS = [
  { name: "genie_company", description: "The company on one page, as the CEO dashboard shows it: P&L to the last month-end (sales, TVC, throughput, OE, PBT), receivables and payables by age, advances, payment due on delivery, the floor (live, late, due in 30 days, delivered), service and people. Use for any 'how is the company doing', money or P&L question.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "genie_jobs", description: "Live jobs on the planning board — job number, customer tag, product family, value, target delivery, OTD date, planning owner, production %, kitting %, status, on-floor flag, current update, escalation. Filter by customer, owner initials, late only, or free text. Use for 'which jobs', 'what is late', 'what is on the floor'.", inputSchema: { type: "object", properties: { search: { type: "string", description: "text matched against job number, tag, customer, family, status" }, owner: { type: "string", description: "planning owner's initials, e.g. PS" }, late_only: { type: "boolean" }, on_floor_only: { type: "boolean" }, limit: { type: "integer", default: 50 } }, additionalProperties: false } },
  { name: "genie_job", description: "One job in full: its board row, open tasks (who, due, category, escalation), today's manpower, and its recent updates. Give the 4-digit job number or the full 10-digit id.", inputSchema: { type: "object", properties: { job: { type: "string" } }, required: ["job"], additionalProperties: false } },
  { name: "genie_tasks", description: "Open tasks on the task list (Nandan Tasking). Filter by assignee, job, project, category, escalated only, overdue only. Use for 'what is pending with X', 'what is escalated'.", inputSchema: { type: "object", properties: { who: { type: "string", description: "assignee as written on the task, e.g. AP, Pankaj" }, job: { type: "string" }, project: { type: "string" }, category: { type: "string" }, escalated_only: { type: "boolean" }, overdue_only: { type: "boolean" }, limit: { type: "integer", default: 50 } }, additionalProperties: false } },
  { name: "genie_queries", description: "The Query Solver — every query (a task ticked Query Solver) by project: number, client's or ours, shared with the client, assigned, due, state.", inputSchema: { type: "object", properties: { project: { type: "string" }, open_only: { type: "boolean", default: true } }, additionalProperties: false } },
  { name: "genie_approvals", description: "Everything in Genie waiting for an approval — records, roles, salary decisions, loans, salary queries, F&F, payment plan, service quotations, service claims, council principles, vendor registrations — with counts, money and the lines.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "genie_internal_kuber", description: "Internal Kuber: cash to bring home (old receivables, payment due on delivery, supplier advances, excess stock, AMC renewals) and where money leaks (interest, bank charges, freight, forex, penalties, warranty, free service), each with its lever.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "genie_raise_task", description: "Raise a task on Nandan Tasking in Dr Raghu's name: title (required), assignee, due date (YYYY-MM-DD), category (Production, Material, Design, Quality, Purchase, Service, General…), job (4 or 10 digits), project id, detail, escalation (None | L1 — Supervisor | L2 — Leaders | L3 — Management), and whether it is a Query Solver item (client's or ours, shared with the client). Confirm with the person before raising when the ask is ambiguous.", inputSchema: { type: "object", properties: { title: { type: "string" }, who: { type: "string" }, due: { type: "string" }, category: { type: "string" }, job: { type: "string" }, project: { type: "string" }, detail: { type: "string" }, escalation: { type: "string" }, query_solver: { type: "boolean" }, query_kind: { type: "string", enum: ["client", "ours"] }, client_shared: { type: "boolean" } }, required: ["title"], additionalProperties: false } },
];

const rpc = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string, status = 200) => NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
const text = (s: string, data?: unknown) => ({ content: [{ type: "text", text: s }], ...(data !== undefined ? { structuredContent: data } : {}) });

function authed(req: Request): boolean {
  const want = S(process.env.GENIE_MCP_TOKEN);
  if (!want) return false;
  const h = req.headers.get("authorization") || "";
  const got = /^bearer\s+(.+)$/i.exec(h)?.[1]?.trim() || "";
  return got.length > 0 && got === want;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Bearer token required — Genie's MCP door." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  /* Streamable HTTP only: a GET is answered, not streamed — no long-lived SSE on this host */
  return NextResponse.json({ name: "genie", transport: "streamable-http", post: "/api/mcp", tools: TOOLS.map((t) => t.name) }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Bearer token required — Genie's MCP door." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  let body: R;
  try { body = (await req.json()) as R; } catch { return rpcErr(null, -32700, "Parse error", 400); }
  /* a batch is answered item by item */
  if (Array.isArray(body)) { const out = []; for (const m of body) out.push(await handle(m as R)); return NextResponse.json(out.filter(Boolean)); }
  const r = await handle(body);
  return r ? NextResponse.json(r) : new NextResponse(null, { status: 202 });
}

async function handle(m: R): Promise<R | null> {
  const id = m.id; const method = S(m.method); const params = (m.params || {}) as R;
  try {
    if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: S(params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "genie", title: "Nandan Genie", version: "1.0.0" }, instructions: "Nandan GSE's Genie: the planning board, the task list, the Query Solver, approvals, the CEO's figures. Read freely; raise tasks only when asked, in Dr Raghu's name." } };
    if (method === "notifications/initialized" || method.startsWith("notifications/")) return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      const name = S(params.name); const args = (params.arguments || {}) as R;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `No such tool: ${name}` } };
      try { return { jsonrpc: "2.0", id, result: await call(name, args) }; }
      catch (e) { return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Genie could not answer: ${e instanceof Error ? e.message : String(e)}` }], isError: true } }; }
    }
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
    if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) { return { jsonrpc: "2.0", id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }; }
}

const jobId = (s: string) => { const d = S(s).replace(/\D/g, ""); return d.length === 10 ? d : d.length === 4 ? `202627${d}` : d; };
const ACTOR = () => S(process.env.GENIE_MCP_ACTOR) || "raghu@nandan.co.in";

async function call(name: string, a: R) {
  const admin = adminClient();
  const today = istDay();
  if (name === "genie_company") {
    const fy = fyStartOf(today); const pnlTo = lastMonthEnd(today);
    const [f, p] = await Promise.all([ceoFigures(admin, fy, today), pnlOf(admin, fy, today, pnlTo)]);
    const ok = (x: unknown): x is R => !!x && typeof x === "object" && !("error" in (x as object));
    const owed = ok(f.owed) ? (f.owed as unknown as R) : null, erp = ok(f.erp) ? (f.erp as unknown as R) : null, floor = ok(f.floor) ? (f.floor as unknown as R) : null, people = ok(f.people) ? (f.people as unknown as R) : null, service = ok(f.service) ? (f.service as unknown as R) : null;
    const lines = [
      `Nandan GSE, FY from ${fy}, today ${today}. P&L struck to ${pnlTo} (the last month-end).`,
      p ? `Sales ${cr(p.sales)} (to date ${cr(p.salesToDate)}) · TVC ${cr(p.tvc)} · Throughput ${cr(p.throughput)} (${p.sales ? Math.round((p.throughput / p.sales) * 100) : 0}%) · OE ${cr(p.oe)} · PBT ${cr(p.pbt)} (${p.sales ? ((p.pbt / p.sales) * 100).toFixed(1) : 0}%).` : "The books are not loaded.",
      owed ? `Receivables ${cr(N(owed.receivable))} (90+ days ${cr(N(owed.rec_90))}) · Payables ${cr(N(owed.payable))} (180+ ${cr(N(owed.pay_180))}) · Advances received ${cr(N(owed.adv_received))}, paid ${cr(N(owed.adv_paid))}.` : "",
      erp ? `Payment due on delivery, pending: 0–30 ${cr(N(erp.poe_0_30))}, 31–60 ${cr(N(erp.poe_31_60))}, 61–90 ${cr(N(erp.poe_61_90))}, 90+ ${cr(N(erp.poe_90))}; not yet delivered ${cr(N(erp.poe_undelivered))}. GRN not billed ${cr(N(erp.grn_unbilled))}.` : "",
      floor ? `Floor: ${N(floor.live)} live jobs ${cr(N(floor.live_value))}, ${N(floor.late)} late (avg ${N(floor.late_avg_days)} days), ${N(floor.due30)} due in 30 days, ${N(floor.on_floor)} on the floor, ${N(floor.escalated)} escalated; delivered this FY ${N(floor.delivered)} (${cr(N(floor.delivered_value))}), this month ${N(floor.delivered_month)}.` : "",
      service ? `Service: ${N(service.open_tickets)} open tickets, ${N(service.amc_valid)} AMCs valid.` : "",
      people ? `People: ${N(people.on_roll)} on the roll, ${N(people.added90)} joined and ${N(people.left90)} left in 90 days, ${N(people.notice)} on notice, ${N(people.fnf_pending)} F&F pending.` : "",
    ].filter(Boolean);
    return text(lines.join("\n"), { pnl_to: pnlTo, pnl: p ? { sales: p.sales, sales_to_date: p.salesToDate, tvc: p.tvc, throughput: p.throughput, oe: p.oe, pbt: p.pbt } : null, owed, erp, floor, service, people });
  }
  if (name === "genie_jobs") {
    const { data, error } = await admin.from("jobs").select("id, tag, cust, fam, val, tdd, otd, stat, pct, kit, on_floor, own, note, escalation, proj, tpp").eq("active", true).eq("delivered", false).order("tdd", { ascending: true, nullsFirst: false }).limit(1000);
    if (error) throw new Error(error.message);
    const q = S(a.search).toLowerCase(); const own = S(a.owner).toUpperCase();
    const { data: profs } = await admin.from("profiles").select("initials, erp_owner, display_name");
    const initOf = (o: string) => { const p = (profs || []).find((x) => S(x.erp_owner) && S(x.erp_owner).toLowerCase() === o.toLowerCase()); return S(p?.initials) || o; };
    let rows = (data || []).map((j) => ({ job: S(j.id).slice(-4), id: S(j.id), tag: S(j.tag), customer: S(j.cust), family: S(j.fam), value: N(j.val), target_delivery: j.tdd, otd_date: j.otd, late_days: j.tdd && S(j.tdd) < today ? Math.round((Date.parse(today) - Date.parse(S(j.tdd))) / 864e5) : 0, owner: initOf(S(j.own)), owner_name: S(j.own), production_pct: N(j.pct), kitting_pct: N(j.kit), throughput_pct: N(j.tpp), status: S(j.stat), on_floor: !!j.on_floor, project: S(j.proj) || null, current_update: S(j.note) || null, escalation: S(j.escalation) || null }));
    if (q) rows = rows.filter((r) => `${r.job} ${r.tag} ${r.customer} ${r.family} ${r.status} ${r.owner} ${r.project || ""}`.toLowerCase().includes(q));
    if (own) rows = rows.filter((r) => r.owner.toUpperCase() === own);
    if (a.late_only) rows = rows.filter((r) => r.late_days > 0);
    if (a.on_floor_only) rows = rows.filter((r) => r.on_floor);
    const total = rows.length; rows = rows.slice(0, Math.min(200, N(a.limit) || 50));
    return text(`${total} live jobs match${total > rows.length ? `, first ${rows.length}` : ""}.\n` + rows.map((r) => `${r.job} · ${r.tag} · ${r.customer} · TDD ${r.target_delivery || "—"}${r.late_days ? ` (${r.late_days}d late)` : ""} · ${r.owner} · prod ${r.production_pct}% kit ${r.kitting_pct}% · ${cr(r.value)} · ${r.status}${r.on_floor ? " · on floor" : ""}${r.current_update ? `\n   update: ${r.current_update.slice(0, 200)}` : ""}`).join("\n"), { total, jobs: rows });
  }
  if (name === "genie_job") {
    const id = jobId(S(a.job));
    const [{ data: j }, { data: mt }, { data: et }, { data: mp }, { data: upd }] = await Promise.all([
      admin.from("jobs").select("*").eq("id", id).maybeSingle(),
      admin.from("manual_tasks").select("title, detail, who, due, cat, esc, done, created_at").eq("job_id", id).eq("done", false).order("due"),
      admin.from("erp_tasks").select("title, detail, who, due, cat, esc, done").eq("job_id", id).eq("done", false).order("due"),
      admin.from("job_manpower").select("day, crew, noted_by").eq("job_id", id).order("day", { ascending: false }).limit(1),
      admin.from("job_update_log").select("old, by, at").eq("job_id", id).order("at", { ascending: false }).limit(5).then((r) => r, () => ({ data: [] as R[] })),
    ]);
    if (!j) return text(`No live job ${S(a.job)} on the board.`);
    const tasks = [...(mt || []), ...(et || [])];
    const crew = mp?.[0]?.crew as R | undefined;
    return text([
      `Job ${S(j.id).slice(-4)} (${S(j.id)}) · ${S(j.tag)} · ${S(j.cust)} · ${S(j.fam)} · ${cr(N(j.val))} · T% ${N(j.tpp)}`,
      `Target delivery ${S(j.tdd) || "—"} · OTD date ${S(j.otd) || "—"} · status ${S(j.stat)} · production ${N(j.pct)}% · kitting ${N(j.kit)}% · owner ${S(j.own) || "—"} · project ${S(j.proj) || "—"}${j.on_floor ? " · on the floor" : ""}`,
      `Current update: ${S(j.note) || "nothing recorded"}${S(j.escalation) ? `\nEscalation: ${S(j.escalation)}` : ""}`,
      crew ? `Manpower ${S(mp?.[0]?.day)}: ${Object.entries(crew).filter(([, v]) => N(v)).map(([k, v]) => `${k} ${v}`).join(", ")}` : "No manpower recorded.",
      `Open tasks (${tasks.length}):` + (tasks.length ? "\n" + tasks.map((t) => `- ${S(t.title)} · ${S(t.who) || "unassigned"} · due ${S(t.due) || "—"} · ${S(t.cat)}${S(t.esc) && S(t.esc) !== "None" ? ` · ${S(t.esc)}` : ""}`).join("\n") : " none"),
      (upd || []).length ? `Past updates:\n` + (upd || []).map((u) => `- ${S(u.at).slice(0, 10)} ${S(u.by)}: ${S(u.old).slice(0, 160)}`).join("\n") : "",
    ].filter(Boolean).join("\n"), { job: j, tasks, manpower: mp?.[0] || null, past_updates: upd || [] });
  }
  if (name === "genie_tasks") {
    const [{ data: mt }, { data: et }, { data: jobs }] = await Promise.all([
      admin.from("manual_tasks").select("id, job_id, project, title, detail, who, due, cat, esc, created_by, created_at").eq("done", false).limit(5000),
      admin.from("erp_tasks").select("id, job_id, title, detail, who, due, cat, esc").eq("done", false).limit(5000),
      admin.from("jobs").select("id, tag, proj").eq("active", true),
    ]);
    const jobOf = new Map((jobs || []).map((j) => [S(j.id), j]));
    const who = S(a.who).toLowerCase(), cat = S(a.category).toLowerCase(), proj = S(a.project).toUpperCase(), job = a.job ? jobId(S(a.job)) : "";
    let rows = [...(mt || []).map((t) => ({ ...t, kind: "manual" })), ...(et || []).map((t) => ({ ...t, kind: "erp", project: null as string | null, created_by: null as string | null, created_at: null as string | null }))]
      .map((t) => { const j = t.job_id ? jobOf.get(S(t.job_id)) : null; return { id: t.id, kind: t.kind, title: S(t.title), detail: S(t.detail) || null, who: S(t.who) || "unassigned", due: t.due, overdue_days: t.due && S(t.due) < today ? Math.round((Date.parse(today) - Date.parse(S(t.due))) / 864e5) : 0, category: S(t.cat), escalation: S(t.esc) || "None", job: t.job_id ? S(t.job_id).slice(-4) : null, job_tag: S(j?.tag) || null, project: S(j?.proj) || S(t.project) || null, raised_by: t.created_by, raised_at: t.created_at }; });
    if (who) rows = rows.filter((r) => r.who.toLowerCase().includes(who));
    if (cat) rows = rows.filter((r) => r.category.toLowerCase().includes(cat));
    if (proj) rows = rows.filter((r) => (r.project || "").toUpperCase().includes(proj));
    if (job) rows = rows.filter((r) => r.job && job.endsWith(r.job));
    if (a.escalated_only) rows = rows.filter((r) => r.escalation !== "None");
    if (a.overdue_only) rows = rows.filter((r) => r.overdue_days > 0);
    rows.sort((x, y) => String(x.due || "9999").localeCompare(String(y.due || "9999")));
    const total = rows.length; rows = rows.slice(0, Math.min(200, N(a.limit) || 50));
    return text(`${total} open tasks match${total > rows.length ? `, first ${rows.length}` : ""}.\n` + rows.map((r) => `- ${r.title} · ${r.who} · due ${r.due || "—"}${r.overdue_days ? ` (${r.overdue_days}d overdue)` : ""} · ${r.category}${r.escalation !== "None" ? ` · ${r.escalation}` : ""}${r.job ? ` · job ${r.job}${r.job_tag ? ` ${r.job_tag}` : ""}` : ""}`).join("\n"), { total, tasks: rows });
  }
  if (name === "genie_queries") {
    const rows = (await queryRows(admin, a.project ? { projectId: S(a.project).toUpperCase().startsWith("NGSE-PROJ-") ? S(a.project).toUpperCase() : `NGSE-PROJ-${S(a.project).replace(/\D/g, "")}` } : {})).filter((r) => a.open_only === false || !r.done);
    return text(`${rows.length} queries.\n` + rows.map((r) => `- Q-${String(r.query_no || 0).padStart(4, "0")} · ${r.project_id || "no project"} · ${r.client || "—"} · ${r.title} · ${r.query_kind === "client" ? "client's" : "ours"}${r.client_shared ? " · shared with client" : ""} · ${r.who} · due ${r.due || "—"} · ${r.done ? "closed" : "open"}`).join("\n"), { queries: rows });
  }
  if (name === "genie_approvals") {
    const qs = await approvalQueues(admin);
    return text(qs.filter((q) => q.count).map((q) => `${q.label} (${q.module}) — ${q.count} waiting on ${q.who}${q.amount ? ` · ${cr(q.amount)}` : ""} · ${q.href}\n` + q.items.slice(0, 10).map((i) => `   - ${i.title} · ${i.sub}${i.amount ? ` · ${cr(i.amount)}` : ""}`).join("\n")).join("\n") || "Nothing is waiting for approval.", { queues: qs });
  }
  if (name === "genie_internal_kuber") {
    const d = await internalKuber(admin);
    return text(`To ${d.pnl_to}. Cash to bring home ${cr(d.generate_total)}; leaking from the books ${cr(d.wastage_total)} (${cr(d.wastage_per_month)} a month); waiting money costs ${cr(d.carry.per_month)} a month.\nGENERATE:\n` + d.generate.map((g) => `- ${g.label}: ${cr(g.amount)}${g.sub ? ` (${g.sub})` : ""} → ${g.lever}`).join("\n") + `\nWASTAGE:\n` + d.wastage.map((w) => `- ${w.label}: ${cr(w.amount)} → ${w.lever}`).join("\n"), d);
  }
  if (name === "genie_raise_task") {
    const title = S(a.title).slice(0, 300); if (!title) throw new Error("A task needs a title.");
    const job = a.job ? jobId(S(a.job)) : null;
    if (job) { const { data: j } = await admin.from("jobs").select("id").eq("id", job).maybeSingle(); if (!j) throw new Error(`No job ${S(a.job)} on the board.`); }
    const esc = ["None", "L1 — Supervisor", "L2 — Leaders", "L3 — Management"].find((e) => e.toLowerCase().startsWith(S(a.escalation).toLowerCase().slice(0, 2)) && S(a.escalation)) || "None";
    const row: R = { job_id: job, title, detail: S(a.detail) || "", who: S(a.who) || "unassigned", due: /^\d{4}-\d{2}-\d{2}$/.test(S(a.due)) ? S(a.due) : null, cat: S(a.category) || "General", esc, done: false, created_by: ACTOR(), project: S(a.project) ? (S(a.project).toUpperCase().startsWith("NGSE-PROJ-") ? S(a.project).toUpperCase() : `NGSE-PROJ-${S(a.project).replace(/\D/g, "")}`) : null };
    if (a.query_solver) { row.query_solver = true; row.query_kind = a.query_kind === "client" ? "client" : "ours"; row.client_shared = !!a.client_shared; row.raised_on = today; const m = await admin.from("manual_tasks").select("query_no").not("query_no", "is", null).order("query_no", { ascending: false }).limit(1); row.query_no = (N(m.data?.[0]?.query_no) || 0) + 1; }
    let ins = await admin.from("manual_tasks").insert(row).select("id").single();
    if (ins.error && /query_|client_shared|raised_on|project|schema cache/i.test(ins.error.message)) { for (const k of ["query_solver", "query_kind", "client_shared", "query_no", "raised_on", "project"]) delete row[k]; ins = await admin.from("manual_tasks").insert(row).select("id").single(); }
    if (ins.error) throw new Error(ins.error.message);
    return text(`Raised: "${title}" · ${S(row.who)} · due ${S(row.due) || "—"} · ${S(row.cat)}${job ? ` · job ${job.slice(-4)}` : ""}${row.query_no ? ` · Q-${String(row.query_no).padStart(4, "0")}` : ""} · in ${ACTOR()}'s name. Open at https://genie.nandan.co.in/?tasking=1`, { id: ins.data?.id, task: row });
  }
  throw new Error(`No such tool: ${name}`);
}
