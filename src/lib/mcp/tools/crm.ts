import type { ToolDef } from "@/lib/mcp/registry";
import { text, S, N, cr, lim } from "@/lib/mcp/registry";
import { crmDb, crmConfigured } from "@/crm/db";

const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });
const db = () => { if (!crmConfigured()) throw new Error("The CRM database is not configured."); return crmDb(); };

export const CRM_TOOLS: ToolDef[] = [
  { name: "crm_find", door: "crm", description: "Search the CRM for companies and people by name, e-mail, phone or city. Returns companies (customer flag, city, country) and people (title, company, e-mail, phone).", inputSchema: obj({ search: { type: "string" }, limit: { type: "integer", default: 20 } }, ["search"]),
    run: async (_c, a) => {
      const c = db(); const q = S(a.search); if (q.length < 2) throw new Error("Give at least two characters.");
      const [co, pe] = await Promise.all([
        c.from("company").select("id, name, city, country, is_customer, industry_id, website").is("deleted_at", null).ilike("name", `%${q}%`).limit(lim(a.limit, 20)),
        c.from("person").select("id, full_name, job_title, primary_email, primary_phone, city, company_id, company:company_id(name)").is("deleted_at", null).or(`full_name.ilike.%${q}%,primary_email.ilike.%${q}%,primary_phone.ilike.%${q}%`).limit(lim(a.limit, 20)),
      ]);
      const companies = co.data || [], people = (pe.data || []) as unknown as Record<string, unknown>[];
      return text(`${companies.length} companies, ${people.length} people match "${q}".\n` + companies.map((x) => `🏢 ${S(x.name)}${x.is_customer ? " · customer" : ""} · ${[S(x.city), S(x.country)].filter(Boolean).join(", ")} · id ${S(x.id)}`).join("\n") + (people.length ? "\n" + people.map((p) => `👤 ${S(p.full_name)} · ${S(p.job_title)} · ${S((p.company as Record<string, unknown> | null)?.name)} · ${S(p.primary_email)} · ${S(p.primary_phone)}`).join("\n") : ""), { companies, people });
    } },
  { name: "crm_company", door: "crm", description: "One company in the CRM: its people, open opportunities, quotations of the last 12 months, and sales orders. Give the company name (or id).", inputSchema: obj({ company: { type: "string" } }, ["company"]),
    run: async (_c, a) => {
      const c = db(); const q = S(a.company);
      const { data: cos } = /^[0-9a-f-]{36}$/i.test(q) ? await c.from("company").select("id, name, city, country, is_customer, website, notes").eq("id", q) : await c.from("company").select("id, name, city, country, is_customer, website, notes").is("deleted_at", null).ilike("name", `%${q}%`).order("is_customer", { ascending: false }).limit(1);
      const co = cos?.[0]; if (!co) return text(`No company matching "${q}" in the CRM.`);
      const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      const [pe, op, qt, so] = await Promise.all([
        c.from("person").select("full_name, job_title, primary_email, primary_phone, is_decision_maker").eq("company_id", co.id).is("deleted_at", null).eq("active", true).limit(30),
        c.from("opportunity").select("opportunity_no, name, amount, expected_close_on, probability, stage_id, product_family").eq("company_id", co.id).is("deleted_at", null).is("won_at", null).is("lost_at", null).limit(30),
        c.from("quotation").select("quote_no, revision, status, grand_total, created_at, valid_until").eq("company_id", co.id).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
        c.from("sales_order").select("so_no, amount, ordered_on, delivery_on, erp_status, po_no").eq("company_id", co.id).order("ordered_on", { ascending: false }).limit(30),
      ]);
      return text([
        `${S(co.name)}${co.is_customer ? " · customer" : ""} · ${[S(co.city), S(co.country)].filter(Boolean).join(", ")}${S(co.website) ? ` · ${S(co.website)}` : ""}`,
        `People (${(pe.data || []).length}): ` + (pe.data || []).map((p) => `${S(p.full_name)} (${S(p.job_title) || "—"}${p.is_decision_maker ? ", decision maker" : ""}) ${S(p.primary_email)} ${S(p.primary_phone)}`).join("; "),
        `Open opportunities (${(op.data || []).length}): ` + (op.data || []).map((o) => `${S(o.opportunity_no)} ${S(o.name)} ${cr(N(o.amount))} · close ${S(o.expected_close_on) || "—"} · ${N(o.probability)}%`).join("; "),
        `Quotations, last 12 months (${(qt.data || []).length}): ` + (qt.data || []).map((x) => `${S(x.quote_no)}${x.revision ? `-R${x.revision}` : ""} ${cr(N(x.grand_total))} · ${S(x.status)} · ${S(x.created_at).slice(0, 10)}`).join("; "),
        `Sales orders (${(so.data || []).length}): ` + (so.data || []).map((x) => `${S(x.so_no)} ${cr(N(x.amount))} · ${S(x.ordered_on)} · ${S(x.erp_status)}${S(x.po_no) ? ` · PO ${S(x.po_no)}` : ""}`).join("; "),
      ].join("\n"), { company: co, people: pe.data || [], opportunities: op.data || [], quotations: qt.data || [], sales_orders: so.data || [] });
    } },
  { name: "crm_pipeline", door: "crm", description: "Open opportunities in the CRM pipeline: number, name, company, amount, probability, expected close, owner. Filter by owner e-mail, company, or free text.", inputSchema: obj({ search: { type: "string" }, limit: { type: "integer", default: 50 } }),
    run: async (_c, a) => {
      const c = db();
      const { data, error } = await c.from("opportunity").select("opportunity_no, name, amount, currency, probability, expected_close_on, product_family, priority, company:company_id(name), owner:owner_id(email)").is("deleted_at", null).is("won_at", null).is("lost_at", null).order("expected_close_on", { ascending: true, nullsFirst: false }).limit(1000);
      if (error) throw new Error(error.message);
      const q = S(a.search).toLowerCase();
      const rows = ((data || []) as unknown as Record<string, unknown>[]).map((o) => ({ no: S(o.opportunity_no), name: S(o.name), company: S((o.company as Record<string, unknown> | null)?.name), amount: N(o.amount), probability: N(o.probability), close: S(o.expected_close_on) || null, owner: S((o.owner as Record<string, unknown> | null)?.email), family: S(o.product_family), priority: S(o.priority) })).filter((r) => !q || `${r.no} ${r.name} ${r.company} ${r.owner} ${r.family}`.toLowerCase().includes(q));
      const total = rows.reduce((s, r) => s + r.amount, 0); const shown = rows.slice(0, lim(a.limit));
      return text(`${rows.length} open opportunities, ${cr(total)}.\n` + shown.map((r) => `- ${r.no} · ${r.name} · ${r.company} · ${cr(r.amount)} · ${r.probability}% · close ${r.close || "—"} · ${r.owner}`).join("\n"), { count: rows.length, total, opportunities: shown });
    } },
];
