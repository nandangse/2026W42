import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/**
 * The CFO's own registers (Dr Raghu, 28 Aug 2026) — the money facts Tally
 * does not carry in usable form: bank guarantees, fixed deposits, insurance,
 * payment planning, and the manual cash-flow lines. One route, five tables,
 * every row carrying its time frame.
 */
const KINDS: Record<string, { table: string; fields: string[]; order: string }> = {
  loan: {
    table: "kuber_loan", order: "bank",
    fields: ["bank", "loan_ac_no", "ltype", "drawn_on", "sanctioned", "outstanding", "emi", "roi", "emi_date", "tenor_months", "upto", "security", "status", "note"],
  },
  bg: {
    table: "kuber_bg", order: "expiry_date",
    fields: ["bg_no", "bank", "favouring", "purpose", "amount", "margin_amount", "issue_date", "expiry_date", "claim_expiry", "status", "note"],
  },
  fd: {
    table: "kuber_fd", order: "maturity_date",
    fields: ["fd_no", "bank", "principal", "rate", "start_date", "maturity_date", "maturity_amount", "lien_for", "status", "note"],
  },
  insurance: {
    table: "kuber_insurance", order: "expiry_date",
    fields: ["policy_no", "insurer", "policy_type", "covering", "sum_insured", "premium", "start_date", "expiry_date", "status", "note"],
  },
  payplan: {
    table: "kuber_payment_plan", order: "plan_date",
    fields: ["plan_date", "party", "amount", "purpose", "bill_ref", "status", "paid_on", "note"],
  },
  reco: {
    table: "kuber_supplier_reco", order: "fy",
    fields: ["party", "fy", "our_closing", "their_closing", "status", "upto", "note"],
  },
  cashitem: {
    table: "kuber_cash_item", order: "date",
    fields: ["date", "direction", "label", "amount", "weekly", "note"],
  },
};

const spec = (kind: string) => {
  const k = KINDS[kind];
  if (!k) throw new HttpError(400, "Unknown register.");
  return k;
};

/** GET ?kind=bg — the whole register, soonest time frame first. */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const k = spec(String(new URL(req.url).searchParams.get("kind") || ""));
    const { data, error } = await adminClient()
      .from(k.table)
      .select("*")
      .order(k.order, { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { kind, action: add|update|delete, id?, row? } */
export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const body = await req.json();
    const k = spec(String(body.kind || ""));
    const admin = adminClient();

    if (body.action === "delete") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const row: Record<string, unknown> = {};
    for (const f of k.fields) {
      if (body.row && f in body.row) {
        const v = body.row[f];
        row[f] = v === "" ? null : v;
      }
    }
    // text columns are not-null-default-'' — put the empties back
    for (const [key, v] of Object.entries(row))
      if (v === null && !/date|amount|premium|principal|rate|margin|sum_insured|paid_on|weekly|closing|upto/.test(key)) row[key] = "";

    if (body.action === "add") {
      const { error } = await admin.from(k.table).insert({ ...row, by: user.email });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0076 first — this register has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
