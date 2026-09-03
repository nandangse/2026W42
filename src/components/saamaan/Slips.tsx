"use client";

/**
 * Issue slips (Dr Raghu, 3 Sep 2026: "submit to store — all those tick
 * points will get into a separate app called issue slip. Each issue slip
 * will be from a particular person to a particular person; it will have
 * project, job number, item group, item name, quantity to be released,
 * aggregated by project first and then by item group. If it doesn't get
 * done it escalates: the project manager, then the COO, then Raghu, each
 * as a task, and the slip says issue not done.")
 *
 * Purchase slips — Submit to purchase — live here too, with the order
 * quantities from the MRP planning boxes.
 */

import { useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, Modal, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, RED, S, fmtD, useLoad, post } from "@/components/ims/ui";

export interface Slip {
  id: string; slip_no: string; kind: string; mrp_id: string | null; from_email: string | null; to_email: string | null; status: string;
  escalation_level: number; escalated_at: string | null; escalation_note: string; created_at: string; done_at: string | null; note: string;
  lines: number; qty: number; released: number; amount: number; projects: string[];
}
interface Line {
  id: string; project_id: string; project_name: string; job_no: string; item_group: string; item_code: string; item_name: string;
  qty: number; uom: string; rate: number | null; amount: number | null; released_qty: number; released_at: string | null; released_by: string | null;
}
const who = (s: string | null) => (S(s).includes("@") ? S(s).split("@")[0] : S(s)) || "·";
const money = (n: unknown) => (n === null || n === undefined ? "·" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
const qtyFmt = (n: unknown) => Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const statusColour = (s: string, level: number) => (s === "done" ? GREEN : s === "cancelled" ? "#5A6672" : level >= 3 ? RED : level > 0 ? AMBER : NAVY);
const LADDER = ["", "project manager", "COO", "Raghu"];

export default function Slips({ mrp }: { mrp?: string } = {}) {
  const [data, busy, reload, err] = useLoad<{ ok: boolean; rows: Slip[] }>(`/api/saamaan/slip?mode=slips${mrp ? `&mrp=${encodeURIComponent(mrp)}` : ""}`);
  const [open, setOpen] = useState<Slip | null>(null);
  const rows = data?.rows ?? [];
  return (
    <Screen title="Issue slips" blurb="From one person to one person: what the store is to release, by project, then item group. A slip left open climbs the ladder a day at a time — project manager, COO, Raghu — each step a task."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      <GenieTable<Slip>
        rows={data ? rows : null}
        minWidth={1000}
        search={(r, q) => [r.slip_no, r.kind, r.from_email, r.to_email, r.status, ...r.projects].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 slip, person, project, status"
        empty="No slip yet — Submit to store on the MRP."
        columns={[
          { key: "no", label: "Slip", align: "left", sort: (r) => r.slip_no, render: (r) => <button onClick={() => setOpen(r)} className="font-bold hover:underline" style={{ color: NAVY }}>{r.slip_no}</button> },
          { key: "kind", label: "To", align: "left", sort: (r) => r.kind, render: (r) => <span>{r.kind === "purchase" ? "Purchase" : "Store"} · <b>{who(r.to_email)}</b></span> },
          { key: "from", label: "From", align: "left", sort: (r) => who(r.from_email), render: (r) => who(r.from_email) },
          { key: "date", label: "Raised", align: "left", sort: (r) => r.created_at, render: (r) => <span className="tnum">{fmtD(r.created_at)}</span> },
          { key: "proj", label: "Projects", align: "left", render: (r) => <span style={{ color: MUTED }}>{r.projects.map((p) => p.replace(/^NGSE-PROJ-/, "")).join(", ") || "·"}</span> },
          { key: "lines", label: "Lines", align: "right", sort: (r) => r.lines, render: (r) => <span className="tnum">{r.lines}</span> },
          { key: "rel", label: "Released", align: "right", sort: (r) => (r.qty ? r.released / r.qty : 0), render: (r) => <span className="tnum">{qtyFmt(r.released)} / {qtyFmt(r.qty)}</span> },
          { key: "amt", label: "Value", align: "right", sort: (r) => r.amount, render: (r) => <span className="tnum">{money(r.amount)}</span> },
          { key: "status", label: "Status", align: "left", sort: (r) => `${r.status}${r.escalation_level}`,
            render: (r) => <Chip text={r.status === "open" && r.escalation_level > 0 ? `issue not done · ${LADDER[r.escalation_level] || `level ${r.escalation_level}`}` : r.status} colour={statusColour(r.status, r.escalation_level)} /> },
        ]}
      />
      {open && <SlipView slip={open} onClose={() => { setOpen(null); reload(); }} />}
    </Screen>
  );
}

export function SlipView({ slip, onClose }: { slip: Slip; onClose: () => void }) {
  const [data, busy, reload, err] = useLoad<{ ok: boolean; slip: Slip; lines: Line[] }>(`/api/saamaan/slip?mode=slip&id=${encodeURIComponent(slip.id)}`);
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState("");
  const s = data?.slip ?? slip;
  const lines = data?.lines ?? [];
  const release = async (line: Line) => {
    const typed = boxes[line.id];
    const qty = typed === undefined || typed === "" ? undefined : Number(typed);
    setSaving(line.id); setMsg("");
    const r = await post("/api/saamaan/slip", { action: "release", id: slip.id, line_id: line.id, qty });
    setSaving("");
    if (!r.ok) { setMsg(r.error || "Could not release."); return; }
    setBoxes((b) => { const n = { ...b }; delete n[line.id]; return n; });
    reload();
  };
  const mark = async (action: "done" | "cancel") => {
    setSaving(action); setMsg("");
    const r = await post("/api/saamaan/slip", { action, id: slip.id });
    setSaving("");
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    reload();
  };
  // Grouped as he asked: project, then item group.
  const groups: { project: string; project_name: string; groups: { group: string; lines: Line[] }[] }[] = [];
  for (const l of lines) {
    let p = groups.find((g) => g.project === l.project_id);
    if (!p) { p = { project: l.project_id, project_name: l.project_name, groups: [] }; groups.push(p); }
    let g = p.groups.find((x) => x.group === l.item_group);
    if (!g) { g = { group: l.item_group, lines: [] }; p.groups.push(g); }
    g.lines.push(l);
  }
  return (
    <Modal onClose={onClose} title={`${s.slip_no} — ${s.kind === "purchase" ? "purchase" : "issue"} slip · ${who(s.from_email)} → ${who(s.to_email)}`} width={1100}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      <div className="flex items-center gap-3 mb-3 text-xs flex-wrap" style={{ color: MUTED }}>
        <Chip text={s.status === "open" && s.escalation_level > 0 ? `issue not done · escalated to ${LADDER[s.escalation_level]}` : s.status} colour={statusColour(s.status, s.escalation_level)} />
        <span>raised <b className="tnum" style={{ color: INK }}>{fmtD(s.created_at)}</b></span>
        {s.done_at && <span>closed <b className="tnum" style={{ color: INK }}>{fmtD(s.done_at)}</b></span>}
        {s.escalation_note && <span style={{ color: AMBER }}>{s.escalation_note}</span>}
        <span className="ml-auto flex gap-2">
          {s.status === "open" && <Btn onClick={() => mark("done")} disabled={!!saving}>Mark done</Btn>}
          {s.status === "open" && <Btn kind="danger" onClick={() => mark("cancel")} disabled={!!saving}>Cancel slip</Btn>}
        </span>
      </div>
      {busy && !data && <div className="text-sm" style={{ color: MUTED }}>Reading…</div>}
      {groups.map((p) => (
        <div key={p.project} className="mb-3 rounded border" style={{ borderColor: BORDER }}>
          <div className="px-3 py-1.5 text-sm font-bold" style={{ background: NAVY_SOFT, color: INK }}>
            {p.project ? p.project.replace(/^NGSE-PROJ-/, "Project ") : "No project"} <span style={{ color: MUTED, fontWeight: 500 }}>· {p.project_name}</span>
          </div>
          {p.groups.map((g) => (
            <div key={g.group}>
              <div className="px-3 py-1 text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6, borderTop: `1px solid ${BORDER}` }}>{g.group.replace(/^RM - /, "") || "(no group)"}</div>
              <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <tbody>
                  {g.lines.map((l, i) => {
                    const owed = (Number(l.qty) || 0) - (Number(l.released_qty) || 0);
                    const full = owed <= 0;
                    return (
                      <tr key={l.id} style={{ background: full ? "#E6F4EC" : i % 2 ? "#FAF9F5" : "#fff" }}>
                        <td className="px-3 py-1 tnum" style={{ width: 110, color: NAVY, fontWeight: 700 }}>{l.job_no || "·"}</td>
                        <td className="px-2 py-1"><b style={{ color: INK }}>{l.item_code}</b> <span style={{ color: MUTED }}>{l.item_name}</span></td>
                        <td className="px-2 py-1 text-right tnum font-bold" style={{ whiteSpace: "nowrap" }}>{qtyFmt(l.qty)} <span style={{ color: MUTED, fontWeight: 500 }}>{l.uom}</span></td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED, whiteSpace: "nowrap" }}>{money(l.amount)}</td>
                        <td className="px-2 py-1 text-right" style={{ whiteSpace: "nowrap", width: 220 }}>
                          {full ? (
                            <span className="text-xs" style={{ color: GREEN }} title={`released by ${who(l.released_by)}`}>✓ released {l.released_at ? fmtD(l.released_at) : ""}</span>
                          ) : s.status === "open" ? (
                            <span className="inline-flex items-center gap-1">
                              {l.released_qty > 0 && <span className="text-xs tnum" style={{ color: "#92400E" }}>{qtyFmt(l.released_qty)} gone</span>}
                              <input value={boxes[l.id] ?? ""} placeholder={qtyFmt(owed)} inputMode="decimal" onChange={(e) => setBoxes((b) => ({ ...b, [l.id]: e.target.value }))}
                                className="rounded border px-1 py-0.5 text-xs tnum text-right" style={{ width: 60, borderColor: BORDER }} />
                              <button onClick={() => release(l)} disabled={saving === l.id} className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: GREEN, color: "#fff" }}>Release</button>
                            </span>
                          ) : <span style={{ color: MUTED }}>{qtyFmt(l.released_qty)} of {qtyFmt(l.qty)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </Modal>
  );
}
