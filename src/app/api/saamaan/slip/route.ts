import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { transferToWip } from "@/lib/erp-stock-entry";

export const dynamic = "force-dynamic";

/**
 * Issue slips, the kitting register, and who things go to (Dr Raghu,
 * 3 Sep 2026).
 *
 *   GET ?mode=slips            — every slip, newest first.
 *   GET ?mode=slip&id=         — one slip with its lines, grouped by the
 *                                screen: project, then item group.
 *   GET ?mode=kitting          — the kitting register: every tick, every
 *                                issue into a WIP, newest first.
 *   GET ?mode=people           — Genie's people, for the "to" of a slip and
 *                                the routing in Masters.
 *   POST { action: "release", id, line_id, qty }  — the store releases a
 *        line, wholly or partly; the slip closes itself when every line is.
 *   POST { action: "done" | "cancel", id }
 *   POST { action: "setting", key, value }         — store_email,
 *        purchase_email, coo_email.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);
const SETTINGS = ["store_email", "purchase_email", "coo_email"];

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const mode = S(p.get("mode") || "slips");
    try {
      if (mode === "people") {
        const [{ data: people }, { data: settings }] = await Promise.all([
          admin.from("profiles").select("email, display_name, initials, role, disabled").eq("disabled", false).order("email"),
          admin.from("material_setting").select("key, value"),
        ]);
        const set: Record<string, string> = {};
        for (const s of settings ?? []) set[S(s.key)] = S(s.value);
        return NextResponse.json({ ok: true, people: people ?? [], settings: set });
      }
      if (mode === "released") {
        const mrp = S(p.get("mrp"));
        let sq = admin.from("material_slip").select("id, slip_no, kind, to_email").limit(500);
        if (mrp) sq = sq.eq("mrp_id", mrp);
        const { data: slips } = await sq;
        const ids = (slips ?? []).map((s) => S(s.id));
        const { data: lines, error } = ids.length
          ? await admin.from("material_slip_line").select("*").in("slip_id", ids).gt("released_qty", 0).order("released_at", { ascending: false }).limit(5000)
          : { data: [], error: null };
        if (error) throw error;
        const slipOf = new Map(((slips ?? []) as Doc[]).map((s) => [S(s.id), s]));
        return NextResponse.json({ ok: true, rows: (lines ?? []).map((l) => ({ ...l, slip_no: S(slipOf.get(S(l.slip_id))?.slip_no), slip_kind: S(slipOf.get(S(l.slip_id))?.kind), released_to: S(slipOf.get(S(l.slip_id))?.to_email) })) });
      }
      if (mode === "kitting") {
        const job = S(p.get("job")), mrp = S(p.get("mrp"));
        let q = admin.from("material_issue").select("*").order("issued_at", { ascending: false }).limit(2000);
        if (job) q = q.eq("job_no", job);
        if (mrp) q = q.eq("mrp_id", mrp);
        const { data, error } = await q;
        if (error) throw error;
        const slipIds = [...new Set((data ?? []).map((i) => S(i.slip_id)).filter(Boolean))];
        const { data: slips } = slipIds.length ? await admin.from("material_slip").select("id, slip_no, status").in("id", slipIds) : { data: [] };
        const slipOf = new Map(((slips ?? []) as Doc[]).map((s) => [S(s.id), s]));
        return NextResponse.json({ ok: true, rows: (data ?? []).map((i) => ({ ...i, slip_no: S(slipOf.get(S(i.slip_id))?.slip_no), slip_status: S(slipOf.get(S(i.slip_id))?.status) })) });
      }
      if (mode === "slip") {
        const id = S(p.get("id"));
        const [{ data: slip, error }, { data: lines }] = await Promise.all([
          admin.from("material_slip").select("*").eq("id", id).maybeSingle(),
          admin.from("material_slip_line").select("*").eq("slip_id", id).order("project_id").order("item_group").order("item_code"),
        ]);
        if (error) throw error;
        if (!slip) throw new HttpError(404, "No such slip.");
        const projIds = [...new Set((lines ?? []).map((l) => S(l.project_id)).filter(Boolean))];
        const { data: projects } = projIds.length ? await admin.from("material_project").select("project_id, project_name").in("project_id", projIds) : { data: [] };
        const projName = new Map(((projects ?? []) as Doc[]).map((x) => [S(x.project_id), S(x.project_name)]));
        // The production owner of each job, for the slip's face — from the
        // board, named through profiles.
        const jobNos = [...new Set((lines ?? []).map((l) => S(l.job_no)).filter(Boolean))];
        const [{ data: jobs }, { data: people }] = await Promise.all([
          jobNos.length ? admin.from("jobs").select("id, tag, production_owner, own").in("id", jobNos) : Promise.resolve({ data: [] }),
          admin.from("profiles").select("email, initials, display_name"),
        ]);
        const byInitials = new Map(((people ?? []) as Doc[]).map((x) => [S(x.initials).toUpperCase(), S(x.display_name) || S(x.email).split("@")[0]]));
        const byEmail = new Map(((people ?? []) as Doc[]).map((x) => [S(x.email).toLowerCase(), S(x.display_name) || S(x.email).split("@")[0]]));
        const jobInfo: Record<string, { tag: string; production_owner: string; owner_name: string }> = {};
        for (const j of (jobs ?? []) as Doc[]) {
          const ini = S(j.production_owner) || S(j.own);
          jobInfo[S(j.id)] = { tag: S(j.tag), production_owner: ini, owner_name: byInitials.get(ini.toUpperCase()) ?? ini };
        }
        return NextResponse.json({
          ok: true, slip, jobs: jobInfo,
          from_name: byEmail.get(S(slip.from_email).toLowerCase()) ?? S(slip.from_email).split("@")[0],
          to_name: byEmail.get(S(slip.to_email).toLowerCase()) ?? S(slip.to_email).split("@")[0],
          lines: (lines ?? []).map((l) => ({ ...l, project_name: projName.get(S(l.project_id)) ?? "" })),
        });
      }
      // slips
      const mrp = S(p.get("mrp"));
      let sq = admin.from("material_slip").select("*").order("created_at", { ascending: false }).limit(500);
      if (mrp) sq = sq.eq("mrp_id", mrp);
      const { data: slips, error } = await sq;
      if (error) throw error;
      const ids = (slips ?? []).map((s) => S(s.id));
      const { data: lines } = ids.length ? await admin.from("material_slip_line").select("slip_id, qty, released_qty, project_id, amount").in("slip_id", ids).limit(20000) : { data: [] };
      const agg = new Map<string, { lines: number; qty: number; released: number; projects: Set<string>; amount: number }>();
      for (const l of (lines ?? []) as Doc[]) {
        const o = agg.get(S(l.slip_id)) ?? { lines: 0, qty: 0, released: 0, projects: new Set<string>(), amount: 0 };
        o.lines++; o.qty += Number(l.qty) || 0; o.released += Number(l.released_qty) || 0; o.amount += Number(l.amount) || 0;
        if (S(l.project_id)) o.projects.add(S(l.project_id));
        agg.set(S(l.slip_id), o);
      }
      return NextResponse.json({
        ok: true,
        rows: (slips ?? []).map((s) => {
          const a = agg.get(S(s.id));
          return { ...s, lines: a?.lines ?? 0, qty: a?.qty ?? 0, released: a?.released ?? 0, amount: a?.amount ?? 0, projects: a ? [...a.projects] : [] };
        }),
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
      if (notInstalled(m)) return NextResponse.json({ error: "Run migration 0127 first — the slip tables don't exist yet." }, { status: 503 });
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
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const action = S(body.action);
    try {
      if (action === "setting") {
        const key = S(body.key);
        if (!SETTINGS.includes(key)) throw new HttpError(400, "Unknown setting.");
        const { error } = await admin.from("material_setting").upsert({ key, value: S(body.value), updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      const id = S(body.id);
      if (!id) throw new HttpError(400, "id required");
      const { data: slip } = await admin.from("material_slip").select("*").eq("id", id).maybeSingle();
      if (!slip) throw new HttpError(404, "No such slip.");

      if (action === "release") {
        const lineId = S(body.line_id);
        const { data: line } = await admin.from("material_slip_line").select("*").eq("id", lineId).eq("slip_id", id).maybeSingle();
        if (!line) throw new HttpError(404, "No such line.");
        const owed = (Number(line.qty) || 0) - (Number(line.released_qty) || 0);
        if (owed <= 0) throw new HttpError(400, "Already released in full.");
        const asked = N(body.qty);
        const qty = asked === null ? owed : Math.min(owed, asked);
        if (qty <= 0) throw new HttpError(400, "The quantity has to be more than nothing.");
        /* THE PHYSICAL MOVE (Dr Raghu, 15 Oct 2026): the release IS a stock transfer in the ERP —
           Stock warehouse → WIP, with the job number. If the ERP will not move it, the line is
           NOT released, and the reason is shown on it. */
        let moved: { name: string; from: string; to: string } | null = null;
        try {
          moved = await transferToWip(admin, { item_code: S(line.item_code), item_name: S(line.item_name), qty, uom: S(line.uom), job_no: S(line.job_no), slip_no: S(slip.slip_no) }, me.email);
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          await admin.from("material_slip_line").update({ erp_error: why.slice(0, 500), erp_at: new Date().toISOString() }).eq("id", lineId).then(() => null, () => null);
          throw new HttpError(409, `Not released — the stock did not move: ${why}`);
        }
        const { error } = await admin.from("material_slip_line").update({
          released_qty: (Number(line.released_qty) || 0) + qty, released_at: new Date().toISOString(), released_by: me.email,
          erp_ste: moved.name, erp_from: moved.from, erp_to: moved.to, erp_error: null, erp_at: new Date().toISOString(),
        }).eq("id", lineId);
        if (error) {
          /* before 0236 the columns are not there — the release still lands, the entry's number does not */
          if (/erp_|schema cache/i.test(error.message)) { const r2 = await admin.from("material_slip_line").update({ released_qty: (Number(line.released_qty) || 0) + qty, released_at: new Date().toISOString(), released_by: me.email }).eq("id", lineId); if (r2.error) throw r2.error; }
          else throw error;
        }
        // Every line released → the slip is done, and the ladder stops.
        const { data: rest } = await admin.from("material_slip_line").select("qty, released_qty").eq("slip_id", id);
        const allDone = (rest ?? []).every((l) => (Number(l.released_qty) || 0) >= (Number(l.qty) || 0));
        if (allDone && S(slip.status) === "open") {
          await admin.from("material_slip").update({ status: "done", done_at: new Date().toISOString() }).eq("id", id);
        }
        return NextResponse.json({ ok: true, released: qty, done: allDone, erp_ste: moved.name, from: moved.from, to: moved.to });
      }
      if (action === "done") {
        /* MARK DONE MOVES WHAT IS STILL UNMOVED (15 Oct 2026): every line not yet released goes to WIP now; one that cannot stops the slip, and says why */
        const { data: open } = await admin.from("material_slip_line").select("*").eq("slip_id", id);
        for (const l of open ?? []) {
          const owed = (Number(l.qty) || 0) - (Number(l.released_qty) || 0);
          if (owed <= 0) continue;
          let moved: { name: string; from: string; to: string };
          try { moved = await transferToWip(admin, { item_code: S(l.item_code), item_name: S(l.item_name), qty: owed, uom: S(l.uom), job_no: S(l.job_no), slip_no: S(slip.slip_no) }, me.email); }
          catch (e) { const why = e instanceof Error ? e.message : String(e); await admin.from("material_slip_line").update({ erp_error: why.slice(0, 500), erp_at: new Date().toISOString() }).eq("id", l.id).then(() => null, () => null); throw new HttpError(409, `Not done — ${S(l.job_no)} · ${S(l.item_code)} did not move: ${why}`); }
          const up = await admin.from("material_slip_line").update({ released_qty: Number(l.qty) || 0, released_at: new Date().toISOString(), released_by: me.email, erp_ste: moved.name, erp_from: moved.from, erp_to: moved.to, erp_error: null, erp_at: new Date().toISOString() }).eq("id", l.id);
          if (up.error && /erp_|schema cache/i.test(up.error.message)) await admin.from("material_slip_line").update({ released_qty: Number(l.qty) || 0, released_at: new Date().toISOString(), released_by: me.email }).eq("id", l.id);
        }
      }
      if (action === "done" || action === "cancel") {
        const { error } = await admin.from("material_slip").update({ status: action === "done" ? "done" : "cancelled", done_at: new Date().toISOString(), note: S(body.note) || S(slip.note) }).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      throw new HttpError(400, "Unknown action.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
      if (notInstalled(m)) throw new HttpError(503, "Run migration 0127 first — the slip tables don't exist yet.");
      throw e;
    }
  } catch (e) {
    return errJson(e);
  }
}
