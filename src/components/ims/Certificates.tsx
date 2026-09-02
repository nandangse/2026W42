"use client";

import { useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, TableBox, Td, Text, Th,
  expiryColour, expiryWords, fmtD, post, useLoad, MUTED, INK,
} from "./ui";
import { CERT_KIND, isAdmin, isHead, openFile, uploadFile, type Boot, type Row } from "./types";

/**
 * Certificates & Statutory — ONE screen for both, filtered by kind.
 *
 * A Factory Licence and an ISO certificate are the same shape: a document, a
 * body, an expiry and somebody whose job it is to renew it. Giving the
 * licence a screen of its own is how it expires in a register nobody opened
 * while the ISO certificate three feet away was watched daily.
 *
 * The colour is the point: red under thirty days, amber under ninety, and red
 * again once it has gone past. The daily scan raises the task; the colour is
 * what makes somebody look before the scan has to.
 */
const BLANK = {
  kind: "certification", title: "", certificate_no: "", scheme: "", issuing_body: "",
  issue_date: "", expiry_date: "", renewal_owner_id: "", file_path: "", remarks: "",
};

export default function Certificates({ boot }: { boot: Boot }) {
  const [kind, setKind] = useState("");
  const [data, busy, reload, err] = useLoad<{ installed: boolean; rows: Row[] }>(
    `/api/ims/certificate${kind ? `?kind=${kind}` : ""}`,
  );
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  const mayWrite = isHead(boot.role);
  const rows = data?.rows ?? [];

  const open = (r?: Row) => {
    setMsg("");
    if (!r) { setEdit({ ...BLANK }); setEditId(null); return; }
    setEditId(r.id);
    setEdit(Object.fromEntries(Object.keys(BLANK).map((k) => [k, String(r[k] ?? "")])) as Record<string, string>);
  };

  const save = async () => {
    if (!edit) return;
    const r = await post("/api/ims/certificate", {
      action: editId ? "update" : "add", id: editId, row: edit,
    });
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setEdit(null); reload();
  };

  const remove = async () => {
    if (!editId) return;
    const r = await post("/api/ims/certificate", { action: "delete", id: editId });
    if (!r.ok) { setMsg(r.error || "Could not delete."); return; }
    setEdit(null); reload();
  };

  const attach = async (file: File) => {
    setUploading(true); setMsg("");
    const r = await uploadFile("ims-certificates", file);
    setUploading(false);
    if (r.error) { setMsg(r.error); return; }
    setEdit((e) => (e ? { ...e, file_path: r.path! } : e));
  };

  const view = async (path: string) => {
    try { window.open(await openFile("ims-certificates", path), "_blank", "noopener"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not open the file."); }
  };

  return (
    <Screen
      title="Certificates & Statutory"
      blurb="Every certificate and every licence in one register — ISO certificates, the Factory Licence, the MPCB consent, the Fire NOC, welder cards, calibration and statutory equipment tests. The daily scan raises a renewal task at 90, 60, 30 and 7 days."
      action={
        <>
          <div style={{ minWidth: 190 }}>
            <Select value={kind} onChange={setKind} blank="Every kind"
              options={Object.entries(CERT_KIND).map(([value, label]) => ({ value, label }))} />
          </div>
          {mayWrite && <Btn kind="primary" onClick={() => open()}>+ Add</Btn>}
        </>
      }
    >
      {err && <Note kind="error">{err}</Note>}
      {data && !data.installed && <Note kind="warn">Run the IMS migrations first — the certificate table does not exist yet.</Note>}

      {busy ? <Empty>Reading…</Empty>
        : rows.length === 0 ? (
          <Empty>
            Nothing here yet. Start with what is already on the wall: the ISO certificates, the Factory Licence,
            the MPCB Consent to Operate and the Fire NOC.
          </Empty>
        ) : (
          <TableBox min={860}>
            <thead>
              <tr>
                <Th>Title</Th><Th>Kind</Th><Th>No.</Th><Th>Body</Th>
                <Th>Issued</Th><Th>Expiry</Th><Th>Owner</Th><Th>File</Th>{mayWrite && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const owner = boot.people.find((p) => p.id === c.renewal_owner_id);
                return (
                  <tr key={c.id}>
                    <Td wrap>{String(c.title ?? "")}</Td>
                    <Td>{CERT_KIND[String(c.kind)] ?? String(c.kind)}</Td>
                    <Td>{String(c.certificate_no || "—")}</Td>
                    <Td>{String(c.issuing_body || "—")}</Td>
                    <Td>{fmtD(c.issue_date)}</Td>
                    <Td>
                      <span style={{ color: expiryColour(c.expiry_date), fontWeight: 700 }}>{fmtD(c.expiry_date)}</span>
                      <div style={{ fontSize: 10, color: MUTED }}>{expiryWords(c.expiry_date)}</div>
                    </Td>
                    <Td>{owner ? owner.full_name : <span style={{ color: "#B3261E", fontWeight: 700 }}>Nobody</span>}</Td>
                    <Td>
                      {c.file_path
                        ? <button onClick={() => view(String(c.file_path))} className="font-bold underline" style={{ color: INK }}>Open</button>
                        : "—"}
                    </Td>
                    {mayWrite && <Td><button onClick={() => open(c)} className="font-bold" style={{ color: INK }}>Edit</button></Td>}
                  </tr>
                );
              })}
            </tbody>
          </TableBox>
        )}

      {edit && (
        <Modal onClose={() => setEdit(null)} title={editId ? "Edit certificate" : "Add certificate"}>
          {msg && <Note kind="error">{msg}</Note>}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Title</Label>
              <Text value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} placeholder="ISO 9001:2015 certificate" />
            </div>
            <div>
              <Label>Kind</Label>
              <Select value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v })} blank="Certification"
                options={Object.entries(CERT_KIND).map(([value, label]) => ({ value, label }))} />
            </div>
            <div><Label>Certificate no.</Label><Text value={edit.certificate_no} onChange={(v) => setEdit({ ...edit, certificate_no: v })} /></div>
            <div><Label>Scheme</Label><Text value={edit.scheme} onChange={(v) => setEdit({ ...edit, scheme: v })} placeholder="ISO 9001 / Factory Licence" /></div>
            <div><Label>Issuing body</Label><Text value={edit.issuing_body} onChange={(v) => setEdit({ ...edit, issuing_body: v })} /></div>
            <div><Label>Issue date</Label><Text type="date" value={edit.issue_date} onChange={(v) => setEdit({ ...edit, issue_date: v })} /></div>
            <div><Label>Expiry date</Label><Text type="date" value={edit.expiry_date} onChange={(v) => setEdit({ ...edit, expiry_date: v })} /></div>
            <div>
              <Label>Renewal owner</Label>
              <Select value={edit.renewal_owner_id} onChange={(v) => setEdit({ ...edit, renewal_owner_id: v })}
                blank="Nobody — the alert goes to the MR"
                options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Certificate file</Label>
              {edit.file_path
                ? <div className="flex gap-2 items-center flex-wrap">
                    <Chip text="Attached" colour="#1A7F4E" />
                    <Btn onClick={() => view(edit.file_path)}>Open</Btn>
                    <Btn onClick={() => setEdit({ ...edit, file_path: "" })}>Remove</Btn>
                  </div>
                : <input type="file" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
                    className="text-sm" style={{ color: INK }} />}
              {uploading && <div className="text-xs mt-1" style={{ color: MUTED }}>Uploading…</div>}
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Label>Remarks</Label>
              <Area value={edit.remarks} onChange={(v) => setEdit({ ...edit, remarks: v })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Btn kind="primary" onClick={save}>{editId ? "Save" : "Add"}</Btn>
            <Btn onClick={() => setEdit(null)}>Cancel</Btn>
            {editId && isAdmin(boot.role) && <Btn kind="danger" onClick={remove}>Delete</Btn>}
          </div>
        </Modal>
      )}
    </Screen>
  );
}
