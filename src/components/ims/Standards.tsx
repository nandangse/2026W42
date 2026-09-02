"use client";

import { useState } from "react";
import { Btn, Chip, Empty, Note, Screen, useLoad, post, BORDER, INK, MUTED, NAVY_SOFT } from "./ui";
import { isHead, openFile, uploadFile, type Boot, type StandardRow } from "./types";

interface Clause { id: string; clause_no: string; title: string; parent_clause: string | null }

/**
 * The Standards Library and the clause browser.
 *
 * TWO DIFFERENT THINGS, gated differently on purpose.
 *
 * The clause TREE is open to everybody admitted: clause numbers and titles are
 * not the standard, and the whole system hangs off people being able to find
 * 8.5.1 and say what answers it.
 *
 * The purchased COPY is not. It is a copyrighted document, so the bucket is
 * private, the link is signed and expires, and only the MR and department
 * heads can get one. The button is absent for everyone else — and the server
 * refuses regardless, because a hidden button is not a gate.
 */
export default function Standards({ boot }: { boot: Boot }) {
  const [sel, setSel] = useState<string | null>(null);
  const [d, busy, reload, err] = useLoad<{ installed: boolean; rows: StandardRow[]; clauses: Clause[]; mayDownloadCopy: boolean }>(
    `/api/ims/standard${sel ? `?id=${sel}` : ""}`,
  );
  const [msg, setMsg] = useState("");

  const rows = d?.rows ?? [];
  const chosen = rows.find((r) => r.id === sel);
  const mayCopy = !!d?.mayDownloadCopy;

  const attach = async (file: File, id: string) => {
    setMsg("");
    const up = await uploadFile("ims-standards", file);
    if (up.error) { setMsg(up.error); return; }
    const r = await post("/api/ims/standard", { action: "set_copy", id, path: up.path });
    if (!r.ok) { setMsg(r.error || "Could not file the copy."); return; }
    reload();
  };

  const view = async (path: string) => {
    try { window.open(await openFile("ims-standards", path), "_blank", "noopener"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not open."); }
  };

  // The tree: top-level clauses carry their descendants under them.
  const tree = (d?.clauses ?? []).filter((c) => !c.parent_clause);
  const kids = (no: string) => (d?.clauses ?? []).filter((c) => c.parent_clause === no);

  return (
    <Screen
      title="Standards"
      blurb="The six standards, their clause trees, and the purchased copies. The clause numbers are open to everybody; the copies are restricted — they are copyrighted documents."
    >
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {d && !d.installed && <Note kind="warn">Run the IMS migrations first.</Note>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {busy && rows.length === 0 ? <Empty>Reading…</Empty> : rows.map((s) => (
          <div key={s.id} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold" style={{ color: INK }}>{s.name}</div>
              <Chip text={s.sys} colour="#1B2D6B" />
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Btn onClick={() => setSel(sel === s.id ? null : s.id)}>
                {sel === s.id ? "Hide clauses" : "Clauses"}
              </Btn>
              {s.standard_copy_path ? (
                mayCopy
                  ? <Btn onClick={() => view(s.standard_copy_path!)}>Open copy</Btn>
                  : <span className="text-xs font-bold self-center" style={{ color: MUTED }}>
                      Copy filed — restricted to the MR and department heads
                    </span>
              ) : isHead(boot.role) ? (
                <label className="text-xs font-bold self-center" style={{ color: INK, cursor: "pointer" }}>
                  Attach copy
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], s.id)} />
                </label>
              ) : (
                <span className="text-xs self-center" style={{ color: MUTED }}>No copy filed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {chosen && (
        <div className="mt-4">
          <div className="text-sm font-bold mb-2" style={{ color: INK }}>{chosen.name} — clauses</div>
          {(d?.clauses ?? []).length === 0 ? (
            <Empty>No clauses seeded for this standard. AWS D1.1 and EN 1090-2 ship without a clause tree in this pass — the ISO four have theirs.</Empty>
          ) : (
            <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "60vh" }}>
              {tree.map((c) => (
                <div key={c.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div className="px-3 py-2 text-sm font-bold" style={{ color: INK, background: NAVY_SOFT }}>
                    <span style={{ display: "inline-block", minWidth: 56 }}>{c.clause_no}</span> {c.title}
                  </div>
                  {kids(c.clause_no).map((k) => (
                    <div key={k.id}>
                      <div className="px-3 py-1.5 text-sm" style={{ color: INK, paddingLeft: 24 }}>
                        <span style={{ display: "inline-block", minWidth: 56, color: MUTED, fontWeight: 700 }}>{k.clause_no}</span> {k.title}
                      </div>
                      {kids(k.clause_no).map((g) => (
                        <div key={g.id} className="px-3 py-1 text-xs" style={{ color: MUTED, paddingLeft: 48 }}>
                          <span style={{ display: "inline-block", minWidth: 56, fontWeight: 700 }}>{g.clause_no}</span> {g.title}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Screen>
  );
}
