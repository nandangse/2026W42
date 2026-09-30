import { NextResponse } from "next/server";
import { requireKuber } from "@/lib/accounts";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { pageAll } from "@/lib/page-all";
import { tidyStatus, readDate, readAmount, type AuditRow } from "@/lib/audit-query";
import { assertAiOn } from "@/lib/ai-gate";
import { AI, anthropicClient } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NOT_INSTALLED = /audit_query|schema cache|does not exist/i;
/**
 * What a rich-text field is allowed to keep: paragraphs, emphasis, lists,
 * links and pictures by Genie's own address. Anything that could run is
 * stripped, and so is any picture that is not ours — a pasted screenshot
 * arrives through /api/kuber/audit-image and comes back as /api/file/…, so
 * an <img> pointing anywhere else did not come from that path.
 */
const cleanHtml = (v: string | null): string | null => {
  if (!v) return v;
  let h = v
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi, "")
    .replace(/<img\b(?![^>]*src\s*=\s*["']?\/api\/file\/)[^>]*>/gi, "");
  return h.slice(0, 40000);
};

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

    /**
     * A STATE CHANGE IS AN EVENT, NOT AN OVERWRITE (Dr Raghu, 30 Sep 2026:
     * "make it log change from pending to done for review and then close").
     *
     * Pending \u2192 Done for Review \u2192 Closed is the shape of the work, and the
     * only interesting question about it is how long each leg took. Writing
     * the new state over the old one answers none of that, so the old state
     * goes into the thread with who moved it and when.
     */
    if (action === "status") {
      const id = String(body.id || "");
      const to = tidyStatus(String(body.status || ""));
      const now = new Date().toISOString();
      const { data: before } = await db.from("audit_query").select("status, answered_at, closed_at").eq("id", id).maybeSingle();
      const from = String((before as { status?: string } | null)?.status || "");
      const upd: Record<string, unknown> = { status: to, updated_by: u.email, updated_at: now };
      /* the clock on each leg, stamped the first time it is reached */
      if (/done for review/i.test(to) && !(before as { answered_at?: string } | null)?.answered_at) upd.answered_at = now;
      if (/^(done|closed)$/i.test(to) && !(before as { closed_at?: string } | null)?.closed_at) upd.closed_at = now;
      const { error } = await db.from("audit_query").update(upd).eq("id", id);
      if (error) fail(error.message);
      if (from !== to) {
        const { error: le } = await db.from("audit_query_event")
          .insert({ query_id: id, kind: "status", from_status: from || null, to_status: to, by_email: u.email });
        if (le && !NOT_INSTALLED.test(le.message)) fail(le.message);
      }
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
        /* Details is rich text now (30 Sep 2026) — a little HTML, never a
           script, never an inline handler, never an image inlined as base64 */
        remarks: cleanHtml(S(body.remarks, 40000)),
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
     * THE THREAD (0182).
     *
     * events   everything said about one query, oldest first
     * comment  somebody writes on it
     * genie    Genie reads it and the reading is KEPT — Dr Raghu, 30 Sep
     *          2026: "this will be seen". An insight that only the person
     *          who pressed the button can see is worth nothing to the next
     *          person who opens the query.
     */
    if (action === "events") {
      const { data, error } = await db.from("audit_query_event").select("*")
        .eq("query_id", String(body.id || "")).order("at", { ascending: true }).limit(200);
      if (error) fail(error.message);
      return NextResponse.json({ events: data || [] });
    }

    if (action === "comment") {
      const text = S(body.body, 4000);
      if (!text) throw new HttpError(400, "Nothing to say.");
      const { error } = await db.from("audit_query_event")
        .insert({ query_id: String(body.id || ""), kind: "comment", body: text, by_email: u.email });
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "genie") {
      await assertAiOn();
      const { data: q } = await db.from("audit_query").select("*").eq("id", String(body.id || "")).maybeSingle();
      const row = q as AuditRow | null;
      if (!row) throw new HttpError(404, "No such query.");

      /* WHAT THE BOOKS SAY ABOUT THE LEDGER IT NAMES. An insight drawn from
         the wording alone is a paraphrase; the useful part is the figure
         sitting behind it, so the ledger named in the query is looked up and
         its closing and last few vouchers go in with the question. */
      let ledgerFacts = "The query does not name a ledger that exists in the books.";
      const named = String(row.related_to || "").trim();
      if (named) {
        const { data: leds } = await db.from("kuber_ledger")
          .select("name, parent, opening, closing").ilike("name", `%${named.slice(0, 40)}%`).limit(6);
        const list = (leds || []) as { name: string; parent: string; opening: number; closing: number }[];
        if (list.length) {
          ledgerFacts = list.map((l) => `${l.name} (under ${l.parent}) — opening ${Math.round(Number(l.opening) || 0)}, closing ${Math.round(Number(l.closing) || 0)}`).join("\n");
        }
      }
      const { data: ev } = await db.from("audit_query_event").select("kind, body, by_email, at")
        .eq("query_id", row.id).order("at", { ascending: true }).limit(40);
      const thread = ((ev || []) as { kind: string; body: string | null; by_email: string | null }[])
        .filter((e) => e.body).map((e) => `${(e.by_email || "").split("@")[0]}: ${e.body}`).join("\n") || "(nothing said yet)";

      const prompt = [
        "You are Genie, the in-house assistant inside Nandan GSE's accounts system. An auditor has raised a query on the books and the accounts team has to answer it.",
        "",
        `THE QUERY (raised ${row.assigned_text || row.assigned_on || "date not recorded"} by ${row.instructed_by || "unknown"}, for ${row.assigned_to || "nobody named"}):`,
        `Ledger or vendor: ${row.related_to || "not named"}`,
        `Amount: ${row.amount_text || "not stated"}`,
        `Status: ${row.status}`,
        row.instruction || "(no wording)",
        "",
        "WHAT THE BOOKS SAY ABOUT THAT LEDGER:",
        ledgerFacts,
        "",
        "THE THREAD SO FAR:",
        thread,
        "",
        "Begin with a single line of the exact form 'SUMMARY: ...' \u2014 one sentence, at most twenty words, saying what this query comes down to and what to do about it. It is read on its own in a list, so it has to stand without the rest.",
        "",
        "Then write a short reading for the person who has to answer this, in four parts, each a heading followed by one to three sentences:",
        "WHAT IS BEING ASKED — in plain words, what the auditor actually wants.",
        "WHY IT MATTERS — what it would mean for the accounts if the answer is bad.",
        "WHAT TO CHECK — the specific vouchers, ledgers or documents to pull, named.",
        "WHAT A GOOD ANSWER LOOKS LIKE — what to write back so it can be closed.",
        "",
        "Rules: Indian accounting and Tally conventions. Rupees in lakhs or crores. Never invent a figure — if the books above do not carry it, say what to look up instead. Be direct; no preamble, no flattery. Under 220 words.",
      ].join("\n");

      const ai = anthropicClient();
      const msg = await ai.messages.create({
        model: AI.FRONT, max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      });
      const note = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n").trim();
      if (!note) throw new HttpError(502, "Genie had nothing to say — try again.");
      const at = new Date().toISOString();
      await db.from("audit_query").update({ ai_note: note, ai_at: at, ai_by: u.email }).eq("id", row.id);
      await db.from("audit_query_event").insert({ query_id: row.id, kind: "ai", body: note, by_email: u.email });
      return NextResponse.json({ ok: true, note, at });
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
