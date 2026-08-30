import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSeva } from "@/lib/seva";

export const dynamic = "force-dynamic";

/**
 * Seva's registers (Dr Raghu, 30 Aug 2026) — one route, three kinds:
 * the issues, the annual-maintenance contracts, and the masters that feed
 * every dropdown. The Vishwakarma register pattern, worn by service.
 */
const KINDS: Record<string, { table: string; fields: string[]; order: string; desc?: boolean }> = {
  issue: { table: "seva_issue", order: "at", desc: true, fields: ["title", "customer", "machine", "serial_no", "category", "reported_via", "status", "owner", "due", "description", "resolution", "resolved_at"] },
  amc: { table: "seva_amc", order: "end_date", fields: ["customer", "machine", "serial_no", "contract_no", "location", "start_date", "end_date", "visits_planned", "visits_done", "value", "engineer", "status", "notes", "territory", "billed"] },
  master: { table: "seva_master", order: "sort_order", fields: ["kind", "label", "sort_order"] },
};

/** The empty string means "no date / no number" on these columns. */
const NULLABLE = /^(due|resolved_at|start_date|end_date|visits_planned|visits_done|value|billed)$/;

const spec = (kind: string) => {
  const k = KINDS[kind];
  if (!k) throw new HttpError(400, "Unknown register.");
  return k;
};

/** GET ?kind=issue — the register, and the masters riding along for pickers. */
export async function GET(req: Request) {
  try {
    await requireSeva();
    const admin = adminClient();
    const kind = String(new URL(req.url).searchParams.get("kind") || "");
    const k = spec(kind);
    const { data, error } = await admin
      .from(k.table).select("*")
      .order(k.order, { ascending: !k.desc, nullsFirst: false })
      .limit(2000);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ installed: false, rows: [], masters: [] });
      throw new Error(error.message);
    }
    // The masters ride on every answer — every screen needs its dropdowns.
    let masters: { id: string; kind: string; label: string; sort_order: number }[] = [];
    if (kind !== "master") {
      const { data: m } = await admin.from("seva_master").select("id, kind, label, sort_order").order("sort_order");
      masters = m || [];
    }
    return NextResponse.json({ installed: true, rows: data || [], masters });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { kind, action: add|update|delete|import, id?, row?, rows? } */
export async function POST(req: Request) {
  try {
    const user = await requireSeva();
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
          row[f] = v === "" && NULLABLE.test(f) ? null : v;
        }
      }
      return row;
    };

    /** The AMC paste-import — the Excel's rows, already parsed client-side. */
    if (body.action === "import") {
      if (body.kind !== "amc") throw new HttpError(400, "Only the AMC register imports.");
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) throw new HttpError(400, "Nothing to import.");
      if (rows.length > 1000) throw new HttpError(400, "At most 1000 rows per paste.");
      const clean = (rows as Record<string, unknown>[])
        .map((r2) => pick(r2))
        .filter((r2: Record<string, unknown>) => String(r2.customer || "").trim() !== "")
        .map((r2: Record<string, unknown>) => ({ ...r2, by: user.email }));
      if (clean.length === 0) throw new HttpError(400, "No row carried a customer — check the Customer column.");
      const { error } = await admin.from(k.table).insert(clean);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0107 first — Seva's tables don't exist yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, imported: clean.length });
    }

    const row = pick(body.row || {});
    if (body.action === "add") {
      const { error } = await admin.from(k.table).insert({ ...row, by: user.email });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0107 first — Seva's tables don't exist yet.");
        if (/duplicate|unique/i.test(error.message))
          throw new HttpError(400, "That entry already exists.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).update(row).eq("id", body.id);
      if (error) {
        if (/duplicate|unique/i.test(error.message))
          throw new HttpError(400, "That entry already exists.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
