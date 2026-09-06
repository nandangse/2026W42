import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";

export const dynamic = "force-dynamic";

/**
 * GET /api/saamaan/wip — WIP, one warehouse per live job (Dr Raghu, 3 Sep
 * 2026: "each Live Job Number will be a wip. Create a table WIP_jobnumber
 * — this is the warehouse where the WIP will be kept. This currently
 * doesn't need to be confused with the ERP WIP. This is separate.")
 *
 * EVERY READ REFRESHES THE STARRED COLUMNS FROM GENIE — the board (jobs:
 * job no, customer tag, project, value, throughput, kitting owner), the
 * BOM mirror (the latest submitted BOM on the project) and the RBOM — and
 * writes them into material_wip, so the table is always the board's
 * current word. The columns Genie fills later (kitted, pending, TVC,
 * throughput calc) are never touched by a refresh. A job that leaves the
 * board is marked not live, never dropped: its WIP may still hold things.
 *
 * The board row rides along whole, so the screen can open the same job
 * lightbox every other Genie app opens.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const rev = (id: string) => Number((id.match(/-(\d+)$/) ?? [])[1] ?? 0);
const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();

    /**
     * ?job=<no> — one WIP warehouse opened (Dr Raghu, 4 Sep 2026: "keep
     * the WIP warehouse clickable. Open a lightbox. Show items kitted and
     * kitted date, any remarks, items pending."). Every RBOM line of the
     * job's project with what the MRP's ticks have issued into WIP_<job>:
     * kitted when the full quantity has gone, partial when some, pending
     * when none; the date is the last issue's; the remarks are the RBOM
     * line's and every issue's note.
     */
    const jobNo = S(new URL(req.url).searchParams.get("job"));
    if (jobNo) {
      const { data: job } = await admin.from("jobs").select("id, proj, tag, cust, fam, val, kitting_owner").eq("id", jobNo).maybeSingle();
      const proj = S(job?.proj);
      const { data: rb } = proj ? await admin.from("material_rbom").select("rbom_id").eq("project_id", proj).maybeSingle() : { data: null };
      const rbomId = S(rb?.rbom_id);
      const lines: Doc[] = [];
      for (let a = 0; rbomId && a < 100000; a += 1000) {
        const { data, error } = await admin.from("material_rbom_item").select("id, idx, item_code, item_name, item_group, qty, uom, rate, amount, bom_status, bom_remark, description").eq("rbom_id", rbomId).order("idx").range(a, a + 999);
        if (error) throw new Error(error.message);
        lines.push(...((data ?? []) as Doc[]));
        if (!data || data.length < 1000) break;
      }
      const { data: iss } = await admin.from("material_issue").select("item_code, item_name, qty, uom, rate, amount, issued_by, issued_at, note, warehouse").eq("job_no", jobNo).order("issued_at");
      const issues = (iss ?? []) as Doc[];
      const byCode = new Map<string, Doc[]>();
      for (const i of issues) (byCode.get(S(i.item_code)) ?? byCode.set(S(i.item_code), []).get(S(i.item_code))!).push(i);
      const items = lines.map((l) => {
        const code = S(l.item_code), q = Number(l.qty) || 0, rate = N(l.rate);
        const mine = byCode.get(code) ?? [];
        const got = mine.reduce((a, i) => a + (Number(i.qty) || 0), 0);
        const last = mine[mine.length - 1];
        const status = q > 0 && got >= q ? "kitted" : got > 0 ? "partial" : "pending";
        const remarks = [S(l.bom_remark), ...mine.map((i) => S(i.note))].filter(Boolean);
        return {
          item_code: code, item_name: S(l.item_name), item_group: S(l.item_group), qty: q, uom: S(l.uom), rate, value: rate === null ? null : q * rate,
          issued: got, pending: Math.max(0, q - got), status, kitted_at: last ? S(last.issued_at) : "", kitted_by: last ? S(last.issued_by) : "",
          issues: mine.map((i) => ({ qty: Number(i.qty) || 0, at: S(i.issued_at), by: S(i.issued_by), note: S(i.note) })),
          remarks, bom_status: S(l.bom_status), description: S(l.description),
        };
      });
      // issues that no RBOM line names — still in the warehouse, still shown
      const named = new Set(items.map((i) => i.item_code));
      for (const [code, mine] of byCode) if (!named.has(code)) {
        const got = mine.reduce((a, i) => a + (Number(i.qty) || 0), 0); const last = mine[mine.length - 1];
        items.push({ item_code: code, item_name: S(mine[0].item_name), item_group: "(not on the RBOM)", qty: 0, uom: S(mine[0].uom), rate: N(mine[0].rate), value: null, issued: got, pending: 0, status: "kitted", kitted_at: S(last.issued_at), kitted_by: S(last.issued_by), issues: mine.map((i) => ({ qty: Number(i.qty) || 0, at: S(i.issued_at), by: S(i.issued_by), note: S(i.note) })), remarks: mine.map((i) => S(i.note)).filter(Boolean), bom_status: "", description: "" });
      }
      const sum = (f: (x: typeof items[number]) => number) => items.reduce((a, x) => a + f(x), 0);
      return NextResponse.json({
        job: { job_no: jobNo, warehouse: `WIP_${jobNo}`, project_id: proj, tag: S(job?.tag), customer: S(job?.cust), family: S(job?.fam), value: N(job?.val), kitting_owner: S(job?.kitting_owner), rbom_id: rbomId },
        items,
        totals: { lines: items.length, kitted: items.filter((i) => i.status === "kitted").length, partial: items.filter((i) => i.status === "partial").length, pending: items.filter((i) => i.status === "pending").length,
          value: sum((i) => i.value ?? 0), value_kitted: sum((i) => (i.rate ?? 0) * Math.min(i.qty || i.issued, i.issued)), value_pending: sum((i) => (i.rate ?? 0) * i.pending), issues: issues.length, last_issue: issues.length ? S(issues[issues.length - 1].issued_at) : "" },
      });
    }

    // 1 — the board: every live job, whole.
    const { data: jobs, error: jErr } = await admin.from("jobs").select("*")
      .eq("active", true).eq("delivered", false).is("archived_at", null).order("id").limit(5000);
    if (jErr) throw new Error(jErr.message);
    const live = (jobs ?? []) as Doc[];
    const projectIds = [...new Set(live.map((j) => S(j.proj)).filter(Boolean))];

    // 2 — the ERP's latest submitted BOM per project, and Genie's RBOM.
    const [boms, rboms, people] = await Promise.all([
      projectIds.length ? admin.from("material_bom").select("bom_id, project_id, docstatus").in("project_id", projectIds).eq("docstatus", 1).limit(5000) : Promise.resolve({ data: [], error: null }),
      projectIds.length ? admin.from("material_rbom").select("rbom_id, project_id").in("project_id", projectIds).limit(5000) : Promise.resolve({ data: [], error: null }),
      admin.from("profiles").select("initials, display_name, email").limit(1000),
    ]);
    const latestBom = new Map<string, string>();
    for (const b of (boms.data ?? []) as Doc[]) {
      const p = S(b.project_id), id = S(b.bom_id);
      if (!latestBom.has(p) || rev(id) > rev(latestBom.get(p)!)) latestBom.set(p, id);
    }
    const rbomOf = new Map(((rboms.data ?? []) as Doc[]).map((r) => [S(r.project_id), S(r.rbom_id)]));
    const nameOf = new Map(((people.data ?? []) as Doc[]).map((p) => [S(p.initials).toUpperCase(), S(p.display_name) || S(p.email).split("@")[0]]));

    // 3 — the starred columns, refreshed. Genie's own columns are not in
    //     this payload, so the upsert leaves them exactly as they were.
    const now = new Date().toISOString();
    const rows = live.map((j) => {
      const proj = S(j.proj);
      return {
        job_no: S(j.id),
        warehouse: `WIP_${S(j.id)}`,
        customer_tag: S(j.tag),
        project_id: proj,
        customer: S(j.cust),
        product_family: S(j.fam),
        bom_no_erp: latestBom.get(proj) ?? "",
        rbom_no: rbomOf.get(proj) ?? "",
        value: N(j.val),
        throughput_erp_pct: N(j.tpp),
        throughput_erp_value: N(j.tpv),
        kitting_pct: N(j.kit),
        kitting_owner: S(j.kitting_owner),
        live: true,
        refreshed_at: now,
      };
    });
    let installed = true;
    if (rows.length) {
      const { error } = await admin.from("material_wip").upsert(rows, { onConflict: "job_no" });
      if (error) {
        if (notInstalled(error.message)) installed = false;
        else throw new Error(error.message);
      }
    }
    // A job gone from the board keeps its WIP row, marked not live.
    if (installed) {
      const ids = rows.map((r) => r.job_no);
      const stale = admin.from("material_wip").update({ live: false }).eq("live", true);
      const { error } = ids.length ? await stale.not("job_no", "in", `(${ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",")})`) : await stale;
      if (error && !notInstalled(error.message)) throw new Error(error.message);
    }

    // 3b — kitted and pending, from the RBOM and the issues the MRP ticks
    //      made: kitted = items whose full RBOM quantity has gone into the
    //      job's WIP, pending = the rest; the values at the RBOM's rates.
    //      Not stored — derived on every read, so they can never go stale.
    const kitting = new Map<string, { nos_kitted: number; value_kitted: number; nos_pending: number; value_pending: number; kitting_value_pct: number | null }>();
    try {
      const rbomIds = [...new Set([...rbomOf.values()])].filter(Boolean);
      const lines: Doc[] = [];
      for (let a = 0; rbomIds.length && a < 100000; a += 1000) {
        const { data, error } = await admin.from("material_rbom_item").select("rbom_id, item_code, qty, rate").in("rbom_id", rbomIds).order("id").range(a, a + 999);
        if (error) throw error;
        lines.push(...((data ?? []) as Doc[]));
        if (!data || data.length < 1000) break;
      }
      const jobIds = rows.map((r) => r.job_no);
      const issued: Doc[] = [];
      for (let a = 0; jobIds.length && a < 100000; a += 1000) {
        const { data, error } = await admin.from("material_issue").select("job_no, item_code, qty, amount").in("job_no", jobIds).order("id").range(a, a + 999);
        if (error) throw error;
        issued.push(...((data ?? []) as Doc[]));
        if (!data || data.length < 1000) break;
      }
      const gone = new Map<string, { qty: number; amount: number }>();
      for (const i of issued) {
        const k = `${S(i.job_no)}|${S(i.item_code)}`;
        const o = gone.get(k) ?? { qty: 0, amount: 0 };
        o.qty += Number(i.qty) || 0; o.amount += Number(i.amount) || 0; gone.set(k, o);
      }
      const byRbom = new Map<string, Doc[]>();
      for (const l of lines) (byRbom.get(S(l.rbom_id)) ?? byRbom.set(S(l.rbom_id), []).get(S(l.rbom_id))!).push(l);
      for (const r of rows) {
        const ls = byRbom.get(r.rbom_no) ?? [];
        if (!ls.length) continue;
        let nk = 0, vk = 0, np = 0, vp = 0, total = 0;
        for (const l of ls) {
          const q = Number(l.qty) || 0, rate = Number(l.rate) || 0;
          const g = gone.get(`${r.job_no}|${S(l.item_code)}`);
          const gq = Math.min(q, g?.qty ?? 0);
          total += q * rate; vk += gq * rate; vp += (q - gq) * rate;
          if (q > 0 && gq >= q) nk++; else np++;
        }
        kitting.set(r.job_no, { nos_kitted: nk, value_kitted: vk, nos_pending: np, value_pending: vp, kitting_value_pct: total > 0 ? (vk / total) * 100 : null });
      }
    } catch (e) {
      // Before 0123 / 0126 there is nothing to derive from; the columns stay dots.
      if (!notInstalled(String((e as { message?: string })?.message || e))) throw e;
    }

    // 4 — read back with Genie's own columns, and hand the board row along.
    let table: Doc[] = rows;
    if (installed) {
      const { data, error } = await admin.from("material_wip").select("*").eq("live", true).order("job_no").limit(5000);
      if (error) throw new Error(error.message);
      table = (data ?? []) as Doc[];
    }
    const jobBy = new Map(live.map((j) => [S(j.id), j]));
    const out = table.map((w) => {
      const j = jobBy.get(S(w.job_no)) ?? {};
      const own = S(j.own).toUpperCase();
      const k = kitting.get(S(w.job_no));
      return {
        ...w,
        ...(k ? { nos_kitted: k.nos_kitted, value_kitted: k.value_kitted, nos_pending: k.nos_pending, value_pending: k.value_pending, kitting_value_pct: k.kitting_value_pct } : {}),
        kitting_owner_name: nameOf.get(S(w.kitting_owner).toUpperCase()) ?? "",
        job: {
          id: S(j.id), tag: S(j.tag), cust: S(j.cust), fam: S(j.fam), tdd: j.tdd ?? null, otd: j.otd ?? null, stat: S(j.stat),
          val: Number(j.val) || 0, tpv: Number(j.tpv) || 0, tpp: Number(j.tpp) || 0, kit: Number(j.kit) || 0, pct: Number(j.pct) || 0,
          note: S(j.note), escalation: (j.escalation as string | null) ?? null,
          amtNeeded: N(j.amt_needed), payOnDelivery: N(j.pay_on_delivery), mandays: (j.mandays as string | null) ?? null,
          ownerInitials: own || null, ownerName: nameOf.get(own) ?? null,
        },
      };
    });
    return NextResponse.json({ ok: true, installed, rows: out, refreshedAt: now });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { job_no, patch } — Genie's own columns on a WIP row. */
export async function POST(req: Request) {
  try {
    await requireSaamaan();
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const job = S(body.job_no);
    if (!job) throw new HttpError(400, "job_no required");
    const allowed = ["nos_kitted", "value_kitted", "nos_pending", "value_pending", "tvc_pct", "throughput_calc", "note"];
    const patch: Doc = {};
    for (const k of allowed) if (body.patch && k in body.patch) patch[k] = k === "note" ? S(body.patch[k]) : N(body.patch[k]);
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change.");
    const { error, count } = await adminClient().from("material_wip").update(patch, { count: "exact" }).eq("job_no", job);
    if (error) {
      if (notInstalled(error.message)) throw new HttpError(503, "Run migration 0125 first — the WIP table doesn't exist yet.");
      throw new Error(error.message);
    }
    if (!count) throw new HttpError(404, `No WIP for job ${job}.`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
