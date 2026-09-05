import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * The register engine.
 *
 * One engine, many registers (design §1). Risk, HIRA, Aspect–Impact, Legal,
 * the Statement of Applicability — and every register still to come: PPE
 * issue, work permits, calibration, hazardous waste, the statutory equipment
 * tests. The MR defines the columns; this route renders, validates and stores
 * them. Adding a register is DATA, not a deploy.
 *
 * The columns definition is the contract. A value whose key is not in
 * `columns` is dropped rather than stored: a JSONB blob that accepts anything
 * is a JSONB blob nobody can report on a year later.
 */
type Column = {
  key: string; label: string; type: string; options?: string[]; required?: boolean;
  /** Multiply the leading numbers of these columns ("4 - Very High" counts 4). */
  product?: string[];
  /** Band the named number: 1-4 Low, 5-9 Medium, 10-15 High, 16+ Extreme. */
  level_of?: string;
};

const lead = (v: unknown): number | null => {
  const m = String(v ?? "").match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
const band = (n: number) => (n <= 4 ? "Low" : n <= 9 ? "Medium" : n <= 15 ? "High" : "Extreme");

/**
 * The computed columns are worked out here, never trusted from the client:
 * inherent risk is impact x probability whatever the form sent.
 */
function derive(columns: Column[], data: Record<string, unknown>) {
  for (const c of columns) {
    if (c.product?.length) {
      const parts = c.product.map((k) => lead(data[k]));
      data[c.key] = parts.every((n) => n !== null) ? parts.reduce((a, n) => a * (n as number), 1) : null;
    }
  }
  for (const c of columns) {
    if (c.level_of) {
      const n = lead(data[c.level_of]);
      data[c.key] = n === null ? null : band(n);
    }
  }
}

/** Coerce one value to its declared type. A date column never holds "". */
function coerce(col: Column, v: unknown): unknown {
  if (v === "" || v === undefined || v === null) return col.type === "bool" ? null : null;
  switch (col.type) {
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return v === true || v === "true" || v === "yes";
    case "date":
      return String(v).slice(0, 10);
    default:
      return String(v);
  }
}

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const db = imsDb();

    if (!slug) {
      const { data, error } = await db
        .from("ims_register_definition").select("*").order("sort_order");
      if (error) {
        if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
        throw new Error(error.message);
      }
      return NextResponse.json({ installed: true, rows: data ?? [], canDefine: me.imsRole === "ims_admin" });
    }

    const { data: def, error } = await db
      .from("ims_register_definition").select("*").eq("slug", slug).maybeSingle();
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false });
      throw new Error(error.message);
    }
    if (!def) throw new HttpError(404, "No such register.");

    const { data: entries } = await db
      .from("ims_register_entry")
      .select("*")
      .eq("register_id", def.id)
      .order("created_at", { ascending: true })
      .limit(5000);

    return NextResponse.json({
      installed: true,
      definition: def,
      entries: entries ?? [],
      canDefine: me.imsRole === "ims_admin",
      canEnter: true,
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action, ... }
 *   entry_add | entry_update | entry_delete  — anybody admitted may record
 *   define_add | define_update              — the MR alone
 *   define_delete                           — the MR, and never a system one
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await req.json();
    const action = String(body.action || "");
    const db = imsDb();

    // ------------------------------------------------------ the definitions
    if (action.startsWith("define_")) {
      await requireImsAdmin();

      if (action === "define_delete") {
        need(body.id, "id required");
        const { data: def } = await db
          .from("ims_register_definition").select("is_system, name").eq("id", body.id).maybeSingle();
        // A seeded register may be EDITED but never removed. An auditor asking
        // for the HIRA must not be told somebody deleted it.
        if (def?.is_system)
          throw new HttpError(409, `${def.name} is a system register — its columns can be edited, but it cannot be deleted.`);
        const { error } = await db.from("ims_register_definition").delete().eq("id", body.id);
        if (error) throw new Error(error.message);
        await log(me, "ims_register_definition", String(body.id), "delete");
        return ok();
      }

      const row = body.row ?? {};
      const columns = Array.isArray(row.columns) ? (row.columns as Column[]) : [];
      need(String(row.name || "").trim(), "A register needs a name.");
      need(columns.length > 0, "A register needs at least one column.");
      for (const c of columns) need(c.key && c.label && c.type, "Every column needs a key, a label and a type.");

      const payload = {
        name: String(row.name).trim(),
        sys: row.sys || null,
        description: String(row.description || ""),
        columns,
        clause_refs: Array.isArray(row.clause_refs) ? row.clause_refs : [],
      };

      if (action === "define_add") {
        const slug = String(row.slug || row.name)
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const { data, error } = await db
          .from("ims_register_definition")
          .insert({ ...payload, slug, created_by: me.email })
          .select("id, slug")
          .maybeSingle();
        if (error) {
          if (/duplicate key/i.test(error.message)) throw new HttpError(409, "A register with that name already exists.");
          throw new Error(error.message);
        }
        await log(me, "ims_register_definition", data?.id ?? null, "add", { name: payload.name });
        return ok({ id: data?.id, slug: data?.slug });
      }

      need(body.id, "id required");
      const { error } = await db.from("ims_register_definition").update(payload).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_register_definition", String(body.id), "update");
      return ok();
    }

    // ----------------------------------------------------------- the entries
    need(body.register_id || body.id, "register_id required");

    if (action === "entry_delete") {
      // A register entry is a record. Heads and the MR remove; a member who
      // could delete rows could delete the risk somebody raised about them.
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may delete a register entry.");
      need(body.id, "id required");
      const { error } = await db.from("ims_register_entry").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_register_entry", String(body.id), "delete");
      return ok();
    }

    const registerId = String(body.register_id || "");
    const { data: def } = await db
      .from("ims_register_definition").select("id, columns, name").eq("id", registerId).maybeSingle();
    if (!def) throw new HttpError(404, "No such register.");
    const columns = (def.columns as Column[]) ?? [];

    // Only declared keys survive. Anything else the client sent is dropped.
    const data: Record<string, unknown> = {};
    const src = (body.data ?? {}) as Record<string, unknown>;
    for (const c of columns) data[c.key] = coerce(c, src[c.key]);
    derive(columns, data);
    for (const c of columns)
      if (c.required && (data[c.key] === null || data[c.key] === ""))
        throw new HttpError(400, `${c.label} is required.`);

    if (action === "entry_add") {
      const { data: made, error } = await db
        .from("ims_register_entry")
        .insert({
          register_id: registerId,
          data,
          status: String(body.status || "open"),
          owner_id: body.owner_id || null,
          review_date: body.review_date || null,
          created_by: me.email,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "ims_register_entry", made?.id ?? null, "add", { register: def.name });
      return ok({ id: made?.id });
    }

    if (action === "entry_update") {
      need(body.id, "id required");
      const { error } = await db
        .from("ims_register_entry")
        .update({
          data,
          status: String(body.status || "open"),
          owner_id: body.owner_id || null,
          review_date: body.review_date || null,
          updated_by: me.email,
        })
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_register_entry", String(body.id), "update", { register: def.name });
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
