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
    let qy = db.from(t.table).select(`id, ${t.titleField}`);
    if (f.linkFilter) qy = qy.eq(f.linkFilter.column, f.linkFilter.value);
    const { data: rows } = await qy.order(t.titleField, { ascending: true }).limit(1000);
    const list = (rows ?? []) as unknown as Record<string, unknown>[];
    links[f.link] = list.map((r) => ({
      id: String(r.id),
      label: String(r[t.titleField] ?? r.id),
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
    const { data } = await db.from(t.table).select(`id, ${t.titleField}`).in("id", missing);
    const list = (data ?? []) as unknown as Record<string, unknown>[];
    links[f.link] = [
      ...(links[f.link] ?? []),
      ...list.map((r) => ({ id: String(r.id), label: String(r[t.titleField] ?? r.id) })),
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
      const { data, error } = await db.from(d.table)
        .select(`id, ${d.titleField}`)
        .ilike(d.titleField, `%${pick.trim().replace(/[%_]/g, "\\$&")}%`)
        .order(d.titleField, { ascending: true })
        .limit(20);
      if (error) throw new HttpError(500, error.message);
      const list = (data ?? []) as unknown as Record<string, unknown>[];
      return NextResponse.json({
        options: list.map((r) => ({ id: String(r.id), label: String(r[d.titleField] ?? r.id) })),
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

    // ---- the list: filters, search and sort run in Postgres --------------
    let qy = db.from(d.table).select(select, { count: "exact" });
    if (wantsInd) qy = qy.eq("company_join.industry_id", indFilter);
    for (const f of d.fields) {
      if (f.virtual) continue;
      const v = u.searchParams.get(`f_${f.name}`);
      if (v === null || v === "") continue;
      qy = f.type === "bool" ? qy.eq(f.name, v === "true") : qy.eq(f.name, v);
    }
    const q = u.searchParams.get("q")?.trim();
    if (q) qy = qy.ilike(d.titleField, `%${q.replace(/[%_]/g, "\\$&")}%`);

    const sortCol = u.searchParams.get("sort");
    const sortOk = !!sortCol && (sortCol === "created_at"
      || d.fields.some((f) => f.name === sortCol && !f.virtual));
    const order = sortOk
      ? { column: sortCol as string, ascending: u.searchParams.get("dir") !== "desc" }
      : (d.orderBy ?? { column: "created_at", ascending: false });

    const { data, error, count } = await qy
      .order(order.column, { ascending: order.ascending })
      .limit(500);
    if (error) throw new HttpError(500, error.message);

    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(fold);

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
    }

    // Human-facing numbers come from the database, never from counting rows.
    if (d.autoNumber) {
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

    return NextResponse.json({ row: data });
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
