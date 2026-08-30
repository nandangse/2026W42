import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/** The sales order's items — read-only lines from the ERP import (0048). */
export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const so = String(new URL(req.url).searchParams.get("so") || "");
    if (!so) throw new HttpError(400, "Which order?");
    const { data, error } = await crmDb().from("sales_order_line")
      .select("line_no, description, item_group, quantity, uom, unit_price, amount")
      .eq("sales_order_id", so).order("line_no");
    if (error) {
      if (/sales_order_line|schema cache/i.test(error.message))
        throw new HttpError(503, "Run CRM migration 0048 first — the order items have nowhere to live yet.");
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ lines: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}
