import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";

export const dynamic = "force-dynamic";

/**
 * MRP — Material Resource Planning (Dr Raghu, 3 Sep 2026).
 *
 *   GET  ?mode=list                 — the runs, newest first, and the board's
 *                                     live jobs grouped by project for the picker.
 *   GET  ?mode=run&id=<uuid>        — one run: its jobs, and the GRID — the
 *                                     RBOM of every chosen job summed into
 *                                     items (rows) by jobs (columns), each
 *                                     cell carrying what has been issued.
 *   POST { action: "create", name }
 *   POST { action: "jobs", id, job_nos: [] }   — the chosen set, kept.
 *   POST { action: "generate", id }
 *   POST { action: "issue", id, job_no, item_code, qty }
 *        — the tick: one row into material_issue, the entry in that job's
 *          WIP warehouse, that quantity, that date, that person. Never more
 *          than what the RBOM still owes. STOCK IS NOT REDUCED — next step.
 *
 * THE RULES HE SET: each job is one unit, so a cell's quantity is the RBOM
 * line's; kitted and pending are COUNTS of items, kitting % is BY VALUE;
 * Draft lines come too, marked; a tick issues the full remaining quantity
 * unless the box beside it says less.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

async function liveJobs(admin: ReturnType<typeof adminClient>): Promise<Doc[]> {
  const { data, error } = await admin.from("jobs").select("id, tag, cust, fam, proj, tdd, val, stat, kitting_owner")
    .eq("active", true).eq("delivered", false).is("archived_at", null).order("id").limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Doc[];
}

/** MRP-0007: one up from the highest on record. */
async function nextNo(admin: ReturnType<typeof adminClient>): Promise<string> {
  const { data } = await admin.from("material_mrp").select("mrp_no").order("mrp_no", { ascending: false }).limit(1);
  const last = Number((S(data?.[0]?.mrp_no).match(/(\d+)$/) ?? [])[1] ?? 0);
  return `MRP-${String(last + 1).padStart(4, "0")}`;
}

/** The grid for a run: rows = items across every chosen job's RBOM, columns = the jobs. */
async function grid(admin: ReturnType<typeof adminClient>, mrpId: string) {
  const { data: run, error: rErr } = await admin.from("material_mrp").select("*").eq("id", mrpId).maybeSingle();
  if (rErr) throw rErr;
  if (!run) throw new HttpError(404, "No such MRP run.");
  const { data: picked } = await admin.from("material_mrp_job").select("job_no").eq("mrp_id", mrpId).order("job_no");
  const jobNos = (picked ?? []).map((j) => S(j.job_no));
  const board = await liveJobs(admin);
  const byJob = new Map(board.map((j) => [S(j.id), j]));
  const projIds = [...new Set(jobNos.map((j) => S(byJob.get(j)?.proj)).filter(Boolean))];

  const [projects, rboms] = await Promise.all([
    projIds.length ? admin.from("material_project").select("project_id, project_name").in("project_id", projIds) : Promise.resolve({ data: [] }),
    projIds.length ? admin.from("material_rbom").select("rbom_id, project_id, item_code, item_name").in("project_id", projIds) : Promise.resolve({ data: [] }),
  ]);
  const projName = new Map(((projects.data ?? []) as Doc[]).map((p) => [S(p.project_id), S(p.project_name)]));
  const rbomOf = new Map(((rboms.data ?? []) as Doc[]).map((r) => [S(r.project_id), r]));
  const rbomIds = [...new Set([...rbomOf.values()].map((r) => S(r.rbom_id)))];

  const lines: Doc[] = [];
  for (let a = 0; rbomIds.length && a < 100000; a += 1000) {
    const { data, error } = await admin.from("material_rbom_item")
      .select("id, rbom_id, idx, item_code, item_name, item_group, qty, uom, rate, amount, bom_status, source_bom")
      .in("rbom_id", rbomIds).order("rbom_id").order("idx").range(a, a + 999);
    if (error) throw error;
    lines.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  const issues: Doc[] = [];
  for (let a = 0; jobNos.length && a < 100000; a += 1000) {
    const { data, error } = await admin.from("material_issue").select("job_no, item_code, qty, amount, issued_by, issued_at")
      .in("job_no", jobNos).order("issued_at").range(a, a + 999);
    if (error) throw error;
    issues.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  // Item group from the mirror where the line carries none.
  const codes = [...new Set(lines.map((l) => S(l.item_code)))];
  const groupOf = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_group").in("item_code", codes.slice(i, i + 500));
    for (const it of data ?? []) groupOf.set(S(it.item_code), S(it.item_group));
  }

  // The columns: jobs under their project, in project order then job order.
  const jobs = jobNos.map((no) => {
    const j = byJob.get(no);
    const proj = S(j?.proj);
    const rb = rbomOf.get(proj);
    return {
      job_no: no, live: !!j, project_id: proj, project_name: projName.get(proj) ?? "", tag: S(j?.tag), cust: S(j?.cust), fam: S(j?.fam),
      tdd: (j?.tdd as string | null) ?? null, val: N(j?.val), stat: S(j?.stat), rbom_id: rb ? S(rb.rbom_id) : "",
    };
  }).sort((a, b) => a.project_id.localeCompare(b.project_id, undefined, { numeric: true }) || a.job_no.localeCompare(b.job_no));

  // The rows: every item across the chosen RBOMs, grouped.
  const linesByRbom = new Map<string, Doc[]>();
  for (const l of lines) (linesByRbom.get(S(l.rbom_id)) ?? linesByRbom.set(S(l.rbom_id), []).get(S(l.rbom_id))!).push(l);
  const issuedBy = new Map<string, { qty: number; amount: number; last: Doc | null; n: number }>();
  for (const i of issues) {
    const k = `${S(i.job_no)}|${S(i.item_code)}`;
    const o = issuedBy.get(k) ?? { qty: 0, amount: 0, last: null, n: 0 };
    o.qty += Number(i.qty) || 0; o.amount += Number(i.amount) || 0; o.last = i; o.n++;
    issuedBy.set(k, o);
  }
  const rows = new Map<string, { item_code: string; item_name: string; item_group: string; cells: Record<string, Doc> }>();
  for (const j of jobs) {
    if (!j.rbom_id) continue;
    for (const l of linesByRbom.get(j.rbom_id) ?? []) {
      const code = S(l.item_code);
      if (!code) continue;
      const row = rows.get(code) ?? { item_code: code, item_name: S(l.item_name), item_group: S(l.item_group) || groupOf.get(code) || "(no group)", cells: {} };
      const qty = Number(l.qty) || 0, rate = N(l.rate);
      const done = issuedBy.get(`${j.job_no}|${code}`);
      row.cells[j.job_no] = {
        qty, uom: S(l.uom), rate, value: rate === null ? null : qty * rate, status: S(l.bom_status), source: S(l.source_bom), rbom_item_id: l.id,
        issued: done?.qty ?? 0, issued_value: done?.amount ?? 0, issues: done?.n ?? 0,
        last_by: done?.last ? S(done.last.issued_by) : "", last_at: done?.last ? S(done.last.issued_at) : "",
      };
      rows.set(code, row);
    }
  }
  const items = [...rows.values()].sort((a, b) => a.item_group.localeCompare(b.item_group) || a.item_code.localeCompare(b.item_code));
  return { run, jobs, items, issues: issues.length };
}

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const mode = S(p.get("mode") || "list");
    try {
      if (mode === "run") {
        const id = S(p.get("id"));
        if (!id) throw new HttpError(400, "id required");
        return NextResponse.json({ ok: true, ...(await grid(admin, id)) });
      }
      const [runs, board, counts] = await Promise.all([
        admin.from("material_mrp").select("*").order("created_at", { ascending: false }).limit(200),
        liveJobs(admin),
        admin.from("material_mrp_job").select("mrp_id").limit(20000),
      ]);
      if (runs.error) throw runs.error;
      const per = new Map<string, number>();
      for (const c of counts.data ?? []) per.set(S(c.mrp_id), (per.get(S(c.mrp_id)) ?? 0) + 1);
      const projIds = [...new Set(board.map((j) => S(j.proj)).filter(Boolean))];
      const { data: projects } = projIds.length ? await admin.from("material_project").select("project_id, project_name").in("project_id", projIds) : { data: [] };
      const projName = new Map(((projects ?? []) as Doc[]).map((x) => [S(x.project_id), S(x.project_name)]));
      return NextResponse.json({
        ok: true,
        runs: (runs.data ?? []).map((r) => ({ ...r, jobs: per.get(S(r.id)) ?? 0 })),
        board: board.map((j) => ({ job_no: S(j.id), tag: S(j.tag), cust: S(j.cust), fam: S(j.fam), project_id: S(j.proj), project_name: projName.get(S(j.proj)) ?? "", tdd: j.tdd ?? null, val: N(j.val), stat: S(j.stat) })),
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
      if (notInstalled(m)) return NextResponse.json({ error: "Run migration 0126 first — the MRP tables don't exist yet." }, { status: 503 });
      throw e;
    }
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = S(body.action);
    try {
      if (action === "create") {
        const name = S(body.name);
        if (!name) throw new HttpError(400, "Give the run a name.");
        for (let attempt = 0; attempt < 3; attempt++) {
          const mrp_no = await nextNo(admin);
          const { data, error } = await admin.from("material_mrp").insert({ mrp_no, name, by: me.email }).select("*").maybeSingle();
          if (!error) return NextResponse.json({ ok: true, run: data });
          if (!/duplicate|unique/i.test(error.message)) throw error;
        }
        throw new HttpError(409, "Two runs were numbered at once — try again.");
      }
      const id = S(body.id);
      if (!id) throw new HttpError(400, "id required");

      if (action === "jobs") {
        const wanted: string[] = [...new Set(((Array.isArray(body.job_nos) ? body.job_nos : []) as unknown[]).map((x) => S(x)).filter(Boolean))];
        const { data: have } = await admin.from("material_mrp_job").select("job_no").eq("mrp_id", id);
        const had = new Set<string>((have ?? []).map((j) => S(j.job_no)));
        const add = wanted.filter((j) => !had.has(j)).map((job_no) => ({ mrp_id: id, job_no, added_by: me.email }));
        const drop: string[] = [...had].filter((j) => !wanted.includes(j));
        if (add.length) { const { error } = await admin.from("material_mrp_job").insert(add); if (error) throw error; }
        if (drop.length) { const { error } = await admin.from("material_mrp_job").delete().eq("mrp_id", id).in("job_no", drop); if (error) throw error; }
        return NextResponse.json({ ok: true, added: add.length, dropped: drop.length });
      }
      if (action === "generate") {
        const { error } = await admin.from("material_mrp").update({ generated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, ...(await grid(admin, id)) });
      }
      if (action === "issue") {
        const job_no = S(body.job_no), item_code = S(body.item_code);
        if (!job_no || !item_code) throw new HttpError(400, "job_no and item_code required");
        // What the RBOM owes this job for this item, less what has gone.
        const { data: j } = await admin.from("jobs").select("proj").eq("id", job_no).maybeSingle();
        const { data: rb } = j?.proj ? await admin.from("material_rbom").select("rbom_id").eq("project_id", String(j.proj)).maybeSingle() : { data: null };
        if (!rb) throw new HttpError(400, `No RBOM for job ${job_no}'s project.`);
        const { data: line } = await admin.from("material_rbom_item").select("id, item_name, qty, uom, rate").eq("rbom_id", String(rb.rbom_id)).eq("item_code", item_code).limit(1).maybeSingle();
        if (!line) throw new HttpError(400, `${item_code} is not on ${rb.rbom_id}.`);
        const { data: gone } = await admin.from("material_issue").select("qty").eq("job_no", job_no).eq("item_code", item_code);
        const issued = (gone ?? []).reduce((a, x) => a + (Number(x.qty) || 0), 0);
        const owed = (Number(line.qty) || 0) - issued;
        if (owed <= 0) throw new HttpError(400, "Nothing left to issue — the RBOM quantity has gone already.");
        const asked = N(body.qty);
        const qty = asked === null ? owed : Math.min(owed, asked);
        if (qty <= 0) throw new HttpError(400, "The quantity has to be more than nothing.");
        const rate = N(line.rate);
        const { error } = await admin.from("material_issue").insert({
          job_no, warehouse: `WIP_${job_no}`, item_code, item_name: S(line.item_name), qty, uom: S(line.uom), rate,
          amount: rate === null ? null : qty * rate, rbom_id: String(rb.rbom_id), rbom_item_id: line.id, mrp_id: id, issued_by: me.email,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true, qty, remaining: owed - qty });
      }
      throw new HttpError(400, "Unknown action.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
      if (notInstalled(m)) throw new HttpError(503, "Run migration 0126 first — the MRP tables don't exist yet.");
      throw e;
    }
  } catch (e) {
    return errJson(e);
  }
}
