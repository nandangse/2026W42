import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The browser's door for parsed Tally data (Dr Raghu, 28 Aug 2026: the XML
 * itself bypasses Vercel — the browser parses it and sends only the rows).
 * A 400 MB export becomes a few MB of JSON, batched 500 rows at a call.
 *
 *   { action: "begin", kind: "masters"|"transactions" }  — wipe that side
 *   { action: "batch", table, rows }                     — one batch in
 *   { action: "done", kind, for_date, name, bytes }      — ledger row + bill rebuild
 *   GET ?config=1                                        — the Google client id
 *     for the Drive leg, public by design.
 */
const TABLES: Record<string, string[]> = {
  kuber_ledger: ["id", "name", "parent", "opening", "closing", "loaded_at"],
  kuber_opening_bill: ["ledger", "bill", "bill_date", "amount", "credit_days"],
  kuber_voucher: ["id", "date", "vtype", "vno", "party", "narration", "loaded_at"],
  kuber_voucher_line: ["id", "voucher_id", "ledger", "amount"],
  kuber_bill_alloc: ["voucher_id", "ledger", "bill", "billtype", "amount", "credit_days", "date"],
};
const SIDE: Record<string, string[]> = {
  masters: ["kuber_ledger", "kuber_opening_bill"],
  transactions: ["kuber_voucher", "kuber_voucher_line", "kuber_bill_alloc"],
};

const addDays = (iso: string, d: number) => {
  const t = new Date(iso + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

export async function GET(req: Request) {
  try {
    await requireKuber();
    if (new URL(req.url).searchParams.get("config"))
      return NextResponse.json({ googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null });
    throw new HttpError(400, "config=1 is the only GET here");
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const admin = adminClient();
    const body = await req.json();

    if (body.action === "begin") {
      const tables = SIDE[String(body.kind)];
      if (!tables) throw new HttpError(400, "kind must be masters or transactions");
      for (const t of tables) {
        const { error } = await admin.from(t).delete().not("id", "is", null);
        if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(error.message);
        if (error) throw new HttpError(503, "Run migration 0076 first — Kuber's book tables don't exist yet.");
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "batch") {
      const cols = TABLES[String(body.table)];
      if (!cols) throw new HttpError(400, "Unknown table.");
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
      const clean = rows.map((r: Record<string, unknown>) => {
        const o: Record<string, unknown> = {};
        for (const c of cols) if (c in r) o[c] = r[c];
        return o;
      });
      if (!clean.length) return NextResponse.json({ ok: true });
      const { error } = await admin.from(String(body.table)).insert(clean);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "done") {
      // Rebuild the open bills from first principles — opening bills plus
      // every allocation, Tally's own signs, exactly the script's math.
      const bills = new Map<string, { ledger: string; bill: string; outstanding: number; bill_date: string | null; credit_days: number | null }>();
      const touch = (ledger: string, bill: string) => {
        const k = ledger + "||" + bill;
        let r = bills.get(k);
        if (!r) { r = { ledger, bill, outstanding: 0, bill_date: null, credit_days: null }; bills.set(k, r); }
        return r;
      };
      const page = async (table: string, cols: string) => {
        const out: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await admin.from(table).select(cols).range(from, from + 999);
          if (error) return out;
          out.push(...((data || []) as unknown as Record<string, unknown>[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      for (const b of await page("kuber_opening_bill", "ledger, bill, bill_date, amount, credit_days")) {
        const r = touch(String(b.ledger), String(b.bill));
        r.outstanding += Number(b.amount) || 0;
        if (b.bill_date) r.bill_date = String(b.bill_date);
        if (b.credit_days != null) r.credit_days = Number(b.credit_days);
      }
      for (const a of await page("kuber_bill_alloc", "ledger, bill, billtype, amount, credit_days, date")) {
        const r = touch(String(a.ledger), String(a.bill));
        r.outstanding += Number(a.amount) || 0;
        if (/new ref/i.test(String(a.billtype))) {
          if (a.date) r.bill_date = String(a.date);
          if (a.credit_days != null) r.credit_days = Number(a.credit_days);
        }
      }
      const groupOf = new Map<string, string>();
      for (const l of await page("kuber_ledger", "name, parent")) groupOf.set(String(l.name), String(l.parent));
      const stamp = new Date().toISOString();
      const open = [...bills.values()]
        .filter((b) => Math.abs(b.outstanding) > 0.5)
        .map((b) => ({
          id: crypto.randomUUID(),
          party: b.ledger,
          party_group: groupOf.get(b.ledger) || null,
          bill: b.bill,
          bill_date: b.bill_date,
          due_date: b.bill_date && b.credit_days != null ? addDays(b.bill_date, b.credit_days) : b.bill_date,
          kind: b.outstanding < 0 ? "receivable" : "payable",
          amount: Math.abs(b.outstanding),
          loaded_at: stamp,
        }));
      await admin.from("kuber_bill").delete().not("id", "is", null);
      for (let i = 0; i < open.length; i += 500) {
        const { error } = await admin.from("kuber_bill").insert(open.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      // the audit ledger row — the browser door counts like every other door
      const initials = (user.initials || user.email.split("@")[0].slice(0, 3)).toUpperCase();
      try {
        await admin.from("kuber_upload").insert({
          kind: String(body.kind), for_date: String(body.for_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
          name: String(body.name || "browser upload").slice(0, 120),
          path: `browser/${Date.now()}`, bytes: Number(body.bytes) || null,
          by: user.email, initials,
          ...(body.drive ? { drive_synced_at: new Date().toISOString() } : {}),
        });
      } catch { /* pre-0075 — the parse still stands */ }
      return NextResponse.json({ ok: true, bills: open.length });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
