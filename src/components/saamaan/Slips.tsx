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
import { LOGO } from "@/lib/logo";
import { rupee } from "@/lib/fmt";
const money = (n: unknown) => rupee(n, "·");

type JobInfo = { tag: string; production_owner: string; owner_name: string };

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

const qtyFmt = (n: unknown) => Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const statusColour = (s: string, level: number) => (s === "done" ? GREEN : s === "cancelled" ? "var(--dim)" : level >= 3 ? RED : level > 0 ? AMBER : NAVY);
const LADDER = ["", "project manager", "COO", "Raghu"];

export default function Slips({ mrp }: { mrp?: string } = {}) {
  const [data, busy, reload, err] = useLoad<{ ok: boolean; rows: Slip[] }>(`/api/saamaan/slip?mode=slips${mrp ? `&mrp=${encodeURIComponent(mrp)}` : ""}`);
  const [open, setOpen] = useState<Slip | null>(null);
  const rows = data?.rows ?? [];
  return (
    <Screen title="Issue slips" blurb="Kitting slips to the store and purchase requisitions, from one person to one person, by project then item group. A slip left open climbs the ladder a day at a time — project manager, COO, Raghu — each step a task."
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
          { key: "kind", label: "To", align: "left", sort: (r) => r.kind, render: (r) => <span>{r.kind === "purchase" ? "Requisition · purchase" : "Kitting · store"} · <b>{who(r.to_email)}</b></span> },
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

/**
 * A slip's face (Dr Raghu, 3 Sep 2026): "Nandan Issue Slip — Date, From,
 * To; Project, Jobs; Production Owner; Item Group, Item, Qty UOM; Please
 * acknowledge with signature or in system. Page break for every project in
 * the print view; click PDF or Print — the guy can just print the A5 paper
 * and give it."
 */
export function SlipView({ slip, onClose }: { slip: Slip; onClose: () => void }) {
  const [data, busy, reload, err] = useLoad<{ ok: boolean; slip: Slip; lines: Line[]; jobs: Record<string, JobInfo>; from_name: string; to_name: string }>(`/api/saamaan/slip?mode=slip&id=${encodeURIComponent(slip.id)}`);
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
  const groups: { project: string; project_name: string; jobs: string[]; groups: { group: string; lines: Line[] }[] }[] = [];
  for (const l of lines) {
    let p = groups.find((g) => g.project === l.project_id);
    if (!p) { p = { project: l.project_id, project_name: l.project_name, jobs: [], groups: [] }; groups.push(p); }
    if (l.job_no && !p.jobs.includes(l.job_no)) p.jobs.push(l.job_no);
    let g = p.groups.find((x) => x.group === l.item_group);
    if (!g) { g = { group: l.item_group, lines: [] }; p.groups.push(g); }
    g.lines.push(l);
  }
  const jobs = data?.jobs ?? {};
  const owners = (p: { jobs: string[] }) => [...new Set(p.jobs.map((j) => jobs[j]?.owner_name).filter(Boolean))].join(", ") || "·";
  const kindWord = s.kind === "purchase" ? "Purchase Requisition" : "Issue Slip";

  /** A5, one project a page, the slip's face and nothing else. */
  const print = () => {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) { setMsg("The browser blocked the print window."); return; }
    const esc = (x: unknown) => S(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const pages = groups.map((p) => `
      <section class="page">
        <header>
          <img src="${LOGO}" alt="Nandan GSE" />
          <div class="t"><div class="h1">Nandan ${kindWord}</div><div class="no">${esc(s.slip_no)}</div></div>
        </header>
        <table className="genie-table" class="meta"><tr><td><b>Date</b> ${esc(fmtD(s.created_at))}</td><td><b>From</b> ${esc(data?.from_name || who(s.from_email))}</td><td><b>To</b> ${esc(data?.to_name || who(s.to_email))}</td></tr></table>
        <div class="proj"><b>Project</b> ${esc(p.project.replace(/^NGSE-PROJ-/, "") || "—")} <span class="pn">${esc(p.project_name)}</span> &nbsp;·&nbsp; <b>Jobs</b> ${esc(p.jobs.join(", ") || "—")}</div>
        <div class="own"><b>Production Owner:</b> ${esc(owners(p))}</div>
        <table className="genie-table" class="lines"><thead><tr><th>Item Group</th><th>Item</th><th class="n">Qty</th><th>UOM</th></tr></thead><tbody>
          ${p.groups.map((g) => g.lines.map((l, i) => `<tr><td>${i === 0 ? esc(g.group.replace(/^RM - /, "")) : ""}</td><td><b>${esc(l.item_code)}</b> ${esc(l.item_name)}</td><td class="n">${esc(qtyFmt(l.qty))}</td><td>${esc(l.uom)}</td></tr>`).join("")).join("")}
        </tbody></table>
        <footer>
          <div class="ack">Please acknowledge with signature or in system.</div>
          <div class="sig"><span>Issued by ______________</span><span>Received by ______________</span></div>
          <div class="small">${esc(s.slip_no)} · page ${groups.indexOf(p) + 1} of ${groups.length} · Genie</div>
        </footer>
      </section>`).join("");
    w.document.write(`<!doctype html><html><head><title>${esc(s.slip_no)}</title><style>
      @page { size: A5 portrait; margin: 9mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #22283A; font-size: 10.5px; margin: 0; }
      html, body { height: auto; }
      /* A break only BETWEEN projects — a break after the last one is a blank second sheet. No fixed height either: the sheet is as tall as its lines. */
      .page + .page { page-break-before: always; break-before: page; }
      header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #1B2D6B; padding-bottom: 6px; margin-bottom: 6px; }
      header img { height: 28px; } .h1 { font-size: 15px; font-weight: 800; color: #1B2D6B; } .no { font-size: 11px; color: #6B7280; font-weight: 700; }
      .meta { width: 100%; margin-bottom: 6px; } .meta td { padding: 2px 0; }
      .proj { font-size: 11.5px; margin: 4px 0 2px; } .pn { color: #6B7280; } .own { margin-bottom: 6px; }
      .lines { width: 100%; border-collapse: collapse; } .lines th { background: #1B2D6B; color: #fff; text-align: left; padding: 3px 5px; font-size: 10px; }
      .lines td { padding: 3px 5px; border-bottom: 1px solid #E5E8F0; vertical-align: top; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      tr { page-break-inside: avoid; }
      footer { padding-top: 14px; page-break-inside: avoid; } .ack { font-weight: 700; margin-bottom: 14px; }
      .sig { display: flex; justify-content: space-between; margin-bottom: 8px; } .small { color: #9CA3AF; font-size: 9px; }
    </style></head><body>${pages}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <Modal onClose={onClose} title={`Nandan ${kindWord} · ${s.slip_no}`} width={900}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}

      {/* ----------------------------------------------------- the face */}
      <div className="rounded-lg border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
        <div className="flex items-center gap-3 pb-2 mb-2" style={{ borderBottom: `2px solid ${NAVY}` }}>
          <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
          <div><div className="font-bold" style={{ color: NAVY, fontSize: 16 }}>Nandan {kindWord}</div><div className="text-xs font-bold" style={{ color: MUTED }}>{s.slip_no}</div></div>
          <span className="ml-auto flex gap-2">
            <Btn kind="primary" onClick={print} title="A5, one project a page — print it and hand it over">Print / PDF</Btn>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="text-xs font-bold" style={{ color: MUTED }}>Date</span><div className="tnum font-semibold" style={{ color: INK }}>{fmtD(s.created_at)}</div></div>
          <div><span className="text-xs font-bold" style={{ color: MUTED }}>From</span><div className="font-semibold" style={{ color: INK }}>{data?.from_name || who(s.from_email)}</div></div>
          <div><span className="text-xs font-bold" style={{ color: MUTED }}>To</span><div className="font-semibold" style={{ color: INK }}>{data?.to_name || who(s.to_email)}</div></div>
        </div>
      </div>

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
          <div className="px-3 py-1.5 text-sm" style={{ background: NAVY_SOFT, color: INK }}>
            <div><b>Project</b> {p.project ? p.project.replace(/^NGSE-PROJ-/, "") : "—"} <span style={{ color: MUTED }}>{p.project_name}</span> <span style={{ color: MUTED }}>·</span> <b>Jobs</b> <span className="tnum">{p.jobs.join(", ") || "—"}</span></div>
            <div className="text-xs"><b>Production Owner:</b> {owners(p)}</div>
          </div>
          {p.groups.map((g) => (
            <div key={g.group}>
              <div className="px-3 py-1 text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6, borderTop: `1px solid ${BORDER}` }}>{g.group.replace(/^RM - /, "") || "(no group)"}</div>
              <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <tbody>
                  {g.lines.map((l, i) => {
                    const owed = (Number(l.qty) || 0) - (Number(l.released_qty) || 0);
                    const full = owed <= 0;
                    return (
                      <tr key={l.id} style={{ background: full ? "#E6F4EC" : i % 2 ? "#FAF9F5" : "#fff" }}>
                        <td className="px-3 py-1 tnum" style={{ width: 100, color: NAVY, fontWeight: 700 }} title="job">{l.job_no || "·"}</td>
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
      <div className="text-sm font-bold mt-2" style={{ color: INK }}>Please acknowledge with signature or in system.</div>
      <div className="text-xs" style={{ color: MUTED }}>In system: Release on each line above. On paper: Print / PDF gives A5 sheets, one project a sheet, with a line to sign.</div>
    </Modal>
  );
}
