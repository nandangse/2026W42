import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COLS = "id, email, first_name, last_name, title, seniority, department, phone, linkedin, city, state, country, company_name, domain, website, industry, employees, lists, promoted_person_id, promoted_at, imported_at";
const MISSING = /mk_apollo|schema cache|does not exist|function/i;

/**
 * APOLLO LEADS — the pool (Dr Raghu, 6 Sep 2026).
 *
 * GET  ?lists=1                     — the Apollo list names with counts
 *      ?q=&list=&country=&city=&title=&company=&has_email=&promoted=0|1&page=
 *      ?ids=1                       — just the ids of everything matching, for select-all
 * POST { action: "import", rows, list_name } — a CSV batch, 500 at a time
 *      { action: "promote", ids, list_id? }  — take them into the CRM's own tables
 *      { action: "forget", ids }             — drop pooled rows (owner only)
 */
export async function GET(req: Request) {
  try {
    const u = await requireMarketing();
    const url = new URL(req.url);
    const P = (k: string) => (url.searchParams.get(k) || "").trim();
    const db = crmDb();

    if (P("lists") === "1") {
      const { data, error } = await db.rpc("mk_apollo_lists");
      if (error) {
        if (MISSING.test(error.message)) return NextResponse.json({ installed: false, lists: [] });
        throw new Error(error.message);
      }
      return NextResponse.json({ installed: true, lists: data ?? [] });
    }

    const wantIds = P("ids") === "1";
    const page = Math.max(0, Number(P("page") || 0));
    const PAGE = wantIds ? 10000 : 200;
    let qy = db.from("mk_apollo").select(wantIds ? "id" : COLS, { count: "exact" });
    if (P("q")) {
      const like = `%${P("q").replace(/[%_]/g, "\\$&")}%`;
      qy = qy.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},title.ilike.${like},company_name.ilike.${like}`);
    }
    if (P("list")) qy = qy.contains("lists", [P("list")]);
    if (P("country")) qy = qy.ilike("country", `%${P("country")}%`);
    if (P("city")) qy = qy.ilike("city", `%${P("city")}%`);
    if (P("title")) qy = qy.ilike("title", `%${P("title")}%`);
    if (P("company")) qy = qy.ilike("company_name", `%${P("company")}%`);
    if (P("has_email") === "1") qy = qy.not("email", "is", null);
    if (P("has_email") === "0") qy = qy.is("email", null);
    if (P("promoted") === "1") qy = qy.not("promoted_person_id", "is", null);
    if (P("promoted") === "0") qy = qy.is("promoted_person_id", null);

    const { data, error, count } = await qy.order("imported_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (MISSING.test(error.message)) return NextResponse.json({ installed: false, rows: [], total: 0 });
      throw new Error(error.message);
    }
    if (wantIds) return NextResponse.json({ ids: (data || []).map((r) => String((r as unknown as { id: string }).id)), total: count ?? 0 });
    return NextResponse.json({ installed: true, rows: data ?? [], total: count ?? 0, scope: u.scope, me: u.email });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string" });
    const db = crmDb();
    const me = u.email.toLowerCase();

    if (b.action === "import") {
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 1000);
      if (!rows.length) throw new HttpError(400, "nothing to take in");
      const { data, error } = await db.rpc("mk_apollo_take", { payload: rows, list_name: String(b.list_name || "").slice(0, 120), by_email: me });
      if (error) {
        if (MISSING.test(error.message)) throw new HttpError(400, "Run CRM migration 0057 first — the Apollo pool does not exist yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, ...(data as Record<string, number>) });
    }

    if (b.action === "promote") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 500);
      if (!ids.length) throw new HttpError(400, "nobody chosen");
      const { data, error } = await db.rpc("mk_apollo_promote", { p_ids: ids, p_by: me, p_list: b.list_id || null });
      if (error) {
        if (MISSING.test(error.message)) throw new HttpError(400, "Run CRM migration 0057 first — the Apollo pool does not exist yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, ...(data as Record<string, number>) });
    }

    if (b.action === "forget") {
      if (!u.isOwner) throw new HttpError(403, "Only the owner clears the pool.");
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 5000);
      if (!ids.length) throw new HttpError(400, "nobody chosen");
      const { error } = await db.from("mk_apollo").delete().in("id", ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, n: ids.length });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
