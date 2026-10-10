import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI, anthropicClient } from "@/lib/ai";
import { errJson, HttpError } from "@/lib/auth";
import { assertAiOn } from "@/lib/ai-gate";
import { isHead, requireIms, type ImsUser } from "@/ims/auth";

/** THE AUDITOR WRITES (Dr Raghu, 10 Oct 2026): the auditor role, the MR and the heads may remark on a clause. */
const mayRemark = (u: ImsUser) => u.isOwner || isHead(u) || u.imsRole === "auditor";
const KINDS = ["Conforms", "Observation", "OFI", "Minor NC", "Major NC"];
import { imsDb, notInstalled } from "@/ims/db";
import { log, ok } from "@/ims/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * CLAUSES & EVIDENCE ACROSS THE STANDARDS (Dr Raghu, 10 Oct 2026): tick the
 * standards, merge them on the clause number, write the evidence once, and
 * on save Genie rewrites it into every ticked standard's own clause note.
 *
 *   GET  ?ids=a,b,c      → the merged rows: for each clause number, the
 *                          clause in each ticked standard, its note, and the
 *                          group note the man wrote
 *   POST { action: "group_save", clause_no, standard_ids[], raw }
 *                        → keeps the raw text, asks Genie once for every
 *                          standard's wording, writes each into its note
 *        { action: "group_save", …, rewrite: false }  → keeps the raw only
 */
const short = (name: string) => {
  const n = name.toUpperCase();
  if (n.includes("AS 9100") || n.includes("AS9100")) return "AS9100D";
  const m = n.match(/(\d{4,5})/); return m ? m[1] : name.slice(0, 8);
};

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const ids = String(new URL(req.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const db = imsDb();
    const { data: standards, error } = await db.from("ims_standard").select("id, code, name, sys").order("sort_order");
    if (error) { if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] }); throw new Error(error.message); }
    if (!ids.length) return NextResponse.json({ installed: true, standards: standards ?? [], rows: [], mayWrite: isHead(me) });
    const chosen = (standards ?? []).filter((s) => ids.includes(String(s.id)));
    const { data: clauses } = await db.from("ims_standard_clause").select("id, standard_id, clause_no, title, parent_clause, sort_order").in("standard_id", ids).order("sort_order");
    const cids = (clauses ?? []).map((c) => String(c.id));
    const [{ data: notes }, { data: groups }, { data: remarks }] = await Promise.all([
      cids.length ? db.from("ims_clause_evidence_note").select("clause_id, evidence, compliance, updated_by, updated_at").in("clause_id", cids) : { data: [] },
      db.from("ims_clause_group_note").select("*"),
      db.from("ims_clause_audit_remark").select("*").order("added_at", { ascending: false }),
    ]);
    /* merge on the clause number; the logical title is the first standard's (9001 leads the order) */
    const byNo = new Map<string, { clause_no: string; title: string; parent_clause: string | null; sort: number; per: { standard_id: string; short: string; clause_id: string; title: string; evidence: string; compliance: string | null; updated_by: string | null; updated_at: string | null }[] }>();
    const order = new Map(chosen.map((s, i) => [String(s.id), i]));
    const sorted = [...(clauses ?? [])].sort((a, b) => (order.get(String(a.standard_id)) ?? 9) - (order.get(String(b.standard_id)) ?? 9) || Number(a.sort_order) - Number(b.sort_order));
    for (const c of sorted) {
      const st = chosen.find((s) => String(s.id) === String(c.standard_id)); if (!st) continue;
      const n = (notes ?? []).find((x) => String(x.clause_id) === String(c.id));
      const row = byNo.get(String(c.clause_no)) ?? { clause_no: String(c.clause_no), title: String(c.title), parent_clause: c.parent_clause ? String(c.parent_clause) : null, sort: Number(c.sort_order) || 0, per: [] };
      row.per.push({ standard_id: String(c.standard_id), short: short(String(st.name)), clause_id: String(c.id), title: String(c.title), evidence: String(n?.evidence || ""), compliance: n?.compliance ? String(n.compliance) : null, updated_by: n?.updated_by ? String(n.updated_by) : null, updated_at: n?.updated_at ? String(n.updated_at) : null });
      byNo.set(String(c.clause_no), row);
    }
    const key = (no: string) => no.split(".").map((x) => (/^\d+$/.test(x) ? x.padStart(3, "0") : x)).join(".");
    const rows = [...byNo.values()].sort((a, b) => key(a.clause_no).localeCompare(key(b.clause_no))).map((r) => ({ ...r, group: (groups ?? []).find((g) => String(g.clause_no) === r.clause_no) || null, remarks: (remarks ?? []).filter((x) => String(x.clause_no) === r.clause_no && (!x.standard_id || ids.includes(String(x.standard_id)))) }));
    return NextResponse.json({ installed: true, standards: standards ?? [], chosen: chosen.map((s) => ({ ...s, short: short(String(s.name)) })), rows, mayWrite: isHead(me), mayRemark: mayRemark(me), me: me.email });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const b = await readBody(req, { action: "string", clause_no: "string?" });
    const db = imsDb();
    /* THE AUDITOR'S REMARK, PER AUDIT — written once, never edited; the writer or the MR may withdraw it */
    if (b.action === "remark_add") {
      if (!mayRemark(me)) throw new HttpError(403, "The auditor, the MR or a department head writes a remark.");
      const remark = String(b.remark || "").replace(/\u0000/g, "").trim(); const audit_label = String(b.audit_label || "").trim();
      if (!b.clause_no) throw new HttpError(400, "Which clause?"); if (!audit_label) throw new HttpError(400, "Name the audit — e.g. Internal audit, Oct 2026."); if (!remark) throw new HttpError(400, "Write the remark.");
      const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : "Observation";
      const { data, error } = await db.from("ims_clause_audit_remark").insert({ clause_no: b.clause_no, standard_id: b.standard_id || null, audit_label, kind, remark, added_by: me.email }).select("id").single();
      if (error) throw new Error(error.message);
      await log(me, "ims_clause_audit_remark", String(data?.id), "add", { clause: b.clause_no, audit: audit_label, kind });
      return ok({ id: data?.id });
    }
    if (b.action === "remark_remove") {
      const { data: r } = await db.from("ims_clause_audit_remark").select("id, added_by").eq("id", String(b.id || "")).maybeSingle();
      if (!r) throw new HttpError(404, "No such remark."); if (r.added_by !== me.email && !isHead(me) && !me.isOwner) throw new HttpError(403, "Your own remark, or the MR.");
      await db.from("ims_clause_audit_remark").delete().eq("id", r.id);
      return ok();
    }
    if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head writes the evidence.");
    if (b.action !== "group_save") throw new HttpError(400, "Unknown action."); if (!b.clause_no) throw new HttpError(400, "Which clause?");
    const standardIds = (Array.isArray(b.standard_ids) ? b.standard_ids : []).map(String);
    const raw = String(b.raw ?? "").replace(/\u0000/g, "").trim();
    const { error: gErr } = await db.from("ims_clause_group_note").upsert({ clause_no: b.clause_no, raw, standard_ids: standardIds, updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "clause_no" });
    if (gErr) throw new Error(gErr.message);
    if (b.rewrite === false || !raw) return ok({ rewritten: 0 });

    await assertAiOn();
    const { data: clauses } = await db.from("ims_standard_clause").select("id, standard_id, clause_no, title").eq("clause_no", b.clause_no).in("standard_id", standardIds);
    if (!clauses?.length) return ok({ rewritten: 0 });
    const { data: standards } = await db.from("ims_standard").select("id, name").in("id", standardIds);
    const { data: notes } = await db.from("ims_clause_evidence_note").select("clause_id, requirement, compliance").in("clause_id", clauses.map((c) => String(c.id)));
    const items = clauses.map((c) => {
      const st = (standards ?? []).find((s) => String(s.id) === String(c.standard_id)); const n = (notes ?? []).find((x) => String(x.clause_id) === String(c.id));
      return { id: String(c.id), standard: String(st?.name || ""), clause: `${c.clause_no} ${c.title}`, requirement: String(n?.requirement || ""), compliance: String(n?.compliance || "") };
    });
    /* ONE call for all the ticked standards: the man's words, rewritten for each
       standard's own clause, returned as JSON keyed by clause id */
    const r = await anthropicClient().messages.create({
      model: AI.FRONT, max_tokens: 4000,
      system: "You are the Management Representative's drafting hand at Nandan GSE Pvt. Ltd., an Indian maker of aircraft ground support equipment certified to ISO 9001, 14001, 45001, AS 9100D, ZED Gold and EN 1090-2. One piece of evidence has been written once for a clause number that several standards share. Rewrite it into the evidence statement an external auditor reads for EACH standard's own clause: keep every fact, document number, record and name exactly as given; add nothing that is not in the text; phrase it against that standard's wording of the clause (the environmental, occupational-health, information-security or aerospace angle where that is the standard); plain English, no marketing. Each statement: two to five sentences on how the requirement is met, then 'Evidence:' as a bulleted list of the documents and records named, then 'Gaps:' as bullets or 'Gaps: none stated'. Return ONLY a JSON object: { \"<clause id>\": \"<statement>\" } for every id given.",
      messages: [{ role: "user", content: `THE EVIDENCE AS WRITTEN (for clause ${b.clause_no}):\n${raw}\n\nTHE CLAUSES TO WRITE IT FOR:\n${items.map((i) => `- id ${i.id} · ${i.standard} · clause ${i.clause}${i.requirement ? ` · requirement as noted: ${i.requirement}` : ""}`).join("\n")}` }],
    });
    const text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let map: Record<string, string> = {};
    try { map = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { throw new HttpError(502, "Genie did not return a usable rewrite — the raw evidence is saved; try once more."); }
    let n = 0;
    for (const it of items) {
      const ev = String(map[it.id] || "").trim(); if (!ev) continue;
      const { error } = await db.from("ims_clause_evidence_note").upsert({ clause_id: it.id, evidence: ev, compliance: it.compliance || "WIP", requirement: it.requirement || "", updated_by: me.email, updated_at: new Date().toISOString(), ai_drafted_at: new Date().toISOString() }, { onConflict: "clause_id" });
      if (!error) n++;
    }
    await db.from("ims_clause_group_note").update({ rewritten_at: new Date().toISOString() }).eq("clause_no", b.clause_no);
    await log(me, "ims_clause_group_note", String(b.clause_no), "group_save", { standards: standardIds.length, rewritten: n });
    return ok({ rewritten: n, evidence: map });
  } catch (e) { return errJson(e); }
}
