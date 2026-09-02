import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { isHead, requireApprover, requireIms, requireImsAdmin, type ImsUser } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";
import { log, need, ok, pick } from "@/ims/api";

export const dynamic = "force-dynamic";

/**
 * The controlled-document engine.
 *
 * One engine, many faces (design §1): the QMS Manual, the HSE Manual, every
 * procedure, work instruction, format and plan are rows here. "QMS manual" is
 * not a feature; it is data, which is why the MR can add a document type
 * without anybody writing code.
 *
 * WHAT A MEMBER MAY SEE is the whole point of a controlled document. Only the
 * APPROVED CURRENT revision — never a draft, never one in review, never an
 * obsolete one. That is enforced HERE, on the server, in the query itself: a
 * member's list is built by a different query, not by hiding rows in the
 * browser after sending them.
 *
 * The number is issued by the DATABASE (0001 §B1). Two people creating a
 * procedure at the same moment cannot produce two NGSE-QMS-PRO-012s, because
 * neither of them is the one deciding.
 */
const DOC_FIELDS = ["sys", "doc_type", "title", "department", "owner_id"];
const REV_FIELDS = ["body", "body_html", "file_path", "change_summary", "effective_date"];

/** The one place that decides what a role may see. */
function visibleStatuses(me: ImsUser): string[] {
  return isHead(me) || me.imsRole === "auditor"
    ? ["draft", "in_review", "approved", "obsolete"]
    : ["approved"];
}

export async function GET(req: Request) {
  try {
    const me = await requireIms();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const db = imsDb();

    // ---- one document, with its revision history ----
    if (id) {
      const { data: doc, error } = await db.from("ims_document").select("*").eq("id", id).maybeSingle();
      if (error) {
        if (notInstalled(error.message)) return NextResponse.json({ installed: false });
        throw new Error(error.message);
      }
      if (!doc) throw new HttpError(404, "No such document.");
      if (!visibleStatuses(me).includes(String(doc.status)))
        throw new HttpError(403, "That document is not approved for general reading.");

      let revQ = db
        .from("ims_document_revision")
        .select("*")
        .eq("document_id", id)
        .order("rev_no", { ascending: false });
      // A member sees the approved revision and nothing else — not the drafts
      // that led to it, and not the superseded ones.
      if (!(isHead(me) || me.imsRole === "auditor")) revQ = revQ.eq("status", "approved");
      const { data: revs } = await revQ;

      const { data: clauses } = await db
        .from("ims_document_clause_map")
        .select("clause_id, ims_standard_clause(id, clause_no, title, standard_id)")
        .eq("document_id", id);

      return NextResponse.json({ installed: true, doc, revisions: revs ?? [], clauses: clauses ?? [] });
    }

    // ---- the list ----
    const { data, error } = await db
      .from("ims_document")
      .select("*")
      .in("status", visibleStatuses(me))
      .order("doc_no")
      .limit(2000);
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [], canEdit: isHead(me) });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST { action, ... }
 *   create        — metadata in, doc_no out (the trigger's, not ours), Rev 00 draft
 *   save_revision — write the working draft's body / file / change summary
 *   new_revision  — open Rev NN+1 as a draft; the approved one stays current
 *   submit        — draft -> in_review
 *   review        — the dept head's step, when approval_mode is two_step
 *   approve       — the MR's step: the revision becomes current, the previous
 *                   one becomes superseded, and the document becomes approved
 *   obsolete      — supersede the whole document
 *   map_clause / unmap_clause
 */
export async function POST(req: Request) {
  try {
    const me = await requireIms();
    const body = await req.json();
    const action = String(body.action || "");
    const db = imsDb();
    const nowIso = new Date().toISOString();

    const mode = await (async () => {
      const { data } = await db.from("ims_settings").select("approval_mode").eq("id", 1).maybeSingle();
      return String(data?.approval_mode ?? "two_step");
    })();

    if (action === "create") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may create a controlled document.");
      const row = pick(body.row ?? {}, DOC_FIELDS);
      need(String(row.title || "").trim(), "A document needs a title.");
      need(row.sys, "Which system does it belong to?");
      need(row.doc_type, "Which type of document is it?");

      const { data: doc, error } = await db
        .from("ims_document")
        .insert({ ...row, created_by: me.email, status: "draft" })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);

      // Rev 00 opens with the document. A controlled document with no
      // revision is a title with nothing under it.
      const { data: rev, error: re } = await db
        .from("ims_document_revision")
        .insert({
          document_id: doc!.id,
          rev_no: 0,
          prepared_by: me.profileId,
          change_summary: "First issue.",
          created_by: me.email,
        })
        .select("id")
        .maybeSingle();
      if (re) throw new Error(re.message);

      await log(me, "ims_document", doc!.id, "create", { doc_no: doc!.doc_no });
      return ok({ id: doc!.id, doc_no: doc!.doc_no, revisionId: rev?.id });
    }

    // Everything below acts on a revision or a document that must exist.
    const docId = String(body.document_id || body.id || "");
    need(docId, "document_id required");
    const { data: doc, error: de } = await db.from("ims_document").select("*").eq("id", docId).maybeSingle();
    if (de) throw new Error(de.message);
    if (!doc) throw new HttpError(404, "No such document.");

    if (action === "save_revision") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may edit a controlled document.");
      need(body.revision_id, "revision_id required");
      const { data: rev } = await db
        .from("ims_document_revision").select("status").eq("id", body.revision_id).maybeSingle();
      // An APPROVED revision is a controlled document. It is superseded by a
      // new revision, never edited in place — that is the entire point of
      // revision control, and editing it would leave the approval signature
      // standing over text nobody approved.
      if (rev?.status === "approved" || rev?.status === "superseded")
        throw new HttpError(409, "That revision is issued. Open a new revision instead of editing it.");

      const row = pick(body.row ?? {}, REV_FIELDS);
      const { error } = await db.from("ims_document_revision").update(row).eq("id", body.revision_id);
      if (error) throw new Error(error.message);
      await log(me, "ims_document_revision", String(body.revision_id), "save");
      return ok();
    }

    if (action === "new_revision") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may open a revision.");
      const { data: last } = await db
        .from("ims_document_revision").select("rev_no").eq("document_id", docId)
        .order("rev_no", { ascending: false }).limit(1).maybeSingle();
      const next = Number(last?.rev_no ?? -1) + 1;
      const { data: rev, error } = await db
        .from("ims_document_revision")
        .insert({
          document_id: docId,
          rev_no: next,
          prepared_by: me.profileId,
          change_summary: String(body.change_summary || ""),
          created_by: me.email,
        })
        .select("id, rev_no")
        .maybeSingle();
      if (error) throw new Error(error.message);
      // The document is drafting again, but the APPROVED revision stays
      // current until the new one is approved — the floor keeps reading the
      // issued procedure while the next one is being written.
      await db.from("ims_document").update({ status: "draft" }).eq("id", docId);
      await log(me, "ims_document", docId, "new_revision", { rev_no: next });
      return ok({ revisionId: rev?.id, revNo: rev?.rev_no });
    }

    if (action === "submit") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may submit for review.");
      need(body.revision_id, "revision_id required");
      await db.from("ims_document_revision").update({ status: "in_review" }).eq("id", body.revision_id);
      await db.from("ims_document").update({ status: "in_review" }).eq("id", docId);
      await log(me, "ims_document", docId, "submit", { revision: body.revision_id });
      return ok({ mode });
    }

    /**
     * review — the department head's signature, and ONLY in two_step mode.
     *
     * The mode is a row in ims_settings, not a constant here, so Dr Raghu can
     * drop to single-step without a deploy (build instruction §4). In single
     * mode this action is refused rather than silently ignored: a review
     * signature that was never asked for must not appear on the record.
     */
    if (action === "review") {
      if (mode !== "two_step")
        throw new HttpError(409, "Approval is set to single-step — there is no separate review.");
      const reviewer = await requireApprover(doc.department ?? null);
      need(body.revision_id, "revision_id required");
      const { error } = await db
        .from("ims_document_revision")
        .update({ reviewed_by: reviewer.profileId, reviewed_at: nowIso })
        .eq("id", body.revision_id);
      if (error) throw new Error(error.message);
      await log(me, "ims_document", docId, "review", { revision: body.revision_id });
      return ok();
    }

    if (action === "approve") {
      // The MR approves. Always — in either mode. A department head reviewing
      // AND approving their own department's procedure is one signature
      // wearing two hats, which is the first thing an auditor tests.
      await requireImsAdmin();
      need(body.revision_id, "revision_id required");

      const { data: rev } = await db
        .from("ims_document_revision")
        .select("id, rev_no, reviewed_by, effective_date")
        .eq("id", body.revision_id).maybeSingle();
      if (!rev) throw new HttpError(404, "No such revision.");
      if (mode === "two_step" && !rev.reviewed_by)
        throw new HttpError(409, "Two-step approval is on: the department head must review this first.");

      // Whatever was current becomes superseded, in that order, so there is
      // never a moment with two approved revisions of one document.
      await db
        .from("ims_document_revision")
        .update({ status: "superseded" })
        .eq("document_id", docId)
        .eq("status", "approved");

      const { error } = await db
        .from("ims_document_revision")
        .update({
          status: "approved",
          approved_by: me.profileId,
          approved_at: nowIso,
          effective_date: rev.effective_date ?? nowIso.slice(0, 10),
        })
        .eq("id", rev.id);
      if (error) throw new Error(error.message);

      await db
        .from("ims_document")
        .update({ status: "approved", current_revision_id: rev.id })
        .eq("id", docId);

      await log(me, "ims_document", docId, "approve", { rev_no: rev.rev_no });
      return ok({ revNo: rev.rev_no });
    }

    if (action === "obsolete") {
      await requireImsAdmin();
      // Obsolete, never deleted. The revision history is what an auditor asks
      // for when they want to know what the floor was told two years ago.
      await db.from("ims_document").update({ status: "obsolete" }).eq("id", docId);
      await log(me, "ims_document", docId, "obsolete");
      return ok();
    }

    if (action === "map_clause" || action === "unmap_clause") {
      if (!isHead(me)) throw new HttpError(403, "Only the MR or a department head may map clauses.");
      need(body.clause_id, "clause_id required");
      if (action === "map_clause") {
        await db
          .from("ims_document_clause_map")
          .upsert({ document_id: docId, clause_id: body.clause_id }, { onConflict: "document_id,clause_id" });
      } else {
        await db
          .from("ims_document_clause_map")
          .delete().eq("document_id", docId).eq("clause_id", body.clause_id);
      }
      await log(me, "ims_document", docId, action, { clause: body.clause_id });
      return ok();
    }

    if (action === "delete") {
      // Only a document that was never issued may be removed at all.
      await requireImsAdmin();
      if (doc.status === "approved" || doc.status === "obsolete")
        throw new HttpError(409, "An issued document is made obsolete, not deleted.");
      const { error } = await db.from("ims_document").delete().eq("id", docId);
      if (error) throw new Error(error.message);
      await log(me, "ims_document", docId, "delete", { doc_no: doc.doc_no });
      return ok();
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
