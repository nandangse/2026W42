"use client";
/**
 * ONE REAL BOM, ON ITS OWN PAGE (Dr Raghu, 8 Sep 2026: "RBOM needs a link of
 * its own ... this link will make it useful").
 *
 * Six tabs, in his order:
 *   Real BOM          — the RBOM's own lines, and where the work is done
 *   Ordering BOM      — the ERP BOM it was built from, untouched
 *   Analytics         — what it is made of, by status, group and money
 *   Projects Used     — where this RBOM appears
 *   Kitted Warehouses — WIP no · Project · Job · Value · Item nos · % kitted
 *   Remarks           — a thread, appended one at a time, never edited
 *
 * And the thing that makes it a document rather than a report: RELEASE.
 * Tick lines, or take every Draft and WIP at once, stamp the header, and tell
 * the people on the project — with the list of what has been added shown
 * before anything is sent, because a notice that names the wrong items is
 * worse than no notice.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import GenieShell from "@/components/GenieShell";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, Modal, INK, MUTED, BORDER, NAVY, GREEN, AMBER, RED } from "@/components/ims/ui";

const inr = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? "·" : `₹${Math.round(Number(n)).toLocaleString("en-IN")}`);
const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "·");
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "·");

const STATUS = ["Draft", "WIP", "Released"] as const;
type Status = (typeof STATUS)[number];
const statusColour = (s: string) => (s === "Released" ? NAVY : s === "WIP" ? AMBER : MUTED);

interface Item {
  id: string; idx: number; item_code: string; item_name: string; item_group: string;
  qty: number | null; uom: string; rate: number | null; amount: number | null;
  description: string; bom_status: string; bom_remark: string; bom_no: string;
  is_sub_assembly: boolean; source_bom: string; added_by: string; updated_by: string | null; updated_at: string | null;
}
interface Head {
  rbom_id: string; project_id: string; item_code: string; item_name: string;
  base_bom: string; draft_boms: string | null; status: string | null; rev: string | null;
  released_at: string | null; released_by: string | null; built_by: string | null; built_at: string | null;
}
interface Ord { row_id?: string; idx: number; item_code: string; item_name: string; qty: number | null; uom: string; rate: number | null; amount: number | null; item_group: string; description: string }
interface Wip { job_no: string; warehouse: string; project_id: string; customer: string; product_family: string; value: number | null; nos_kitted: number | null; value_kitted: number | null; nos_pending: number | null; tvc_pct: number | null }
interface Remark { id: string; item_code: string | null; body: string; by_name: string; by_email: string; at: string }
interface Data {
  head: Head; items: Item[]; remarks: Remark[];
  ordering: Ord[]; orderingHead: Record<string, unknown> | null;
  wip: Wip[]; project: Record<string, unknown> | null;
  notify?: { emails: string[]; note: string | null };
}

interface Grp { group: string; n: number; value: number }
type Tab = "real" | "ordering" | "analytics" | "projects" | "kitted" | "remarks";
const TABS: [Tab, string][] = [
  ["real", "Real BOM"], ["ordering", "Ordering BOM"], ["analytics", "Analytics"],
  ["projects", "Projects Used"], ["kitted", "Kitted Warehouses"], ["remarks", "Remarks"],
];

export default function RbomPage({ id, email, displayName, initials, role, isOwner }: {
  id: string; email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean;
}) {
  const [d0, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("real");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [say, setSay] = useState("");
  const [rel, setRel] = useState<{ added: Item[]; to: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/saamaan/rbom-one?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setD(j);
  }, [id]);
  useEffect(() => { load().catch((e) => setMsg(String(e.message || e))); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/saamaan/rbom-one", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j;
  };
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg("");
    try { const j = await post(body); await load(); setMsg(`${done} ✓`); return j; }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const items = d0?.items ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.bom_status || "Draft"] = (c[i.bom_status || "Draft"] || 0) + 1;
    return c;
  }, [items]);
  const notReleased = items.filter((i) => i.bom_status !== "Released");

  /* Analytics: what it is made of, three ways */
  const analytics = useMemo(() => {
    const byGroup = new Map<string, { n: number; value: number }>();
    let value = 0, lines = 0, sub = 0;
    for (const i of items) {
      const g = i.item_group || "(no group)";
      const t = byGroup.get(g) ?? { n: 0, value: 0 };
      t.n++; t.value += Number(i.amount) || 0; byGroup.set(g, t);
      value += Number(i.amount) || 0; lines++; if (i.is_sub_assembly) sub++;
    }
    const rows: Grp[] = [...byGroup.entries()].map(([group, t]) => ({ group, n: t.n, value: t.value })).sort((a, b) => b.value - a.value);
    return { byGroup: rows, value, lines, sub };
  }, [items]);

  const head = d0?.head;
  const released = !!head?.released_at;

  return (
    <GenieShell
      module="saamaan"
      title="Nandan Saamaan"
      tagline={`RBOM ${id}`}
      user={{ email, displayName, initials, role }}
    >
      <Screen
        title={`${id}${head?.item_name ? ` · ${head.item_name}` : ""}`}
        blurb={head ? `${head.project_id}${head.base_bom ? ` · built from ${head.base_bom}` : ""}${head.built_at ? ` · built ${d(head.built_at)}` : ""}` : "loading…"}
        action={
          <div className="flex gap-1.5 items-center">
            <a href="/saamaan" className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${BORDER}`, color: MUTED, textDecoration: "none" }}>← Saamaan</a>
            {/* RELEASE — the button he asked for, at the top */}
            {isOwner && (
              <Btn kind="primary" disabled={busy || !d0}
                onClick={() => setRel({ added: notReleased, to: (d0?.notify?.emails ?? []).join(", ") })}
                title={released ? `Released ${d(head?.released_at)} — releasing again sends the notice a second time` : "Move every Draft and WIP line to Released and tell the project"}>
                {released ? "↻ Release again" : `✓ Release${notReleased.length ? ` (${notReleased.length})` : ""}`}
              </Btn>
            )}
          </div>
        }
      >
        {msg && <Note kind={msg.endsWith("✓") ? "info" : "error"}>{msg}</Note>}

        <div className="flex gap-2 flex-wrap items-center mb-2 text-xs">
          {released
            ? <Chip text={`Released ${d(head?.released_at)}`} colour={GREEN} />
            : <Chip text={head?.status || "Draft"} colour={statusColour(head?.status || "Draft")} />}
          {STATUS.map((s) => counts[s] ? <Chip key={s} text={`${s} ${counts[s]}`} colour={statusColour(s)} /> : null)}
          <span style={{ flex: 1 }} />
          <span style={{ color: MUTED }}>{items.length} lines · {inr(analytics.value)}</span>
        </div>

        <div className="flex gap-1.5 mb-3 flex-wrap">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded px-3 py-1.5 text-xs font-bold"
              style={{ background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : INK, border: `1px solid ${tab === k ? NAVY : BORDER}` }}>
              {l}{k === "remarks" && d0?.remarks.length ? ` (${d0.remarks.length})` : ""}
              {k === "kitted" && d0?.wip.length ? ` (${d0.wip.length})` : ""}
            </button>
          ))}
        </div>

        {/* ───────────── REAL BOM ───────────── */}
        {tab === "real" && (
          <>
            {isOwner && (
              <div className="flex gap-1.5 items-center mb-2 text-xs flex-wrap">
                <Btn onClick={() => setPicked(picked.length === items.length ? [] : items.map((i) => i.id))}>
                  {picked.length === items.length && items.length ? "Clear all" : "Select all"}
                </Btn>
                <span style={{ color: MUTED }}>{picked.length ? `${picked.length} picked` : "none picked"}</span>
                {STATUS.map((s) => (
                  <Btn key={s} disabled={busy || !picked.length}
                    onClick={() => act({ action: "status", to: s, ids: picked }, `${picked.length} moved to ${s}`).then(() => setPicked([]))}>
                    → {s}
                  </Btn>
                ))}
                <span style={{ flex: 1 }} />
                {/* the whole list at once, which is what a release usually is */}
                <Btn disabled={busy || !notReleased.length}
                  onClick={() => act({ action: "status", to: "Released" }, `${notReleased.length} moved to Released`)}
                  title="Every line not already Released">
                  All → Released
                </Btn>
              </div>
            )}
            <GenieTable<Item>
              rows={d0 ? items : null} minWidth={1200} search={() => true} empty="No lines on this RBOM."
              columns={[
                ...(isOwner ? [{
                  key: "pick", label: "", align: "left" as const,
                  render: (r: Item) => <input type="checkbox" checked={picked.includes(r.id)}
                    onChange={(e) => setPicked((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />,
                }] : []),
                { key: "code", label: "Item ID", align: "left", sort: (r) => r.item_code, render: (r) => <span className="tnum text-xs font-bold">{r.item_code}</span> },
                { key: "grp", label: "Item Group", align: "left", sort: (r) => r.item_group, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.item_group || "·"}</span> },
                { key: "name", label: "Item", align: "left", sort: (r) => r.item_name, render: (r) => <span className="font-bold text-xs" style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 320 }}>{r.item_name}</span> },
                { key: "qty", label: "Qty UOM", align: "right", sort: (r) => Number(r.qty || 0), render: (r) => <span className="tnum">{r.qty == null ? "·" : r.qty.toLocaleString("en-IN")} <span style={{ color: MUTED }}>{r.uom}</span></span> },
                { key: "rate", label: "Rate", align: "right", sort: (r) => Number(r.rate || 0), render: (r) => <span className="tnum">{inr(r.rate)}</span> },
                { key: "amt", label: "Amount", align: "right", sort: (r) => Number(r.amount || 0), render: (r) => <span className="tnum font-bold">{inr(r.amount)}</span> },
                { key: "rem", label: "Remarks", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED, whiteSpace: "normal" }}>{r.bom_remark || "·"}</span> },
                { key: "st", label: "Status", align: "left", sort: (r) => r.bom_status, render: (r) => <Chip text={r.bom_status || "Draft"} colour={statusColour(r.bom_status)} /> },
                { key: "by", label: "Added / edited by", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{(r.updated_by || r.added_by || "").split("@")[0] || "·"}<br />{dt(r.updated_at)}</span> },
              ]}
            />
          </>
        )}

        {/* ───────────── ORDERING BOM ───────────── */}
        {tab === "ordering" && (
          <>
            <Note kind="info">
              The ordering BOM is <b>{head?.base_bom || "—"}</b> — the ERP&apos;s own, exactly as it stands. The Real BOM above was built from it; this is what it was built from, so the two can be read against each other.
            </Note>
            <GenieTable<Ord>
              rows={d0 ? d0.ordering : null} minWidth={1000} search={() => true}
              empty="No lines against that BOM in the mirror — run the ERP pull."
              columns={[
                { key: "idx", label: "#", align: "right", sort: (r) => r.idx, render: (r) => <span className="tnum" style={{ color: MUTED }}>{r.idx}</span> },
                { key: "code", label: "Item ID", align: "left", sort: (r) => r.item_code, render: (r) => <span className="tnum text-xs font-bold">{r.item_code}</span> },
                { key: "name", label: "Item", align: "left", sort: (r) => r.item_name, render: (r) => <span className="text-xs" style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 340 }}>{r.item_name}</span> },
                { key: "qty", label: "Qty", align: "right", sort: (r) => Number(r.qty || 0), render: (r) => <span className="tnum">{r.qty == null ? "·" : r.qty.toLocaleString("en-IN")} <span style={{ color: MUTED }}>{r.uom}</span></span> },
                { key: "rate", label: "Rate", align: "right", sort: (r) => Number(r.rate || 0), render: (r) => <span className="tnum">{inr(r.rate)}</span> },
                { key: "amt", label: "Amount", align: "right", sort: (r) => Number(r.amount || 0), render: (r) => <span className="tnum font-bold">{inr(r.amount)}</span> },
              ]}
            />
          </>
        )}

        {/* ───────────── ANALYTICS ───────────── */}
        {tab === "analytics" && (
          <>
            <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {[["Lines", String(analytics.lines)], ["Value", inr(analytics.value)],
                ["Sub-assemblies", String(analytics.sub)], ["Released", String(counts.Released || 0)],
                ["WIP", String(counts.WIP || 0)], ["Draft", String(counts.Draft || 0)]].map(([k, v]) => (
                <div key={k} className="rounded p-2" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
                  <div className="text-xs" style={{ color: MUTED }}>{k}</div>
                  <div className="font-bold tnum" style={{ fontSize: 19 }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>WHAT IT IS MADE OF — by item group, biggest money first</div>
            <GenieTable<Grp>
              rows={analytics.byGroup} minWidth={600} search={() => true} empty="Nothing to count yet."
              columns={[
                { key: "g", label: "Item group", align: "left", sort: (r: Grp) => r.group, render: (r: Grp) => <span className="font-bold text-xs">{r.group}</span> },
                { key: "n", label: "Lines", align: "right", sort: (r: Grp) => r.n, render: (r: Grp) => <span className="tnum">{r.n}</span> },
                { key: "v", label: "Value", align: "right", sort: (r: Grp) => r.value, render: (r: Grp) => <span className="tnum font-bold">{inr(r.value)}</span> },
                { key: "share", label: "Share", align: "right", sort: (r: Grp) => r.value, render: (r: Grp) => <span className="tnum" style={{ color: MUTED }}>{analytics.value ? `${Math.round((r.value / analytics.value) * 100)}%` : "·"}</span> },
              ]}
            />
          </>
        )}

        {/* ───────────── PROJECTS USED ───────────── */}
        {tab === "projects" && (
          <>
            {d0?.project ? (
              <div className="rounded p-3 mb-2" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
                <div className="font-bold">{String(d0.project.project_id)} · {String(d0.project.project_name || "")}</div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>
                  {String(d0.project.customer || "")} · {String(d0.project.product_family || "")} · {String(d0.project.status || "")}
                  {d0.project.design_stage ? ` · design ${String(d0.project.design_stage)}` : ""}
                  {d0.project.approved_bom ? ` · approved BOM ${String(d0.project.approved_bom)}` : ""}
                </div>
              </div>
            ) : <Note kind="warn">This RBOM names project <b>{head?.project_id}</b>, but that project is not in the mirror — run the ERP pull.</Note>}
            <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>EVERY JOB THIS RBOM IS USED ON</div>
            <GenieTable<Wip>
              rows={d0 ? d0.wip : null} minWidth={800} search={() => true}
              empty="No job carries this RBOM yet."
              columns={[
                { key: "job", label: "Job", align: "left", sort: (r) => r.job_no, render: (r) => <span className="tnum font-bold text-xs">{r.job_no}</span> },
                { key: "proj", label: "Project", align: "left", sort: (r) => r.project_id, render: (r) => <span className="text-xs">{r.project_id}</span> },
                { key: "cust", label: "Customer", align: "left", sort: (r) => r.customer, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.customer || "·"}</span> },
                { key: "fam", label: "Family", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.product_family || "·"}</span> },
                { key: "val", label: "Value", align: "right", sort: (r) => Number(r.value || 0), render: (r) => <span className="tnum font-bold">{inr(r.value)}</span> },
              ]}
            />
          </>
        )}

        {/* ───────────── KITTED WAREHOUSES ───────────── */}
        {tab === "kitted" && (
          <>
            <Note kind="info">His columns: WIP no · Project · Job · Value · Item nos · % kitted. Read live from the WIP warehouses, not typed here.</Note>
            <GenieTable<Wip>
              rows={d0 ? d0.wip : null} minWidth={1000} search={() => true}
              empty="Nothing kitted against this RBOM yet."
              columns={[
                { key: "wh", label: "WIP no", align: "left", sort: (r) => r.warehouse, render: (r) => <span className="text-xs font-bold">{r.warehouse}</span> },
                { key: "proj", label: "Project", align: "left", sort: (r) => r.project_id, render: (r) => <span className="text-xs">{r.project_id}</span> },
                { key: "job", label: "Job", align: "left", sort: (r) => r.job_no, render: (r) => <span className="tnum text-xs">{r.job_no}</span> },
                { key: "val", label: "Value", align: "right", sort: (r) => Number(r.value || 0), render: (r) => <span className="tnum font-bold">{inr(r.value)}</span> },
                { key: "nos", label: "Items Nos", align: "right", sort: (r) => Number(r.nos_kitted || 0), render: (r) => <span className="tnum">{r.nos_kitted ?? "·"}{r.nos_pending ? <span style={{ color: MUTED }}> / {(r.nos_kitted || 0) + r.nos_pending}</span> : null}</span> },
                {
                  key: "pct", label: "% Kitted", align: "right", sort: (r) => Number(r.tvc_pct || 0),
                  render: (r) => {
                    const done = Number(r.nos_kitted || 0), pend = Number(r.nos_pending || 0);
                    const pct = done + pend > 0 ? Math.round((done / (done + pend)) * 100) : null;
                    return <span className="tnum font-bold" style={{ color: pct == null ? MUTED : pct >= 100 ? GREEN : pct >= 50 ? AMBER : RED }}>{pct == null ? "·" : `${pct}%`}</span>;
                  },
                },
                { key: "vk", label: "Value kitted", align: "right", sort: (r) => Number(r.value_kitted || 0), render: (r) => <span className="tnum">{inr(r.value_kitted)}</span> },
              ]}
            />
          </>
        )}

        {/* ───────────── REMARKS ───────────── */}
        {tab === "remarks" && (
          <>
            <div className="rounded p-2 mb-3" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
              <textarea value={say} onChange={(e) => setSay(e.target.value)} rows={3}
                placeholder="Add a remark — it is kept as its own line, with your name and the time. Nothing here is ever edited."
                className="w-full text-sm rounded px-2 py-1.5" style={{ border: `1px solid ${BORDER}` }} />
              <div className="flex justify-end mt-1.5">
                <Btn kind="primary" disabled={busy || !say.trim()}
                  onClick={() => act({ action: "remark", body: say.trim() }, "Remark added").then(() => setSay(""))}>
                  Add remark
                </Btn>
              </div>
            </div>
            {!d0?.remarks.length && <Note kind="info">No remarks yet. They read newest first, one under another, like a conversation.</Note>}
            {(d0?.remarks ?? []).map((r) => (
              <div key={r.id} className="rounded p-2.5 mb-2" style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
                <div className="text-xs mb-1" style={{ color: MUTED }}>
                  <b style={{ color: INK }}>{r.by_name || (r.by_email || "").split("@")[0]}</b> · {dt(r.at)}
                  {r.item_code ? <> · on <span className="tnum">{r.item_code}</span></> : null}
                </div>
                <div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.body}</div>
              </div>
            ))}
          </>
        )}
      </Screen>

      {/* ───────────── RELEASE ───────────── */}
      {rel && (
        <Modal onClose={() => setRel(null)} title={`Release ${id}`} width={900}>
          <Note kind="warn">
            {rel.added.length
              ? <>This moves <b>{rel.added.length}</b> line{rel.added.length === 1 ? "" : "s"} to Released and stamps the RBOM. The notice below names exactly those lines.</>
              : <>Every line is already Released. Releasing again re-stamps it and sends the notice a second time.</>}
          </Note>
          {/* WHO TO TELL COMES FROM THE PROJECT (Dr Raghu, 8 Sep 2026: "the
              rule will come in projects"). Set once against the project and
              every release on it reads the same list — still shown here, and
              still editable, because the last look before a notice goes out
              should be at the actual addresses. */}
          <div className="text-xs font-bold mt-2 mb-1" style={{ color: MUTED }}>
            WHO TO TELL — from project {head?.project_id}
            {d0?.notify?.emails.length ? "" : <span style={{ color: AMBER }}> · nothing set on this project yet</span>}
          </div>
          <textarea value={rel.to} onChange={(e) => setRel({ ...rel, to: e.target.value })} rows={2}
            placeholder="name@nandan.co.in, someone@nandan.co.in"
            className="w-full text-sm rounded px-2 py-1.5" style={{ border: `1px solid ${BORDER}` }} />
          <div className="flex items-center gap-2 mt-1">
            <div className="text-xs" style={{ color: MUTED, flex: 1 }}>
              {d0?.notify?.note ? <>Project note: {d0.notify.note}. </> : null}
              Editing here changes this notice only — save it to the project to make it the rule for every RBOM on {head?.project_id}.
            </div>
            <Btn disabled={busy}
              onClick={() => act({ action: "notify", emails: rel.to.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean) }, "Saved to the project")}
              title="Keep these addresses against the project, so every RBOM released on it starts here">
              Save to project
            </Btn>
          </div>

          <div className="text-xs font-bold mt-3 mb-1" style={{ color: MUTED }}>THE NOTICE, AS IT WILL READ</div>
          <div className="rounded p-3 text-sm" style={{ background: "#fff", border: `1px solid ${BORDER}`, lineHeight: 1.7 }}>
            Hello,<br /><br />
            RBOM <b>{id}</b>{head?.rev ? <> Rev <b>{head.rev}</b></> : null} has been released today.<br />
            <span style={{ color: NAVY }}>{typeof window !== "undefined" ? `${window.location.origin}/saamaan/rbom/${encodeURIComponent(id)}` : `/saamaan/rbom/${id}`}</span><br /><br />
            Below items have been added:
            <div className="mt-2" style={{ maxHeight: 220, overflowY: "auto" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead><tr>{["Item code", "Description", "Qty", "UOM", "Remarks"].map((h) => (
                  <th key={h} className="px-2 py-1 text-left" style={{ background: "#F4F2EC", color: MUTED }}>{h}</th>))}</tr></thead>
                <tbody>
                  {rel.added.slice(0, 200).map((i) => (
                    <tr key={i.id}>
                      <td className="px-2 py-1 tnum" style={{ borderTop: `1px solid ${BORDER}` }}>{i.item_code}</td>
                      <td className="px-2 py-1" style={{ borderTop: `1px solid ${BORDER}` }}>{i.item_name || i.description}</td>
                      <td className="px-2 py-1 tnum text-right" style={{ borderTop: `1px solid ${BORDER}` }}>{i.qty ?? "·"}</td>
                      <td className="px-2 py-1" style={{ borderTop: `1px solid ${BORDER}` }}>{i.uom}</td>
                      <td className="px-2 py-1" style={{ borderTop: `1px solid ${BORDER}`, color: MUTED }}>{i.bom_remark || "·"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rel.added.length > 200 && <div className="text-xs mt-1" style={{ color: MUTED }}>…and {rel.added.length - 200} more.</div>}
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-3">
            <Btn onClick={() => setRel(null)}>Cancel</Btn>
            <Btn kind="primary" disabled={busy}
              onClick={async () => {
                const to = rel.to.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
                await act({ action: "release", to, again: released }, `Released — ${rel.added.length} lines`);
                setRel(null);
              }}>
              {released ? "Release again" : "Release"}
            </Btn>
          </div>
        </Modal>
      )}
    </GenieShell>
  );
}
