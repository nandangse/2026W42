import { NextResponse } from "next/server";
import { crmDb } from "@/crm/db";
import { requireCrm } from "@/crm/auth";
import { errJson, HttpError } from "@/lib/auth";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

const NOT_INSTALLED = /verified_at|schema cache|does not exist/i;
const S = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/**
 * THE FUNNEL — five stages, one person, one window.
 *
 * Dr Raghu, 30 Sep 2026: List Building = leads, Account Qualified = company,
 * Contact Verified = e-mail sent or a tick, Nurturing = a reply or an
 * interaction, Opportunity Identified = an opportunity.
 *
 * WHY IT IS SCOPED AND NOT A TOTAL. Counted across the whole CRM the five
 * stages come to 255,215 / 62,056 / 15,509 / 74,303 / 53,771 — nurturing
 * wider than verified, opportunities three times the contacts. Drawn as a
 * funnel that widens at the bottom, which is not a funnel, it is a picture
 * of twenty years of imported ERP history.
 *
 * So each stage counts what ENTERED it inside the window, for the person who
 * owns it. That narrows, and every number is one a person can be asked
 * about — which is the only reason to draw a funnel at all.
 *
 * ACCOUNT QUALIFIED IS "ASSIGNED TO SOMEBODY". A company has no other signal
 * that is not true of all 62,056; being given to a salesperson is a real act
 * by a real person, and it is the moment an account stops being a row.
 */
export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    const db = crmDb();
    const u = new URL(req.url);

    const to = S(u.searchParams.get("to"), 10) || new Date().toISOString().slice(0, 10);
    const from = S(u.searchParams.get("from"), 10)
      || new Date(Date.parse(`${to}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
    const fromT = `${from}T00:00:00Z`, toT = `${to}T23:59:59Z`;

    /** "" = everybody, "me" = the caller, else the e-mail of one person. */
    const whoRaw = S(u.searchParams.get("who"), 120).toLowerCase();
    const seesAll = me.isOwner || /head|manager|admin/i.test(me.crmRole);
    const who = whoRaw === "me" || (!seesAll && !whoRaw) ? me.email.toLowerCase() : whoRaw;
    if (who && who !== me.email.toLowerCase() && !seesAll)
      throw new HttpError(403, "That is not your funnel to read.");

    const mine = <T extends { eq: (c: string, v: unknown) => T }>(q: T, col: string) =>
      who ? q.eq(col, who) : q;
    const N = async (p: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const r = await p;
      if (r.error) { if (NOT_INSTALLED.test(r.error.message)) return null; throw new Error(r.error.message); }
      return r.count ?? 0;
    };
    const names = async (
      table: string, select: string, build: (q: ReturnType<typeof db.from>) => unknown,
    ) => {
      const q = build(db.from(table)) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null }>;
      const r = await q;
      return (r.data || []) as Record<string, unknown>[];
      void select;
    };

    /* ---- 1 · list building: leads that arrived in the window ---- */
    const leads = await N(mine(
      db.from("person").select("id", { count: "exact", head: true })
        .eq("is_lead", true).is("deleted_at", null)
        .gte("created_at", fromT).lte("created_at", toT) as never, "created_by_email"));

    /* ---- 2 · account qualified: a company given to somebody ---- */
    const qualified = await N(mine(
      db.from("company").select("id", { count: "exact", head: true })
        .not("assigned_to", "is", null).is("deleted_at", null)
        .gte("updated_at", fromT).lte("updated_at", toT) as never, "assigned_to"));

    /* ---- 3 · contact verified: the tick, or an e-mail that went ---- */
    const verified = await N(mine(
      db.from("person").select("id", { count: "exact", head: true })
        .not("verified_at", "is", null).is("deleted_at", null)
        .gte("verified_at", fromT).lte("verified_at", toT) as never, "verified_by"));

    /* ---- 4 · nurturing: an interaction happened ---- */
    const nurturing = await N(
      db.from("interaction").select("id", { count: "exact", head: true })
        .gte("happened_at", fromT).lte("happened_at", toT) as never);

    /* ---- 5 · opportunity identified ---- */
    const opportunities = await N(mine(
      db.from("opportunity").select("id", { count: "exact", head: true })
        .gte("created_at", fromT).lte("created_at", toT) as never, "created_by"));

    /**
     * THE NAMES, not only the count (his instruction: "show the names and the
     * person"). A number nobody can open is a number nobody trusts — and the
     * first question asked of any funnel is "which ones?".
     */
    const cut = 12;
    const [leadRows, compRows, verRows, intRows, oppRows] = await Promise.all([
      names("person", "", (q) => {
        let x = q.select("id, full_name, primary_email, created_by_email, created_at")
          .eq("is_lead", true).is("deleted_at", null)
          .gte("created_at", fromT).lte("created_at", toT).order("created_at", { ascending: false }).limit(cut);
        if (who) x = x.eq("created_by_email", who);
        return x;
      }),
      names("company", "", (q) => {
        let x = q.select("id, name, assigned_to, updated_at")
          .not("assigned_to", "is", null).is("deleted_at", null)
          .gte("updated_at", fromT).lte("updated_at", toT).order("updated_at", { ascending: false }).limit(cut);
        if (who) x = x.eq("assigned_to", who);
        return x;
      }),
      names("person", "", (q) => {
        let x = q.select("id, full_name, primary_email, verified_by, verified_how, verified_at")
          .not("verified_at", "is", null).is("deleted_at", null)
          .gte("verified_at", fromT).lte("verified_at", toT).order("verified_at", { ascending: false }).limit(cut);
        if (who) x = x.eq("verified_by", who);
        return x;
      }).catch(() => []),
      names("interaction", "", (q) => q.select("id, person_name, kind, remark, happened_at, created_by")
        .gte("happened_at", fromT).lte("happened_at", toT).order("happened_at", { ascending: false }).limit(cut)),
      names("opportunity", "", (q) => {
        let x = q.select("id, name, created_by, created_at")
          .gte("created_at", fromT).lte("created_at", toT).order("created_at", { ascending: false }).limit(cut);
        if (who) x = x.eq("created_by", who);
        return x;
      }),
    ]);

    /** Everybody who could be looked at, for the admin's picker. */
    let people: string[] = [];
    if (seesAll) {
      const { data } = await db.from("company").select("assigned_to").not("assigned_to", "is", null).limit(1000);
      people = [...new Set((data || []).map((r) => String(r.assigned_to).toLowerCase()).filter(Boolean))].sort();
    }

    return NextResponse.json({
      from, to, who, seesAll, me: me.email.toLowerCase(), people,
      needsMigration: verified === null,
      stages: [
        { key: "leads", label: "List Building", sub: "leads added", n: leads ?? 0, rows: leadRows },
        { key: "qualified", label: "Account Qualified", sub: "companies given to somebody", n: qualified ?? 0, rows: compRows },
        { key: "verified", label: "Contact Verified", sub: "ticked, or an e-mail sent", n: verified ?? 0, rows: verRows },
        { key: "nurturing", label: "Nurturing Relationship", sub: "an interaction happened", n: nurturing ?? 0, rows: intRows },
        { key: "opportunity", label: "Opportunity Identified", sub: "an opportunity raised", n: opportunities ?? 0, rows: oppRows },
      ],
    });
  } catch (e) { return errJson(e); }
}

/** The tick itself — "make the verified contact tick available". */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    const db = crmDb();
    const body = await readBody(req, {});
    const id = S(body.id, 64);
    if (!id) throw new HttpError(400, "Which contact?");
    const on = body.on !== false;
    const { error } = await db.from("person").update(
      on
        ? { verified_at: new Date().toISOString(), verified_by: me.email.toLowerCase(), verified_how: S(body.how, 40) || "ticked" }
        /* Un-ticking clears the name too — a verification whose evidence has
           been withdrawn must not keep somebody's name against it. */
        : { verified_at: null, verified_by: null, verified_how: null },
    ).eq("id", id);
    if (error) {
      if (NOT_INSTALLED.test(error.message))
        throw new HttpError(503, "Run CRM migration 0080 first — the verified tick has nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
