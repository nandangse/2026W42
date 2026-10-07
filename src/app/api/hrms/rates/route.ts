import { NextResponse } from "next/server";
import { payDaysFor } from "@/lib/salary";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import * as XLSX from "xlsx";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { people } from "@/lib/hrms-wa";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * HRIS → Salary Rate List (Dr Raghu, 4 Sep 2026).
 *
 * GET                       the structures, and the rates of ?structure=<id> (default: the Live one)
 * POST { action: "seed_old" }                     Salary Structure 2025-06 from the records' pay fields, Overwritten
 * POST { action: "create", code, title, from? }   a Draft, copied from another structure or empty
 * POST { action: "set_live", id }                 makes it Live; the Live one becomes Overwritten
 * POST { action: "save_rate", structure_id, employee_id, ...fields }   one line, inline
 * POST { action: "remove_rate", id }
 * POST { action: "rename", id, title, note, effective_from }
 * POST multipart (structure_id, file)             rows from a CSV/Excel, matched on Employee ID
 *
 * Gross and per-day are worked out on save: gross = basic + HRA + fixed +
 * conveyance + medical; per day = gross ÷ 26 for Labour and Labour - Contract,
 * ÷ 31 for everybody else — the DISPLAYED rate (Dr Raghu, 7 Sep and 7 Oct
 * 2026: "only for display purposes"). The payroll run works its own per-day
 * from the gross over the month's actual pay days.
 */
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[₹,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
const derive = (r: { basic_da: number; hra: number; fixed_allowance: number; conveyance: number; medical_allowance: number }, type?: string | null) => {
  const gross = r.basic_da + r.hra + r.fixed_allowance + r.conveyance + r.medical_allowance;
  return { gross, per_day: Math.round(gross / payDaysFor(type ?? null)) };
};

export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const { data: structures, error } = await admin.from("hrms_salary_structure").select("*").order("code", { ascending: false });
    if (error) {
      if (/hrms_salary_structure|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ structures: [], rates: [], needsMigration: true });
      throw new Error(error.message);
    }
    const url = new URL(req.url);
    const wanted = url.searchParams.get("structure");
    const cur = (structures || []).find((s) => s.id === wanted) || (structures || []).find((s) => s.status === "Live") || (structures || [])[0] || null;
    let rates: unknown[] = [];
    if (cur) {
      const { data } = await admin.from("hrms_salary_rate").select("*").eq("structure_id", cur.id).order("employee_id");
      rates = data || [];
    }
    // counts per structure, so the tabs read as sheets
    const counts: Record<string, number> = {};
    try { const { data: c } = await admin.from("hrms_salary_rate").select("structure_id"); for (const r of c || []) counts[String(r.structure_id)] = (counts[String(r.structure_id)] || 0) + 1; } catch (e) { swallow("hrms/rates", e); /* */ }
    return NextResponse.json({ structures: (structures || []).map((s) => ({ ...s, lines: counts[String(s.id)] || 0 })), current: cur?.id || null, rates });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const sid = String(form.get("structure_id") || "");
      const f = form.get("file");
      if (!sid || !(f instanceof File)) throw new HttpError(400, "Structure and file, please.");
      const wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: "buffer", raw: /\.csv$/i.test(f.name) });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false }) as unknown[][];
      const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      let hr = 0, best = -1;
      for (let i = 0; i < Math.min(grid.length, 15); i++) { const sc = (grid[i] || []).filter((c) => /basic|gross|employee|^id$|name/.test(norm(c))).length; if (sc > best) { best = sc; hr = i; } }
      const H = (grid[hr] || []).map(norm);
      const col = (...res: RegExp[]) => H.findIndex((h) => res.some((re) => re.test(h)));
      const cId = col(/^emp(loyee)? ?id$/, /^id$/, /^emp$/), cName = col(/^name$/), cType = col(/^type$/, /^category$/), cDept = col(/^department$/), cDesig = col(/^designation$/), cMgr = col(/reporting/),
        cBasic = col(/basic/), cHra = col(/^hra/), cFixed = col(/fixed/), cConv = col(/conve/), cMed = col(/medical/);
      if (cId < 0 || cBasic < 0) throw new HttpError(400, "The file needs at least an Employee ID column and a Basic and DA column.");
      const rows: Record<string, unknown>[] = [];
      for (let i = hr + 1; i < grid.length; i++) {
        const L = grid[i] || []; const id = String(L[cId] ?? "").trim();
        if (!/^\d{4}$/.test(id)) continue;
        const r = { basic_da: num(L[cBasic]), hra: cHra >= 0 ? num(L[cHra]) : 0, fixed_allowance: cFixed >= 0 ? num(L[cFixed]) : 0, conveyance: cConv >= 0 ? num(L[cConv]) : 0, medical_allowance: cMed >= 0 ? num(L[cMed]) : 0 };
        rows.push({ structure_id: sid, employee_id: id, name: cName >= 0 ? String(L[cName] || "") : null, type: cType >= 0 ? String(L[cType] || "") : null, department: cDept >= 0 ? String(L[cDept] || "") : null, designation: cDesig >= 0 ? String(L[cDesig] || "") : null, reporting_manager: cMgr >= 0 ? String(L[cMgr] || "") : null, ...r, ...derive(r, cType >= 0 ? String(L[cType] || "") : null), note: `imported from ${f.name}`, updated_by: stamp, updated_at: now });
      }
      if (!rows.length) throw new HttpError(400, "No lines with a four-digit Employee ID were read.");
      const { error } = await admin.from("hrms_salary_rate").upsert(rows, { onConflict: "structure_id,employee_id" });
      if (error) throw new Error(error.message);
      await admin.from("hrms_salary_structure").update({ updated_at: now }).eq("id", sid);
      return NextResponse.json({ ok: true, lines: rows.length });
    }

    const body = await readBody(req, {});
    const action = String(body.action || "");

    if (action === "seed_old") {
      // Salary Structure 2025-06: the rates as the records carry them today, Overwritten by design
      const { data: have } = await admin.from("hrms_salary_structure").select("id").eq("code", "2025-06").maybeSingle();
      if (have) return NextResponse.json({ ok: true, id: have.id, existed: true });
      const { data: s, error } = await admin.from("hrms_salary_structure").insert({ code: "2025-06", title: "Salary Structure 2025-06", status: "Overwritten", effective_from: "2025-06-01", note: "The rates as the employee master carried them before the 2026 appraisal.", created_by: stamp }).select("id").single();
      if (error) { if (/hrms_salary_structure|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0135 first."); throw new Error(error.message); }
      const ppl = await people(admin);
      const rows = ppl.map((p) => {
        const r = { basic_da: num(p.value.basic_da), hra: num(p.value.hra), fixed_allowance: num(p.value.fixed_allowance), conveyance: num(p.value.conveyance), medical_allowance: num(p.value.medical_allowance) };
        return { structure_id: s.id, employee_id: p.id, name: p.name, type: p.type || null, department: p.department, designation: p.value.designation || null, reporting_manager: String(p.value.reporting_manager || p.value.reports_to || ""), ...r, ...derive(r, p.type || null), note: "from the record", updated_by: stamp, updated_at: now };
      }).filter((r) => r.basic_da > 0 || r.gross > 0);
      for (let i = 0; i < rows.length; i += 200) { const { error: ie } = await admin.from("hrms_salary_rate").upsert(rows.slice(i, i + 200), { onConflict: "structure_id,employee_id" }); if (ie) throw new Error(ie.message); }
      return NextResponse.json({ ok: true, id: s.id, lines: rows.length });
    }

    if (action === "create") {
      const code = String(body.code || "").trim();
      if (!/^\d{4}-\d{2}$/.test(code)) throw new HttpError(400, "Code as YYYY-MM, e.g. 2026-09.");
      const title = String(body.title || `Salary Structure ${code}`).slice(0, 120);
      const { data: s, error } = await admin.from("hrms_salary_structure").insert({ code, title, status: "Draft", effective_from: `${code}-01`, note: String(body.note || "").slice(0, 500) || null, created_by: stamp }).select("id").single();
      if (error) { if (/duplicate|unique/i.test(error.message)) throw new HttpError(400, `${code} already exists.`); throw new Error(error.message); }
      if (body.from) {
        const { data: src } = await admin.from("hrms_salary_rate").select("*").eq("structure_id", String(body.from));
        const rows = (src || []).map((r) => { const { id: _i, structure_id: _s, ...rest } = r as Record<string, unknown>; return { ...rest, structure_id: s.id, note: "carried forward", updated_by: stamp, updated_at: now }; });
        for (let i = 0; i < rows.length; i += 200) await admin.from("hrms_salary_rate").insert(rows.slice(i, i + 200));
      }
      return NextResponse.json({ ok: true, id: s.id });
    }

    if (action === "set_live") {
      if (!owner) throw new HttpError(403, `Making a structure Live is ${RAGHU_EMAIL}'s.`);
      const id = String(body.id || "");
      await admin.from("hrms_salary_structure").update({ status: "Overwritten", updated_at: now }).eq("status", "Live");
      const { error } = await admin.from("hrms_salary_structure").update({ status: "Live", updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "rename") {
      const patch: Record<string, unknown> = { updated_at: now };
      if ("title" in body) patch.title = String(body.title || "").slice(0, 120);
      if ("note" in body) patch.note = String(body.note || "").slice(0, 500) || null;
      if ("effective_from" in body) patch.effective_from = body.effective_from || null;
      const { error } = await admin.from("hrms_salary_structure").update(patch).eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "remove_structure") {
      if (!owner) throw new HttpError(403, `Removing a structure is ${RAGHU_EMAIL}'s.`);
      const { data: s } = await admin.from("hrms_salary_structure").select("status").eq("id", String(body.id || "")).maybeSingle();
      if (s?.status === "Live") throw new HttpError(400, "The Live structure cannot be removed — make another Live first.");
      const { error } = await admin.from("hrms_salary_structure").delete().eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /**
     * FREEZING A RATE LIST, SIGNED (Dr Raghu, 7 Sep 2026: "after uploading,
     * give a facility to freeze it by Raghu. Let me sign my name on it").
     *
     * A rate list is what everybody is paid from, and until now anybody with
     * HRMS could edit any cell of it for ever. Freezing closes it: the cells
     * stop taking edits and the sheet carries the name he typed, the account
     * that typed it and the moment. His alone, like making one Live.
     *
     * The signature is kept as he wrote it. A name a man typed himself is a
     * different thing from a tick some code set true.
     */
    if (action === "freeze" || action === "unfreeze") {
      if (!owner) throw new HttpError(403, `Freezing a rate list is ${RAGHU_EMAIL}'s.`);
      const sid = String(body.structure_id || "");
      if (!sid) throw new HttpError(400, "Which list?");
      const on = action === "freeze";
      const signed = String(body.signed_as || "").trim();
      if (on && signed.length < 3) throw new HttpError(400, "Please sign your name on it.");
      const patch = on
        ? { frozen_at: now, frozen_by: stamp, signed_as: signed.slice(0, 120), updated_at: now }
        : { frozen_at: null, frozen_by: null, signed_as: null, updated_at: now };
      const { error } = await admin.from("hrms_salary_structure").update(patch).eq("id", sid);
      if (error) {
        if (/frozen_at|signed_as|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0155 first — a signature has nowhere to sit yet.");
        throw new Error(error.message);
      }
      // SIGNING IS THE APPROVAL — the signed list backflushes into every HRIS record and the FY history (7 Oct 2026)
      let back: { records: number; changed: number; fy: string } | null = null;
      if (on) {
        const { data: st } = await admin.from("hrms_salary_structure").select("status").eq("id", sid).maybeSingle();
        if (st?.status === "Live") { try { const { backflushStructure } = await import("@/lib/structure-sync"); back = await backflushStructure(admin, sid, stamp); } catch (e) { swallow("hrms/rates backflush", e); } }
      }
      return NextResponse.json({ ok: true, frozen: on, signed_as: on ? signed : null, backflushed: back });
    }

    if (action === "save_rate") {
      const sid = String(body.structure_id || ""), eid = String(body.employee_id || "").trim();
      if (!sid || !/^\d{4}$/.test(eid)) throw new HttpError(400, "Structure and a four-digit Employee ID, please.");
      // a signed list is closed — refused here, not merely hidden on the screen
      try {
        const { data: st } = await admin.from("hrms_salary_structure").select("frozen_at, title").eq("id", sid).maybeSingle();
        if (st?.frozen_at) throw new HttpError(409, `${st.title} is frozen and signed. Take the freeze off before changing a rate.`);
      } catch (e) { if (e instanceof HttpError) throw e; swallow("hrms/rates frozen", e); }
      const r = { basic_da: num(body.basic_da), hra: num(body.hra), fixed_allowance: num(body.fixed_allowance), conveyance: num(body.conveyance), medical_allowance: num(body.medical_allowance) };
      /**
       * THE TYPE IS THE HRIS'S, NOT THIS LIST'S (Dr Raghu, 7 Sep 2026: "in
       * the Salary structure, the type pull it from the masters HRIS — then
       * the per day rate will be as per that").
       *
       * It decides the per-day divisor: 26 for Labour and Labour - Contract,
       * 31 for everybody else. Held here it was a second copy that nobody
       * filled in, so every line divided by 31 — 127 men's per-day understated
       * by a fifth. Read from the master it cannot drift, and whatever the
       * caller sends is ignored.
       */
      const [who] = await people(admin, [eid]);
      const hrisType = who?.type || null;
      const row = { structure_id: sid, employee_id: eid, name: body.name ?? who?.name ?? null, type: hrisType, department: body.department ?? null, designation: body.designation ?? null, reporting_manager: body.reporting_manager ?? null, ...r, ...derive(r, hrisType), note: body.note ?? null, updated_by: stamp, updated_at: now };
      const { error } = await admin.from("hrms_salary_rate").upsert(row, { onConflict: "structure_id,employee_id" });
      if (error) throw new Error(error.message);
      await admin.from("hrms_salary_structure").update({ updated_at: now }).eq("id", sid);
      // a line saved on the LIVE list reaches the record at once (7 Oct 2026)
      try { const { data: st2 } = await admin.from("hrms_salary_structure").select("status").eq("id", sid).maybeSingle(); if (st2?.status === "Live") { const { backflushStructure } = await import("@/lib/structure-sync"); await backflushStructure(admin, sid, stamp, [eid]); } } catch (e) { swallow("hrms/rates save backflush", e); }
      return NextResponse.json({ ok: true, type: hrisType, ...derive(r, hrisType) });
    }

    /**
     * PULL EVERY TYPE FROM THE HRIS AND WORK THE PER-DAY OUT AGAIN
     * (Dr Raghu, 7 Sep 2026: "check it and update it").
     *
     * Deliberately a button he presses rather than something that happens
     * quietly on a read: it rewrites 205 rates, and by his own rule every
     * change to a rate carries who made it and when.
     */
    /** BACKFLUSH TO HRIS (7 Oct 2026): the Live list's every line onto the HRIS record's Pay fields and the FY history */
    if (action === "backflush") {
      if (!owner) throw new HttpError(403, `Backflushing the rate list into the records is ${RAGHU_EMAIL}'s.`);
      const sid = String(body.structure_id || "");
      const { data: st } = await admin.from("hrms_salary_structure").select("status").eq("id", sid).maybeSingle();
      if (st?.status !== "Live") throw new HttpError(400, "Only the Live list backflushes into the records.");
      const { backflushStructure } = await import("@/lib/structure-sync");
      const r = await backflushStructure(admin, sid, stamp);
      return NextResponse.json({ ok: true, ...r });
    }

    if (action === "sync_types") {
      const sid = String(body.structure_id || "");
      if (!sid) throw new HttpError(400, "Which structure?");
      const { data: st } = await admin.from("hrms_salary_structure").select("frozen_at, title").eq("id", sid).maybeSingle();
      if (st?.frozen_at) throw new HttpError(409, `${st.title} is frozen and signed. Take the freeze off first.`);
      const { data: lines } = await admin.from("hrms_salary_rate")
        .select("id, employee_id, type, basic_da, hra, fixed_allowance, conveyance, medical_allowance, gross, per_day").eq("structure_id", sid);
      const rows = lines || [];
      if (!rows.length) return NextResponse.json({ ok: true, changed: 0, checked: 0 });
      const ppl = await people(admin, rows.map((x) => String(x.employee_id)));
      const typeOf = new Map(ppl.map((p) => [String(p.id), p.type || null]));
      let changed = 0, noType = 0;
      for (const x of rows) {
        const t = typeOf.get(String(x.employee_id)) ?? null;
        if (!t) { noType++; continue; }
        const r = { basic_da: num(x.basic_da), hra: num(x.hra), fixed_allowance: num(x.fixed_allowance), conveyance: num(x.conveyance), medical_allowance: num(x.medical_allowance) };
        const d = derive(r, t);
        if (String(x.type || "") === t && Math.abs(num(x.per_day) - d.per_day) <= 1) continue;
        const { error } = await admin.from("hrms_salary_rate")
          .update({ type: t, ...d, updated_by: stamp, updated_at: now }).eq("id", x.id);
        if (error) throw new Error(error.message);
        changed++;
      }
      await admin.from("hrms_salary_structure").update({ updated_at: now }).eq("id", sid);
      return NextResponse.json({ ok: true, checked: rows.length, changed, noType });
    }

    if (action === "remove_rate") {
      const { error } = await admin.from("hrms_salary_rate").delete().eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
