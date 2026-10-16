import type { ToolDef } from "@/lib/mcp/registry";
import { text, S, N, cr, lim, jobId, projId } from "@/lib/mcp/registry";
import { queryRows } from "@/lib/query-solver";

const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });

export const PLANNING_TOOLS: ToolDef[] = [
  { name: "genie_jobs", door: "planning", description: "Live jobs on the planning board — job number, customer tag, product family, value, target delivery, OTD date, planning owner, production %, kitting %, status, on-floor flag, current update, escalation. Filter by customer, owner initials, late only, on-floor only, or free text.",
    inputSchema: obj({ search: { type: "string" }, owner: { type: "string", description: "planning owner's initials, e.g. PS" }, late_only: { type: "boolean" }, on_floor_only: { type: "boolean" }, limit: { type: "integer", default: 50 } }),
    run: async ({ admin, today }, a) => {
      const { data, error } = await admin.from("jobs").select("id, tag, cust, fam, val, tdd, otd, stat, pct, kit, on_floor, own, note, escalation, proj, tpp").eq("active", true).eq("delivered", false).order("tdd", { ascending: true, nullsFirst: false }).limit(1000);
      if (error) throw new Error(error.message);
      const { data: profs } = await admin.from("profiles").select("initials, erp_owner");
      const initOf = (o: string) => S((profs || []).find((x) => S(x.erp_owner).toLowerCase() === o.toLowerCase())?.initials) || o;
      const q = S(a.search).toLowerCase(), own = S(a.owner).toUpperCase();
      let rows = (data || []).map((j) => ({ job: S(j.id).slice(-4), id: S(j.id), tag: S(j.tag), customer: S(j.cust), family: S(j.fam), value: N(j.val), target_delivery: j.tdd, otd_date: j.otd, late_days: j.tdd && S(j.tdd) < today ? Math.round((Date.parse(today) - Date.parse(S(j.tdd))) / 864e5) : 0, owner: initOf(S(j.own)), production_pct: N(j.pct), kitting_pct: N(j.kit), throughput_pct: N(j.tpp), status: S(j.stat), on_floor: !!j.on_floor, project: S(j.proj) || null, current_update: S(j.note) || null, escalation: S(j.escalation) || null }));
      if (q) rows = rows.filter((r) => `${r.job} ${r.tag} ${r.customer} ${r.family} ${r.status} ${r.owner} ${r.project || ""}`.toLowerCase().includes(q));
      if (own) rows = rows.filter((r) => r.owner.toUpperCase() === own);
      if (a.late_only) rows = rows.filter((r) => r.late_days > 0);
      if (a.on_floor_only) rows = rows.filter((r) => r.on_floor);
      const total = rows.length; rows = rows.slice(0, lim(a.limit));
      return text(`${total} live jobs match${total > rows.length ? `, first ${rows.length}` : ""}.\n` + rows.map((r) => `${r.job} · ${r.tag} · ${r.customer} · TDD ${r.target_delivery || "—"}${r.late_days ? ` (${r.late_days}d late)` : ""} · ${r.owner} · prod ${r.production_pct}% kit ${r.kitting_pct}% · ${cr(r.value)} · ${r.status}${r.on_floor ? " · on floor" : ""}${r.current_update ? `\n   update: ${r.current_update.slice(0, 200)}` : ""}`).join("\n"), { total, jobs: rows });
    } },
  { name: "genie_job", door: "planning", description: "One job in full: board row, open tasks, today's manpower, past updates. Give the 4-digit job number or the full id.", inputSchema: obj({ job: { type: "string" } }, ["job"]),
    run: async ({ admin }, a) => {
      const id = jobId(S(a.job));
      const [{ data: j }, { data: mt }, { data: et }, { data: mp }] = await Promise.all([
        admin.from("jobs").select("*").eq("id", id).maybeSingle(),
        admin.from("manual_tasks").select("title, detail, who, due, cat, esc, done").eq("job_id", id).eq("done", false).order("due"),
        admin.from("erp_tasks").select("title, detail, who, due, cat, esc, done").eq("job_id", id).eq("done", false).order("due"),
        admin.from("job_manpower").select("day, crew").eq("job_id", id).order("day", { ascending: false }).limit(1),
      ]);
      if (!j) return text(`No live job ${S(a.job)} on the board.`);
      const tasks = [...(mt || []), ...(et || [])]; const crew = mp?.[0]?.crew as Record<string, unknown> | undefined;
      return text([
        `Job ${S(j.id).slice(-4)} (${S(j.id)}) · ${S(j.tag)} · ${S(j.cust)} · ${S(j.fam)} · ${cr(N(j.val))} · T% ${N(j.tpp)}`,
        `Target delivery ${S(j.tdd) || "—"} · OTD date ${S(j.otd) || "—"} · status ${S(j.stat)} · production ${N(j.pct)}% · kitting ${N(j.kit)}% · owner ${S(j.own) || "—"} · project ${S(j.proj) || "—"}${j.on_floor ? " · on the floor" : ""}`,
        `Current update: ${S(j.note) || "nothing recorded"}${S(j.escalation) ? `\nEscalation: ${S(j.escalation)}` : ""}`,
        crew ? `Manpower ${S(mp?.[0]?.day)}: ${Object.entries(crew).filter(([, v]) => N(v)).map(([k, v]) => `${k} ${v}`).join(", ")}` : "No manpower recorded.",
        `Open tasks (${tasks.length}):` + (tasks.length ? "\n" + tasks.map((t) => `- ${S(t.title)} · ${S(t.who) || "unassigned"} · due ${S(t.due) || "—"} · ${S(t.cat)}${S(t.esc) && S(t.esc) !== "None" ? ` · ${S(t.esc)}` : ""}`).join("\n") : " none"),
      ].join("\n"), { job: j, tasks, manpower: mp?.[0] || null });
    } },
  { name: "genie_projects", door: "planning", description: "Projects (a customer order with its jobs): id, name, customer, status, stage, planning owner, % complete, expected end. Filter by customer or free text; live only by default.",
    inputSchema: obj({ search: { type: "string" }, include_closed: { type: "boolean" }, limit: { type: "integer", default: 50 } }),
    run: async ({ admin }, a) => {
      const { data, error } = await admin.from("projects").select("id, name, cust, status, stage, planning_owner, pct_complete, exp_end, committed, product_family, quantity, po_number").order("exp_end", { ascending: true, nullsFirst: false }).limit(2000);
      if (error) throw new Error(error.message);
      const q = S(a.search).toLowerCase();
      let rows = (data || []).filter((p) => a.include_closed || !/complet|closed|cancel/i.test(S(p.status))).filter((p) => !q || `${p.id} ${p.name} ${p.cust} ${p.status} ${p.stage} ${p.planning_owner}`.toLowerCase().includes(q));
      const total = rows.length; rows = rows.slice(0, lim(a.limit));
      return text(`${total} projects.\n` + rows.map((p) => `${S(p.id).replace("NGSE-PROJ-", "PROJ ")} · ${S(p.name)} · ${S(p.cust)} · ${S(p.stage) || S(p.status)} · owner ${S(p.planning_owner) || "—"} · ${N(p.pct_complete)}% · ends ${S(p.exp_end) || "—"}`).join("\n"), { total, projects: rows });
    } },
  { name: "genie_tasks", door: "planning", description: "Open tasks on Nandan Tasking. Filter by assignee, job, project, category, escalated only, overdue only.",
    inputSchema: obj({ who: { type: "string" }, job: { type: "string" }, project: { type: "string" }, category: { type: "string" }, escalated_only: { type: "boolean" }, overdue_only: { type: "boolean" }, limit: { type: "integer", default: 50 } }),
    run: async ({ admin, today }, a) => {
      const [{ data: mt }, { data: et }, { data: jobs }] = await Promise.all([
        admin.from("manual_tasks").select("id, job_id, project, title, detail, who, due, cat, esc, created_by").eq("done", false).limit(5000),
        admin.from("erp_tasks").select("id, job_id, title, detail, who, due, cat, esc").eq("done", false).limit(5000),
        admin.from("jobs").select("id, tag, proj").eq("active", true),
      ]);
      const jobOf = new Map((jobs || []).map((j) => [S(j.id), j]));
      const who = S(a.who).toLowerCase(), cat = S(a.category).toLowerCase(), proj = projId(S(a.project)), job = a.job ? jobId(S(a.job)) : "";
      let rows = [...(mt || []).map((t) => ({ ...t, kind: "manual" })), ...(et || []).map((t) => ({ ...t, kind: "erp", project: null as string | null, created_by: null as string | null }))]
        .map((t) => { const j = t.job_id ? jobOf.get(S(t.job_id)) : null; return { id: t.id, kind: t.kind, title: S(t.title), detail: S(t.detail) || null, who: S(t.who) || "unassigned", due: t.due, overdue_days: t.due && S(t.due) < today ? Math.round((Date.parse(today) - Date.parse(S(t.due))) / 864e5) : 0, category: S(t.cat), escalation: S(t.esc) || "None", job: t.job_id ? S(t.job_id).slice(-4) : null, job_tag: S(j?.tag) || null, project: S(j?.proj) || S(t.project) || null, raised_by: t.created_by }; });
      if (who) rows = rows.filter((r) => r.who.toLowerCase().includes(who));
      if (cat) rows = rows.filter((r) => r.category.toLowerCase().includes(cat));
      if (proj) rows = rows.filter((r) => (r.project || "").toUpperCase() === proj);
      if (job) rows = rows.filter((r) => r.job && job.endsWith(r.job));
      if (a.escalated_only) rows = rows.filter((r) => r.escalation !== "None");
      if (a.overdue_only) rows = rows.filter((r) => r.overdue_days > 0);
      rows.sort((x, y) => String(x.due || "9999").localeCompare(String(y.due || "9999")));
      const total = rows.length; rows = rows.slice(0, lim(a.limit));
      return text(`${total} open tasks match${total > rows.length ? `, first ${rows.length}` : ""}.\n` + rows.map((r) => `- ${r.title} · ${r.who} · due ${r.due || "—"}${r.overdue_days ? ` (${r.overdue_days}d overdue)` : ""} · ${r.category}${r.escalation !== "None" ? ` · ${r.escalation}` : ""}${r.job ? ` · job ${r.job}${r.job_tag ? ` ${r.job_tag}` : ""}` : ""}`).join("\n"), { total, tasks: rows });
    } },
  { name: "genie_raise_task", door: "planning", write: true, description: "Raise a task on Nandan Tasking in the caller's name: title (required), assignee, due (YYYY-MM-DD), category (Production, Material, Design, Quality, Purchase, Service, General…), job (4 or 10 digits), project id, detail, escalation (None | L1 — Supervisor | L2 — Leaders | L3 — Management), Query Solver ticks. Confirm with the person before raising when the ask is ambiguous.",
    inputSchema: obj({ title: { type: "string" }, who: { type: "string" }, due: { type: "string" }, category: { type: "string" }, job: { type: "string" }, project: { type: "string" }, detail: { type: "string" }, escalation: { type: "string" }, query_solver: { type: "boolean" }, query_kind: { type: "string", enum: ["client", "ours"] }, client_shared: { type: "boolean" } }, ["title"]),
    run: async ({ admin, caller, today }, a) => {
      const title = S(a.title).slice(0, 300); if (!title) throw new Error("A task needs a title.");
      const job = a.job ? jobId(S(a.job)) : null;
      if (job) { const { data: j } = await admin.from("jobs").select("id").eq("id", job).maybeSingle(); if (!j) throw new Error(`No job ${S(a.job)} on the board.`); }
      const esc = S(a.escalation) ? ["L1 — Supervisor", "L2 — Leaders", "L3 — Management"].find((e) => e.toLowerCase().startsWith(S(a.escalation).toLowerCase().slice(0, 2))) || "None" : "None";
      const row: Record<string, unknown> = { job_id: job, title, detail: S(a.detail) || "", who: S(a.who) || "unassigned", due: /^\d{4}-\d{2}-\d{2}$/.test(S(a.due)) ? S(a.due) : null, cat: S(a.category) || "General", esc, done: false, created_by: caller.email, project: projId(S(a.project)) || null };
      if (a.query_solver) { row.query_solver = true; row.query_kind = a.query_kind === "client" ? "client" : "ours"; row.client_shared = !!a.client_shared; row.raised_on = today; const m = await admin.from("manual_tasks").select("query_no").not("query_no", "is", null).order("query_no", { ascending: false }).limit(1); row.query_no = (N(m.data?.[0]?.query_no) || 0) + 1; }
      let ins = await admin.from("manual_tasks").insert(row).select("id").single();
      if (ins.error && /query_|client_shared|raised_on|project|schema cache/i.test(ins.error.message)) { for (const k of ["query_solver", "query_kind", "client_shared", "query_no", "raised_on", "project"]) delete row[k]; ins = await admin.from("manual_tasks").insert(row).select("id").single(); }
      if (ins.error) throw new Error(ins.error.message);
      return text(`Raised: "${title}" · ${S(row.who)} · due ${S(row.due) || "—"} · ${S(row.cat)}${job ? ` · job ${job.slice(-4)}` : ""}${row.query_no ? ` · Q-${String(row.query_no).padStart(4, "0")}` : ""} · in ${caller.name}'s name.`, { id: ins.data?.id, task: row });
    } },
  { name: "genie_job_update", door: "planning", write: true, description: "Write a job's Current Update (the one-line status the board carries, e.g. 'W42: chassis received, fabrication started'). The old line is kept in the job's history. Planners, project owners and Stratcom only.",
    inputSchema: obj({ job: { type: "string" }, update: { type: "string" } }, ["job", "update"]),
    run: async ({ admin, caller }, a) => {
      if (!(caller.isOwner || caller.stratcom || ["admin", "planner", "project_owner"].includes(caller.role))) throw new Error("A job's update is written by planning, the project owners and Stratcom.");
      const id = jobId(S(a.job)); const update = S(a.update).slice(0, 2000); if (!update) throw new Error("Write the update.");
      const { data: j } = await admin.from("jobs").select("id, note").eq("id", id).maybeSingle(); if (!j) throw new Error(`No job ${S(a.job)} on the board.`);
      const now = new Date().toISOString();
      await admin.from("job_update_log").insert({ job_id: id, old: S(j.note), by: caller.email, at: now }).then(() => null, () => null);
      const { error } = await admin.from("jobs").update({ note: update, updated_at: now }).eq("id", id); if (error) throw new Error(error.message);
      await admin.from("erp_update").insert({ doctype: "Jobmaster", docname: id, field: "note", label: "Current Status", old_value: S(j.note), new_value: update, by: caller.email, at: now }).then(() => null, () => null);
      return text(`Job ${id.slice(-4)} update written: "${update}" (was: "${S(j.note) || "—"}").`);
    } },
  { name: "genie_queries", door: "queries", description: "The Query Solver — every query (a task ticked Query Solver) by project: number, client's or ours, shared with the client, assigned, due, state.", inputSchema: obj({ project: { type: "string" }, open_only: { type: "boolean", default: true } }),
    run: async ({ admin }, a) => {
      const rows = (await queryRows(admin, a.project ? { projectId: projId(S(a.project)) } : {})).filter((r) => a.open_only === false || !r.done);
      return text(`${rows.length} queries.\n` + rows.map((r) => `- Q-${String(r.query_no || 0).padStart(4, "0")} · ${r.project_id || "no project"} · ${r.client || "—"} · ${r.title} · ${r.query_kind === "client" ? "client's" : "ours"}${r.client_shared ? " · shared with client" : ""} · ${r.who} · due ${r.due || "—"} · ${r.done ? "closed" : "open"}`).join("\n"), { queries: rows });
    } },
];
