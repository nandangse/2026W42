import type { ToolDef } from "@/lib/mcp/registry";
import { text, S, N, cr, lim, all } from "@/lib/mcp/registry";
import { hrmsTables } from "@/lib/hrms";
import { musterView, personView, musterPeople } from "@/lib/attendance-muster";
import { liveStock } from "@/lib/saamaan-stock";
import { liveClients } from "@/lib/query-solver";

const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });
type R = Record<string, unknown>;

/* ----------------------------------------------------------------- HRMS */
export const HRMS_TOOLS: ToolDef[] = [
  { name: "hrms_find_person", door: "hrms", description: "Find people on the HRMS roll by name, department, designation or location: designation, department, location, date of joining, e-mail. No salary figures.", inputSchema: obj({ search: { type: "string" }, limit: { type: "integer", default: 30 } }, ["search"]),
    run: async ({ admin }, a) => {
      const T = await hrmsTables(admin); const q = S(a.search).toLowerCase();
      const rows = (await all<R>((x, y) => admin.from(T.employees).select("id, name, email, department, designation, location, doj, active").eq("active", true).order("id").range(x, y))).filter((e) => `${e.name} ${e.department} ${e.designation} ${e.location} ${e.email} ${e.id}`.toLowerCase().includes(q)).slice(0, lim(a.limit, 30));
      return text(`${rows.length} people match "${S(a.search)}".\n` + rows.map((e) => `- ${S(e.name)} (${S(e.id)}) · ${S(e.designation) || "—"} · ${S(e.department) || "—"} · ${S(e.location) || "—"} · joined ${S(e.doj) || "—"}${S(e.email) ? ` · ${S(e.email)}` : ""}`).join("\n"), { people: rows });
    } },
  { name: "hrms_headcount", door: "hrms", description: "Headcount on the roll by department (and by location), active people only.", inputSchema: obj({}),
    run: async ({ admin }) => {
      const T = await hrmsTables(admin);
      const rows = await all<R>((x, y) => admin.from(T.employees).select("department, location").eq("active", true).order("id").range(x, y));
      const by = (k: string) => { const m: Record<string, number> = {}; for (const r of rows) { const v = S(r[k]) || "(blank)"; m[v] = (m[v] || 0) + 1; } return Object.entries(m).sort((p, q) => q[1] - p[1]); };
      return text(`${rows.length} on the roll.\nBy department: ` + by("department").map(([k, v]) => `${k} ${v}`).join(" · ") + `\nBy location: ` + by("location").map(([k, v]) => `${k} ${v}`).join(" · "), { total: rows.length, by_department: by("department"), by_location: by("location") });
    } },
  { name: "hrms_attendance", door: "hrms", description: "Attendance from the muster (Dr Raghu, 16 Oct 2026). Without a person: a month's summary — people, days paid, present, absent, attendance % (present ÷ present+absent), late coming % (late days ÷ present), by category, and who was absent most. With a person (employee id or name): their months — days paid, present, absent, week-offs, attendance %, late, and the day marks. month/year pick the month (default: the latest in Genie). Never salaries.", inputSchema: obj({ person: { type: "string", description: "employee id or (part of a) name" }, month: { type: "integer" }, year: { type: "integer" }, limit: { type: "integer", default: 12 } }),
    run: async ({ admin }, a) => {
      const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const pc = (v: number | null) => (v == null ? "—" : `${v}%`);
      if (S(a.person)) {
        const q = S(a.person).toLowerCase();
        const people = await musterPeople(admin);
        // spelling-tolerant: Shrinidhi / Shreenidhi / Srinidhi all meet at "srndh"
        const skel = (x: string) => x.toLowerCase().replace(/sh/g, "s").replace(/ee|ea/g, "i").replace(/[^a-z]/g, "").replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
        const qs = skel(q);
        let hits = people.filter((p) => p.employee_id === q || p.name.toLowerCase().includes(q));
        if (!hits.length && qs.length >= 3) hits = people.filter((p) => p.name.split(/\s+/).some((w) => skel(w) === qs || skel(w).startsWith(qs)) || skel(p.name).includes(qs));
        if (!hits.length) return text(`No muster in Genie carries anyone matching "${S(a.person)}".`);
        if (hits.length > 1 && !people.some((p) => p.employee_id === q)) return text(`${hits.length} people match "${S(a.person)}" — which one?\n` + hits.slice(0, 15).map((p) => `- ${p.name} (${p.employee_id}) · ${p.department || "—"}`).join("\n"), { candidates: hits.slice(0, 15) });
        const pv = await personView(admin, (hits.find((p) => p.employee_id === q) || hits[0]).employee_id);
        const P = pv.person!; const months = pv.months.filter((m) => (!a.month || m.month.month === Number(a.month)) && (!a.year || m.month.year === Number(a.year))).slice(0, lim(a.limit, 12, 36));
        return text(`${P.name} (${P.employee_id}) · ${P.designation || "—"} · ${P.department || "—"} · ${P.category}\nAcross ${pv.averages.months} months: attendance ${pc(pv.averages.attendance_pct)}, late coming ${pc(pv.averages.late_pct)}, ${pv.averages.present} present / ${pv.averages.absent} absent / ${pv.averages.pay_days} days paid.\n` + months.map((m) => `- ${MO[m.month.month - 1]} ${m.month.year}: paid ${m.line.pay_days}, present ${m.line.present}, absent ${m.line.absent}, WO ${m.line.wo}, MO/ST ${m.line.mo_st}, attendance ${pc(m.line.attendance_pct)}, late ${m.line.late ?? "—"} (${pc(m.line.late_pct)})${m.line.days.length ? ` · marks: ${m.line.days.join(" ")}` : ""}`).join("\n"), { person: P, averages: pv.averages, months: months.map((m) => ({ month: m.month.month, year: m.month.year, source: m.month.source, ...m.line })) });
      }
      const v0 = await musterView(admin);
      const want = a.month || a.year ? v0.months.find((m) => (!a.month || m.month === Number(a.month)) && (!a.year || m.year === Number(a.year))) : v0.month;
      if (!want) return text(`Genie holds no muster for ${a.month ? MO[Number(a.month) - 1] : ""} ${a.year || ""}. Months in Genie: ${v0.months.map((m) => `${MO[m.month - 1]} ${m.year}`).join(", ")}.`);
      const v = want.id === v0.month?.id ? v0 : await musterView(admin, want.id);
      const T = v.totals; const m = v.month!;
      const worst = [...v.rows].filter((r) => r.absent > 0).sort((p, q) => q.absent - p.absent).slice(0, 10);
      return text(`Attendance muster · ${MO[m.month - 1]} ${m.year} (${m.source === "payroll" ? "payroll run" : m.source === "sheet" ? "HR sheet" : "salary sheet — absent derived as days in month minus days paid; no late figure"}) · ${T.people} people.\nDays paid ${T.pay_days} · present ${T.present} · absent ${T.absent} · attendance ${pc(T.attendance_pct)} · late ${T.late} days (${pc(T.late_pct)}).\nBy category: ` + v.byCategory.map((c) => `${c.category} ${c.people} people, attendance ${pc(c.attendance_pct)}, late ${pc(c.late_pct)}`).join(" · ") + (worst.length ? `\nMost absent: ` + worst.map((r) => `${r.name} (${r.employee_id}) ${r.absent}d`).join(", ") : "") + `\nMonths in Genie: ${v.months.map((x) => `${MO[x.month - 1]} ${x.year}`).join(", ")}.`, { month: { month: m.month, year: m.year, source: m.source }, totals: T, by_category: v.byCategory, most_absent: worst.map((r) => ({ employee_id: r.employee_id, name: r.name, absent: r.absent, present: r.present, attendance_pct: r.attendance_pct })) });
    } },
];

/* ----------------------------------------------------------------- Seva */
export const SEVA_TOOLS: ToolDef[] = [
  { name: "seva_tickets", door: "seva", description: "Service tickets (ERP Issues mirrored in Seva): open by default; filter by customer, status, engineer, type of support, or free text. Returns ticket no, customer, subject, status, raised/opening date, attended by, type, job.", inputSchema: obj({ search: { type: "string" }, customer: { type: "string" }, include_closed: { type: "boolean" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("seva_issue").select("erp_name, customer, subject, title, status, issue_date, opening_date, attended_by, handled_by, type_of_support, problem_type, job_number, location, cost_spent").order("opening_date", { ascending: false, nullsFirst: false }).limit(1500);
      if (!a.include_closed) q = q.not("status", "ilike", "%closed%").not("status", "ilike", "%resolved%");
      if (S(a.customer)) q = q.ilike("customer", `%${S(a.customer)}%`);
      const { data, error } = await q; if (error) throw new Error(error.message);
      const s = S(a.search).toLowerCase();
      const rows = (data || []).filter((t) => !s || `${t.erp_name} ${t.customer} ${t.subject} ${t.title} ${t.status} ${t.attended_by} ${t.type_of_support} ${t.problem_type} ${t.location}`.toLowerCase().includes(s));
      const shown = rows.slice(0, lim(a.limit, 40));
      return text(`${rows.length} tickets${a.include_closed ? "" : " open"}.\n` + shown.map((t) => `- ${S(t.erp_name)} · ${S(t.customer)} · ${S(t.subject) || S(t.title)} · ${S(t.status)} · opened ${S(t.opening_date || t.issue_date).slice(0, 10)} · ${S(t.attended_by) || S(t.handled_by) || "—"}${S(t.type_of_support) ? ` · ${S(t.type_of_support)}` : ""}`).join("\n"), { count: rows.length, tickets: shown });
    } },
  { name: "seva_amc", door: "seva", description: "AMC contracts: valid ones by default, with customer, machine, dates, value, engineer; filter by customer or 'expiring within N days'.", inputSchema: obj({ customer: { type: "string" }, expiring_days: { type: "integer" }, include_expired: { type: "boolean" }, limit: { type: "integer", default: 50 } }),
    run: async ({ admin, today }, a) => {
      let q = admin.from("seva_amc").select("erp_name, customer, machine, start_date, end_date, value, engineer, status, territory, visits_planned, visits_done").order("end_date").limit(1000);
      if (!a.include_expired) q = q.eq("status", "AMC valid paid");
      if (S(a.customer)) q = q.ilike("customer", `%${S(a.customer)}%`);
      if (a.expiring_days) q = q.gte("end_date", today).lte("end_date", new Date(Date.parse(today) + N(a.expiring_days) * 864e5).toISOString().slice(0, 10));
      const { data, error } = await q; if (error) throw new Error(error.message);
      const rows = (data || []).slice(0, lim(a.limit));
      return text(`${(data || []).length} contracts, ${cr((data || []).reduce((s, r) => s + N(r.value), 0))} a year.\n` + rows.map((r) => `- ${S(r.erp_name)} · ${S(r.customer)} · ${S(r.machine)} · ${S(r.start_date)} → ${S(r.end_date)} · ${cr(N(r.value))} · ${S(r.engineer) || "—"} · visits ${N(r.visits_done)}/${N(r.visits_planned)}`).join("\n"), { contracts: rows });
    } },
  { name: "seva_plan", door: "seva", description: "The service team's deployment plan: who is where on a day (default today) — person, kind of visit, customer, site, status.", inputSchema: obj({ date: { type: "string" }, days: { type: "integer", default: 1 } }),
    run: async ({ admin, today }, a) => {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(S(a.date)) ? S(a.date) : today; const to = new Date(Date.parse(from) + (Math.max(1, N(a.days) || 1) - 1) * 864e5).toISOString().slice(0, 10);
      const { data, error } = await admin.from("seva_plan").select("on_date, person_name, kind, customer, site, status, notes, job_id").gte("on_date", from).lte("on_date", to).order("on_date").order("person_name"); if (error) throw new Error(error.message);
      return text(`${(data || []).length} deployments ${from}${to !== from ? ` → ${to}` : ""}.\n` + (data || []).map((r) => `- ${S(r.on_date)} · ${S(r.person_name)} · ${S(r.kind)} · ${S(r.customer)}${S(r.site) ? ` (${S(r.site)})` : ""} · ${S(r.status)}${S(r.notes) ? ` · ${S(r.notes).slice(0, 80)}` : ""}`).join("\n"), { rows: data || [] });
    } },
  { name: "seva_orders", door: "seva", description: "Service orders (NGSE/PO/SER): number, date, customer, spares and service amounts, status, manager, invoice.", inputSchema: obj({ customer: { type: "string" }, status: { type: "string" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("seva_service_order").select("so_no, so_date, customer, spares_amount, service_amount, status, manager_name, invoice_no, invoice_date, amc, job_id, issue").order("so_date", { ascending: false }).limit(lim(a.limit, 40));
      if (S(a.customer)) q = q.ilike("customer", `%${S(a.customer)}%`); if (S(a.status)) q = q.ilike("status", `%${S(a.status)}%`);
      const { data, error } = await q; if (error) throw new Error(error.message);
      return text(`${(data || []).length} service orders.\n` + (data || []).map((r) => `- ${S(r.so_no)} · ${S(r.so_date)} · ${S(r.customer)} · spares ${cr(N(r.spares_amount))} + service ${cr(N(r.service_amount))} · ${S(r.status)} · ${S(r.manager_name) || "—"}${S(r.invoice_no) ? ` · inv ${S(r.invoice_no)}` : ""}`).join("\n"), { orders: data || [] });
    } },
];

/* -------------------------------------------------------------- Saamaan */
export const SAAMAAN_TOOLS: ToolDef[] = [
  { name: "saamaan_stock", door: "saamaan", description: "Live stock of items from the ERP (Stock warehouses per Masters): search by item code or name; returns code, name, group, stock, on order, reserved.", inputSchema: obj({ search: { type: "string" }, limit: { type: "integer", default: 20 } }, ["search"]),
    run: async ({ admin }, a) => {
      const q = S(a.search); if (q.length < 3) throw new Error("Give at least three characters of the code or name.");
      const { data: items } = await admin.from("material_item").select("item_code, item_name, item_group, stock_uom").eq("disabled", false).or(`item_code.ilike.%${q}%,item_name.ilike.%${q}%`).limit(lim(a.limit, 20));
      const codes = (items || []).map((i) => S(i.item_code)); if (!codes.length) return text(`No item matching "${q}" in the item master.`);
      const live = await liveStock(admin, codes);
      return text((items || []).map((i) => { const s = live?.get(S(i.item_code)); return `- ${S(i.item_code)} · ${S(i.item_name)} · ${S(i.item_group)} · stock ${s ? s.stock : "?"} ${S(i.stock_uom)}${s?.ordered ? ` · on order ${s.ordered}` : ""}${s?.blocked ? ` · reserved ${s.blocked}` : ""}`; }).join("\n") + (live ? "" : "\n(the ERP could not be read — stock shown as ?)"), { items: (items || []).map((i) => ({ ...i, ...(live?.get(S(i.item_code)) || {}) })) });
    } },
  { name: "saamaan_po", door: "saamaan", description: "Purchase orders (from the ERP): open by default — supplier, date, schedule, value, % received, % billed, project. Filter by supplier or project.", inputSchema: obj({ supplier: { type: "string" }, project: { type: "string" }, include_closed: { type: "boolean" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("material_po").select("name, supplier_name, status, transaction_date, schedule_date, grand_total, per_received, per_billed, project").eq("docstatus", 1).order("transaction_date", { ascending: false }).limit(1500);
      if (S(a.supplier)) q = q.ilike("supplier_name", `%${S(a.supplier)}%`); if (S(a.project)) q = q.ilike("project", `%${S(a.project)}%`);
      const { data, error } = await q; if (error) throw new Error(error.message);
      const rows = (data || []).filter((r) => a.include_closed || !(/completed|closed|cancelled/i.test(S(r.status)) || N(r.per_received) >= 100)).slice(0, lim(a.limit, 40));
      return text(`${rows.length} purchase orders${a.include_closed ? "" : " open"}, ${cr(rows.reduce((s, r) => s + N(r.grand_total), 0))}.\n` + rows.map((r) => `- ${S(r.name)} · ${S(r.supplier_name)} · ${S(r.transaction_date)} · due ${S(r.schedule_date) || "—"} · ${cr(N(r.grand_total))} · received ${N(r.per_received)}% · billed ${N(r.per_billed)}%${S(r.project) ? ` · ${S(r.project)}` : ""}`).join("\n"), { orders: rows });
    } },
  { name: "saamaan_slips", door: "saamaan", description: "Issue slips (store) and requisitions (purchase) that are still open, with their lines released and pending.", inputSchema: obj({ limit: { type: "integer", default: 30 } }),
    run: async ({ admin }, a) => {
      const { data: slips, error } = await admin.from("material_slip").select("id, slip_no, kind, from_email, to_email, status, created_at, escalation_level").eq("status", "open").order("created_at", { ascending: false }).limit(lim(a.limit, 30)); if (error) throw new Error(error.message);
      const ids = (slips || []).map((s) => s.id); const { data: lines } = ids.length ? await admin.from("material_slip_line").select("slip_id, job_no, item_code, item_name, qty, released_qty, erp_ste, erp_error").in("slip_id", ids) : { data: [] as R[] };
      return text(`${(slips || []).length} open slips.\n` + (slips || []).map((s) => { const ls = (lines || []).filter((l) => l.slip_id === s.id); const pend = ls.filter((l) => N(l.qty) > N(l.released_qty)); return `- ${S(s.slip_no)} (${S(s.kind)}) · ${S(s.from_email)} → ${S(s.to_email)} · ${S(s.created_at).slice(0, 10)} · ${ls.length} lines, ${pend.length} pending${N(s.escalation_level) ? ` · escalated L${s.escalation_level}` : ""}` + (pend.length ? "\n" + pend.slice(0, 8).map((l) => `    ${S(l.job_no).slice(-4)} · ${S(l.item_code)} ${S(l.item_name)} · ${N(l.qty) - N(l.released_qty)} pending${S(l.erp_error) ? ` · ✗ ${S(l.erp_error).slice(0, 80)}` : ""}`).join("\n") : ""); }).join("\n"), { slips: slips || [], lines: lines || [] });
    } },
  { name: "saamaan_kanban_red", door: "saamaan", description: "Kanban items in the red zone — stock below a third of the buffer — with stock, buffer, on order and the reorder quantity.", inputSchema: obj({ limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      const { data, error } = await admin.from("material_kanban").select("item_code, stock, ordered, buffer_qty, reorder_qty, zone, rate, red_days").eq("active", true).eq("zone", "red").order("red_days", { ascending: false }).limit(lim(a.limit, 40)); if (error) throw new Error(error.message);
      const codes = (data || []).map((r) => S(r.item_code)); const { data: names } = codes.length ? await admin.from("material_item").select("item_code, item_name").in("item_code", codes) : { data: [] as R[] };
      const nm = new Map((names || []).map((n) => [S(n.item_code), S(n.item_name)]));
      return text(`${(data || []).length} items in red.\n` + (data || []).map((r) => `- ${S(r.item_code)} ${nm.get(S(r.item_code)) || ""} · stock ${N(r.stock)} of buffer ${N(r.buffer_qty)} · on order ${N(r.ordered)} · reorder ${N(r.reorder_qty)} · red ${N(r.red_days)} days`).join("\n"), { items: data || [] });
    } },
];

/* ------------------------------------------------------------------ IMS */
export const IMS_TOOLS: ToolDef[] = [
  { name: "ims_documents", door: "ims", description: "IMS documents (procedures, formats, registers, certificates): search by number, title, department or type; returns number, title, type, department, owner, status, next review.", inputSchema: obj({ search: { type: "string" }, limit: { type: "integer", default: 30 } }, ["search"]),
    run: async ({ admin }, a) => {
      const q = S(a.search);
      const { data, error } = await admin.from("ims_document").select("doc_no, title, doc_type, department, owner_name, status, next_review, sys, external_url").or(`doc_no.ilike.%${q}%,title.ilike.%${q}%,department.ilike.%${q}%,doc_type.ilike.%${q}%`).order("doc_no").limit(lim(a.limit, 30)); if (error) throw new Error(error.message);
      return text(`${(data || []).length} documents match "${q}".\n` + (data || []).map((d) => `- ${S(d.doc_no)} · ${S(d.title)} · ${S(d.doc_type)} · ${S(d.department)} · ${S(d.owner_name) || "—"} · ${S(d.status)}${S(d.next_review) ? ` · review ${S(d.next_review)}` : ""}`).join("\n"), { documents: data || [] });
    } },
  { name: "ims_nonconformities", door: "ims", description: "Non-conformities and their CAPA: open by default — NC number, source, severity, department, description, CAPA owner and due.", inputSchema: obj({ include_closed: { type: "boolean" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("ims_nonconformity").select("id, nc_no, source, description, severity, department, status, raised_by, created_at, clause_no").order("created_at", { ascending: false }).limit(lim(a.limit, 40));
      if (!a.include_closed) q = q.not("status", "ilike", "%closed%");
      const { data, error } = await q; if (error) throw new Error(error.message);
      const ids = (data || []).map((n) => n.id); const { data: capa } = ids.length ? await admin.from("ims_capa").select("nc_id, corrective_action, owner_name, due_date, status").in("nc_id", ids) : { data: [] as R[] };
      return text(`${(data || []).length} non-conformities${a.include_closed ? "" : " open"}.\n` + (data || []).map((n) => { const c = (capa || []).find((x) => x.nc_id === n.id); return `- ${S(n.nc_no)} · ${S(n.severity)} · ${S(n.department)} · ${S(n.description).slice(0, 120)} · ${S(n.status)}${c ? ` · CAPA: ${S(c.owner_name) || "—"} by ${S(c.due_date) || "—"} (${S(c.status)})` : ""}`; }).join("\n"), { ncs: data || [], capa: capa || [] });
    } },
  { name: "ims_audits", door: "ims", description: "Internal audits: number, title, dates, status, lead auditor, findings count.", inputSchema: obj({ limit: { type: "integer", default: 20 } }),
    run: async ({ admin }, a) => {
      const { data, error } = await admin.from("ims_internal_audit").select("id, audit_no, title, date_start, target_end, status, lead_auditor, departments").order("date_start", { ascending: false }).limit(lim(a.limit, 20)); if (error) throw new Error(error.message);
      const ids = (data || []).map((x) => x.id); const { data: ans } = ids.length ? await admin.from("ims_audit_answer").select("audit_id, status").in("audit_id", ids) : { data: [] as R[] };
      return text((data || []).map((x) => { const as = (ans || []).filter((y) => y.audit_id === x.id); const nc = as.filter((y) => /nc/i.test(S(y.status))).length; return `- ${S(x.audit_no)} · ${S(x.title)} · ${S(x.date_start)} → ${S(x.target_end)} · ${S(x.status)} · ${S(x.lead_auditor) || "—"} · ${as.length} answers, ${nc} NCs`; }).join("\n") || "No audits yet.", { audits: data || [] });
    } },
];

/* ------------------------------------------------------ Leaders Council */
export const LC_TOOLS: ToolDef[] = [
  { name: "lc_solution_board", door: "lc", description: "The Leaders Council's Solution Board — open problems with status, who raised them, related area and tentative date.", inputSchema: obj({ include_closed: { type: "boolean" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("lc_problem").select("title, description, lc_summary, status, tentative_on, added_by, created_at, related_to").order("created_at", { ascending: false }).limit(lim(a.limit, 40));
      if (!a.include_closed) q = q.not("status", "ilike", "%closed%").not("status", "ilike", "%solved%");
      const { data, error } = await q; if (error) throw new Error(error.message);
      return text(`${(data || []).length} problems.\n` + (data || []).map((p) => `- ${S(p.title)} · ${S(p.status)} · ${S(p.related_to) || "—"} · by ${S(p.added_by)} · ${S(p.created_at).slice(0, 10)}${S(p.tentative_on) ? ` · by ${S(p.tentative_on)}` : ""}`).join("\n"), { problems: data || [] });
    } },
  { name: "lc_checkins", door: "lc", description: "The latest Leaders Check-in from each leader: T1, T2, B1, the burning issue, goals and results, 99-day plan, learning.", inputSchema: obj({ limit: { type: "integer", default: 15 } }),
    run: async ({ admin }, a) => {
      const { data, error } = await admin.from("lc_checkin").select("email, on_date, t1, t2, b1, burning, goals, plan_99, learning").order("on_date", { ascending: false }).limit(200); if (error) throw new Error(error.message);
      const seen = new Set<string>(); const rows = (data || []).filter((r) => !seen.has(S(r.email)) && seen.add(S(r.email))).slice(0, lim(a.limit, 15));
      return text(rows.map((r) => `— ${S(r.email)} · ${S(r.on_date)}\n  T1 ${S(r.t1)} · T2 ${S(r.t2)} · B1 ${S(r.b1)}\n  Burning: ${S(r.burning) || "—"}\n  Goals: ${S(r.goals).slice(0, 200) || "—"}\n  99-day: ${S(r.plan_99).slice(0, 200) || "—"}\n  Learning: ${S(r.learning).slice(0, 160) || "—"}`).join("\n") || "No check-ins yet.", { checkins: rows });
    } },
  { name: "lc_kpis", door: "lc", description: "The Council's KPIs with their latest month's value against target.", inputSchema: obj({}),
    run: async ({ admin }) => {
      const [{ data: k }, { data: v }] = await Promise.all([admin.from("lc_kpi").select("id, name, assigned_to, unit, target, group").eq("active", true).order("sort"), admin.from("lc_kpi_value").select("kpi_id, month, value").order("month", { ascending: false }).limit(3000)]);
      const latest = new Map<string, R>(); for (const x of v || []) if (!latest.has(S(x.kpi_id))) latest.set(S(x.kpi_id), x);
      return text((k || []).map((x) => { const l = latest.get(S(x.id)); return `- ${S(x.name)}${S(x.group) ? ` (${S(x.group)})` : ""} · ${S(x.assigned_to) || "—"} · ${l ? `${S(l.month)}: ${S(l.value)}` : "no value yet"}${x.target != null ? ` · target ${S(x.target)}` : ""} ${S(x.unit)}`; }).join("\n") || "No KPIs yet.", { kpis: k || [], latest: [...latest.values()] });
    } },
];

/* ---------------------------------------------------------- Vishwakarma */
export const VISHWA_TOOLS: ToolDef[] = [
  { name: "vishwa_design", door: "vishwakarma", description: "Design status by project: design stage, design owner, BOM % and manufacturing-drawing %, support needed, and the design plan's stages with dates.", inputSchema: obj({ project: { type: "string" } }),
    run: async ({ admin }, a) => {
      let q = admin.from("vishwa_project").select("project_id, design_stage, design_owner, support_needed, bom_pct, manuf_pct").order("project_id").limit(200);
      if (S(a.project)) q = q.ilike("project_id", `%${S(a.project).replace(/\D/g, "") || S(a.project)}%`);
      const { data, error } = await q; if (error) throw new Error(error.message);
      const ids = (data || []).map((p) => S(p.project_id)); const { data: plan } = ids.length ? await admin.from("vishwa_design_plan").select("project_id, idx, title, on_date, done").in("project_id", ids).order("idx") : { data: [] as R[] };
      return text((data || []).map((p) => `- ${S(p.project_id)} · ${S(p.design_stage) || "—"} · ${S(p.design_owner) || "—"} · BOM ${N(p.bom_pct)}% · drawings ${N(p.manuf_pct)}%${S(p.support_needed) ? ` · needs ${S(p.support_needed)}` : ""}` + ((plan || []).filter((s) => s.project_id === p.project_id).map((s) => `\n    ${s.done ? "✓" : "·"} ${S(s.title)} ${S(s.on_date) || ""}`).join(""))).join("\n") || "Nothing in Vishwakarma yet.", { projects: data || [], plan: plan || [] });
    } },
];

/* --------------------------------------------------------------- Portal */
export const PORTAL_TOOLS: ToolDef[] = [
  { name: "portal_clients", door: "portal", description: "Customers with a portal door: live or not, people invited, last sign-in, queries shared with them.", inputSchema: obj({}),
    run: async ({ admin }) => { const rows = await liveClients(admin); return text(rows.map((c) => `- ${c.name} (/portal/${c.slug}) · ${c.active ? "live" : "inactive"} · ${c.people} people · last sign-in ${c.last_login ? c.last_login.slice(0, 10) : "never"} · ${c.open_queries} open shared queries`).join("\n") || "No client has a portal yet.", { clients: rows }); } },
  { name: "portal_queries", door: "portal", description: "Questions customers have asked on their portal (Query solver): open by default — organisation, subject, who asked, when, status.", inputSchema: obj({ include_closed: { type: "boolean" }, limit: { type: "integer", default: 40 } }),
    run: async ({ admin }, a) => {
      let q = admin.from("portal_query").select("org_slug, job_id, subject, body, status, by_name, by_side, at").order("updated_at", { ascending: false }).limit(lim(a.limit, 40));
      if (!a.include_closed) q = q.neq("status", "closed");
      const { data, error } = await q; if (error) throw new Error(error.message);
      return text(`${(data || []).length} portal queries.\n` + (data || []).map((r) => `- ${S(r.org_slug)} · ${S(r.subject)} · ${S(r.by_side) === "them" ? "asked by" : "note from"} ${S(r.by_name)} · ${S(r.at).slice(0, 10)} · ${S(r.status)}${S(r.job_id) ? ` · job ${S(r.job_id)}` : ""}`).join("\n"), { queries: data || [] });
    } },
];

/* ------------------------------------------------------------------ LMS */
export const LMS_TOOLS: ToolDef[] = [
  { name: "lms_my_learning", door: "lms", description: "The caller's own learning record: lessons completed, in progress and planned, time learned, and what they wrote.", inputSchema: obj({}),
    run: async ({ admin, caller }) => {
      const { data: p } = await admin.from("profiles").select("id").eq("email", caller.email).maybeSingle(); if (!p) return text("No learning record.");
      const [{ data: pr }, { data: ls }] = await Promise.all([admin.from("lms_progress").select("lesson_id, status, completed_on, minutes, learning").eq("person_id", p.id), admin.from("lms_lesson").select("id, title, minutes, code")]);
      const t = new Map((ls || []).map((l) => [S(l.id), l]));
      const rows = (pr || []).map((x) => ({ lesson: S(t.get(S(x.lesson_id))?.title), code: S(t.get(S(x.lesson_id))?.code), status: S(x.status), completed_on: x.completed_on, minutes: N(x.minutes) || N(t.get(S(x.lesson_id))?.minutes), learning: S(x.learning) }));
      const done = rows.filter((r) => r.status === "completed");
      return text(`${done.length} completed · ${rows.filter((r) => r.status === "in_progress").length} in progress · ${rows.filter((r) => r.status === "planned").length} planned · ${done.reduce((s, r) => s + r.minutes, 0)} minutes learned.\n` + rows.map((r) => `- ${r.lesson} (/lms/${r.code}) · ${r.status}${r.completed_on ? ` ${r.completed_on}` : ""}`).join("\n"), { rows });
    } },
];
