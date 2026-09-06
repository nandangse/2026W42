import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/**
 * The prospecting queue — see supabase-crm/migrations/0017.
 *
 * GET  — MY open queue, oldest first (a queue is dealt from the bottom),
 *        each item enriched live with the deal's title, company and the
 *        number to dial. Enriched at read rather than stored, so a phone
 *        corrected on the person record corrects every queue it sits in.
 * POST — { action: "add", kind, id } · { action: "done", id } ·
 *        { action: "remove", id }. All against MY rows alone.
 */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();

    /**
     * ?marks=1 — the light path for the deal board's icons: which deals sit
     * in MY queue (red) and which I have already handled (green). Pairs
     * only, no enrichment — the board asks on every load.
     */
    if (new URL(req.url).searchParams.get("marks")) {
      const { data, error } = await db.from("prospect_queue")
        .select("kind, ref_id, done_at").eq("added_by", me.email.toLowerCase()).limit(2000);
      if (error) return NextResponse.json({ open: [], done: [] });
      return NextResponse.json({
        open: (data || []).filter((r) => !r.done_at).map((r) => `${r.kind}:${r.ref_id}`),
        done: (data || []).filter((r) => r.done_at).map((r) => `${r.kind}:${r.ref_id}`),
      });
    }

    const { data: items, error } = await db
      .from("prospect_queue").select("id, kind, ref_id, added_at, done_at, note")
      .eq("added_by", me.email.toLowerCase())
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("added_at", { ascending: true })
      .limit(400);
    if (error) {
      if (/prospect_queue|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ items: [], needsMigration: true });
      throw new HttpError(500, error.message);
    }

    const open = (items || []).filter((i) => !i.done_at);
    const doneToday = (items || []).filter((i) => i.done_at && String(i.done_at).slice(0, 10) === new Date().toISOString().slice(0, 10));

    // ---- enrich: title, company, phone ----
    const byKind = new Map<string, string[]>();
    for (const i of open) byKind.set(String(i.kind), [...(byKind.get(String(i.kind)) || []), String(i.ref_id)]);

    const info = new Map<string, { title: string; company_id: string | null; phone: string | null }>();
    const companyIds = new Set<string>();

    const load = async (kind: string, table: string, titleCol: string, phoneCol?: string) => {
      const ids = byKind.get(kind);
      if (!ids?.length) return;
      const cols = `id, ${titleCol}, company_id${phoneCol ? `, ${phoneCol}` : ""}`;
      const { data } = await db.from(table).select(cols).in("id", ids);
      for (const r of (data || []) as unknown as Row[]) {
        const company = r.company_id ? String(r.company_id) : null;
        if (company) companyIds.add(company);
        info.set(`${kind}:${r.id}`, {
          title: String(r[titleCol] ?? ""),
          company_id: company,
          phone: phoneCol && r[phoneCol] ? String(r[phoneCol]) : null,
        });
      }
    };
    await load("opportunity", "opportunity", "name");
    await load("quotation", "quotation", "quote_no");
    await load("sales_order", "sales_order", "so_no");
    await load("lead", "lead", "raw_subject", "contact_phone");
    await load("person", "person", "full_name", "primary_phone");
    // a company IS its own company — the dial number comes from its people
    {
      const coIds = byKind.get("company");
      if (coIds?.length) {
        const { data } = await db.from("company").select("id, name").in("id", coIds);
        for (const r of data || []) {
          companyIds.add(String(r.id));
          info.set(`company:${r.id}`, { title: String(r.name ?? ""), company_id: String(r.id), phone: null });
        }
      }
    }

    // companies, and their first person with a number — the dial target
    const companyName = new Map<string, string>();
    const companyPhone = new Map<string, { phone: string; person: string }>();
    if (companyIds.size) {
      const ids = [...companyIds];
      const { data: cos } = await db.from("company").select("id, name").in("id", ids);
      for (const c of cos || []) companyName.set(String(c.id), String(c.name ?? ""));
      const { data: people } = await db
        .from("person").select("id, company_id, full_name, primary_phone").in("company_id", ids).not("primary_phone", "is", null);
      for (const p of (people || []) as Row[]) {
        const cid = String(p.company_id);
        if (!companyPhone.has(cid) && p.primary_phone)
          companyPhone.set(cid, { phone: String(p.primary_phone), person: String(p.full_name ?? "") });
      }
    }

    const shape = (i: Row) => {
      const inf = info.get(`${i.kind}:${i.ref_id}`);
      const viaCompany = inf?.company_id ? companyPhone.get(inf.company_id) : undefined;
      return {
        id: String(i.id), kind: String(i.kind), ref_id: String(i.ref_id),
        added_at: i.added_at, done_at: i.done_at ?? null, note: i.note ?? null,
        title: inf?.title || "(deleted record)",
        company: inf?.company_id ? companyName.get(inf.company_id) ?? null : null,
        phone: inf?.phone || viaCompany?.phone || null,
        phone_person: inf?.phone ? null : viaCompany?.person ?? null,
      };
    };
    return NextResponse.json({ items: open.map(shape), doneToday: doneToday.length });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const mine = me.email.toLowerCase();

    if (action === "add") {
      const kind = String(body.kind || "");
      const ref = String(body.id || "");
      if (!["opportunity", "quotation", "sales_order", "lead", "company", "person"].includes(kind)) throw new HttpError(400, "Which kind of deal?");
      if (!ref) throw new HttpError(400, "Which deal?");
      const { error } = await db.from("prospect_queue").insert({ kind, ref_id: ref, added_by: mine });
      if (error) {
        if (/prospect_queue_open_uniq|duplicate/i.test(error.message))
          return NextResponse.json({ ok: true, already: true });
        if (/prospect_queue|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run CRM migration 0017 first — the queue has nowhere to live yet.");
        throw new HttpError(500, error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "done" || action === "remove") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "Which entry?");
      const q = action === "done"
        ? db.from("prospect_queue").update({ done_at: new Date().toISOString(), note: String(body.note || "").slice(0, 500) || null }).eq("id", id).eq("added_by", mine)
        : db.from("prospect_queue").delete().eq("id", id).eq("added_by", mine);
      const { error } = await q;
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    // the drag writes the order — my rows alone (Dr Raghu, 30 Aug 2026)
    if (action === "reorder") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 200);
      if (!ids.length) throw new HttpError(400, "Nothing to reorder.");
      for (let i = 0; i < ids.length; i++) {
        await db.from("prospect_queue").update({ sort_order: i + 1 })
          .eq("id", ids[i]).eq("added_by", me.email.toLowerCase()).is("done_at", null);
      }
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
