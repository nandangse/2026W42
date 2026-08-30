/**
 * ONE ROUTE FOR EVERY DOCTYPE.
 *
 *   GET   /api/crm/<doctype>            -- rows (filtered, sorted, searched
 *                                          SERVER-side, because the tables
 *                                          hold 54k rows and the list caps at
 *                                          500) plus link options and the
 *                                          true total
 *   GET   /api/crm/<doctype>?id=<uuid>  -- one record, for the lightbox
 *   POST  /api/crm/<doctype>            -- add a record
 *   PATCH /api/crm/<doctype>?id=<uuid>  -- edit a record
 *
 * Written once so that adding a doctype cannot leave it without a way to add,
 * see, filter or edit records. The registry in src/crm/doctypes.ts is the
 * only thing that changes.
 *
 * Two doctypes get a little more than the registry gives:
 *   company  -- each row carries opp_count / contact_count / so_count,
 *               embedded counts computed by PostgREST in the same query
 *   industry -- renaming one onto an existing name MERGES them: companies
 *               are repointed to the survivor and the duplicate goes away.
 *               253 industries came in from the ERP with near-duplicates;
 *               merging is how the book gets clean without losing links.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm, type CrmUser } from "@/crm/auth";
import { advanceNewToHandled } from "@/crm/stageflow";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { doctypeBySlug, linkTargets, type Doctype, type Field } from "@/crm/doctypes";

export const dynamic = "force-dynamic";

const COMPANY_SELECT = "*, opps:opportunity(count), contacts:person(count), sos:sales_order(count)";
// The customer's industry rides along on the opportunity, by name.
const OPP_SELECT = "*, company_join:company_id(industry:industry_id(name))";

/** BANTTC, weighted the way Dr Raghu weighs it: B×2, A, N×2, T×2, TQ, C. */
function banttcScore(r: Record<string, unknown>): number | null {
  const w: [string, number][] = [
    ["budget_pct", 2], ["authority_pct", 1], ["need_pct", 2],
    ["timing_pct", 2], ["technically_qualified_pct", 1], ["competitiveness_pct", 1],
  ];
  let sum = 0, den = 0;
  for (const [k, weight] of w) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    sum += Number(v) * weight; den += weight;
  }
  return den > 0 ? Math.round(sum / den) : null;
}

function foldOpportunity(r: Record<string, unknown>): Record<string, unknown> {
  const { company_join, ...rest } = r as Record<string, unknown> & {
    company_join?: { industry?: { name?: unknown } | null } | null;
  };
  return {
    ...rest,
    company_industry: company_join?.industry?.name ?? null,
    banttc_score: banttcScore(rest),
  };
}

function resolve(slug: string, user?: CrmUser): Doctype {
  const d = doctypeBySlug(slug);
  if (!d) throw new HttpError(404, `No such doctype: ${slug}`);
  // Some doctypes are for named eyes only. Enforced here, not just hidden.
  if (d.onlyFor && (!user || !d.onlyFor.includes(user.email)))
    throw new HttpError(403, `${d.plural} are not open to this account yet.`);
  return d;
}

/** A missing database is a setup step, not a crash. Say which step. */
function guardConfigured() {
  if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
}

/** Every link field needs something to choose from -- fetched once per load.
 *  A field may narrow its dropdown (linkFilter) -- the opportunity's stage
 *  list and the quotation's hotness list share one table. */
async function linkOptions(d: Doctype) {
  const db = crmDb();
  const links: Record<string, { id: string; label: string }[]> = {};
  for (const f of d.fields) {
    if (f.type !== "link" || !f.link) continue;
    const t = doctypeBySlug(f.link);
    if (!t) continue;
    let qy = db.from(t.table).select(t.name === "address" ? "id, label, line1, city" : `id, ${t.titleField}`);
    if (f.linkFilter) qy = qy.eq(f.linkFilter.column, f.linkFilter.value);
    // Only ACTIVE salespeople stand in the dropdowns — Settings → Users →
    // Active is the switch. Old rows keep their names via resolveRowLabels.
    if (f.link === "profile") qy = qy.eq("is_active", true);
    // Stages stand in Dr Raghu's order, not the alphabet's.
    const { data: rows } = await (f.link === "stage"
      ? qy.order("sort_order", { ascending: true })
      : qy.order(t.titleField, { ascending: true })).limit(1000);
    const list = (rows ?? []) as unknown as Record<string, unknown>[];
    links[f.link] = list.map((r) => ({
      id: String(r.id),
      label: t.name === "address"
        ? [r.label, r.line1, r.city].filter(Boolean).join(" · ") || String(r.id)
        : String(r[t.titleField] ?? r.id),
    }));
  }
  // Any doctype hanging off a company can be filtered by the customer's
  // industry — the filter bar needs the industry book to offer.
  if (!links.industry && d.fields.some((f) => f.name === "company_id")) {
    const { data: inds } = await db.from("industry")
      .select("id, name").order("name", { ascending: true }).limit(1000);
    links.industry = ((inds ?? []) as unknown as Record<string, unknown>[])
      .map((r) => ({ id: String(r.id), label: String(r.name ?? r.id) }));
  }
  return links;
}

/**
 * The dropdown caps at 1000 options, but 54k companies exist -- so the rows
 * on screen resolve their own labels: every linked id present in the result
 * set gets its real name fetched and merged in, and no cell ever shows a
 * bare uuid.
 */
async function resolveRowLabels(
  d: Doctype,
  rows: Record<string, unknown>[],
  links: Record<string, { id: string; label: string }[]>,
) {
  const db = crmDb();
  for (const f of d.fields) {
    if (f.type !== "link" || !f.link) continue;
    const t = doctypeBySlug(f.link);
    if (!t) continue;
    const have = new Set((links[f.link] ?? []).map((o) => o.id));
    const missing = [...new Set(rows.map((r) => r[f.name]).filter(Boolean).map(String))]
      .filter((id) => !have.has(id));
    if (!missing.length) continue;
    let list: Record<string, unknown>[] = [];
    const selCols = t.name === "address" ? "id, label, line1, city" : `id, ${t.titleField}`;
    if (missing.length > 3000) {
      // A big pull (10k/50k/All rows) — sweeping the whole target table in
      // pages beats thousands of IN() calls.
      for (let a = 0; ; a += 1000) {
        const { data } = await db.from(t.table).select(selCols).range(a, a + 999);
        const chunk = (data ?? []) as unknown as Record<string, unknown>[];
        list.push(...chunk);
        if (chunk.length < 1000) break;
      }
      const want = new Set(missing);
      list = list.filter((r) => want.has(String(r.id)));
    } else {
      for (let i = 0; i < missing.length; i += 150) {
        const { data } = await db.from(t.table).select(selCols).in("id", missing.slice(i, i + 150));
        list.push(...(data ?? []) as unknown as Record<string, unknown>[]);
      }
    }
    links[f.link] = [
      ...(links[f.link] ?? []),
      ...list.map((r) => ({
        id: String(r.id),
        label: t.name === "address"
          ? [r.label, r.line1, r.city].filter(Boolean).join(" · ") || String(r.id)
          : String(r[t.titleField] ?? r.id),
      })),
    ];
  }
  return links;
}

/** Flatten PostgREST's embedded counts into the virtual registry columns. */
function foldCompanyCounts(r: Record<string, unknown>): Record<string, unknown> {
  const n = (v: unknown) => (Array.isArray(v) && v[0] ? Number((v[0] as { count?: unknown }).count) || 0 : 0);
  const { opps, contacts, sos, ...rest } = r as Record<string, unknown> & {
    opps?: unknown; contacts?: unknown; sos?: unknown;
  };
  return { ...rest, opp_count: n(opps), contact_count: n(contacts), so_count: n(sos) };
}

/**
 * One field's value, checked and coerced the same way for POST and PATCH.
 */
function coerce(f: Field, v: unknown): unknown {
  if (v === "" || v === undefined) v = null;
  if (f.required && (v === null || v === false))
    throw new HttpError(400, `${f.label} is required`);
  if (v === null) return null;
  if (f.type === "number" || f.type === "money") {
    const n = Number(v);
    if (Number.isNaN(n)) throw new HttpError(400, `${f.label} must be a number`);
    return n;
  }
  if (f.type === "bool") return v === true || v === "true";
  if (f.type === "select" && f.options && !f.options.includes(String(v)))
    throw new HttpError(400, `${f.label} must be one of: ${f.options.join(", ")}`);
  if (f.type === "link") return String(v);
  return v;
}

/** Postgres speaks in constraint names. Say something a person can act on. */
function friendly(d: Doctype, error: { code?: string; message: string }): never {
  if (error.code === "23505") throw new HttpError(409, `That ${d.label.toLowerCase()} already exists.`);
  if (error.code === "23503") throw new HttpError(400, "One of the linked records no longer exists.");
  // P0001 is `raise exception` -- the stage trigger's lost-reason guard speaks here.
  if (error.code === "P0001") throw new HttpError(400, error.message);
  throw new HttpError(500, error.message);
}

export async function GET(req: Request, { params }: { params: { doctype: string } }) {
  try {
    const user = await requireCrm();
    const d = resolve(params.doctype, user);
    guardConfigured();
    const db = crmDb();
    const u = new URL(req.url);
    const isCompany = d.name === "company";
    const isOpp = d.name === "opportunity";

    // Filter by the CUSTOMER'S industry: an inner join through the company.
    const indFilter = u.searchParams.get("f_company_industry");
    const wantsInd = !!indFilter && !isCompany && d.fields.some((f) => f.name === "company_id");

    const select = isCompany ? COMPANY_SELECT
      : isOpp ? (wantsInd ? "*, company_join:company_id!inner(industry_id, industry:industry_id(name))" : OPP_SELECT)
      : wantsInd ? "*, company_join:company_id!inner(industry_id)" : "*";
    const fold = (r: Record<string, unknown>) => {
      if (isCompany) return foldCompanyCounts(r);
      if (isOpp) return foldOpportunity(r);
      if (wantsInd) { const { company_join, ...rest } = r; void company_join; return rest; }
      return r;
    };

    // ---- the type-along picker: a few names for what was typed -----------
    const pick = u.searchParams.get("pick");
    if (pick !== null) {
      // The picker honours the same f_ filters as the list — a contact
      // picker on an opportunity searches only that company's people.
      // the mail composer's To-picker needs the address beside the name
      let pq = db.from(d.table).select(d.name === "person" ? `id, ${d.titleField}, primary_email` : `id, ${d.titleField}`);
      if (["company", "person", "opportunity", "product"].includes(d.name)) pq = pq.is("deleted_at", null);
      for (const f of d.fields) {
        if (f.virtual) continue;
        const v = u.searchParams.get(`f_${f.name}`);
        if (v === null || v === "") continue;
        pq = f.type === "bool" ? pq.eq(f.name, v === "true")
          : v.includes(",") ? pq.in(f.name, v.split(","))
          : pq.eq(f.name, v);
      }
      const { data, error } = await pq
        .ilike(d.titleField, `%${pick.trim().replace(/[%_]/g, "\\$&")}%`)
        .order(d.titleField, { ascending: true })
        .limit(20);
      if (error) throw new HttpError(500, error.message);
      const list = (data ?? []) as unknown as Record<string, unknown>[];
      return NextResponse.json({
        options: list.map((r) => ({
          id: String(r.id),
          label: String(r[d.titleField] ?? r.id),
          ...(r.primary_email ? { email: String(r.primary_email) } : {}),
        })),
      });
    }

    // ---- one record, for the lightbox ------------------------------------
    const id = u.searchParams.get("id");
    if (id) {
      const { data, error } = await db.from(d.table)
        .select(select).eq("id", id).maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, `That ${d.label.toLowerCase()} no longer exists.`);
      const row = fold(data as unknown as Record<string, unknown>);
      const links = await resolveRowLabels(d, [row as Record<string, unknown>], await linkOptions(d));
      return NextResponse.json({ doctype: d, row, links });
    }

    // ---- group-by: aggregate the WHOLE filtered set ----------------------
    // ?groupby=owner_id — same f_ filters and search as the list, but the
    // route walks every matching row and hands back counts (and the money
    // sum) per group, biggest first. The screen never holds the rows.
    const groupby = u.searchParams.get("groupby");
    if (groupby) {
      const gf = d.fields.find((f) => f.name === groupby && !f.virtual && f.type !== "readonly");
      // Industry on an opportunity is the COMPANY's industry — grouped
      // through the join, like the filter does it.
      const viaCompany = !gf && groupby === "company_industry" && d.fields.some((f) => f.name === "company_id");
      if (!gf && !viaCompany) throw new HttpError(400, "Cannot group by that field.");
      const moneyField = d.fields.find((f) => f.type === "money")?.name
        ?? d.fields.find((f) => f.type === "readonly" && f.format === "money")?.name ?? null;
      const joinNeeded = wantsInd || viaCompany;
      const aggSelect = [viaCompany ? null : groupby, moneyField].filter(Boolean).join(", ")
        + (joinNeeded ? `${moneyField || !viaCompany ? ", " : ""}company_join:company_id!inner(industry_id)` : "");
      const buildAgg = () => {
        let qy = db.from(d.table).select(aggSelect);
        if (["company", "person", "opportunity", "product"].includes(d.name)) qy = qy.is("deleted_at", null);
        if (wantsInd) qy = (String(indFilter).includes(",") ? qy.in("company_join.industry_id", String(indFilter).split(",")) : qy.eq("company_join.industry_id", indFilter));
        for (const f of d.fields) {
          if (f.virtual) continue;
          const v = u.searchParams.get(`f_${f.name}`);
          if (v === null || v === "") continue;
          qy = f.type === "bool" ? qy.eq(f.name, v === "true")
          : v.includes(",") ? qy.in(f.name, v.split(","))
          : qy.eq(f.name, v);
        }
        const q = u.searchParams.get("q")?.trim();
        if (q) qy = qy.ilike(d.titleField, `%${q.replace(/[%_]/g, "\\$&")}%`);
        return qy;
      };
      const agg = new Map<string, { count: number; sum: number }>();
      let scanned = 0;
      for (let a = 0; a < 200000; a += 1000) {
        const { data, error } = await buildAgg().range(a, a + 999);
        if (error) throw new HttpError(500, error.message);
        const chunk = (data ?? []) as unknown as Record<string, unknown>[];
        for (const r of chunk) {
          const raw = viaCompany
            ? (r.company_join as { industry_id?: unknown } | null)?.industry_id
            : r[groupby];
          const key = raw === null || raw === undefined || raw === "" ? "" : String(raw);
          const cur = agg.get(key) ?? { count: 0, sum: 0 };
          cur.count += 1;
          if (moneyField) cur.sum += Number(r[moneyField]) || 0;
          agg.set(key, cur);
        }
        scanned += chunk.length;
        if (chunk.length < 1000) break;
      }
      // names for link keys — fetched by id, so inactive owners keep theirs
      const labels = new Map<string, string>();
      if (viaCompany || (gf?.type === "link" && gf.link)) {
        const t = doctypeBySlug(viaCompany ? "industry" : (gf!.link as string));
        const ids = [...agg.keys()].filter(Boolean);
        if (t) for (let i = 0; i < ids.length; i += 150) {
          const { data: ls } = await db.from(t.table).select(`id, ${t.titleField}`).in("id", ids.slice(i, i + 150));
          for (const r of (ls ?? []) as unknown as Record<string, unknown>[]) labels.set(String(r.id), String(r[t.titleField] ?? r.id));
        }
      }
      const groups = [...agg.entries()]
        .map(([key, v]) => ({ key, label: key === "" ? "Not set" : labels.get(key) ?? key, count: v.count, sum: v.sum }))
        .sort((a, b) => b.count - a.count);
      return NextResponse.json({
        field: viaCompany ? "Industry" : gf!.label, hasMoney: !!moneyField, total: scanned,
        sumTotal: groups.reduce((a, g) => a + g.sum, 0), groups,
      });
    }

    // ---- the list: filters, search and sort run in Postgres --------------
    // 100 | 500 | 2500 | 10000 | 50000 | all — the footer's choices; the
    // route pages internally past PostgREST's 1000-row ceiling, and offset
    // powers Show More.
    const SIZES = [100, 500, 2500, 10000, 50000];
    const limitRaw = u.searchParams.get("limit");
    const limit = limitRaw === "all" ? Number.MAX_SAFE_INTEGER
      : SIZES.includes(Number(limitRaw)) ? Number(limitRaw) : 500;
    const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);

    // ?tag=NAME — the tag filter (Dr Raghu, 28 Aug 2026): an exact existing
    // name opens every record carrying it, whoever owns the tag.
    let tagIds: string[] | null = null;
    const tagQ = u.searchParams.get("tag")?.trim();
    if (tagQ && ["company", "person", "opportunity", "quotation", "sales_order", "lead"].includes(d.name)) {
      const { data: tags } = await db.from("crm_tag").select("id").ilike("name", tagQ);
      const ids: string[] = [];
      if (tags?.length) {
        for (let a = 0; ; a += 1000) {
          const { data: links } = await db.from("crm_tag_link").select("entity_id")
            .in("tag_id", tags.map((t) => t.id)).eq("entity", d.name).order("id").range(a, a + 999);
          ids.push(...(links || []).map((l) => String(l.entity_id)));
          if (!links || links.length < 1000) break;
        }
      }
      tagIds = [...new Set(ids)];
    }

    const buildList = (withCount: boolean) => {
      let qy = db.from(d.table).select(select, withCount ? { count: "exact" as const } : undefined);
      // Merged and soft-deleted rows stay in the ledger, not on the screens.
      if (["company", "person", "opportunity", "product"].includes(d.name)) qy = qy.is("deleted_at", null);
      if (tagIds) qy = qy.in("id", tagIds.length ? tagIds.slice(0, 2000) : ["00000000-0000-0000-0000-000000000000"]);
      if (wantsInd) qy = (String(indFilter).includes(",") ? qy.in("company_join.industry_id", String(indFilter).split(",")) : qy.eq("company_join.industry_id", indFilter));
      for (const f of d.fields) {
        if (f.virtual) continue;
        const v = u.searchParams.get(`f_${f.name}`);
        if (v !== null && v !== "") {
          qy = f.type === "bool" ? qy.eq(f.name, v === "true")
            : v.includes(",") ? qy.in(f.name, v.split(","))
            : qy.eq(f.name, v);
        }
        // the date views (Dr Raghu, 28 Aug 2026): any date field takes a
        // range — the client's presets (YTD, This Quarter, Last FY…) all
        // land here as plain gte/lte.
        if (f.type === "date") {
          const g = u.searchParams.get(`f_${f.name}_gte`);
          const l = u.searchParams.get(`f_${f.name}_lte`);
          if (g) qy = qy.gte(f.name, g);
          if (l) qy = qy.lte(f.name, l);
        }
      }
      {
        const g = u.searchParams.get("f_created_at_gte");
        const l = u.searchParams.get("f_created_at_lte");
        if (g) qy = qy.gte("created_at", g);
        if (l) qy = qy.lte("created_at", l + "T23:59:59");
      }
      const q = u.searchParams.get("q")?.trim();
      if (q) qy = qy.ilike(d.titleField, `%${q.replace(/[%_]/g, "\\$&")}%`);

      const sortCol = u.searchParams.get("sort");
      const sortOk = !!sortCol && (sortCol === "created_at"
        || d.fields.some((f) => f.name === sortCol && !f.virtual));
      const order = sortOk
        ? { column: sortCol as string, ascending: u.searchParams.get("dir") !== "desc" }
        : (d.orderBy ?? { column: "created_at", ascending: false });
      // nullsFirst:false — undated rows must not float above today's work
      return qy.order(order.column, { ascending: order.ascending, nullsFirst: false });
    };

    const collected: Record<string, unknown>[] = [];
    let count: number | null = null;
    for (let a = offset; collected.length < limit; a += 1000) {
      const want = Math.min(1000, limit - collected.length);
      const { data, error, count: c } = await buildList(a === offset)
        .range(a, a + want - 1);
      if (error) throw new HttpError(500, error.message);
      if (a === offset) count = c ?? null;
      const chunk = (data ?? []) as unknown as Record<string, unknown>[];
      collected.push(...chunk);
      if (chunk.length < want) break;
    }

    const rows = collected.map(fold);

    const links = await resolveRowLabels(
      d, rows as unknown as Record<string, unknown>[], await linkOptions(d),
    );
    return NextResponse.json({ doctype: d, rows, total: count ?? rows.length, links });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request, { params }: { params: { doctype: string } }) {
  try {
    const user = await requireCrm();
    const d = resolve(params.doctype, user);
    guardConfigured();
    const db = crmDb();

    const body = (await req.json()) as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const f of d.fields) {
      if (f.type === "readonly" || f.virtual) continue;   // the database fills these
      row[f.name] = coerce(f, body[f.name]);
      // a missing tick is FALSE, never null — NOT NULL booleans survive any client
      if (f.type === "bool" && (row[f.name] === null || row[f.name] === undefined))
        row[f.name] = f.default === true;
    }

    // An opportunity is born NEW unless the form says otherwise.
    if (d.name === "opportunity" && !row.stage_id) {
      const { data: st } = await db.from("stage").select("id").eq("code", "new").maybeSingle();
      if (st) row.stage_id = st.id;
    }
    // A quote line survives ANY client: the NOT NULL columns get their
    // defaults server-side, whatever an old cached tab failed to send.
    if (d.name === "quotation_line") {
      if (row.unit_cost === null || row.unit_cost === undefined) row.unit_cost = 0;
      if (row.discount_pct === null || row.discount_pct === undefined) row.discount_pct = 0;
      if (row.gst_rate === null || row.gst_rate === undefined) row.gst_rate = 18;
      if (row.is_optional === null || row.is_optional === undefined) row.is_optional = false;
      if (!(Number(row.quantity) > 0)) row.quantity = 1;
      if (row.unit_price === null || row.unit_price === undefined) row.unit_price = 0;
      if (!row.uom) row.uom = "Nos";
    }

    // A quotation is born DRAFT until it is sent (Dr Raghu, 30 Aug 2026).
    if (d.name === "quotation" && !row.stage_id) {
      const { data: st } = await db.from("stage").select("id").eq("code", "q_draft").maybeSingle();
      if (st) row.stage_id = st.id;
    }

    // Human-facing numbers come from the database, never from counting rows —
    // unless the form carries one already (an ERP import keeps its number).
    if (d.autoNumber && !String(row[d.autoNumber.field] ?? "").trim()) {
      const { data: n, error: nerr } = await db.rpc("next_number", { p_code: d.autoNumber.series });
      if (nerr) throw new HttpError(500, `Could not issue a number: ${nerr.message}`);
      row[d.autoNumber.field] = n;
    }
    stampCreatedBy(d, row, user);

    const { data, error } = await db.from(d.table).insert(row).select().single();
    if (error) friendly(d, error);

    await db.from("crm_audit").insert({
      entity: d.table, entity_id: String(data.id), action: "insert",
      after: data, by_user: user.profileId,
    });

    // Speaking with the customer moves a NEW opportunity to Handled by itself.
    if (d.name === "interaction" && data.opportunity_id) {
      await advanceNewToHandled(db, String(data.opportunity_id));
    }

    return NextResponse.json({ row: data });
  } catch (e) {
    return errJson(e);
  }
}

// DELETE /api/crm/profile?id= — Users only, the admin's pen only. Everything
// else in the CRM retires (deleted_at) rather than vanishing; a user who
// owns records is refused with the honest alternative: deactivate.
export async function DELETE(req: Request, { params }: { params: { doctype: string } }) {
  try {
    const user = await requireCrm();
    const d = resolve(params.doctype, user);
    guardConfigured();
    if (d.name !== "profile")
      throw new HttpError(400, "Delete is only for Users — other records retire, they do not vanish.");
    if (!(["admin", "ceo"].includes(user.crmRole) || user.email === "raghu@nandan.co.in"))
      throw new HttpError(403, "Deleting users is the admin's pen.");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Which user? DELETE needs ?id=");
    if (user.profileId === id) throw new HttpError(400, "You cannot delete yourself.");
    const db = crmDb();
    const { data: before } = await db.from("profile").select("*").eq("id", id).maybeSingle();
    if (!before) throw new HttpError(404, "That user no longer exists.");
    const { error } = await db.from("profile").delete().eq("id", id);
    if (error) {
      throw new HttpError(409, /foreign key|violates/i.test(error.message)
        ? `${before.full_name} owns records — opportunities, mails or interactions point at them. Deactivate instead of deleting.`
        : error.message);
    }
    await db.from("crm_audit").insert({
      entity: "profile", entity_id: id, action: "delete",
      before, by_user: user.profileId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { doctype: string } }) {
  try {
    const user = await requireCrm();
    const d = resolve(params.doctype, user);
    guardConfigured();
    const db = crmDb();

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Which record? PATCH needs ?id=");

    const body = (await req.json()) as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    // Only the fields the browser actually sent -- a partial edit must not
    // blank the columns the form did not show.
    for (const f of d.fields) {
      if (f.type === "readonly" || f.virtual || !(f.name in body)) continue;
      row[f.name] = coerce(f, body[f.name]);
    }
    // the quote's To and CC (Dr Raghu, 30 Aug 2026) — arrays of person ids,
    // no doctype field of their own so they pass through here
    if (d.name === "quotation") {
      for (const k of ["mail_to", "mail_cc", "mail_bcc"] as const)
        if (Array.isArray(body[k])) row[k] = (body[k] as unknown[]).map(String).slice(0, 200);
      // the Quote items desk's own knobs — tax scheme, currency, decimals,
      // the signature line, the header discount
      if (typeof body.tax_id === "string") row.tax_id = body.tax_id || null;
      if (typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency)) row.currency = body.currency;
      if (typeof body.show_decimals === "boolean") row.show_decimals = body.show_decimals;
      if (typeof body.authorized_by === "string") row.authorized_by = body.authorized_by.slice(0, 160);
      if (typeof body.situational_details === "string") row.situational_details = body.situational_details;
      if (typeof body.subject === "string") row.subject = body.subject.slice(0, 300);
      for (const k of ["terms_template", "terms_text", "letter_template", "letter_text",
        "cover_template", "cover_text", "back_template", "back_text", "about_template", "about_text"] as const)
        if (typeof body[k] === "string") row[k] = body[k];
      if (Array.isArray(body.print_sections))
        row.print_sections = (body.print_sections as unknown[]).map(String).slice(0, 10);
      if (body.discount_pct !== undefined && body.discount_pct !== null && body.discount_pct !== "")
        row.discount_pct = Number(body.discount_pct) || 0;
    }
    // a quote line's own dress — rich description and image carried in specs,
    // edited on the QUOTE alone, never written back to the product master
    if (d.name === "quotation_line" && body.specs && typeof body.specs === "object" && !Array.isArray(body.specs))
      row.specs = body.specs;
    if (!Object.keys(row).length) throw new HttpError(400, "Nothing to update.");

    const { data: before, error: berr } = await db.from(d.table).select("*").eq("id", id).maybeSingle();
    if (berr) throw new HttpError(500, berr.message);
    if (!before) throw new HttpError(404, `That ${d.label.toLowerCase()} no longer exists.`);

    // ---- industry merge-on-rename ---------------------------------------
    // Renaming an industry onto a name that already exists is a MERGE:
    // every company holding the old industry is repointed to the survivor,
    // the duplicate row goes away, and the survivor is returned.
    if (d.name === "industry" && typeof row.name === "string" && row.name !== before.name) {
      const { data: hit } = await db.from("industry")
        .select("*").ilike("name", row.name).neq("id", id).maybeSingle();
      if (hit) {
        const { error: moveErr } = await db.from("company")
          .update({ industry_id: hit.id }).eq("industry_id", Number(id));
        if (moveErr) throw new HttpError(500, moveErr.message);
        const { error: delErr } = await db.from("industry").delete().eq("id", id);
        if (delErr) throw new HttpError(500, delErr.message);
        await db.from("crm_audit").insert({
          entity: "industry", entity_id: String(id), action: "merge",
          before, after: hit, by_user: user.profileId,
        });
        return NextResponse.json({ row: hit, merged: true });
      }
    }

    const { data, error } = await db.from(d.table).update(row).eq("id", id).select().single();
    if (error) friendly(d, error);

    await db.from("crm_audit").insert({
      entity: d.table, entity_id: String(id), action: "update",
      before, after: data, by_user: user.profileId,
    });

    return NextResponse.json({ row: data });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * The CRM's own profile id, never the Genie auth id -- the two look alike
 * and point at different people (docs/DATABASE-SPLIT.md).
 */
function stampCreatedBy(d: Doctype, row: Record<string, unknown>, user: CrmUser) {
  if (d.fields.some((f) => f.name === "created_by")
    || ["company", "person", "opportunity", "task", "quotation", "sales_order", "interaction"].includes(d.name))
    row.created_by = user.profileId;
}
