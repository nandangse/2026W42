/**
 * ONE ROUTE FOR EVERY DOCTYPE.
 *
 *   GET  /api/crm/<doctype>  -- the rows, plus the options every link field needs
 *   POST /api/crm/<doctype>  -- add a record
 *
 * Written once so that adding a doctype cannot leave it without a way to add
 * records. The registry in src/crm/doctypes.ts is the only thing that changes.
 *
 * Validation is server-side and works off the same registry the form does, so
 * the two cannot drift: a required field is required here whatever the browser
 * was persuaded to send, and a column nobody declared is dropped rather than
 * written.
 */
import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { doctypeBySlug, linkTargets, type Doctype } from "@/crm/doctypes";

export const dynamic = "force-dynamic";

function resolve(slug: string): Doctype {
  const d = doctypeBySlug(slug);
  if (!d) throw new HttpError(404, `No such doctype: ${slug}`);
  return d;
}

/** A missing database is a setup step, not a crash. Say which step. */
function guardConfigured() {
  if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
}

export async function GET(_req: Request, { params }: { params: { doctype: string } }) {
  try {
    await requireCrm();
    const d = resolve(params.doctype);
    guardConfigured();
    const db = crmDb();

    const order = d.orderBy ?? { column: "created_at", ascending: false };
    const { data, error } = await db
      .from(d.table)
      .select("*")
      .order(order.column, { ascending: order.ascending })
      .limit(500);
    if (error) throw new HttpError(500, error.message);

    // Every link field needs something to choose from. Fetched here rather
    // than one request per dropdown from the browser.
    const links: Record<string, { id: string; label: string }[]> = {};
    for (const target of linkTargets(d)) {
      const t = doctypeBySlug(target);
      if (!t) continue;
      const { data: rows } = await db
        .from(t.table)
        .select(`id, ${t.titleField}`)
        .limit(1000);
      // The column list is built at runtime, so supabase-js cannot infer a row
      // type for it. The shape is known -- an id and one title column.
      const list = (rows ?? []) as unknown as Record<string, unknown>[];
      links[target] = list.map((r) => ({
        id: String(r.id),
        label: String(r[t.titleField] ?? r.id),
      }));
    }

    return NextResponse.json({ doctype: d, rows: data ?? [], links });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request, { params }: { params: { doctype: string } }) {
  try {
    const user = await requireCrm();
    const d = resolve(params.doctype);
    guardConfigured();
    const db = crmDb();

    const body = (await req.json()) as Record<string, unknown>;
    const row: Record<string, unknown> = {};

    for (const f of d.fields) {
      let v = body[f.name];

      // An empty box is an absent value, not an empty string -- otherwise a
      // blank link field becomes "" and the foreign key blows up.
      if (v === "" || v === undefined) v = null;

      if (f.required && (v === null || v === false))
        throw new HttpError(400, `${f.label} is required`);

      if (v !== null) {
        if (f.type === "number" || f.type === "money") {
          const n = Number(v);
          if (Number.isNaN(n)) throw new HttpError(400, `${f.label} must be a number`);
          v = n;
        } else if (f.type === "bool") {
          v = v === true || v === "true";
        } else if (f.type === "select" && f.options && !f.options.includes(String(v))) {
          throw new HttpError(400, `${f.label} must be one of: ${f.options.join(", ")}`);
        } else if (f.type === "link") {
          v = String(v);
        }
      }
      row[f.name] = v;
    }

    // Human-facing numbers come from the database, never from counting rows.
    if (d.autoNumber) {
      const { data: n, error: nerr } = await db.rpc("next_number", { p_code: d.autoNumber.series });
      if (nerr) throw new HttpError(500, `Could not issue a number: ${nerr.message}`);
      row[d.autoNumber.field] = n;
    }
    if (d.fields.some((f) => f.name === "created_by") || ["customer", "contact", "deal"].includes(d.name))
      row.created_by = user.id;

    const { data, error } = await db.from(d.table).insert(row).select().single();
    if (error) {
      // Postgres speaks in constraint names. Say something a person can act on.
      if (error.code === "23505") throw new HttpError(409, `That ${d.label.toLowerCase()} already exists.`);
      if (error.code === "23503") throw new HttpError(400, "One of the linked records no longer exists.");
      throw new HttpError(500, error.message);
    }

    await db.from("crm_audit").insert({
      entity: d.table, entity_id: String(data.id), action: "insert",
      after: data, by_user: user.id,
    });

    return NextResponse.json({ row: data });
  } catch (e) {
    return errJson(e);
  }
}
