import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";

export const dynamic = "force-dynamic";

/**
 * Saamaan's registers (Dr Raghu, 2 Sep 2026) — one route, two kinds to
 * start: the materials master and the masters that feed every dropdown.
 * The Seva register pattern, worn by the store. Every table here is a
 * `material_` table; that prefix is the module's boundary in the one
 * database.
 */
const KINDS: Record<string, { table: string; fields: string[]; order: string; desc?: boolean }> = {
  item: {
    table: "material_item", order: "name",
    fields: ["code", "name", "category", "unit", "store", "min_stock", "rate", "hsn", "notes", "active"],
  },
  master: { table: "material_master", order: "sort_order", fields: ["kind", "label", "sort_order"] },
};

/** The empty string means "nobody has said" on these columns — NULL, not 0. */
const NULLABLE = /^(min_stock|rate|code)$/;

const spec = (kind: string) => {
  const k = KINDS[kind];
  if (!k) throw new HttpError(400, "Unknown register.");
  return k;
};

const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

/** GET ?kind=item — the register, and the masters riding along for pickers. */
export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const kind = String(new URL(req.url).searchParams.get("kind") || "");
    const k = spec(kind);
    const { data, error } = await admin
      .from(k.table).select("*")
      .order(k.order, { ascending: !k.desc, nullsFirst: false })
      .limit(5000);
    if (error) {
      if (notInstalled(error.message))
        return NextResponse.json({ installed: false, rows: [], masters: [] });
      throw new Error(error.message);
    }
    // The masters ride on every answer — every screen needs its dropdowns.
    let masters: { id: string; kind: string; label: string; sort_order: number }[] = [];
    if (kind !== "master") {
      const { data: m } = await admin.from("material_master").select("id, kind, label, sort_order").order("sort_order");
      masters = m || [];
    }
    return NextResponse.json({ installed: true, rows: data || [], masters });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { kind, action: add|update|delete, id?, row? } */
export async function POST(req: Request) {
  try {
    const user = await requireSaamaan();
    const body = await req.json();
    const k = spec(String(body.kind || ""));
    const admin = adminClient();

    if (body.action === "delete") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const pick = (src: Record<string, unknown>) => {
      const row: Record<string, unknown> = {};
      for (const f of k.fields) {
        if (src && f in src) {
          const v = src[f];
          row[f] = (v === "" || v === null) && NULLABLE.test(f) ? null : typeof v === "string" ? v.trim() : v;
        }
      }
      return row;
    };

    const row = pick(body.row || {});
    if (body.kind === "item" && "name" in row && !String(row.name || "").trim())
      throw new HttpError(400, "An item needs a name.");
    if (body.kind === "master" && "label" in row && !String(row.label || "").trim())
      throw new HttpError(400, "A master needs a label.");

    const explain = (m: string): never => {
      if (notInstalled(m))
        throw new HttpError(503, "Run migration 0117 first — Saamaan's tables don't exist yet.");
      if (/duplicate|unique/i.test(m))
        throw new HttpError(400, "That entry already exists — the code or the label is taken.");
      throw new Error(m);
    };

    if (body.action === "add") {
      const { error } = await admin.from(k.table).insert({ ...row, by: user.email });
      if (error) explain(error.message);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).update(row).eq("id", body.id);
      if (error) explain(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
