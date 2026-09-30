import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { addDays } from "@/lib/fmt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The browser's door for parsed Tally data (Dr Raghu, 28 Aug 2026: the XML
 * itself bypasses Vercel — the browser parses it and sends only the rows).
 * A 400 MB export becomes a few MB of JSON, batched 500 rows at a call.
 *
 *   { action: "begin", kind, fy }        — wipe THAT SIDE OF THAT YEAR
 *   { action: "batch", table, rows, fy } — one batch in, stamped with its year
 *   { action: "done", kind, fy, ... }    — ledger row + bill rebuild
 *   GET ?config=1                        — the Google client id for the Drive
 *     leg, public by design.
 *
 * ONE YEAR AT A TIME (0178). Until 30 September 2026 "begin" deleted every
 * row in every Kuber table, which is right for one year and catastrophic for
 * two: loading 2025-26 would have taken 2026-27 with it, and the first sign
 * would have been a board report missing half a year. Every row now carries
 * the year it was loaded under and the wipe is scoped to it.
 */

/** "2025-26" — the year-file register's own spelling, and the only one taken. */
const FY_RE = /^\d{4}-\d{2}$/;
const readFy = (v: unknown): string => {
  const fy = String(v || "").trim();
  if (!FY_RE.test(fy)) throw new HttpError(400, `A financial year like 2026-27 is required — got "${fy || "nothing"}".`);
  return fy;
};
const TABLES: Record<string, string[]> = {
  kuber_group: ["name", "parent"],
  kuber_ledger: ["id", "name", "parent", "opening", "closing", "loaded_at"],
  kuber_opening_bill: ["ledger", "bill", "bill_date", "amount", "credit_days"],
  kuber_voucher: ["id", "date", "vtype", "vno", "party", "narration", "amount", "loaded_at"],
  kuber_voucher_line: ["id", "voucher_id", "ledger", "amount"],
  kuber_bill_alloc: ["voucher_id", "ledger", "bill", "billtype", "amount", "credit_days", "date"],
  kuber_voucher_item: ["voucher_id", "item", "qty", "amount"],
};
/**
 * THE GROUP TREE IS NOT A YEAR'S DATA.
 *
 * It is the chart of accounts: it keys on the name and is upserted, so a
 * group that existed last year and this is one group. Everything else is a
 * year's worth of rows and is cleared and refilled a year at a time.
 */
const UNSCOPED = new Set(["kuber_group"]);
const SIDE: Record<string, string[]> = {
  masters: ["kuber_group", "kuber_ledger", "kuber_opening_bill"],
  transactions: ["kuber_voucher", "kuber_voucher_line", "kuber_bill_alloc", "kuber_voucher_item"],
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
    const body = await readBody(req, {});

    if (body.action === "begin") {
      const tables = SIDE[String(body.kind)];
      if (!tables) throw new HttpError(400, "kind must be masters or transactions");
      const fy = readFy(body.fy);
      // PROBE FIRST, WIPE AFTER: on 28 Aug a missing migration was discovered
      // one batch AFTER the wipe, leaving the books half-empty. Never again —
      // if any table is absent, refuse before touching anything.
      for (const t of tables) {
        const sel = t === "kuber_group" ? "name" : t === "kuber_voucher" ? "id, amount" : "id";
        const { error } = await admin.from(t).select(sel).limit(1);
        if (error) {
          const mig = t === "kuber_group" ? "0079"
            : t === "kuber_voucher_item" ? "0081"
            : t === "kuber_voucher" && /amount/i.test(error.message) ? "0083"
            : "0076";
          throw new HttpError(503, `Run migration ${mig} first — ${t} is not ready. Nothing was touched.`);
        }
      }
      /**
       * THE WIPE IS SCOPED TO THE YEAR BEING LOADED (0178).
       *
       * If the fy column is not there yet the migration has not run, and the
       * old whole-table delete would silently take every other year with it.
       * That is the exact accident this change exists to prevent, so it
       * REFUSES rather than falling back — except when only one year has ever
       * been loaded, where there is nothing to lose.
       */
      for (const t of tables) {
        if (UNSCOPED.has(t)) continue;   // the chart of accounts is not a year
        const q = admin.from(t).delete().eq("fy", fy);
        const { error } = await q;
        if (error && /fy|column/i.test(error.message))
          throw new HttpError(503, "Run migration 0178 first — Kuber cannot yet tell one financial year from another, "
            + "and loading a second year would delete the first. Nothing was touched.");
        if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(error.message);
        if (error && t === "kuber_group")
          throw new HttpError(503, "Run migration 0079 first — the group tree has nowhere to live yet.");
        if (error && t === "kuber_voucher_item")
          throw new HttpError(503, "Run migration 0081 first — the voucher items have nowhere to live yet.");
        if (error) throw new HttpError(503, "Run migration 0076 first — Kuber's book tables don't exist yet.");
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "batch") {
      const cols = TABLES[String(body.table)];
      if (!cols) throw new HttpError(400, "Unknown table.");
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
      /* Every row carries the year it was loaded under, so the next load of
         that year can clear exactly its own rows and nothing else. */
      const fy = UNSCOPED.has(String(body.table)) ? null : readFy(body.fy);
      const clean = rows.map((r: Record<string, unknown>) => {
        const o: Record<string, unknown> = {};
        for (const c of cols) if (c in r) o[c] = r[c];
        if (fy) o.fy = fy;
        return o;
      });
      if (!clean.length) return NextResponse.json({ ok: true });
      // kuber_group keys on the name and Tally repeats altered groups —
      // a duplicate is old news, never an error
      const { error } = body.table === "kuber_group"
        ? await admin.from("kuber_group").upsert(clean, { onConflict: "name", ignoreDuplicates: true })
        : await admin.from(String(body.table)).insert(clean);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "done") {
      const fy = readFy(body.fy);
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
      /**
       * THE ONE PIECE OF ARITHMETIC THAT MAKES TWO YEARS TRUE.
       *
       * A year's OPENING bills are what the previous year left unsettled. So
       * when 2025-26 and 2026-27 are both loaded, 2026-27's openings already
       * contain everything 2025-26 did not clear — and adding both would
       * count every old bill twice, doubling the receivables.
       *
       * The correct reconstruction is: <b>the openings of the EARLIEST year
       * loaded, plus the allocations of EVERY year</b>. One starting position,
       * then every movement since, in order. With a single year loaded this
       * is exactly what it has always done, so nothing changes today.
       */
      const years = [...new Set((await page("kuber_voucher", "fy")).map((r) => String(r.fy || "")).filter(Boolean))].sort();
      const openingYear = years[0] || null;
      const openRows = await page("kuber_opening_bill", "ledger, bill, bill_date, amount, credit_days, fy");
      const useOpen = openingYear
        ? openRows.filter((b) => !b.fy || String(b.fy) === openingYear)
        : openRows;
      for (const b of useOpen) {
        const r = touch(String(b.ledger), String(b.bill));
        r.outstanding += Number(b.amount) || 0;
        if (b.bill_date) r.bill_date = String(b.bill_date);
        if (b.credit_days != null) r.credit_days = Number(b.credit_days);
      }
      /* Allocations from EVERY year — they are the movements. */
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
      // the tree decides WHO IS A PARTY (Dr Raghu, 28 Aug 2026): receivable
      // only under Sundry Debtors, payable only under Sundry Creditors — a
      // loan company or a staff advance is neither, whatever its sign.
      const parentOf = new Map<string, string>();
      for (const g of await page("kuber_group", "name, parent")) parentOf.set(String(g.name), String(g.parent));
      const chainHas = (g: string, word: string) => {
        const seen = new Set<string>();
        while (g && !seen.has(g)) {
          if (g.toLowerCase().includes(word)) return true;
          seen.add(g);
          g = parentOf.get(g) || "";
        }
        return false;
      };
      const classOf = (ledger: string): "receivable" | "payable" | null => {
        const p = groupOf.get(ledger) || "";
        if (chainHas(p, "sundry debtor")) return "receivable";
        if (chainHas(p, "sundry creditor")) return "payable";
        return null;
      };
      const stamp = new Date().toISOString();
      // SIGNED amounts: positive = owed in the party's own direction
      // (Tally: debit is negative, so a debtor's debit bill flips positive);
      // negative = an unadjusted opposite entry, shown, never hidden.
      const open = [...bills.values()]
        .filter((b) => Math.abs(b.outstanding) > 0.5)
        .flatMap((b) => {
          const kind = classOf(b.ledger);
          if (!kind) return [];
          const amount = kind === "receivable" ? -b.outstanding : b.outstanding;
          return [{
            id: crypto.randomUUID(),
            party: b.ledger,
            party_group: groupOf.get(b.ledger) || null,
            bill: b.bill,
            bill_date: b.bill_date,
            due_date: b.bill_date && b.credit_days != null ? addDays(b.bill_date, b.credit_days) : b.bill_date,
            kind,
            amount,
            loaded_at: stamp,
            fy,
          }];
        });
      await admin.from("kuber_bill").delete().not("id", "is", null);
      for (let i = 0; i < open.length; i += 500) {
        const { error } = await admin.from("kuber_bill").insert(open.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      // the audit ledger row — the browser door counts like every other door,
      // and says what was TAKEN IN (0078), not just what arrived
      const initials = (user.initials || user.email.split("@")[0].slice(0, 3)).toUpperCase();
      const c = (body.counts ?? {}) as Record<string, number>;
      const fmtN = (n: unknown) => Number(n ?? 0).toLocaleString("en-IN");
      const takenIn = String(body.kind) === "masters"
        ? `${fmtN(c.groups)} groups · ${fmtN(c.ledgers)} ledgers · ${fmtN(c.bills)} opening bills`
        : `${fmtN(c.vouchers)} vouchers · ${fmtN(c.lines)} lines · ${fmtN(c.allocs)} bill refs · ${fmtN(c.items)} item lines`;
      const row = {
        kind: String(body.kind), for_date: String(body.for_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        name: String(body.name || "browser upload").slice(0, 120),
        path: `browser/${Date.now()}`, bytes: Number(body.bytes) || null,
        by: user.email, initials,
        ...(body.drive ? { drive_synced_at: new Date().toISOString() } : {}),
      };
      try {
        const { error } = await admin.from("kuber_upload").insert({ ...row, taken_in: `${takenIn} → ${open.length.toLocaleString("en-IN")} open bills stand` });
        if (error) await admin.from("kuber_upload").insert(row); // pre-0078: the row still lands
      } catch (e) { swallow("kuber/ingest", e); /* pre-0075 — the parse still stands */ }
      return NextResponse.json({ ok: true, bills: open.length });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
