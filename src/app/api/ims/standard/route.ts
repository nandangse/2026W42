import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { errJson, HttpError } from "@/lib/auth";
import { assertAiOn } from "@/lib/ai-gate";
import { isHead, requireIms, requireImsAdmin } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * The Standards Library, the clause browser, and the evidence behind every
 * clause (Dr Raghu, 5 Sep 2026): "In this standards ... editable document ...
 * 'Make it better' ... column: Fully compliant / WIP / Pending / Risk ... plus
 * sign for a task ... light box."
 *
 * The CLAUSE TREE is open to everybody admitted. The purchased COPY is not.
 * The EVIDENCE NOTE is written by the MR and the heads, read by all.
 */
const COMPLIANCE = ["Fully compliant", "WIP", "Pending", "Risk"] as const;

type Link = { title: string; url: string };

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const standardId = url.searchParams.get("id");
    const db = imsDb();

    const { data: standards, error } = await db
      .from("ims_standard").select("*").order("sort_order");
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }

    let clauses: Record<string, unknown>[] = [];
    let notes: Record<string, unknown>[] = [];
    const openTasks: Record<string, number> = {};
    const docs: Record<string, number> = {};
    if (standardId) {
      const { data } = await db
        .from("ims_standard_clause")
        .select("id, clause_no, title, parent_clause, sort_order")
        .eq("standard_id", standardId)
        .order("sort_order");
      clauses = data ?? [];
      const ids = clauses.map((c) => String(c.id));
      if (ids.length) {
        const [n, t, m] = await Promise.all([
          db.from("ims_clause_evidence_note").select("*").in("clause_id", ids),
          db.from("core_task").select("source_id").eq("source_type", "clause").in("source_id", ids).in("status", ["open", "in_progress"]),
          db.from("ims_document_clause_map").select("clause_id").in("clause_id", ids),
        ]);
        notes = n.data ?? [];
        for (const r of t.data ?? []) openTasks[String(r.source_id)] = (openTasks[String(r.source_id)] ?? 0) + 1;
        for (const r of m.data ?? []) docs[String(r.clause_id)] = (docs[String(r.clause_id)] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      installed: true,
      rows: standards ?? [],
      clauses,
      notes,
      openTasks,
      docs,
      mayDownloadCopy: isHead(me),
      mayWrite: isHead(me),
      people: me.profileId,
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action, ... }
 *   set_copy   — the MR files a purchased copy
 *   note_save  — the evidence document for one clause (MR and heads)
 *   task_add   — the "+" beside a clause: a task in core_task, tied to the clause
 *   improve    — "Make it better": Claude drafts the evidence from what Genie holds
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const db = imsDb();

    if (action === "set_copy") {
      await requireImsAdmin();
      need(body.id, "id required");
      const { error } = await db.from("ims_standard").update({ standard_copy_path: body.path || null }).eq("id", body.id);
      if (error) throw new Error(error.message);
      await log(me, "ims_standard", String(body.id), "set_copy", { path: body.path });
      return ok();
    }

    const clauseId = String(body.clause_id || "");
    need(clauseId, "clause_id required");
    const { data: clause } = await db
      .from("ims_standard_clause").select("id, clause_no, title, standard_id").eq("id", clauseId).maybeSingle();
    if (!clause) throw new HttpError(404, "No such clause.");

    if (action === "note_save") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may write the evidence.");
      const compliance = String(body.compliance || "Pending");
      if (!(COMPLIANCE as readonly string[]).includes(compliance)) throw new HttpError(400, "Compliance must be Fully compliant, WIP, Pending or Risk.");
      const links: Link[] = (Array.isArray(body.links) ? body.links : [])
        .map((l: Record<string, unknown>) => ({ title: String(l.title ?? "").trim(), url: String(l.url ?? "").trim() }))
        .filter((l: Link) => l.url);
      const row = {
        clause_id: clauseId,
        requirement: String(body.requirement ?? ""),
        evidence: String(body.evidence ?? ""),
        compliance,
        links,
        updated_by: me.email,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("ims_clause_evidence_note").upsert(row, { onConflict: "clause_id" });
      if (error) throw new Error(error.message);
      await log(me, "ims_clause_evidence_note", clauseId, "save", { clause: clause.clause_no, compliance });
      return ok();
    }

    if (action === "task_add") {
      const title = String(body.title || "").trim();
      need(title, "A task needs a title.");
      const { data, error } = await db
        .from("core_task")
        .insert({
          module: "IMS",
          title,
          description: String(body.description || ""),
          source_type: "clause",
          source_id: clauseId,
          source_key: `clause:${clause.clause_no}`,
          owner_id: body.owner_id || me.profileId,
          due_date: body.due_date || null,
          priority: ["low", "normal", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal",
          created_by: me.email,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await log(me, "core_task", data?.id ?? null, "add", { clause: clause.clause_no, title });
      return ok({ id: data?.id });
    }

    if (action === "improve") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may ask for a draft.");
      await assertAiOn();
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set.");

      // What Genie holds that bears on this clause: the note as it stands,
      // the documents mapped to the clause, the documents whose titles share
      // its words, the registers, the certificates. The model may cite only
      // these — it is told so, and told to name gaps rather than fill them.
      const [{ data: std }, { data: note }, { data: mapped }] = await Promise.all([
        db.from("ims_standard").select("name").eq("id", clause.standard_id).maybeSingle(),
        db.from("ims_clause_evidence_note").select("*").eq("clause_id", clauseId).maybeSingle(),
        db.from("ims_document_clause_map").select("ims_document(ref_no, doc_no, title, doc_type, department, status, external_url)").eq("clause_id", clauseId),
      ]);
      const words = String(clause.title).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["general", "control", "requirements", "products", "services", "management"].includes(w));
      const orq = words.slice(0, 6).map((w) => `title.ilike.%${w}%`).join(",");
      const { data: similar } = orq
        ? await db.from("ims_document").select("ref_no, doc_no, title, doc_type, department, status, external_url").or(orq).limit(25)
        : { data: [] };
      const [{ data: regs }, { data: certs }] = await Promise.all([
        db.from("ims_register_definition").select("name, description"),
        db.from("ims_certificate").select("title, certificate_no, issuing_body, expiry_date"),
      ]);
      const docLine = (x: Record<string, unknown>) => `- ${x.ref_no || x.doc_no}: ${x.title} (${x.doc_type}, ${x.department || "-"}, ${x.status})${x.external_url ? ` <${x.external_url}>` : ""}`;
      const mappedDocs = (mapped ?? []).map((m) => m.ims_document as unknown as Record<string, unknown>).filter(Boolean);
      const cur = (note ?? {}) as Record<string, unknown>;
      const context = [
        `STANDARD: ${std?.name ?? ""}`,
        `CLAUSE: ${clause.clause_no} ${clause.title}`,
        `REQUIREMENT (as noted by the MR): ${String(cur.requirement || "-")}`,
        `EVIDENCE AS WRITTEN TODAY: ${String(cur.evidence || "-")}`,
        `COMPLIANCE AS MARKED TODAY: ${String(cur.compliance || "Pending")}`,
        `LINKS ON THE NOTE: ${JSON.stringify(cur.links ?? [])}`,
        `DOCUMENTS MAPPED TO THIS CLAUSE:\n${mappedDocs.map(docLine).join("\n") || "- none"}`,
        `DOCUMENTS WHOSE TITLES SHARE THE CLAUSE'S WORDS:\n${(similar ?? []).map((x) => docLine(x as Record<string, unknown>)).join("\n") || "- none"}`,
        `REGISTERS IN GENIE:\n${(regs ?? []).map((r) => `- ${r.name}: ${r.description}`).join("\n")}`,
        `CERTIFICATES HELD:\n${(certs ?? []).map((c) => `- ${c.title} ${c.certificate_no} (${c.issuing_body}, till ${c.expiry_date ?? "-"})`).join("\n")}`,
      ].join("\n\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: AI.FRONT,
          max_tokens: 1500,
          system: "You are the Management Representative's drafting hand at Nandan GSE Pvt. Ltd., an Indian maker of aircraft ground support equipment certified to ISO 9001, 14001, 45001, AS 9100D, ZED Gold and EN 1090-2. You write the evidence statement an external auditor reads for one clause. Plain English, second person absent, no marketing. Cite ONLY documents, registers and certificates listed in the material given; give their numbers and links exactly. Never invent a document. Where the material does not show the clause is met, say so under 'Gaps'.",
          messages: [{
            role: "user",
            content: `Rewrite the evidence statement for this clause so it is complete, specific and auditable. Structure: a two-to-four sentence statement of how the requirement is met; then 'Evidence:' as a bulleted list of the documents and records (number - title - link); then 'Gaps:' as bullets, or 'Gaps: none found in the material' if so; then one final line 'Suggested compliance: <Fully compliant|WIP|Pending|Risk>' with a reason in six words or fewer.\n\n${context}`,
          }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new HttpError(502, j?.error?.message || `Anthropic returned ${res.status}`);
      const draft = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
      await db.from("ims_clause_evidence_note").upsert(
        { clause_id: clauseId, ai_draft: draft, ai_drafted_at: new Date().toISOString(), updated_by: me.email },
        { onConflict: "clause_id" },
      );
      await log(me, "ims_clause_evidence_note", clauseId, "improve", { clause: clause.clause_no });
      return ok({ draft });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
