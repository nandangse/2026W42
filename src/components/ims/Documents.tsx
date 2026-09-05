"use client";

import { useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, TableBox, Td, Text, Th,
  fmtD, post, statusColour, useLoad, BORDER, INK, MUTED, NAVY_SOFT,
} from "./ui";
import { DOC_TYPE, SYS, SYS_LABEL, isAdmin, isHead, openFile, uploadFile, type Boot, type Row } from "./types";

/**
 * Controlled documents.
 *
 * The number comes from the DATABASE, on save, and is never typed. The
 * revision history is never deleted. An approved revision is never edited —
 * it is superseded by a new one, which is the entire point of revision
 * control: an approval signature must never end up standing over text nobody
 * approved.
 *
 * WHAT A MEMBER SEES is decided by the server, not here. This screen simply
 * never receives a draft.
 *
 * BODY FORMAT — a divergence worth naming. The build instruction asked for
 * TipTap. The schema keeps `body jsonb` for exactly that, but this pass
 * stores HTML in `body_html` and edits it as text, because adding an editor
 * dependency and its schema to a first pass is how a first pass stops being
 * shippable. Legacy Rev 00 ports go in as PDFs, which is what "port, don't
 * redesign" means in practice.
 */
const BLANK = { sys: "QMS", doc_type: "PRO", title: "", department: "", owner_id: "" };

export default function Documents({ boot }: { boot: Boot }) {
  const [fSys, setFSys] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fDept, setFDept] = useState("");
  const [q, setQ] = useState("");
  const [list, busy, reload, err] = useLoad<{ installed: boolean; rows: Row[]; canEdit: boolean }>("/api/ims/document");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState("");

  const mayWrite = isHead(boot.role);
  const depts = Array.from(new Set((list?.rows ?? []).map((d) => String(d.department || "")).filter(Boolean))).sort();
  const needle = q.trim().toLowerCase();
  const rows = (list?.rows ?? []).filter(
    (d) =>
      (!fSys || d.sys === fSys) &&
      (!fType || d.doc_type === fType) &&
      (!fStatus || d.status === fStatus) &&
      (!fDept || d.department === fDept) &&
      (!needle || [d.title, d.doc_no, d.ref_no, d.owner_name, d.expectation, d.remarks].some((x) => String(x ?? "").toLowerCase().includes(needle))),
  );

  const create = async () => {
    if (!creating) return;
    const r = await post("/api/ims/document", { action: "create", row: creating });
    if (!r.ok) { setMsg(r.error || "Could not create."); return; }
    setCreating(null); reload(); setOpenId(String(r.id));
  };

  return (
    <Screen
      title="Controlled documents"
      blurb="Manuals, procedures, work instructions, formats, checklists and plans — one engine, one numbering series, one revision history. Only the approved current revision is visible to members."
      action={
        <>
          <div style={{ minWidth: 150 }}>
            <Select value={fSys} onChange={setFSys} blank="Every system" options={SYS.map((s) => ({ value: s, label: s }))} />
          </div>
          <div style={{ minWidth: 150 }}>
            <Select value={fType} onChange={setFType} blank="Every type"
              options={Object.entries(DOC_TYPE).map(([value, label]) => ({ value, label: label.split(" — ")[0] }))} />
          </div>
          <div style={{ minWidth: 150 }}>
            <Select value={fStatus} onChange={setFStatus} blank="Every status"
              options={["draft", "in_review", "approved", "obsolete"]} />
          </div>
          <div style={{ minWidth: 150 }}>
            <Select value={fDept} onChange={setFDept} blank="Every department" options={depts} />
          </div>
          <div style={{ minWidth: 180 }}><Text value={q} onChange={setQ} placeholder="Search title, number, owner" /></div>
          {mayWrite && <Btn kind="primary" onClick={() => { setCreating({ ...BLANK }); setMsg(""); }}>+ New</Btn>}
        </>
      }
    >
      {err && <Note kind="error">{err}</Note>}
      {list && !list.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      {busy ? <Empty>Reading…</Empty> : rows.length === 0 ? (
        <Empty>
          {(list?.rows ?? []).length === 0
            ? "No documents yet. Port the procedures you already have in as Rev 00 — the PDF upload is there for exactly that."
            : "Nothing matches those filters."}
        </Empty>
      ) : (
        <TableBox min={980}>
          <thead>
            <tr><Th>Doc no.</Th><Th>Title</Th><Th>Sys</Th><Th>Type</Th><Th>Department</Th><Th>Owner</Th><Th>Status</Th><Th>Where</Th><Th>Next review</Th></tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const owner = boot.people.find((p) => p.id === d.owner_id);
              return (
                <tr key={d.id} onClick={() => { setOpenId(d.id); setMsg(""); }} style={{ cursor: "pointer" }}>
                  <Td><span style={{ fontWeight: 700, color: INK }}>{String(d.ref_no || d.doc_no || "—")}</span></Td>
                  <Td wrap>{String(d.title ?? "")}</Td>
                  <Td>{String(d.sys ?? "")}</Td>
                  <Td>{String(d.doc_type ?? "")}</Td>
                  <Td>{String(d.department || "—")}</Td>
                  <Td>{owner?.full_name ?? String(d.owner_name || "—")}</Td>
                  <Td><Chip text={String(d.status).replace("_", " ")} colour={statusColour(String(d.status))} /></Td>
                  <Td>{d.external_url ? <a href={String(d.external_url)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: "#1B2D6B" }} onClick={(e) => e.stopPropagation()}>{String(d.doc_kind || "open")} ↗</a> : <span style={{ color: MUTED }}>{String(d.doc_kind || "—")}</span>}</Td>
                  <Td>{fmtD(d.next_review)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}

      {creating && (
        <Modal onClose={() => setCreating(null)} title="New controlled document">
          {msg && <Note kind="error">{msg}</Note>}
          <Note>The document number is issued by the database when you save — <b>NGSE-{creating.sys}-{creating.doc_type}-NNN</b>. It cannot be typed, so two people creating a procedure at the same moment cannot end up with the same number.</Note>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Title</Label>
              <Text value={creating.title} onChange={(v) => setCreating({ ...creating, title: v })} placeholder="Control of Documented Information" />
            </div>
            <div>
              <Label>System</Label>
              <Select value={creating.sys} onChange={(v) => setCreating({ ...creating, sys: v })} blank="QMS"
                options={SYS.map((s) => ({ value: s, label: SYS_LABEL[s] }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={creating.doc_type} onChange={(v) => setCreating({ ...creating, doc_type: v })} blank="Procedure"
                options={Object.entries(DOC_TYPE).map(([value, label]) => ({ value, label }))} />
            </div>
            <div><Label>Department</Label><Text value={creating.department} onChange={(v) => setCreating({ ...creating, department: v })} /></div>
            <div>
              <Label>Owner</Label>
              <Select value={creating.owner_id} onChange={(v) => setCreating({ ...creating, owner_id: v })}
                options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Btn kind="primary" onClick={create}>Create as Rev 00 draft</Btn>
            <Btn onClick={() => setCreating(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {openId && <DocumentDetail id={openId} boot={boot} onClose={() => { setOpenId(null); reload(); }} />}
    </Screen>
  );
}

// ---------------------------------------------------------------- the detail

function DocumentDetail({ id, boot, onClose }: { id: string; boot: Boot; onClose: () => void }) {
  const [d, busy, reload, err] = useLoad<{ installed: boolean; doc: Row; revisions: Row[]; clauses: Row[] }>(
    `/api/ims/document?id=${id}`,
  );
  const [msg, setMsg] = useState("");
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [busySave, setBusySave] = useState(false);

  const mayWrite = isHead(boot.role);
  const doc = d?.doc;
  const revs = d?.revisions ?? [];
  // The working revision is the newest one that is not yet issued.
  const working = revs.find((r) => r.status === "draft" || r.status === "in_review");
  const current = revs.find((r) => r.status === "approved");

  const act = async (body: Record<string, unknown>) => {
    setBusySave(true);
    const r = await post("/api/ims/document", { document_id: id, ...body });
    setBusySave(false);
    if (!r.ok) { setMsg(r.error || "Could not save."); return false; }
    setMsg(""); reload(); return true;
  };

  const attach = async (file: File, revisionId: string) => {
    const up = await uploadFile("ims-documents", file);
    if (up.error) { setMsg(up.error); return; }
    await act({ action: "save_revision", revision_id: revisionId, row: { file_path: up.path } });
  };

  /**
   * Print — the controlled copy. doc_no, revision and effective date go in the
   * FOOTER of every page, which is the thing an auditor checks first on a
   * printout found on the shop floor.
   */
  const print = () => {
    const rev = current ?? working;
    if (!doc || !rev) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { setMsg("The browser blocked the print window."); return; }
    const foot = `${doc.doc_no} · Rev ${String(rev.rev_no).padStart(2, "0")} · Effective ${fmtD(rev.effective_date)}`;
    const obsolete = String(doc.status) !== "approved";
    w.document.write(`<!doctype html><html><head><title>${String(doc.doc_no)}</title><style>
      @page { margin: 20mm 16mm 24mm; }
      body { font-family: Arial, Helvetica, sans-serif; color:#22283A; font-size:12pt; line-height:1.6; }
      h1 { font-size:16pt; margin:0 0 4pt; }
      .meta { color:#6B7280; font-size:10pt; margin-bottom:16pt; border-bottom:1px solid #E5E8F0; padding-bottom:8pt; }
      .foot { position:fixed; bottom:8mm; left:0; right:0; font-size:9pt; color:#6B7280;
              border-top:1px solid #E5E8F0; padding-top:4pt; }
      .stamp { color:#B3261E; border:2px solid #B3261E; padding:4pt 8pt; display:inline-block;
               font-weight:bold; letter-spacing:2px; margin-bottom:12pt; }
    </style></head><body>
      ${obsolete ? `<div class="stamp">${String(doc.status).toUpperCase().replace("_", " ")} — NOT A CONTROLLED COPY</div>` : ""}
      <h1>${String(doc.title)}</h1>
      <div class="meta">${String(doc.doc_no)} · Rev ${String(rev.rev_no).padStart(2, "0")} · ${String(doc.sys)}/${String(doc.doc_type)}${doc.department ? ` · ${String(doc.department)}` : ""}</div>
      <div>${String(rev.body_html || "<p><i>This revision has no text — see the attached file.</i></p>")}</div>
      <div class="foot">${foot} · Nandan GSE Pvt. Ltd.</div>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  if (busy || !doc)
    return <Modal onClose={onClose} title="Document"><Empty>{err || "Reading…"}</Empty></Modal>;

  return (
    <Modal onClose={onClose} title={`${String(doc.doc_no ?? "")} — ${String(doc.title ?? "")}`} width={860}>
      {msg && <Note kind="error">{msg}</Note>}
      {String(doc.status) === "obsolete" && (
        <Note kind="warn">This document is OBSOLETE. It is kept for the audit trail; it is not the instruction anybody should be following.</Note>
      )}

      <div className="flex gap-2 items-center flex-wrap mb-3">
        <Chip text={String(doc.status).replace("_", " ")} colour={statusColour(String(doc.status))} />
        <span className="text-xs" style={{ color: MUTED }}>
          {String(doc.sys)}/{String(doc.doc_type)}{doc.department ? ` · ${String(doc.department)}` : ""}{doc.ref_no && doc.ref_no !== doc.doc_no ? ` · Genie no. ${String(doc.doc_no)}` : ""}
        </span>
        {doc.external_url ? <a href={String(doc.external_url)} target="_blank" rel="noreferrer" className="text-xs font-bold hover:underline" style={{ color: "#1B2D6B" }}>Open the {String(doc.doc_kind || "document")} ↗</a> : null}
        <Btn onClick={print}>Print / PDF</Btn>
        {mayWrite && !working && <Btn onClick={() => act({ action: "new_revision", change_summary: summary })}>Open new revision</Btn>}
        {mayWrite && isAdmin(boot.role) && String(doc.status) === "approved" && (
          <Btn kind="danger" onClick={() => act({ action: "obsolete" })}>Make obsolete</Btn>
        )}
      </div>

      {(doc.expectation || doc.approved_by_name || doc.reviewed_by_name || doc.next_review || doc.remarks || doc.owner_name) ? (
        <div className="rounded border p-3 mb-3 text-xs" style={{ borderColor: BORDER, color: INK, lineHeight: 1.7 }}>
          {doc.source_type ? <div><span style={{ color: MUTED }}>On the register as: </span>{String(doc.source_type)}{doc.issue_no ? ` · issue ${String(doc.issue_no)}` : ""}</div> : null}
          {doc.owner_name ? <div><span style={{ color: MUTED }}>Owner: </span>{String(doc.owner_name)}</div> : null}
          {doc.expectation ? <div><span style={{ color: MUTED }}>Expectation: </span>{String(doc.expectation)}</div> : null}
          {doc.approved_by_name ? <div><span style={{ color: MUTED }}>Approved by: </span>{String(doc.approved_by_name)}{doc.approved_on ? ` on ${fmtD(doc.approved_on)}` : ""}</div> : null}
          {doc.reviewed_by_name ? <div><span style={{ color: MUTED }}>Reviewed by: </span>{String(doc.reviewed_by_name)}{doc.reviewed_on ? ` on ${fmtD(doc.reviewed_on)}` : ""}</div> : null}
          {doc.next_review ? <div><span style={{ color: MUTED }}>Next review: </span>{fmtD(doc.next_review)}</div> : null}
          {doc.remarks ? <div><span style={{ color: MUTED }}>Remarks: </span>{String(doc.remarks)}</div> : null}
        </div>
      ) : null}

      {/* ---------------------------------------------- the working revision */}
      {working && mayWrite && (
        <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER, background: NAVY_SOFT }}>
          <div className="text-sm font-bold mb-2" style={{ color: INK }}>
            Rev {String(working.rev_no).padStart(2, "0")} — {String(working.status).replace("_", " ")}
          </div>
          <Label>Change summary</Label>
          <Text value={summary || String(working.change_summary ?? "")} onChange={setSummary} placeholder="What changed, and why" />
          <div className="mt-2">
            <Label>Body (HTML or plain text)</Label>
            <Area rows={8} value={draftBody ?? String(working.body_html ?? "")} onChange={setDraftBody}
              placeholder="<h2>1. Purpose</h2><p>…</p>" />
          </div>
          <div className="mt-2">
            <Label>Or attach the legacy PDF (Rev 00 ports)</Label>
            {working.file_path ? (
              <div className="flex gap-2 items-center flex-wrap">
                <Chip text="File attached" colour="#1A7F4E" />
                <Btn onClick={async () => {
                  try { window.open(await openFile("ims-documents", String(working.file_path)), "_blank", "noopener"); }
                  catch (e) { setMsg(e instanceof Error ? e.message : "Could not open."); }
                }}>Open</Btn>
              </div>
            ) : (
              <input type="file" className="text-sm"
                onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], String(working.id))} />
            )}
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Btn disabled={busySave} onClick={() =>
              act({ action: "save_revision", revision_id: working.id,
                    row: { body_html: draftBody ?? String(working.body_html ?? ""), change_summary: summary || String(working.change_summary ?? "") } })
            }>Save draft</Btn>

            {String(working.status) === "draft" && (
              <Btn kind="primary" disabled={busySave}
                onClick={() => act({ action: "submit", revision_id: working.id })}>Submit for review</Btn>
            )}

            {String(working.status) === "in_review" && boot.approvalMode === "two_step" && !working.reviewed_by && (
              <Btn disabled={busySave} onClick={() => act({ action: "review", revision_id: working.id })}
                title="The department head's review — required before the MR may approve">
                Review (dept head)
              </Btn>
            )}

            {String(working.status) === "in_review" && isAdmin(boot.role) && (
              <Btn kind="primary" disabled={busySave}
                title={boot.approvalMode === "two_step" && !working.reviewed_by
                  ? "Two-step approval is on — the department head must review this first"
                  : "Approve and issue this revision"}
                onClick={() => act({ action: "approve", revision_id: working.id })}>
                Approve &amp; issue
              </Btn>
            )}
          </div>
          <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
            Approval is set to <b>{boot.approvalMode === "two_step" ? "two-step" : "single"}</b>
            {boot.approvalMode === "two_step"
              ? " — the department head reviews, then the MR approves."
              : " — the MR approves alone."}
          </div>
        </div>
      )}

      {/* ------------------------------------------------ revision history */}
      <div className="text-sm font-bold mb-2" style={{ color: INK }}>Revision history</div>
      {revs.length === 0 ? <Empty>No revisions.</Empty> : (
        <TableBox min={560}>
          <thead><tr><Th>Rev</Th><Th>Status</Th><Th>Prepared</Th><Th>Reviewed</Th><Th>Approved</Th><Th>Effective</Th><Th>Change</Th></tr></thead>
          <tbody>
            {revs.map((r) => {
              const who = (v: unknown) => boot.people.find((p) => p.id === v)?.initials ?? (v ? "✓" : "—");
              return (
                <tr key={r.id}>
                  <Td><b>{String(r.rev_no).padStart(2, "0")}</b></Td>
                  <Td><Chip text={String(r.status).replace("_", " ")} colour={statusColour(String(r.status))} /></Td>
                  <Td>{who(r.prepared_by)}</Td>
                  <Td>{who(r.reviewed_by)}</Td>
                  <Td>{who(r.approved_by)}</Td>
                  <Td>{fmtD(r.effective_date)}</Td>
                  <Td wrap>{String(r.change_summary || "—")}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
    </Modal>
  );
}
