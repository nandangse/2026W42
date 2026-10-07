/**
 * THE SYNC WATCH (Dr Raghu, 7 Oct 2026: "Can this also be made sure that it
 * doesn't change in the future? Also, same for customer, contact, and
 * company.")
 *
 * Twice in a month a stream looked healthy from its own report while rows
 * went missing or landed thin: a refused insert swallowed and the cursor
 * moved on; a race between two pulls that left 124 enquiries undated. The
 * stream's own count of what it wrote cannot see either. This check asks
 * the only question that matters, from the other side: of what the ERP
 * changed in the last two days, is every document in the CRM, and whole?
 *
 *   present   the ERP document has a row here (by its ERP name)
 *   whole     the row carries the fields the list and the board stand on:
 *             an opportunity its date and number, a company its name,
 *             a person a first name, a quotation its date
 *
 * Documents the ERP made in the last two hours are not judged — the pull
 * that brings them may not have run yet. Runs inside the hourly crm-sync,
 * costs three small ERP reads, and is written into the heartbeat and onto
 * the Synchronize to ERP screen, red when anything is wrong.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));
const stamp = (msBack: number) => new Date(Date.now() - msBack).toISOString().replace("T", " ").slice(0, 19);

export interface WatchLine { doctype: string; checked: number; missing: number; thin: number; missingNames: string[]; thinNames: string[]; error?: string }
export interface Watch { at: string; window: string; ok: boolean; lines: WatchLine[] }

interface Stream {
  doctype: string; table: string;
  /** CRM columns that may carry the ERP name */
  keys: string[];
  /** columns a whole row must have */
  must: string[];
}
const STREAMS: Stream[] = [
  { doctype: "Opportunity", table: "opportunity", keys: ["opportunity_no", "erp_opportunity_name"], must: ["opportunity_on", "opportunity_no"] },
  { doctype: "Customer", table: "company", keys: ["erp_name"], must: ["name"] },
  { doctype: "Contact", table: "person", keys: ["erp_name"], must: ["first_name"] },
  { doctype: "Quotation", table: "quotation", keys: ["quote_no"], must: ["quoted_on"] },
];

export async function syncWatch(db: SupabaseClient, base: string, EH: Record<string, string>): Promise<Watch> {
  /* the ERP writes its clock in IST; two days back, less a two-hour grace */
  const since = stamp(48 * 3600 * 1000 - 330 * 60000);
  const grace = stamp(2 * 3600 * 1000 - 330 * 60000);
  const lines: WatchLine[] = [];
  for (const st of STREAMS) {
    const line: WatchLine = { doctype: st.doctype, checked: 0, missing: 0, thin: 0, missingNames: [], thinNames: [] };
    try {
      const r = await fetch(`${base}/api/resource/${encodeURIComponent(st.doctype)}?fields=${J(["name", "creation"])}&filters=${J([["modified", ">=", since]])}&limit_page_length=2000`, { headers: EH, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`the ERP answered ${r.status}`);
      const docs = (((await r.json()) as { data?: Doc[] }).data ?? []).filter((d) => S(d.creation) < grace);
      const names = docs.map((d) => S(d.name)).filter(Boolean);
      line.checked = names.length;
      if (!names.length) { lines.push(line); continue; }
      const found = new Map<string, Doc>();
      for (let i = 0; i < names.length; i += 100) {
        const slice = names.slice(i, i + 100);
        const or = st.keys.map((k) => `${k}.in.(${slice.map((n) => `"${n.replace(/"/g, "")}"`).join(",")})`).join(",");
        const { data, error } = await db.from(st.table).select([...st.keys, ...st.must].join(",")).or(or).is("deleted_at", null);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Doc[]) for (const k of st.keys) if (S(row[k])) found.set(S(row[k]), row);
      }
      for (const n of names) {
        const row = found.get(n);
        if (!row) { line.missing++; if (line.missingNames.length < 8) line.missingNames.push(n); continue; }
        if (st.must.some((m) => !S(row[m]))) { line.thin++; if (line.thinNames.length < 8) line.thinNames.push(n); }
      }
    } catch (e) {
      line.error = e instanceof Error ? e.message : String(e);
    }
    lines.push(line);
  }
  return { at: new Date().toISOString(), window: "ERP documents modified in the last 48 hours, made more than 2 hours ago", ok: lines.every((l) => !l.missing && !l.thin && !l.error), lines };
}
