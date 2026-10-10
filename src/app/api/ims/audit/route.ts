import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI, anthropicClient } from "@/lib/ai";
import { errJson, HttpError } from "@/lib/auth";
import { assertAiOn } from "@/lib/ai-gate";
import { isHead, requireIms, type ImsUser } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, ok } from "@/ims/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * INTERNAL AUDIT (Dr Raghu, 10 Oct 2026): an audit has its standards, a
 * start date, a target completion date, the people, the departments and a
 * status. Meeting a department brings up every checklist line of that
 * department; each line is answered with a status, a finding and the
 * evidence seen; a Minor or Major NC raises a non-conformity; the action
 * plan (CAPA) hangs off each NC; and the audit file is written at the end.
 *
 *   GET                → the audits, with counts
 *   GET ?id=…          → one audit: its items (for its standards), answers,
 *                        NCs, CAPAs, the departments it covers
 *   GET ?bank=1        → the checklist bank (every item)
 *   POST { action }    create · edit · answer · nc_status · capa_add · capa_edit ·
 *                      item_add · report (Genie writes the audit file) · close
 */
const ANSWER = ["Not audited", "C", "OFI", "Minor NC", "Major NC", "N/A"];
const SEV: Record<string, string> = { OFI: "observation", "Minor NC": "minor", "Major NC": "major" };
const KIND: Record<string, string> = { C: "Conforms", OFI: "OFI", "Minor NC": "Minor NC", "Major NC": "Major NC" };
const mayAudit = (u: ImsUser) => u.isOwner || isHead(u) || u.imsRole === "auditor";

async function nextNo(db: ReturnType<typeof imsDb>, table: "ims_internal_audit" | "ims_nonconformity", col: string, prefix: string) {
  const { data } = await db.from(table).select(col).ilike(col, `${prefix}%`).order(col, { ascending: false }).limit(1);
  const last = (data?.[0] as Record<string, string> | undefined)?.[col] || "";
  const n = Number((last.match(/(\d+)$/) || [])[1] || 0) + 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const db = imsDb();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (url.searchParams.get("bank")) {
      const { data, error } = await db.from("ims_audit_item").select("*").order("sort");
      if (error) { if (notInstalled(error.message)) return NextResponse.json({ installed: false }); throw new Error(error.message); }
      return NextResponse.json({ installed: true, items: data ?? [], mayAudit: mayAudit(me) });
    }
    const { data: audits, error } = await db.from("ims_internal_audit").select("*").order("created_at", { ascending: false });
    if (error) { if (notInstalled(error.message)) return NextResponse.json({ installed: false, audits: [] }); throw new Error(error.message); }
    const { data: standards } = await db.from("ims_standard").select("id, name, sys").order("sort_order");
    if (!id) {
      const ids = (audits ?? []).map((a) => String(a.id));
      const [{ data: ans }, { data: ncs }] = await Promise.all([
        ids.length ? db.from("ims_audit_answer").select("audit_id, status").in("audit_id", ids) : { data: [] },
        ids.length ? db.from("ims_nonconformity").select("audit_id, severity, status").in("audit_id", ids) : { data: [] },
      ]);
      return NextResponse.json({
        installed: true, standards: standards ?? [], mayAudit: mayAudit(me), mayPlan: isHead(me) || me.isOwner,
        audits: (audits ?? []).map((a) => {
          const an = (ans ?? []).filter((x) => String(x.audit_id) === String(a.id)); const nc = (ncs ?? []).filter((x) => String(x.audit_id) === String(a.id));
          return { ...a, answered: an.filter((x) => x.status !== "Not audited").length, major: nc.filter((x) => x.severity === "major").length, minor: nc.filter((x) => x.severity === "minor").length, ofi: nc.filter((x) => x.severity === "observation").length, open: nc.filter((x) => x.status !== "closed").length };
        }),
      });
    }
    const a = (audits ?? []).find((x) => String(x.id) === id);
    if (!a) throw new HttpError(404, "No such audit.");
    const stdIds = (a.standard_ids || []).map(String);
    const [{ data: items }, { data: answers }, { data: ncs }] = await Promise.all([
      db.from("ims_audit_item").select("*").eq("active", true).order("sort"),
      db.from("ims_audit_answer").select("*").eq("audit_id", id),
      db.from("ims_nonconformity").select("*").eq("audit_id", id).order("nc_no"),
    ]);
    const ncIds = (ncs ?? []).map((n) => String(n.id));
    const { data: capas } = ncIds.length ? await db.from("ims_capa").select("*").in("nc_id", ncIds).order("created_at") : { data: [] };
    /* the items for this audit's standards; an item with no standard belongs to every audit */
    const mine = (items ?? []).filter((i) => !i.standard_id || stdIds.includes(String(i.standard_id)));
    const depts = [...new Set([...(a.departments || []), ...mine.flatMap((i) => i.departments || [])])].filter((d) => d && d !== "All");
    return NextResponse.json({ installed: true, audit: a, standards: standards ?? [], items: mine, answers: answers ?? [], ncs: ncs ?? [], capas: capas ?? [], departments: depts, mayAudit: mayAudit(me), mayPlan: isHead(me) || me.isOwner, me: me.email, meName: me.displayName || me.email });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const b = await readBody(req, { action: "string" });
    const db = imsDb();
    const txt = (v: unknown) => { const s = String(v ?? "").replace(/\u0000/g, "").trim(); return s || null; };
    const names = (v: unknown) => (Array.isArray(v) ? v : String(v || "").split(/[,\n]/)).map((x: unknown) => String(x).trim()).filter(Boolean);
    const date = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

    if (b.action === "create" || b.action === "edit") {
      if (!(isHead(me) || me.isOwner)) throw new HttpError(403, "The MR or a department head plans an audit.");
      const title = txt(b.title); if (!title) throw new HttpError(400, "A title.");
      const row = { title, standard_ids: (Array.isArray(b.standard_ids) ? b.standard_ids : []).map(String), date_start: date(b.date_start), target_end: date(b.target_end), lead_auditor: txt(b.lead_auditor), auditors: names(b.auditors), auditees: names(b.auditees), departments: names(b.departments), status: ["planned", "in_progress", "reporting", "closed"].includes(String(b.status)) ? String(b.status) : "planned" };
      if (b.action === "create") {
        const audit_no = await nextNo(db, "ims_internal_audit", "audit_no", `IA-${new Date().getFullYear()}-`);
        const { data, error } = await db.from("ims_internal_audit").insert({ ...row, audit_no, created_by: me.email }).select("id").single();
        if (error) throw new Error(error.message);
        await log(me, "ims_internal_audit", String(data?.id), "create", { audit_no });
        return ok({ id: data?.id, audit_no });
      }
      const { error } = await db.from("ims_internal_audit").update(row).eq("id", String(b.id || ""));
      if (error) throw new Error(error.message);
      return ok();
    }

    if (b.action === "answer") {
      if (!mayAudit(me)) throw new HttpError(403, "The auditor, the MR or a department head answers.");
      const audit_id = String(b.audit_id || ""), item_id = String(b.item_id || "");
      const status = ANSWER.includes(String(b.status)) ? String(b.status) : "Not audited";
      const finding = txt(b.finding), evidence_ref = txt(b.evidence_ref), remarks = txt(b.remarks), department = txt(b.department);
      const [{ data: audit }, { data: item }, { data: prev }] = await Promise.all([
        db.from("ims_internal_audit").select("id, audit_no, title, status, standard_ids").eq("id", audit_id).maybeSingle(),
        db.from("ims_audit_item").select("id, clause_no, clause_title, standard_id, departments").eq("id", item_id).maybeSingle(),
        db.from("ims_audit_answer").select("id, nc_id").eq("audit_id", audit_id).eq("item_id", item_id).maybeSingle(),
      ]);
      if (!audit || !item) throw new HttpError(404, "No such audit or line.");
      let nc_id: string | null = prev?.nc_id ? String(prev.nc_id) : null;
      /* A MINOR OR MAJOR NC (or an OFI) RAISES A NON-CONFORMITY, numbered; a later change of status updates it rather than raising another */
      if (SEV[status]) {
        const desc = `${item.clause_no} ${item.clause_title || ""}: ${finding || "Finding not written"}`.trim();
        if (nc_id) await db.from("ims_nonconformity").update({ description: desc, severity: SEV[status], department: department || item.departments?.[0] || "", evidence_ref, clause_no: item.clause_no }).eq("id", nc_id);
        else {
          const nc_no = await nextNo(db, "ims_nonconformity", "nc_no", `${audit.audit_no}-`);
          const { data: nc, error } = await db.from("ims_nonconformity").insert({ nc_no, source: "internal_audit", description: desc, severity: SEV[status], department: department || item.departments?.[0] || "", status: "open", clause_no: item.clause_no, audit_id, evidence_ref, raised_by: me.profileId }).select("id").single();
          if (error) throw new Error(error.message); nc_id = String(nc?.id);
        }
      }
      const row = { audit_id, item_id, department, status, finding, evidence_ref, remarks, nc_id, auditor: me.displayName || me.email, audited_at: new Date().toISOString() };
      const { error } = await db.from("ims_audit_answer").upsert(row, { onConflict: "audit_id,item_id" });
      if (error) throw new Error(error.message);
      /* THE CLAUSE-WISE REMARK — the key: the finding lands on the clause in Standards too */
      if (finding && KIND[status]) await db.from("ims_clause_audit_remark").insert({ clause_no: item.clause_no, standard_id: item.standard_id, audit_label: `${audit.audit_no} · ${audit.title}`, kind: KIND[status], remark: finding, added_by: me.email }).then(() => {}, () => {});
      if (audit.status === "planned") await db.from("ims_internal_audit").update({ status: "in_progress" }).eq("id", audit_id);
      return ok({ nc_id });
    }

    if (b.action === "nc_status") {
      if (!mayAudit(me)) throw new HttpError(403, "The auditor, the MR or a department head.");
      const st = ["open", "rca", "capa", "verification", "closed"].includes(String(b.status)) ? String(b.status) : "open";
      const { error } = await db.from("ims_nonconformity").update({ status: st, closed_at: st === "closed" ? new Date().toISOString() : null }).eq("id", String(b.id || ""));
      if (error) throw new Error(error.message);
      return ok();
    }

    if (b.action === "capa_add" || b.action === "capa_edit") {
      if (!mayAudit(me) && !isHead(me)) throw new HttpError(403, "The auditor, the MR or a department head writes the action plan.");
      const corrective_action = txt(b.corrective_action); if (!corrective_action) throw new HttpError(400, "The corrective action.");
      const row = { correction: txt(b.correction) || "", corrective_action, owner_name: txt(b.owner_name) || "", owner_id: b.owner_id || null, support: txt(b.support) || "", due_date: date(b.due_date), status: ["open", "in_progress", "verified", "closed"].includes(String(b.status)) ? String(b.status) : "open", effectiveness_result: txt(b.effectiveness_result) || "" };
      if (b.action === "capa_add") {
        const { data: nc } = await db.from("ims_nonconformity").select("id, clause_no, audit_id").eq("id", String(b.nc_id || "")).maybeSingle();
        if (!nc) throw new HttpError(404, "No such NC.");
        const { data, error } = await db.from("ims_capa").insert({ ...row, nc_id: nc.id, clause_no: nc.clause_no, audit_id: nc.audit_id }).select("id").single();
        if (error) throw new Error(error.message);
        await db.from("ims_nonconformity").update({ status: "capa" }).eq("id", nc.id).eq("status", "open");
        return ok({ id: data?.id });
      }
      const { error } = await db.from("ims_capa").update(row).eq("id", String(b.id || ""));
      if (error) throw new Error(error.message);
      return ok();
    }

    if (b.action === "item_add") {
      if (!(isHead(me) || me.isOwner)) throw new HttpError(403, "The MR or a department head adds to the checklist.");
      const question = txt(b.question); const clause_no = txt(b.clause_no); if (!question || !clause_no) throw new HttpError(400, "A clause and a question.");
      const { data: last } = await db.from("ims_audit_item").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db.from("ims_audit_item").insert({ standard_id: b.standard_id || null, ref_no: txt(b.ref_no) || clause_no, sec: clause_no.split(".")[0], clause_no, clause_title: txt(b.clause_title), question, aero: !!b.aero, evidence_to_verify: txt(b.evidence_to_verify), process_owner: txt(b.process_owner), departments: names(b.departments), method: txt(b.method), sort: Number(last?.sort || 0) + 1, created_by: me.email }).select("id").single();
      if (error) throw new Error(error.message);
      return ok({ id: data?.id });
    }

    if (b.action === "report") {
      if (!mayAudit(me) && !isHead(me)) throw new HttpError(403, "The auditor, the MR or a department head writes the audit file.");
      await assertAiOn();
      const id = String(b.id || "");
      const [{ data: a }, { data: answers }, { data: ncs }, { data: items }] = await Promise.all([
        db.from("ims_internal_audit").select("*").eq("id", id).maybeSingle(),
        db.from("ims_audit_answer").select("*").eq("audit_id", id),
        db.from("ims_nonconformity").select("*").eq("audit_id", id).order("nc_no"),
        db.from("ims_audit_item").select("id, ref_no, clause_no, clause_title, question, departments").eq("active", true),
      ]);
      if (!a) throw new HttpError(404, "No such audit.");
      const ncIds = (ncs ?? []).map((n) => String(n.id));
      const { data: capas } = ncIds.length ? await db.from("ims_capa").select("*").in("nc_id", ncIds) : { data: [] };
      const { data: stds } = await db.from("ims_standard").select("id, name").in("id", (a.standard_ids || []).map(String));
      const byItem = new Map((items ?? []).map((i) => [String(i.id), i]));
      const counts = ANSWER.map((s) => `${s}: ${(answers ?? []).filter((x) => x.status === s).length}`).join(", ");
      const lines = (answers ?? []).filter((x) => x.status !== "Not audited").map((x) => { const i = byItem.get(String(x.item_id)); return `- [${x.status}] ${i?.clause_no} ${i?.clause_title || ""} · ${x.department || i?.departments?.[0] || ""} · ${x.finding || "-"}${x.evidence_ref ? ` · evidence: ${x.evidence_ref}` : ""}`; }).join("\n");
      const ncText = (ncs ?? []).map((n) => `- ${n.nc_no} [${n.severity}] clause ${n.clause_no} · ${n.department} · ${n.description} · status ${n.status}\n${(capas ?? []).filter((c) => String(c.nc_id) === String(n.id)).map((c) => `    action: ${c.corrective_action} · owner ${c.owner_name || "-"} · by ${c.due_date || "-"} · ${c.status}${c.support ? ` · support ${c.support}` : ""}`).join("\n")}`).join("\n");
      const r = await anthropicClient().messages.create({
        model: AI.FRONT, max_tokens: 6000,
        system: "You are the Management Representative's drafting hand at Nandan GSE Pvt. Ltd. (aircraft ground support equipment, Navi Mumbai and Khalapur, certified to ISO 9001, 14001, 45001 and AS 9100D). You write the INTERNAL AUDIT REPORT a certification body auditor will read. Plain English, Indian spelling, no marketing, nothing invented: every finding, number and name comes from the material. Return clean HTML only, using <h2>, <h3>, <p>, <ul>, <ol>, <li>, <b>, <table border=\"1\">, <tr>, <th>, <td>. Structure: <h2>Internal Audit Report — {audit no}</h2>; <h3>1. Audit details</h3> table (title, standards, period, lead auditor, audit team, auditees, departments, status); <h3>2. Scope and method</h3>; <h3>3. Summary of results</h3> a table of counts and one paragraph on the overall state of the system; <h3>4. Findings by department</h3> for each department a short paragraph and a table of its lines (clause, status, finding, evidence); <h3>5. Non-conformities and the action plan</h3> a table (NC no, severity, clause, department, statement of non-conformity, corrective action, owner, target, status); <h3>6. Opportunities for improvement</h3>; <h3>7. Conclusion and recommendation</h3> (readiness, what must close before the certification audit); <h3>8. Sign-off</h3> lines for the lead auditor and the MR. Write every NC as requirement + objective evidence + statement of non-conformity where the material allows.",
        messages: [{ role: "user", content: `AUDIT: ${a.audit_no} · ${a.title}\nStandards: ${(stds ?? []).map((s) => s.name).join("; ")}\nPeriod: ${a.date_start || "-"} to ${a.target_end || "-"} · status ${a.status}\nLead auditor: ${a.lead_auditor || "-"} · auditors: ${(a.auditors || []).join(", ") || "-"} · auditees: ${(a.auditees || []).join(", ") || "-"}\nDepartments: ${(a.departments || []).join(", ")}\n\nCOUNTS: ${counts}\n\nLINES AUDITED:\n${lines || "(none yet)"}\n\nNON-CONFORMITIES AND ACTION PLAN:\n${ncText || "(none)"}` }],
      });
      const html = r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
      await db.from("ims_internal_audit").update({ report_html: html, report_at: new Date().toISOString(), status: a.status === "closed" ? "closed" : "reporting" }).eq("id", id);
      await log(me, "ims_internal_audit", id, "report", { ncs: ncIds.length });
      return ok({ html });
    }

    if (b.action === "close") {
      if (!(isHead(me) || me.isOwner)) throw new HttpError(403, "The MR closes an audit.");
      await db.from("ims_internal_audit").update({ status: "closed" }).eq("id", String(b.id || ""));
      return ok();
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
