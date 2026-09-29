import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { pageAll } from "@/lib/page-all";
import { tidyStatus, readDate, readAmount, type AuditRow } from "@/lib/audit-query";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NOT_INSTALLED = /audit_query|schema cache|does not exist/i;
const S = (v: unknown, max = 4000) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * AUDIT QUERIES — the Accounts Management Review, live.
 *
 * GET              every query (it is under two thousand rows; the screen
 *                  filters it, so a filter never costs a round trip)
 * POST save        add one, or change one
 * POST status      just the state, for the one-click close
 * POST import      the sheet, in batches, from the browser
 * POST delete      owner only, and only a row somebody typed by mistake
 */
export async function GET() {
  try {
    await requireKuber();
    const db = adminClient();
    /* PostgREST stops at a thousand whatever the limit says, and this sheet
       is nineteen hundred rows — read to the end or half the audit is
       invisible and nothing on screen says so. */
    const rows = await pageAll<AuditRow>(async (f, t) => {
      const r = await db.from("audit_query").select("*")
        .order("assigned_on", { ascending: false, nullsFirst: false })
        .order("sheet_row", { ascending: false, nullsFirst: false })
        .range(f, t);
      return { data: r.data as unknown as AuditRow[] | null, error: r.error };
    }, "the audit queries").catch((e) => {
      if (NOT_INSTALLED.test(String(e))) return null;
      throw e;
    });
    if (rows === null) return NextResponse.json({ installed: false, rows: [] });
    return NextResponse.json({ installed: true, rows });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireKuber();
    const db = adminClient();
    const body = await readBody(req, {});
    const action = String(body.action || "save");
    const fail = (m: string) => {
      throw new HttpError(NOT_INSTALLED.test(m) ? 503 : 500,
        NOT_INSTALLED.test(m) ? "Run migration 0172 first — the audit queries have nowhere to live yet." : m);
    };

    if (action === "status") {
      const { error } = await db.from("audit_query")
        .update({ status: tidyStatus(String(body.status || "")), updated_by: u.email, updated_at: new Date().toISOString() })
        .eq("id", String(body.id || ""));
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "save") {
      const row: Record<string, unknown> = {
        assigned_text: S(body.assigned_text, 60),
        assigned_on: readDate(String(body.assigned_text || "")) || S(body.assigned_on, 10),
        instructed_by: S(body.instructed_by, 80),
        assigned_to: S(body.assigned_to, 80),
        related_to: S(body.related_to, 300),
        instruction: S(body.instruction, 8000),
        target_text: S(body.target_text, 120),
        target_on: readDate(String(body.target_text || "")),
        amount_text: S(body.amount_text, 80),
        amount: readAmount(String(body.amount_text || "")),
        status: tidyStatus(String(body.status || "Pending")),
        remarks: S(body.remarks, 8000),
        verified_text: S(body.verified_text, 60),
        verified_on: readDate(String(body.verified_text || "")),
        updated_by: u.email,
        updated_at: new Date().toISOString(),
      };
      if (body.id) {
        const { error } = await db.from("audit_query").update(row).eq("id", String(body.id));
        if (error) fail(error.message);
      } else {
        row.added_by = u.email;
        row.source = "typed";
        const { error } = await db.from("audit_query").insert(row);
        if (error) fail(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /**
     * THE SHEET, IN BATCHES.
     *
     * The browser reads the CSV and sends it a few hundred rows at a time —
     * the whole file in one request is refused by the platform at four and a
     * half megabytes, and a refusal halfway through an import is the worst
     * possible outcome for a record like this.
     *
     * KEYED ON THE SHEET'S OWN ROW NUMBER, so running it twice corrects the
     * rows rather than doubling them. An audit trail that can be accidentally
     * duplicated is an audit trail nobody can count.
     */
    if (action === "import") {
      if (!u.isOwner) throw new HttpError(403, "Importing the sheet is Raghu's.");
      const list = Array.isArray(body.rows) ? body.rows : [];
      if (!list.length) return NextResponse.json({ ok: true, wrote: 0 });
      const rows = (list as Record<string, unknown>[]).slice(0, 500).map((r) => ({
        sheet_row: Number(r.sheet_row) || null,
        assigned_text: S(r.assigned_text, 60),
        assigned_on: readDate(String(r.assigned_text || "")),
        instructed_by: S(r.instructed_by, 80),
        assigned_to: S(r.assigned_to, 80),
        related_to: S(r.related_to, 300),
        instruction: S(r.instruction, 8000),
        target_text: S(r.target_text, 120),
        target_on: readDate(String(r.target_text || "")),
        amount_text: S(r.amount_text, 80),
        amount: readAmount(String(r.amount_text || "")),
        status: tidyStatus(String(r.status || "")),
        remarks: S(r.remarks, 8000),
        verified_text: S(r.verified_text, 60),
        verified_on: readDate(String(r.verified_text || "")),
        source: "sheet",
        added_by: u.email,
        updated_by: u.email,
        updated_at: new Date().toISOString(),
      })).filter((r) => r.sheet_row);
      const { error } = await db.from("audit_query").upsert(rows, { onConflict: "sheet_row" });
      if (error) fail(error.message);
      return NextResponse.json({ ok: true, wrote: rows.length });
    }

    if (action === "delete") {
      if (!u.isOwner) throw new HttpError(403, "Deleting a query is Raghu's.");
      const { error } = await db.from("audit_query").delete().eq("id", String(body.id || ""));
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) { return errJson(e); }
}
