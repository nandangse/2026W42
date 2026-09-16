import { NextResponse } from "next/server";
import { crmDb } from "@/crm/db";
import { requireCrm } from "@/crm/auth";
import { errJson, HttpError } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { pageAll } from "@/lib/page-all";
import { tidyCompanyName, companyKey, looksLikeAPerson, tidyPhone, phoneKey } from "@/lib/clean-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CLEAN DATABASE — find it, show it, and let a person decide.
 *
 * Dr Raghu, 16 Sep 2026, listing what needs cleaning, and: "this can be done
 * by Shweta."
 *
 * THE SCAN IS KEPT, NOT REPEATED. Reading 255,288 people takes 84 seconds;
 * doing that on every page load would make the screen unusable. A scan runs,
 * writes what it found, and the screen reads that with the time on it.
 *
 * NOTHING IS CLEANED AUTOMATICALLY. The measurement is why: among the
 * colliding company names are "Kuldeep" four times and "Rahul Kumar" four
 * times, which are people's names used as a company and almost certainly
 * four different people. A name alone is not identity, so every group is a
 * proposal with a button beside it, and a wrong one can be dismissed for good.
 *
 * A MERGE IS REVERSIBLE. The loser is soft-deleted, never destroyed, after
 * its blanks have been given to the keeper and its list memberships moved.
 */
const S = (v: unknown) => String(v ?? "").trim();
const HANDS = new Set(["raghu@nandan.co.in", "shweta@nandan.co.in", "pankajs@nandan.co.in", "mukesh@nandan.co.in"]);

async function hand() {
  const u = await requireCrm();
  if (!HANDS.has(u.email.toLowerCase()) && !u.isOwner)
    throw new HttpError(403, "Clean Database is Shweta, Raghu, Pankaj and Mukesh.");
  return u;
}

export async function GET(req: Request) {
  try {
    await hand();
    const db = crmDb();
    const url = new URL(req.url);
    const kind = S(url.searchParams.get("kind"));

    /**
     * THE TWINS OF ONE PERSON, found live and cheaply.
     *
     * Dr Raghu, 16 Sep 2026, looking at five Renato Ramellas: "also in these
     * leads have a provision to merge as a tab!"
     *
     * The whole-database scan is for working through thousands. This is the
     * other half: you are already looking at somebody, you can see they are
     * in here five times, and the merge should be where your eyes are.
     *
     * Three indexed questions, no scan: the same address, the same last ten
     * digits, the same name. Each match says WHY it matched, because an
     * address is strong evidence, a name on its own is weak, and the person
     * pressing the button deserves to know which they are looking at.
     */
    const twinOf = S(url.searchParams.get("twins"));
    if (twinOf) {
      const { data: meRow } = await db.from("person")
        .select("id, full_name, first_name, last_name, primary_email, primary_phone, whatsapp_number, company_id")
        .eq("id", twinOf).maybeSingle();
      if (!meRow) throw new HttpError(404, "No such person.");
      const m = meRow as Record<string, unknown>;
      const found = new Map<string, { id: string; why: string[] }>();
      const add = (rows: Record<string, unknown>[] | null, why: string) => {
        for (const r of rows || []) {
          const id = String(r.id);
          if (id === twinOf) continue;
          const cur = found.get(id) || { id, why: [] };
          if (!cur.why.includes(why)) cur.why.push(why);
          found.set(id, cur);
        }
      };
      const email = S(m.primary_email).toLowerCase();
      if (email) {
        const { data } = await db.from("person").select("id").ilike("primary_email", email).is("deleted_at", null).limit(40);
        add(data as Record<string, unknown>[] | null, "the same e-mail");
      }
      const key = phoneKey(S(m.whatsapp_number) || S(m.primary_phone));
      if (key) {
        const { data } = await db.from("person").select("id")
          .or(`primary_phone.ilike.%${key}%,whatsapp_number.ilike.%${key}%`).is("deleted_at", null).limit(40);
        add(data as Record<string, unknown>[] | null, "the same number");
      }
      const nm = S(m.full_name) || [S(m.first_name), S(m.last_name)].filter(Boolean).join(" ");
      if (nm.length > 3) {
        const { data } = await db.from("person").select("id").ilike("full_name", nm).is("deleted_at", null).limit(40);
        add(data as Record<string, unknown>[] | null, "the same name");
      }
      const ids = [...found.keys()];
      let rows: Record<string, unknown>[] = [];
      if (ids.length) {
        const { data } = await db.from("person")
          .select("id, full_name, first_name, last_name, job_title, primary_email, primary_phone, whatsapp_number, city, country, company_id, created_at")
          .in("id", ids);
        rows = (data || []) as Record<string, unknown>[];
        const cids = [...new Set(rows.map((r) => r.company_id).filter(Boolean))] as string[];
        const cn = new Map<string, string>();
        if (cids.length) {
          const { data: cs } = await db.from("company").select("id, name").in("id", cids);
          for (const c of (cs || []) as { id: string; name: string }[]) cn.set(String(c.id), c.name);
        }
        rows = rows.map((r) => ({ ...r, company: r.company_id ? cn.get(String(r.company_id)) ?? null : null, why: found.get(String(r.id))?.why || [] }));
        /* Strongest evidence first: an address identifies, a name guesses. */
        const rank = (w: string[]) => (w.includes("the same e-mail") ? 0 : w.includes("the same number") ? 1 : 2);
        rows.sort((a, b) => rank((a.why as string[]) || []) - rank((b.why as string[]) || []));
      }
      return NextResponse.json({ ok: true, me: meRow, twins: rows });
    }

    const { data: runs } = await db.from("crm_clean_run").select("*").order("at", { ascending: false }).limit(1);
    const run = (runs || [])[0] as { at: string; seconds: number; summary: Record<string, number> } | undefined;

    let findings: Record<string, unknown>[] = [];
    if (kind) {
      const { data, error } = await db.from("crm_clean_finding")
        .select("*").eq("kind", kind).eq("status", "open").order("n", { ascending: false }).limit(200);
      if (error && /crm_clean_finding/i.test(error.message)) return NextResponse.json({ ok: true, installed: false });
      if (error) throw new Error(error.message);
      findings = (data || []) as Record<string, unknown>[];
    }
    return NextResponse.json({ ok: true, installed: true, run: run ?? null, kind, findings });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await hand();
    const db = crmDb();
    const b = await readBody(req, { action: "string" });
    const me = u.email.toLowerCase();

    /* ── THE SCAN ───────────────────────────────────────────────────── */
    if (b.action === "scan") {
      const t0 = Date.now();
      const rows: Record<string, unknown>[] = [];

      /* Companies: one read, two questions — do two names collide, and is
         the suffix spelled oddly. */
      const co = await pageAll<{ id: string; name: string }>(async (f, t) => {
        const r = await db.from("company").select("id, name").is("deleted_at", null).range(f, t);
        return { data: r.data as unknown as { id: string; name: string }[] | null, error: r.error };
      }, "companies");

      const byKey = new Map<string, { id: string; name: string }[]>();
      for (const c of co) {
        const k = companyKey(c.name);
        if (!k) continue;
        byKey.set(k, [...(byKey.get(k) || []), c]);
        const tidy = tidyCompanyName(c.name);
        if (tidy && tidy !== S(c.name)) {
          rows.push({ kind: "company_name", grp: c.id, ids: [c.id], labels: [c.name], n: 1, suggestion: tidy, status: "open" });
        }
      }
      for (const [k, group] of byKey) {
        if (group.length < 2) continue;
        rows.push({
          kind: "company_dup", grp: k,
          ids: group.map((g) => g.id),
          labels: group.map((g) => g.name),
          n: group.length,
          /* A name that looks like a person is proposed with a warning on it. */
          suggestion: looksLikeAPerson(group[0].name) ? "RISKY: this reads as a person's name, not a firm" : tidyCompanyName(group[0].name),
          status: "open",
        });
      }

      /* People: one read, three questions. */
      const pp = await pageAll<{ id: string; full_name: string | null; primary_email: string | null; primary_phone: string | null; whatsapp_number: string | null }>(async (f, t) => {
        const r = await db.from("person").select("id, full_name, primary_email, primary_phone, whatsapp_number").is("deleted_at", null).range(f, t);
        return { data: r.data as unknown as { id: string; full_name: string | null; primary_email: string | null; primary_phone: string | null; whatsapp_number: string | null }[] | null, error: r.error };
      }, "people");

      const byMail = new Map<string, typeof pp>();
      const byNum = new Map<string, typeof pp>();
      for (const p of pp) {
        const e = S(p.primary_email).toLowerCase();
        if (e) byMail.set(e, [...(byMail.get(e) || []), p]);
        const raw = S(p.whatsapp_number) || S(p.primary_phone);
        const k = phoneKey(raw);
        if (k) byNum.set(k, [...(byNum.get(k) || []), p]);
        if (raw) {
          const fix = tidyPhone(raw);
          if (fix.to && fix.to !== raw) rows.push({ kind: "phone_format", grp: p.id, ids: [p.id], labels: [S(p.full_name) || "(no name)", raw], n: 1, suggestion: fix.to, status: "open" });
        }
      }
      const CAP = 400;   // the worst offenders first; a screen cannot use 13,000 at once
      const take = (m: Map<string, typeof pp>, kind: string) =>
        [...m.entries()].filter(([, g]) => g.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, CAP)
          .map(([k, g]) => ({
            kind, grp: k, ids: g.map((x) => x.id),
            labels: g.map((x) => `${S(x.full_name) || "(no name)"}${x.primary_email ? ` · ${x.primary_email}` : ""}`),
            n: g.length, suggestion: null as string | null, status: "open",
          }));
      rows.push(...take(byMail, "person_email"));
      rows.push(...take(byNum, "person_phone"));

      const summary = {
        companies: co.length, people: pp.length,
        company_dup: rows.filter((r) => r.kind === "company_dup").length,
        company_name: rows.filter((r) => r.kind === "company_name").length,
        person_email: [...byMail.values()].filter((g) => g.length > 1).length,
        person_phone: [...byNum.values()].filter((g) => g.length > 1).length,
        phone_format: rows.filter((r) => r.kind === "phone_format").length,
        shown_cap: CAP,
      };

      const { data: run, error: re } = await db.from("crm_clean_run")
        .insert({ by_email: me, seconds: (Date.now() - t0) / 1000, summary }).select("id").single();
      if (re) {
        if (/crm_clean_run/i.test(re.message)) throw new HttpError(503, "Run CRM migration 0078 first.");
        throw new Error(re.message);
      }

      /* Replace what was open: a finding already acted on stays acted on. */
      await db.from("crm_clean_finding").delete().eq("status", "open");
      const withRun = rows.map((r) => ({ ...r, run_id: run.id }));
      for (let i = 0; i < withRun.length; i += 500) {
        const { error } = await db.from("crm_clean_finding")
          .upsert(withRun.slice(i, i + 500), { onConflict: "kind,grp", ignoreDuplicates: false });
        if (error) throw new Error(`writing findings: ${error.message}`);
      }
      return NextResponse.json({ ok: true, summary, seconds: Math.round((Date.now() - t0) / 100) / 10, wrote: withRun.length });
    }

    /* ── THE FIXES ──────────────────────────────────────────────────── */
    const finding = async (id: string) => {
      const { data } = await db.from("crm_clean_finding").select("*").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "That finding is gone — run the scan again.");
      return data as { id: string; kind: string; ids: string[]; labels: string[]; suggestion: string | null };
    };
    const close = (id: string, status: "done" | "ignored") =>
      db.from("crm_clean_finding").update({ status, acted_by: me, acted_at: new Date().toISOString() }).eq("id", id);

    if (b.action === "ignore") { await close(S(b.id), "ignored"); return NextResponse.json({ ok: true }); }

    if (b.action === "rename_company") {
      const f = await finding(S(b.id));
      const to = S(b.to) || S(f.suggestion);
      if (!to) throw new HttpError(400, "Nothing to write.");
      const { error } = await db.from("company").update({ name: to, match_key: to.toLowerCase() }).eq("id", f.ids[0]);
      if (error) throw new Error(error.message);
      await close(f.id, "done");
      return NextResponse.json({ ok: true, to });
    }

    if (b.action === "fix_phone") {
      const f = await finding(S(b.id));
      const to = S(b.to) || S(f.suggestion);
      if (!/^\+\d{8,15}$/.test(to)) throw new HttpError(400, "That is not a +country-code number.");
      const { error } = await db.from("person").update({ whatsapp_number: to }).eq("id", f.ids[0]);
      if (error) throw new Error(error.message);
      await close(f.id, "done");
      return NextResponse.json({ ok: true, to });
    }

    /**
     * MERGE — the keeper takes what the loser had that it lacked, the loser's
     * list memberships move across, and the loser is SOFT-deleted.
     *
     * Soft, because a merge is a judgement and judgements are sometimes
     * wrong. Nothing is destroyed, every screen that filters deleted_at stops
     * showing it, and it can be brought back by clearing one column.
     */
    if (b.action === "merge" || b.action === "merge_ids") {
      /* From the cleaner it is a finding; from a person's own Merge tab it
         is simply two ids. One road afterwards, so a merge behaves the same
         whichever screen asked for it. */
      const fromIds = b.action === "merge_ids";
      const f = fromIds
        ? { id: "", kind: S(b.kind) === "company" ? "company_dup" : "person_email", ids: [S(b.keep), ...((b.drop as string[]) || []).map(S)], labels: [], suggestion: null }
        : await finding(S(b.id));
      const keep = S(b.keep) || f.ids[0];
      const drop = f.ids.filter((x) => x !== keep && x);
      if (!drop.length) throw new HttpError(400, "Nothing to merge into it.");
      const table = f.kind === "company_dup" ? "company" : "person";

      const { data: keeper } = await db.from(table).select("*").eq("id", keep).maybeSingle();
      if (!keeper) throw new HttpError(404, "The row being kept is gone.");
      const fill: Record<string, unknown> = {};
      for (const id of drop) {
        const { data: loser } = await db.from(table).select("*").eq("id", id).maybeSingle();
        if (!loser) continue;
        for (const [k, v] of Object.entries(loser as Record<string, unknown>)) {
          if (["id", "created_at", "updated_at", "deleted_at", "search_vector", "match_key", "full_name"].includes(k)) continue;
          if (v !== null && v !== "" && ((keeper as Record<string, unknown>)[k] === null || (keeper as Record<string, unknown>)[k] === "") && fill[k] === undefined) fill[k] = v;
        }
      }
      if (Object.keys(fill).length) await db.from(table).update(fill).eq("id", keep);

      if (table === "person") {
        /* The memberships move so a merge never costs somebody their place
           on a list — then the duplicates that would collide are dropped. */
        const { data: mem } = await db.from("mk_list_member").select("list_id").in("person_id", drop);
        for (const m of (mem || []) as { list_id: string }[]) {
          await db.from("mk_list_member").upsert({ list_id: m.list_id, person_id: keep, added_by_email: me },
            { onConflict: "list_id,person_id", ignoreDuplicates: true }).then(() => null, () => null);
        }
        await db.from("mk_list_member").delete().in("person_id", drop).then(() => null, () => null);
        for (const t of ["met_person", "interaction", "outbound_queue", "message"]) {
          await db.from(t).update({ person_id: keep }).in("person_id", drop).then(() => null, () => null);
        }
      } else {
        for (const t of ["person", "met_person", "interaction", "outbound_queue", "opportunity", "quotation"]) {
          await db.from(t).update({ company_id: keep }).in("company_id", drop).then(() => null, () => null);
        }
      }

      const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).in("id", drop);
      if (error) throw new Error(error.message);
      if (f.id) await close(f.id, "done");
      return NextResponse.json({ ok: true, kept: keep, merged: drop.length });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
