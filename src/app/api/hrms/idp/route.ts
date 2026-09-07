import { NextResponse } from "next/server";
import { allRows } from "@/lib/all-rows";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { NextResponse as NR } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, FIELD_GROUPS } from "@/lib/hrms";
import { salaryTable, scaledGetter, num, splitGross, payDaysFor } from "@/lib/salary";

export const dynamic = "force-dynamic";

const BUCKET = "voice-notes";
const LINK_TTL = 60 * 60;
const CYCLE_TBL = "2026-27";

/** The five pay components, sheet header → overlay field key. */
const SHEET_TO_FIELD: Record<string, string> = {
  "Basic and DA": "basic_da", "HRA": "hra", "Fixed Allowance": "fixed_allowance",
  "Conveyance": "conveyance", "Medical Allowance": "medical_allowance",
  "Site Allowance": "site_allowance",
};

/**
 * GET /api/hrms/idp — the management side of the IDP.
 *
 * The person writes at /idp and sees only their own; HR and the owner read
 * them HERE, behind the same gate as every other people record. The consent
 * each person ticked named exactly this readership — Management, HR and
 * their HoD — and this route is two-thirds of that promise. (The HoD third
 * needs its own gate and does not exist yet; nothing here pretends it does.)
 *
 *   GET /api/hrms/idp          — every attempt, newest first
 *   GET /api/hrms/idp?id=<id>  — one, in full: answers, ratings, recordings
 *                                with their transcripts, attachments, the
 *                                consent, and the salary they asked for
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    const person = new URL(req.url).searchParams.get("person");
    const table = new URL(req.url).searchParams.get("table");

    /**
     * ?table=1 — the Appraisal Table: every active person on one row, with
     * where their appraisal stands. The row is a summary and the click goes
     * to the Individual Report Card, so this endpoint carries numbers and
     * stages, never the words.
     */
    if (table) {
      const T = await hrmsTables(admin);
      const [{ data: emps }, { data: eds }, { data: idps }, { data: revs }] = await Promise.all([
        admin.from(T.employees).select("id, name, department, designation, location, dob, doj, active, extra"),
        allRows<{ employee_id: string; field: string; value: string | null }>(() =>
          admin.from(T.edits).select("employee_id, field, value").in("field", ["type", "status", "department", "designation", "reporting_manager", "basic_da", "hra", "fixed_allowance", "conveyance", "medical_allowance", "site_allowance", "location", "phone", "personal_email"])).then((data) => ({ data })),
        admin.from("hrms_idp").select("id, employee_id, submitted_at, ratings, ask:answers->>ask_gross").eq("cycle", CYCLE_TBL),
        admin.from("hrms_idp_review").select("idp_id, submitted_at, ratings, gross_proposed"),
      ]);
      type Structure = { components?: Record<string, number> } | null;
      let appr: { employee_id: string; new_gross: number | null; prev_gross: number | null; approved_at?: string | null; growth_note?: string | null; released_at?: string | null; structure?: Structure; new_designation?: string | null }[] = [];
      try {
        /**
         * growth_note arrives with migration 0148. Asking for a column that
         * is not there fails the WHOLE query, which on 7 Sep 2026 emptied
         * New Gross, Increase and the Final count on the live table until
         * the migration ran. So: ask for it, and fall back without it.
         */
        type ApRows = { data: Record<string, unknown>[] | null; error: { message: string } | null };
        const BASE = "employee_id, new_gross, prev_gross, approved_at";
        // structure came with 0062 and new_designation later; both are asked
        // for together and dropped together if the schema is behind.
        const EXTRA = ", growth_note, released_at, structure, new_designation";
        let q = (await admin.from("hrms_appraisal").select(BASE + EXTRA).eq("cycle", CYCLE_TBL)) as unknown as ApRows;
        if (q.error) q = (await admin.from("hrms_appraisal").select(BASE).eq("cycle", CYCLE_TBL)) as unknown as ApRows;
        if (q.error) throw new Error(q.error.message);
        appr = (q.data || []) as unknown as typeof appr;
      } catch (e) { swallow("hrms/idp", e); /* pre-0061 */ }

      const ovBy = new Map<string, Map<string, string | null>>();
      for (const e of eds || []) {
        const id = String(e.employee_id);
        if (!ovBy.has(id)) ovBy.set(id, new Map());
        ovBy.get(id)!.set(String(e.field), e.value == null ? null : String(e.value));
      }
      const avg = (rt: unknown) => {
        const v = Object.values((rt || {}) as Record<string, number>).map(Number).filter((n) => n > 0);
        return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
      };
      const idpBy = new Map<string, { id: string; submitted: boolean; selfAvg: number | null; ask: number | null }>();
      for (const r of idps || []) {
        const id = String(r.employee_id || "");
        if (!id) continue;
        const cur = idpBy.get(id);
        // a submitted one beats an open one for the status column
        if (!cur || (!cur.submitted && r.submitted_at))
          idpBy.set(id, { id: String(r.id), submitted: !!r.submitted_at, selfAvg: avg(r.ratings), ask: r.ask ? Number(r.ask) || null : null });
      }
      const reviewed = new Set((revs || []).filter((r) => r.submitted_at).map((r) => String(r.idp_id)));
      const mgrBy = new Map<string, { avg: number | null; proposed: number | null }>();
      for (const r of revs || []) {
        if (!r.submitted_at) continue;
        const k = String(r.idp_id);
        const prev = mgrBy.get(k);
        // more than one manager can have reviewed; keep the mean of their means
        const a = avg(r.ratings);
        mgrBy.set(k, {
          avg: prev?.avg != null && a != null ? Math.round(((prev.avg + a) / 2) * 10) / 10 : a ?? prev?.avg ?? null,
          proposed: r.gross_proposed != null ? Number(r.gross_proposed) : prev?.proposed ?? null,
        });
      }
      const apprBy = new Map(appr.map((a) => [String(a.employee_id), a]));

      const ON = new Set(["Active", "Doubtful", "Notice Period"]);
      const years = (iso: unknown) => {
        if (!iso) return null;
        const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
        if (Number.isNaN(d.getTime())) return null;
        return Math.round(((Date.now() - d.getTime()) / (365.25 * 864e5)) * 10) / 10;
      };

      const rows = (emps || [])
        .filter((e) => {
          const ov = ovBy.get(String(e.id));
          const st = (ov?.get("status") as string) || ((e.extra || {}) as Record<string, string>)["Status"] || "";
          return st ? ON.has(st) : !!e.active;
        })
        .map((e) => {
          const id = String(e.id);
          const ov = ovBy.get(id);
          const ex = (e.extra || {}) as Record<string, string>;
          const pick = (field: string, header: string, col?: string | null) =>
            (ov?.get(field) as string | undefined) ?? (col ?? undefined) ?? ex[header] ?? null;
          // THE SAME ARITHMETIC AS EVERY OTHER SCREEN. Summing the five
          // components here looked equivalent and is not: salaryTable drops
          // HRA for the exempt types, so a Management person read one gross
          // on this table and a different one on their Report Card.
          const type = pick("type", "Type") as string | null;
          const salaryGet = (k: string) => pick(SHEET_TO_FIELD[k] || k, k);
          const salary = salaryTable(salaryGet, type);
          const gross = salary?.gross ?? 0;
          /** The parts as they stand TODAY, read the same way every screen reads them. */
          const partOf = (label: string) => Number(salary?.rows.find((x) => x.label === label)?.monthly || 0);
          const oldParts = salary ? {
            basic_da: partOf("Basic & DA"), hra: partOf("HRA"), fixed: partOf("Fixed Allowance"),
            conveyance: partOf("Conveyance"), medical: partOf("Medical Allowance"),
            site: partOf("Site Allowance — while deputed to site"),
          } : null;
          const idp = idpBy.get(id);
          const mgr = idp ? mgrBy.get(idp.id) : undefined;
          const ap = apprBy.get(id);
          const newGross = ap?.new_gross != null ? Number(ap.new_gross) : null;
          const prev = ap?.prev_gross != null ? Number(ap.prev_gross) : gross || null;
          // Dr Raghu's own words for where a person stands (7 Sep 2026):
          // Not Done → IDP Done → Manager IDP completed → Appraisal Finalised
          // → Released. Released is the day they are told, not the day he decided.
          const stage = ap?.released_at ? "Released"
            : ap?.new_gross != null && ap.approved_at ? "Appraisal Finalised"
            : ap?.new_gross != null ? "Awaiting RJ"
            : idp?.submitted && idp.id && reviewed.has(idp.id) ? "Manager IDP completed"
            : idp?.submitted ? "IDP Done"
            : idp ? "Started" : "Not Done";
          return {
            id, name: String(e.name || id),
            department: pick("department", "Department", e.department) as string | null,
            designation: pick("designation", "Designation", e.designation) as string | null,
            // who they report to — the Appraisal Table filters by it (7 Sep 2026)
            manager: pick("reporting_manager", "Reporting Manager") as string | null,
            // whether the growth note is already written, for the mass run
            growth: !!ap?.growth_note,
            released: ap?.released_at ?? null,
            /**
             * THE AGREED STRUCTURE, NOT A RE-SPLIT (Dr Raghu, 7 Sep 2026, on
             * what the download must carry). Where an appraisal was saved
             * with its components edited, those are what was agreed and those
             * are what goes out; only where none was saved does Genie split
             * the new gross by its own rule.
             */
            newParts: (() => {
              const c = ap?.structure?.components;
              if (c && Object.keys(c).length) return {
                basic_da: Number(c.basic_da) || 0, hra: Number(c.hra) || 0,
                fixed: Number(c.fixed) || 0, conveyance: Number(c.conveyance) || 0,
                medical: Number(c.medical) || 0, site: Number(c.site) || 0, agreed: true,
              };
              if (newGross == null) return null;
              const sp = splitGross(newGross, undefined, type);
              return { basic_da: sp.basic_da, hra: sp.hra, fixed: sp.fixed_allowance,
                conveyance: sp.conveyance, medical: sp.medical_allowance,
                site: Number(pick("site_allowance", "Site Allowance") || 0), agreed: false };
            })(),
            oldParts,
            location: pick("location", "Job Location", e.location as string | null) as string | null,
            mobile: pick("phone", "PERSONAL Mobile No") as string | null,
            personalEmail: pick("personal_email", "Personal Mail ID") as string | null,
            newDesignation: ap?.new_designation ?? null,
            siteAllowance: Number(pick("site_allowance", "Site Allowance") || 0),
            payDays: payDaysFor(type),
            type,
            age: years(e.dob), exp: years(e.doj),
            prevGross: prev, newGross,
            inc: prev != null && newGross != null ? newGross - prev : null,
            incPct: prev && newGross != null ? Math.round(((newGross - prev) / prev) * 1000) / 10 : null,
            stage,
            selfAvg: idp?.selfAvg ?? null, mgrAvg: mgr?.avg ?? null,
            askGross: idp?.ask ?? null, mgrProposed: mgr?.proposed ?? null,
          };
        });
      return NextResponse.json({ rows });
    }

    /**
     * ?interviews=1 — the audit of the conversations themselves. One row per
     * person on the roll: did the SELF discussion happen (their own IDP, with
     * its voice notes), and did the MANAGER one (the review, with its voice
     * note). Counts and dates only — the words open per person.
     */
    if (new URL(req.url).searchParams.get("interviews")) {
      const T = await hrmsTables(admin);
      const [{ data: emps }, { data: eds }, { data: idps }, { data: revs }] = await Promise.all([
        admin.from(T.employees).select("id, name, department, active, extra"),
        admin.from(T.edits).select("employee_id, field, value").in("field", ["status", "department", "user_email"]),
        admin.from("hrms_idp").select("id, employee_id, started_at, submitted_at, audio").eq("cycle", CYCLE_TBL),
        admin.from("hrms_idp_review").select("idp_id, reviewer_email, started_at, submitted_at, audio"),
      ]);
      const ovBy = new Map<string, Map<string, string | null>>();
      const nameByEmail = new Map<string, string>();
      const nameById = new Map((emps || []).map((e) => [String(e.id), String(e.name || e.id)]));
      for (const e of eds || []) {
        const id = String(e.employee_id);
        if (!ovBy.has(id)) ovBy.set(id, new Map());
        ovBy.get(id)!.set(String(e.field), e.value == null ? null : String(e.value));
        if (e.field === "user_email" && e.value) nameByEmail.set(String(e.value).toLowerCase(), nameById.get(id) || String(e.value));
      }
      const tally = (audio: unknown) => {
        const lists = Array.isArray(audio) ? [audio] : Object.values((audio || {}) as Record<string, unknown[]>);
        let voices = 0, seconds = 0;
        for (const l of lists) for (const a of (l as { seconds?: number | null }[]) || []) { voices++; seconds += Number(a?.seconds) || 0; }
        return { voices, seconds: Math.round(seconds) };
      };
      const idpBy = new Map<string, (typeof idps extends (infer U)[] | null ? U : never)>();
      for (const r of idps || []) {
        const id = String(r.employee_id || "");
        if (!id) continue;
        const cur = idpBy.get(id);
        if (!cur || (!cur.submitted_at && r.submitted_at)) idpBy.set(id, r);
      }
      const revsBy = new Map<string, typeof revs>();
      for (const r of revs || []) {
        const k = String(r.idp_id);
        if (!revsBy.has(k)) revsBy.set(k, []);
        revsBy.get(k)!.push(r);
      }
      const ON = new Set(["Active", "Doubtful", "Notice Period"]);
      const rows = (emps || [])
        .filter((e) => {
          const ov = ovBy.get(String(e.id));
          const st = (ov?.get("status") as string) || ((e.extra || {}) as Record<string, string>)["Status"] || "";
          return st ? ON.has(st) : !!e.active;
        })
        .map((e) => {
          const id = String(e.id);
          const ov = ovBy.get(id);
          const idp = idpBy.get(id);
          const reviews = (idp ? revsBy.get(String(idp.id)) || [] : []).map((r) => ({
            by: nameByEmail.get(String(r.reviewer_email).toLowerCase()) || String(r.reviewer_email),
            submitted: r.submitted_at, started: r.started_at, ...tally(r.audio),
          }));
          return {
            id, name: String(e.name || id),
            department: (ov?.get("department") as string) || ((e.extra || {}) as Record<string, string>)["Department"] || e.department || null,
            self: idp ? { started: idp.started_at, submitted: idp.submitted_at, ...tally(idp.audio) } : null,
            reviews,
          };
        });
      return NextResponse.json({ rows });
    }

    /**
     * ?person=<employee_id> — the Individual Report Card for Appraisal.
     *
     * One person, everything the discussion needs: their latest IDP with
     * NOTHING held back (HR is the one desk that sees both sides), every
     * manager review of it, the current salary structure, and the decided
     * appraisal if one has been written.
     */
    if (person) {
      const T = await hrmsTables(admin);
      const { data: emp } = await admin
        .from(T.employees).select("id, name, department, designation, dob, doj, extra").eq("id", person).maybeSingle();
      if (!emp) return NextResponse.json({ error: "No such employee" }, { status: 404 });
      const { data: eds } = await admin
        .from(T.edits).select("field, value").eq("employee_id", person);
      const ov = new Map((eds || []).map((e) => [String(e.field), e.value == null ? null : String(e.value)]));
      const headerToKey = new Map(
        FIELD_GROUPS.flatMap((g) => g.fields).filter((f) => f.sheetHeader).map((f) => [f.sheetHeader as string, f.key]),
      );
      const get = (k: string) => {
        const fk = headerToKey.get(k);
        const o = fk ? ov.get(fk) : undefined;
        if (o != null && String(o).trim() !== "") return o;
        return ((emp.extra || {}) as Record<string, string>)[k];
      };
      const type = (ov.get("type") as string | undefined) || ((emp.extra || {}) as Record<string, string>)["Type"] || null;
      const salary = salaryTable(get, type);

      const { data: idps } = await admin
        .from("hrms_idp").select("*").eq("employee_id", person).order("started_at", { ascending: false }).limit(3);
      const idp = (idps || []).find((r) => r.submitted_at) || (idps || [])[0] || null;

      let idpFull: Record<string, unknown> | null = null;
      let reviews: Record<string, unknown>[] = [];
      if (idp) {
        const audio = (idp.audio || {}) as Record<string, { path: string; seconds: number | null; transcript?: string }[]>;
        const audioUrls: Record<string, { url: string | null; seconds: number | null; transcript: string | null }[]> = {};
        for (const [qid, list] of Object.entries(audio)) {
          audioUrls[qid] = await Promise.all(list.map(async (a) => {
            const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
            return { url: sgn?.signedUrl ?? null, seconds: a.seconds, transcript: a.transcript ?? null };
          }));
        }
        idpFull = { ...idp, audioUrls };
        const { data: rv } = await admin.from("hrms_idp_review").select("*").eq("idp_id", idp.id);
        reviews = await Promise.all((rv || []).map(async (r) => {
          const voice = await Promise.all(((r.audio || []) as { path: string; seconds: number | null; transcript?: string }[]).map(async (a) => {
            const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
            return { url: sgn?.signedUrl ?? null, seconds: a.seconds, transcript: a.transcript ?? null };
          }));
          return { ...r, voice };
        }));
      }

      let appraisal: Record<string, unknown> | null = null;
      try {
        const { data: ap } = await admin
          .from("hrms_appraisal").select("*").eq("employee_id", person).eq("cycle", "2026-27").maybeSingle();
        appraisal = ap ?? null;
      } catch (e) { swallow("hrms/idp", e); /* pre-0061 */ }

      // the person's frame (Dr Raghu, 29 Aug 2026): age, years in the
      // company, who they report to — and their ROLE from the register,
      // KRA (deliverable) and KPIs (metric) beside the finalised IDP.
      const extra = (emp.extra || {}) as Record<string, string>;
      const todayI = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const yearsBetween = (from: string | null) => {
        if (!from || !/^\d{4}/.test(String(from))) return null;
        const y = (new Date(todayI).getTime() - new Date(String(from)).getTime()) / (365.25 * 86400000);
        return Math.round(y * 10) / 10;
      };
      const meta = {
        age: extra["Age"] ? Math.round(Number(String(extra["Age"]).replace(/[^0-9.]/g, "")) * 10) / 10 : yearsBetween(emp.dob as string | null),
        years: yearsBetween(emp.doj as string | null),
        doj: emp.doj ?? null,
        manager: extra["Reporting Manager"] || null,
        personal_mobile: extra["PERSONAL Mobile No"] && !/^n\/?a$/i.test(String(extra["PERSONAL Mobile No"]).trim()) ? String(extra["PERSONAL Mobile No"]).trim() : null,
        personal_email: extra["Personal Mail ID"] && /@/.test(String(extra["Personal Mail ID"])) ? String(extra["Personal Mail ID"]).trim() : null,
      };
      let role: Record<string, unknown> | null = null;
      const roleName = String((idp && (idp as Record<string, unknown>).role_at_time) || emp.designation || "").split(" · ")[0].trim();
      if (roleName) {
        const { data: rr } = await admin.from("hrms_role")
          .select("role, department, grade, reports_to, job_description, deliverable, metric, summary")
          .ilike("role", roleName).maybeSingle();
        role = rr ?? null;
      }
      // the gross by year, 2020→2027 (his frame): today's gross stands on the
      // current year, each appraisal cycle adds its decided gross, and the
      // years the sheets never covered stand honestly empty.
      const salaryYears: { year: number; gross: number | null; note: string }[] = [];
      const grossNow = salary?.gross ?? null;
      let cycles: { cycle: string; new_gross: number | null; prev_gross: number | null; approved_at?: string | null; effective_from?: string | null }[] = [];
      try {
        const BASE = "cycle, new_gross, prev_gross, approved_at";
        type Ap = { data: Record<string, unknown>[] | null; error: { message: string } | null };
        let q = (await admin.from("hrms_appraisal").select(BASE + ", effective_from").eq("employee_id", person)) as unknown as Ap;
        if (q.error) q = (await admin.from("hrms_appraisal").select(BASE).eq("employee_id", person)) as unknown as Ap;
        cycles = (q.data || []) as unknown as typeof cycles;
      } catch (e) { swallow("hrms/idp", e); /* pre-0061 */ }
      // the Employee Master's own history (0097) speaks first for each year
      let hist: { fy: string; gross: number }[] = [];
      try {
        const { data: hh } = await admin.from("hrms_salary_history")
          .select("fy, gross").eq("employee_id", person);
        hist = ((hh || []) as { fy: string; gross: number }[]);
      } catch (e) { swallow("hrms/idp", e); /* pre-0097 */ }
      const histOf = (y: number) => hist.find((h) => String(h.fy).startsWith(String(y)));
      for (let y = 2019; y <= 2027; y++) {
        const hh = histOf(y);
        const cy = cycles.find((c) => String(c.cycle).startsWith(String(y)));
        /**
         * A FINALISED APPRAISAL IS THE PAY (Dr Raghu, 7 Sep 2026: "this also
         * should change with the number from Finalised"). The climb used to
         * read the Employee Master's sheet first, so a year that had both a
         * sheet figure and a settled appraisal showed the old number and the
         * rise never appeared. Finalised wins; a proposal does not, so the
         * line does not move before he has decided.
         */
        if (cy?.new_gross && cy.approved_at)
          salaryYears.push({ year: y, gross: Number(cy.new_gross), note: `appraisal ${cy.cycle} · finalised${cy.effective_from ? ` from ${String(cy.effective_from).slice(8, 10)}-${String(cy.effective_from).slice(5, 7)}-${String(cy.effective_from).slice(0, 4)}` : ""}` });
        else if (hh?.gross) salaryYears.push({ year: y, gross: Number(hh.gross), note: `sheet ${hh.fy}` });
        else if (cy?.new_gross) salaryYears.push({ year: y, gross: Number(cy.new_gross), note: `appraisal ${cy.cycle} · proposed, not final` });
        else if (y === 2026 && grossNow) salaryYears.push({ year: y, gross: grossNow, note: "current sheet" });
        else salaryYears.push({ year: y, gross: null, note: "" });
      }

      return NextResponse.json({
        employee: { id: emp.id, name: emp.name, department: emp.department, designation: emp.designation, type, ...meta },
        role, salaryYears,
        salary, idp: idpFull, reviews, appraisal,
      });
    }

    if (id) {
      const { data: r, error } = await admin.from("hrms_idp").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!r) return NextResponse.json({ error: "No such IDP" }, { status: 404 });

      const audio = (r.audio || {}) as Record<string, { path: string; seconds: number | null; at: string; transcript?: string }[]>;
      const audioUrls: Record<string, { url: string | null; seconds: number | null; at: string; transcript: string | null }[]> = {};
      for (const [qid, list] of Object.entries(audio)) {
        audioUrls[qid] = await Promise.all(list.map(async (a) => {
          const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
          return { url: sgn?.signedUrl ?? null, seconds: a.seconds, at: a.at, transcript: a.transcript ?? null };
        }));
      }
      const attachments = await Promise.all(((r.attachments || []) as { path: string; name: string; size: number; at: string }[]).map(async (a) => {
        const { data: sgn } = await admin.storage.from(BUCKET).createSignedUrl(a.path, LINK_TTL);
        return { ...a, url: sgn?.signedUrl ?? null };
      }));
      return NextResponse.json({ idp: { ...r, audioUrls, attachments } });
    }

    const { data, error } = await admin
      .from("hrms_idp")
      .select("id, employee_id, person_email, person_name, cycle, started_at, submitted_at, consent_at, answers, ratings, audio, attachments, role_at_time")
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) {
      if (/hrms_idp|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ idps: [], needsMigration: true });
      throw new Error(error.message);
    }

    // names off the master, so the list reads as people rather than emails
    const T = await hrmsTables(admin);
    const ids = [...new Set((data || []).map((r) => r.employee_id).filter(Boolean))] as string[];
    const nameOf = new Map<string, string>();
    if (ids.length) {
      const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
      for (const e of emps || []) nameOf.set(String(e.id), String(e.name));
    }

    return NextResponse.json({
      idps: (data || []).map((r) => {
        const answers = (r.answers || {}) as Record<string, string>;
        const audio = (r.audio || {}) as Record<string, unknown[]>;
        return {
          id: r.id,
          employee_id: r.employee_id,
          name: r.employee_id ? nameOf.get(String(r.employee_id)) || r.person_name || r.person_email : r.person_name || r.person_email,
          email: r.person_email,
          cycle: r.cycle,
          role: r.role_at_time,
          started_at: r.started_at,
          submitted_at: r.submitted_at,
          answered: Object.values(answers).filter((v) => String(v).trim()).length,
          rated: Object.keys((r.ratings || {}) as object).length,
          recordings: Object.values(audio).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0),
          attachments: ((r.attachments || []) as unknown[]).length,
          askGross: String(answers["ask_gross"] || "").trim() || null,
        };
      }),
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/idp — { action: "reopen", id }
 *
 * Puts a SUBMITTED IDP back into the person's hands, from the HRMS side.
 * Everything they wrote stays; only the lock comes off, and the next visit
 * to /idp carries on from what is there. Dr Raghu's own case is the point:
 * a first pass done to test the machinery, reopened to be done properly
 * before it goes to the Chairman.
 *
 * HRMS-gated like everything else here, and logged: a record that moves
 * between submitted and open with no trace would make "when was this
 * finished" unanswerable.
 */
export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireHrms();
    const admin = adminClient();
    const body = await readBody(req, {});
    // RAGHU'S BRIEF (29 Aug 2026): click-only AI pointers before the
    // sit-down — the role, the work in their own words, what to affirm,
    // what to raise — grounded in the record, kept on the cycle row.
    if (String(body.action || "") === "raghu-brief") {
      if (me.email.toLowerCase() !== RAGHU_EMAIL) throw new HttpError(403, "The brief is Raghu's own.");
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set.");
      const employee_id = String(body.employee_id || "");
      if (!employee_id) throw new HttpError(400, "employee_id required");

      const T2 = await hrmsTables(admin);
      const { data: emp } = await admin.from(T2.employees)
        .select("id, name, department, designation, dob, doj, extra").eq("id", employee_id).maybeSingle();
      if (!emp) throw new HttpError(404, "No such employee.");
      const extra = (emp.extra || {}) as Record<string, string>;
      const { data: idps } = await admin.from("hrms_idp").select("answers, ratings, role_at_time, submitted_at")
        .eq("employee_id", employee_id).order("started_at", { ascending: false }).limit(1);
      const idp = (idps || [])[0] || null;
      const roleName = String(idp?.role_at_time || emp.designation || "").split(" · ")[0].trim();
      const { data: role } = roleName
        ? await admin.from("hrms_role").select("role, job_description, deliverable, metric, summary").ilike("role", roleName).maybeSingle()
        : { data: null };
      let reviews: { notes: string | null; analysis: string | null; ratings: Record<string, number> | null }[] = [];
      if (idp) {
        const { data: idRows } = await admin.from("hrms_idp").select("id").eq("employee_id", employee_id).order("started_at", { ascending: false }).limit(1);
        if (idRows?.[0]) {
          const { data: rv } = await admin.from("hrms_idp_review").select("notes, analysis, ratings").eq("idp_id", idRows[0].id);
          reviews = (rv || []) as typeof reviews;
        }
      }
      const { data: hist } = await admin.from("hrms_salary_history")
        .select("fy, gross").eq("employee_id", employee_id).order("fy").limit(20).then((r) => ({ data: r.error ? [] : r.data }));

      const answers = (idp?.answers || {}) as Record<string, string>;
      delete answers["ask_gross"];
      const material =
        `PERSON: ${emp.name} · ${emp.designation || ""} · ${emp.department || ""} · in company since ${emp.doj || "?"} · reports to ${extra["Reporting Manager"] || "?"}\n\n` +
        (role ? `ROLE (register): ${role.role}\nJD: ${role.job_description || ""}\nKRA: ${role.deliverable || ""}\nKPIs: ${role.metric || ""}\n\n` : "") +
        (idp ? `THEIR OWN IDP WORDS:\n${Object.entries(answers).map(([k, v]) => `${k}: ${String(v).slice(0, 900)}`).join("\n")}\n\n` : "NO IDP SUBMITTED.\n\n") +
        (reviews.length ? `MANAGER REVIEW NOTES:\n${reviews.map((r) => [r.notes, r.analysis].filter(Boolean).join(" · ")).join("\n")}\n\n` : "") +
        (hist?.length ? `GROSS BY YEAR: ${hist.map((h) => `${h.fy}: ₹${h.gross}`).join(" · ")}` : "");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: AI.FRONT, max_tokens: 1400,
          system: "You brief Dr Raghu Nandan, MD of Nandan GSE, for an appraisal interview — five minutes' read, plain simple language. " +
            "Sections, each 2-5 short pointers: WHO THEY ARE (one line); THE ROLE IN ONE LINE; WHAT THEY ACTUALLY DO (from their own IDP words); " +
            "WORTH AFFIRMING; WORTH RAISING (concerns, gaps between role and reality); THREE QUESTIONS WORTH ASKING; " +
            "A FEEDBACK SEED (3-4 sentences Dr Raghu could adapt into written feedback to them — warm, direct, specific). " +
            "Grounded only in the material given — where it is thin, say so plainly. Never invent numbers or events.",
          messages: [{ role: "user", content: material.slice(0, 60000) }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new HttpError(502, (j as { error?: { message?: string } })?.error?.message || `Anthropic returned ${res.status}`);
      const text = ((j as { content?: { type: string; text: string }[] }).content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      const { error } = await admin.from("hrms_appraisal").upsert(
        { employee_id, cycle: "2026-27", brief: text, brief_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "employee_id,cycle" });
      if (error && /brief|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0098 first — the brief has nowhere to live yet.");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, brief: text });
    }

    // the FINALISED DISCUSSION (29 Aug 2026): date · attendees · link · MoM ·
    // Note from Raghu — kept on the cycle row; the note rides into the IDP
    // letter later.
    /**
     * { action: "growth-note", employee_id } — THE GROWTH NOTE (Dr Raghu,
     * 7 Sep 2026): "write this in Raghu's voice to the person directly. Use
     * first person and also use his name at least 2 to 3 times. For the
     * workers mention this in Hindi also."
     *
     * Not a brief about them — a letter to them, in his voice, of the
     * quality a good CHRO would write. Hindi beside it for Labour, because
     * a note the person cannot read is not a note. Grounded in the same
     * record as the brief; it invents nothing and never mentions money.
     */
    /**
     * { action: "release", employee_ids: [...], on } — the day the person is
     * told (Dr Raghu, 7 Sep 2026: "have a cell called released"). Only over
     * appraisals he has already finalised; releasing what is not decided
     * would say something to somebody that has not been decided.
     */
    if (String(body.action || "") === "release") {
      const u2 = await requireHrms();
      if (!u2.isOwner) throw new HttpError(403, "Only Dr Raghu releases an appraisal.");
      const ids = (Array.isArray(body.employee_ids) ? body.employee_ids : [body.employee_id]).map(String).filter(Boolean).slice(0, 500);
      if (!ids.length) throw new HttpError(400, "nobody chosen");
      const on = body.on !== false;
      const patch = on
        ? { released_at: new Date().toISOString(), released_by: u2.email, updated_at: new Date().toISOString() }
        : { released_at: null, released_by: null, updated_at: new Date().toISOString() };
      const { data: ready } = await admin.from("hrms_appraisal").select("employee_id").eq("cycle", "2026-27").in("employee_id", ids).not("approved_at", "is", null);
      const may = (ready || []).map((r) => String(r.employee_id));
      if (on && !may.length) throw new HttpError(400, "None of those are finalised yet — finalise the appraisal before releasing it.");
      const target = on ? may : ids;
      const { error } = await admin.from("hrms_appraisal").update(patch).eq("cycle", "2026-27").in("employee_id", target);
      if (error) {
        if (/released_at|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0149 first — released has nowhere to be recorded yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, n: target.length, skipped: ids.length - target.length });
    }

    if (String(body.action || "") === "growth-note") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set on this deploy.");
      const employee_id = String(body.employee_id || "");
      if (!employee_id) throw new HttpError(400, "employee_id required");
      const T = await hrmsTables(admin);
      const { data: emp } = await admin.from(T.employees).select("id, name, department, designation, doj, extra").eq("id", employee_id).maybeSingle();
      if (!emp) throw new HttpError(404, "no such person");
      const extra = (emp.extra || {}) as Record<string, string>;
      const { data: edits } = await admin.from(T.edits).select("field, value").eq("employee_id", employee_id).in("field", ["type", "designation", "department", "reporting_manager"]);
      const ed = new Map((edits || []).map((r) => [String(r.field), r.value == null ? "" : String(r.value)]));
      const type = ed.get("type") || extra["Type"] || "";
      const wantHindi = /labour|worker|shop\s*floor/i.test(type);

      const { data: roleRow } = await admin.from("hrms_role").select("role, job_description, deliverable, metric")
        .ilike("role", String(ed.get("designation") || emp.designation || "")).limit(1).maybeSingle();
      const { data: idpRows } = await admin.from("hrms_idp").select("id, answers, ratings, submitted_at").eq("employee_id", employee_id).eq("cycle", "2026-27").order("submitted_at", { ascending: false }).limit(1);
      const idp = idpRows?.[0];
      let reviews: { notes: string | null; analysis: string | null }[] = [];
      if (idp?.id) {
        const { data: rv } = await admin.from("hrms_idp_review").select("notes, analysis").eq("idp_id", idp.id);
        reviews = (rv || []) as typeof reviews;
      }
      const answers = { ...((idp?.answers || {}) as Record<string, string>) };
      delete answers["ask_gross"];
      const material =
        `PERSON: ${emp.name}\nDESIGNATION: ${ed.get("designation") || emp.designation || "—"}\nDEPARTMENT: ${ed.get("department") || emp.department || "—"}\n` +
        `TYPE: ${type || "—"}\nWITH NANDAN SINCE: ${emp.doj || "—"}\nREPORTS TO: ${ed.get("reporting_manager") || extra["Reporting Manager"] || "—"}\n\n` +
        (roleRow ? `THE ROLE AS WRITTEN: ${roleRow.role}\nWhat the job is: ${roleRow.job_description || ""}\nWhat they must deliver: ${roleRow.deliverable || ""}\nHow it is measured: ${roleRow.metric || ""}\n\n` : "") +
        (idp ? `THEIR OWN WORDS IN THIS YEAR'S IDP:\n${Object.entries(answers).map(([k, v]) => `${k}: ${String(v).slice(0, 900)}`).join("\n")}\n\n` : "NO IDP SUBMITTED THIS YEAR.\n\n") +
        (reviews.length ? `WHAT THEIR MANAGER WROTE:\n${reviews.map((r) => [r.notes, r.analysis].filter(Boolean).join(" · ")).join("\n")}\n` : "THE MANAGER HAS NOT WRITTEN YET.\n");

      /**
       * THE OPENING IS HIS, WORD FOR WORD (Dr Raghu, 7 Sep 2026: "Tell them
       * — Dear so-and-so, I appreciate you for being an important member of
       * Team Nandan…"). It is built here, not asked of the model: the same
       * paragraph must reach all 205 people unaltered, and a model given
       * words to reproduce will eventually improve one of them.
       */
      const firstName = String(emp.name || "").trim().split(/\s+/)[0] || String(emp.name || "");
      const deptName = ed.get("department") || emp.department || "your";
      const roleName = ed.get("designation") || emp.designation || "your role";
      const yrs = emp.doj ? Math.max(0, Math.round(((Date.now() - Date.parse(String(emp.doj))) / (365.25 * 864e5)) * 10) / 10) : null;
      const tenure = yrs == null ? "some years" : yrs < 1 ? "these first months" : `${yrs} years`;
      const opening =
        `Dear ${firstName},\n\n` +
        `I appreciate you for being an important member of Team Nandan in the ${deptName} department, and for holding the ${roleName} role with us for ${tenure}. As we take the next growth of Nandan, it is important for you to be at your best performing ability, and for you to win with us.\n\n` +
        `Please note that we will take your performance very seriously, and this appraisal has been done with great thought and with expectations. If the expectations do not match, there is going to be immense pressure on you, for sure, to deliver — because all data is seen in the system. If you do not put in data, that is also seen as non-performance. Kindly take that up and work it out to make this happen.`;

      const system = [
        "You are the finest CHRO in the country, holding the pen for Dr Raghunandan Jagdish — Dr Raghu — Managing Director of Nandan GSE, which has built ground support equipment for Indian airports out of Mumbai since 1994.",
        "You are writing the GROWTH NOTE he hands a person at their appraisal.",
        "",
        "THE NOTE ALREADY HAS ITS OPENING — Dr Raghu has written it himself and it is fixed. It is given to you below under OPENING ALREADY WRITTEN. Do NOT repeat it, do not greet the person again, and do not restate its points. You write ONLY what comes after it, continuing in the same breath.",
        "",
        "WRITE AS DR RAGHU, IN THE FIRST PERSON — 'I have watched', 'I want you to', 'I will'. Speak TO the person, never about them. Use their first name two or three times, placed naturally; never more.",
        "",
        "Four short paragraphs, no headings, no bullet points, 180 to 260 words:",
        "1. What I have seen in you this year, specific, from the record.",
        "2. What you do well, and why it matters to Nandan.",
        "3. Where I want you to grow this coming year — one or two things, concrete enough to act on Monday.",
        "4. What I and the company will do to help that happen, closing in my own voice with an expectation and the belief behind it.",
        "",
        "RULES. Plain English a person reads once and understands. Warm, and straight — never flattery, never a lecture. No jargon: no synergy, no leverage, no bandwidth, no journey. Never invent an event, a number, a project or a customer that is not in the material; where the record is thin, speak to the role and to character rather than pretending to know. Never mention salary, increment or the appraisal figure. Never suggest a machine wrote it.",
        wantHindi
          ? "THIS PERSON WORKS ON THE FLOOR. Write the WHOLE note again in simple, respectful Hindi in Devanagari — the opening given to you AND your own part, as one letter — using the आप form, short sentences, the Hindi a Mumbai shop floor actually speaks. Carry the same meaning rather than translating word for word; keep the person's name in Roman letters as written."
          : "Hindi is not needed for this person.",
        "",
        'Answer as JSON only: {"en": "only the part that follows the opening", "hi": "the whole letter in Hindi including the opening, or an empty string"}',
      ].join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: AI.FRONT, max_tokens: 3000, system, messages: [{ role: "user", content: `OPENING ALREADY WRITTEN (do not repeat it):\n${opening}\n\n---\n\n${material}`.slice(0, 60000) }] }),
      });
      const j = await res.json();
      if (!res.ok) throw new HttpError(502, (j as { error?: { message?: string } })?.error?.message || `Anthropic returned ${res.status}`);
      const raw = ((j as { content?: { type: string; text: string }[] }).content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new HttpError(502, "Genie did not answer in the expected shape — try once more.");
      const parsed = JSON.parse(m[0]) as { en?: string; hi?: string };
      const tail = String(parsed.en || "").trim();
      const hi = String(parsed.hi || "").trim();
      if (!tail) throw new HttpError(502, "Genie came back empty — try once more.");
      // his words first, always, and then the part written for this person
      const en = `${opening}\n\n${tail}`;
      const { error } = await admin.from("hrms_appraisal").upsert(
        { employee_id, cycle: "2026-27", growth_note: en, growth_note_hi: hi || null, growth_note_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "employee_id,cycle" });
      if (error && /growth_note|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0148 first — the growth note has nowhere to live yet.");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, en, hi, hindi: wantHindi });
    }

    if (String(body.action || "") === "appraisal-discussion") {
      const employee_id = String(body.employee_id || "");
      if (!employee_id) throw new HttpError(400, "employee_id required");
      const d2 = (body.discussion || {}) as Record<string, string>;
      const discussion = {
        date: String(d2.date || "").slice(0, 10) || null,
        attendees: String(d2.attendees || "").slice(0, 500),
        link: String(d2.link || "").slice(0, 500),
        mom: String(d2.mom || "").slice(0, 8000),
        note_raghu: String(d2.note_raghu || "").slice(0, 4000),
        by: me.initials || me.email, at: new Date().toISOString(),
      };
      const { error } = await admin.from("hrms_appraisal").upsert(
        { employee_id, cycle: "2026-27", discussion, updated_at: new Date().toISOString() },
        { onConflict: "employee_id,cycle" });
      if (error) {
        if (/discussion|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0096 first — the discussion has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (String(body.action || "") === "appraisal") {
      const employee_id = String(body.employee_id || "");
      if (!employee_id) throw new HttpError(400, "employee_id required");
      const new_gross = Number(String(body.new_gross ?? "").replace(/[^0-9.]/g, "")) || null;
      const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
      const owner = me.email.toLowerCase() === RAGHU_EMAIL;
      const now = new Date().toISOString();
      // a DRAFT (Dr Raghu, 29 Aug 2026: "provision to save it — submit may
      // be later") parks the working: no approval, no queue, just kept.
      const draft = !!body.draft;
      const row: Record<string, unknown> = {
        employee_id, cycle: "2026-27",
        new_gross, prev_gross: Number(body.prev_gross) || null,
        new_designation: String(body.new_designation || "").trim() || null,
        note: String(body.note || "").trim() || null,
        decided_by: stamp,
        updated_at: now,
        // HR proposes, the owner finalises. His own save IS the approval —
        // sending it to a queue he is standing in front of would be theatre.
        pending_since: draft ? null : owner ? null : now,
        pending_by: draft ? null : owner ? null : stamp,
        ...(!draft && owner ? { approved_at: now, approved_by: stamp } : { approved_at: null, approved_by: null }),
      };
      // the hand-tuned split and the investment lines, when the card sent them (0062)
      if (body.structure && typeof body.structure === "object") row.structure = body.structure;
      let { error } = await admin.from("hrms_appraisal").upsert(row, { onConflict: "employee_id,cycle" });
      // Narrowest missing column first. Both errors say "schema cache", so a
      // pre-0062 failure tested against the 0063 branch would strip the
      // approval columns and store the owner's own save as unapproved —
      // leaving him waiting for himself.
      if (error && row.structure && /structure/i.test(error.message)) {
        delete row.structure;
        ({ error } = await admin.from("hrms_appraisal").upsert(row, { onConflict: "employee_id,cycle" }));
        if (!error) return NR.json({ ok: true, approved: owner, warning: "Saved, but the edited structure needs migration 0062 — run it and save once more." });
      }
      if (error && /pending_since|approved_at|approved_by|pending_by/i.test(error.message)) {
        for (const k of ["pending_since", "pending_by", "approved_at", "approved_by"]) delete row[k];
        ({ error } = await admin.from("hrms_appraisal").upsert(row, { onConflict: "employee_id,cycle" }));
        if (!error) return NR.json({ ok: true, approved: false, warning: "Saved, but the approval flow needs migration 0063 — run it and save once more." });
      }
      if (error) {
        if (/hrms_appraisal|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0061 first — the appraisal decision has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NR.json({ ok: true, approved: owner });
    }

    /**
     * { action: "approve-appraisal", ids?: string[], all?: true } — the owner
     * finalises. Approving alters no number; it changes what the number IS:
     * a proposal becomes the agreed figure.
     */
    if (String(body.action || "") === "approve-appraisal") {
      if (me.email.toLowerCase() !== RAGHU_EMAIL)
        throw new HttpError(403, `Only ${RAGHU_EMAIL} may finalise an appraisal.`);
      const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
      let q = admin.from("hrms_appraisal")
        .update({ pending_since: null, pending_by: null, approved_at: new Date().toISOString(), approved_by: stamp })
        .eq("cycle", "2026-27").not("pending_since", "is", null);
      if (!body.all) {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
        if (!ids.length) throw new HttpError(400, "Nothing was ticked.");
        q = q.in("employee_id", ids);
      }
      const { data, error } = await q.select("employee_id");
      if (error) {
        if (/pending_since|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0063 first — the appraisal approval has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NR.json({ ok: true, approved: (data || []).length });
    }

    /** GET-shaped read of the commercial queue, kept beside its approve. */
    if (String(body.action || "") === "pending-appraisals") {
      const T = await hrmsTables(admin);
      const { data, error } = await admin.from("hrms_appraisal")
        .select("employee_id, new_gross, prev_gross, pending_since, pending_by, note")
        .eq("cycle", "2026-27").not("pending_since", "is", null)
        .order("pending_since", { ascending: false });
      if (error) {
        if (/pending_since|schema cache/i.test(error.message)) return NR.json({ rows: [], needsMigration: true });
        throw new Error(error.message);
      }
      const ids = (data || []).map((r) => String(r.employee_id));
      const nameOf = new Map<string, string>();
      const deptOf = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await admin.from(T.employees).select("id, name, department").in("id", ids);
        for (const e of emps || []) { nameOf.set(String(e.id), String(e.name || e.id)); deptOf.set(String(e.id), String(e.department || "")); }
      }
      return NR.json({
        rows: (data || []).map((r) => ({
          id: String(r.employee_id),
          name: nameOf.get(String(r.employee_id)) || String(r.employee_id),
          department: deptOf.get(String(r.employee_id)) || null,
          prev: r.prev_gross == null ? null : Number(r.prev_gross),
          next: r.new_gross == null ? null : Number(r.new_gross),
          since: r.pending_since, by: r.pending_by, note: r.note,
        })),
      });
    }

    if (String(body.action || "") !== "reopen") throw new HttpError(400, "unknown action");
    const id = String(body.id || "");
    const { data: row } = await admin
      .from("hrms_idp").select("id, person_email, employee_id, submitted_at").eq("id", id).maybeSingle();
    if (!row) throw new HttpError(404, "No such IDP.");
    if (!row.submitted_at) return NR.json({ ok: true, already: "open" });
    const { error } = await admin
      .from("hrms_idp").update({ submitted_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    try {
      const T = await hrmsTables(admin);
      await admin.from(T.log).insert({
        employee_id: row.employee_id || "(idp)", field: "idp",
        old_value: `submitted ${row.submitted_at}`, new_value: "reopened for a proper pass",
        edited_by: me.initials ? `${me.initials} · ${me.email}` : me.email,
      });
    } catch (e) { swallow("hrms/idp", e); /* the reopen matters more than the line about it */ }
    return NR.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
