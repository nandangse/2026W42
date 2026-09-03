import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";

export const dynamic = "force-dynamic";

/**
 * The warehouse master (Dr Raghu, 3 Sep 2026: "Make Masters settings. In
 * this show warehouses, and in front of the warehouse remarks. In front of
 * it Type — changeable to stock / wip / vendor.")
 *
 *   GET  — every warehouse the ERP has, with Genie's type and remark.
 *   POST { warehouse, kind?, remarks? } — set the type or the remark. The
 *          names are the ERP's and are not edited here; the type and the
 *          remark are Genie's and survive every pull.
 */

const KINDS = ["", "Stock", "WIP", "Vendor", "Finished goods"] as const;
const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

export async function GET() {
  try {
    await requireSaamaan();
    const { data, error } = await adminClient().from("material_warehouse").select("*").order("is_group").order("warehouse").limit(500);
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const body = await req.json().catch(() => ({}));
    const warehouse = String(body.warehouse || "").trim();
    if (!warehouse) throw new HttpError(400, "warehouse required");
    const patch: Record<string, unknown> = {};
    if ("kind" in body) {
      const kind = String(body.kind ?? "").trim();
      if (!(KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Type is Stock, WIP, Vendor or Finished goods — or blank.");
      patch.kind = kind;
      patch.kind_by = me.email;
      patch.kind_at = new Date().toISOString();
    }
    if ("remarks" in body) patch.remarks = String(body.remarks ?? "").slice(0, 500);
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change.");
    const { error, count } = await adminClient().from("material_warehouse").update(patch, { count: "exact" }).eq("warehouse", warehouse);
    if (error) {
      if (notInstalled(error.message)) throw new HttpError(503, "Run migration 0124 first — the warehouse master doesn't exist yet.");
      throw new Error(error.message);
    }
    if (!count) throw new HttpError(404, `No warehouse ${warehouse} — pull from the ERP first.`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
