"use client";
/**
 * PROJECTS (Dr Raghu, 30 Aug 2026): the ERP's Project doctype, replicated
 * whole — every scalar field the ERP holds, live, so the cleanup of what
 * stays and what goes can be decided by looking at the real thing.
 *
 * The main details lead; every other ERP field follows alphabetically.
 * Search narrows; 300 rows render at a time so the browser stays honest.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const C = {
  ink: "var(--navy)", sub: "var(--dim)", mute: "var(--muted)", line: "var(--line)",
  panel: "#F4F2EC", accent: "var(--accent)", navy: "var(--blue)", green: "var(--green)", red: "var(--red)",
};

/** The fields worth leading with — the rest trail alphabetically. */
const LEAD = ["name", "project_name", "status", "percent_complete", "customer",
  "expected_start_date", "expected_end_date", "actual_start_date", "actual_end_date",
  "priority", "project_type", "cost_center", "total_sales_amount", "total_billed_amount",
  "total_costing_amount", "gross_margin", "per_gross_margin"];
/** Plumbing nobody will clean by hand. */
const HIDE = new Set(["doctype", "docstatus", "idx", "owner", "modified_by", "creation", "_user_tags", "_comments", "_assign", "_liked_by", "naming_series"]);

type Row = Record<string, unknown>;

export default function ErpProjects() {
  const [d, setD] = useState<{ count: number; columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [err, setErr] = useState("");
  const [peek, setPeek] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  /**
   * OPEN ON THE LIVE WORK (Dr Raghu, 2 Sep 2026: "by default show the is as
   * Jobs in process"). The book holds 1,687 projects and all but fifty of
   * them are finished; opening on all of them buries the ones being built.
   * "All statuses" is still one click away for the cleanup.
   */
  const [status, setStatus] = useState("Jobs in Process");
  const [cap, setCap] = useState(300);

  useEffect(() => {
    api.get("/api/erp-projects").then(setD).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const cols = useMemo(() => {
    if (!d) return [] as string[];
    const have = new Set(d.columns);
    const lead = LEAD.filter((c) => have.has(c));
    const rest = d.columns.filter((c) => !LEAD.includes(c) && !HIDE.has(c)).sort();
    return [...lead, ...rest];
  }, [d]);

  const statuses = useMemo(() => [...new Set((d?.rows || []).map((r) => String(r.status || "")))].filter(Boolean).sort(), [d]);

  const rows = useMemo(() => {
    let out = d?.rows || [];
    if (status) out = out.filter((r) => String(r.status || "") === status);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      out = out.filter((r) => String(r.name || "").toLowerCase().includes(k)
        || String(r.project_name || "").toLowerCase().includes(k)
        || String(r.customer || "").toLowerCase().includes(k));
    }
    return out;
  }, [d, q, status]);

  if (err) return <div className="p-6 text-sm" style={{ color: C.red }}>{err}</div>;
  if (!d) return <div className="p-6 text-sm" style={{ color: C.mute }}>Reading the ERP&apos;s projects — every field of every one…</div>;

  const cell = (v: unknown) => {
    const s = String(v ?? "");
    if (!s || s === "0") return <span style={{ color: "#D5D2C9" }}>—</span>;
    return s.length > 60 ? <span title={s}>{s.slice(0, 57)}…</span> : s;
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>PROJECTS</div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>
            The ERP&apos;s project book — every field, for the cleanup to come
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project / name / customer…"
          className="text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line, width: 260 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm border rounded px-2 py-1.5 bg-white" style={{ borderColor: C.line }}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs" style={{ color: C.mute }}>{rows.length} of {d.count} · {cols.length} fields</span>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto" style={{ borderColor: C.line, maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
        <table className="text-xs genie-table" style={{ borderCollapse: "collapse", minWidth: cols.length * 130 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {cols.map((c, i) => (
                <th key={c} className="px-2 py-2 text-left whitespace-nowrap"
                  style={i === 0 ? { position: "sticky", left: 0, background: "var(--ink)", zIndex: 3 } : undefined}>
                  {c.replace(/^custom_/, "✳ ").replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, cap).map((r, ri) => (
              <tr key={String(r.name ?? ri)} style={{ borderTop: "1px solid #EFEDE7", background: ri % 2 ? "#FAF9F5" : "#fff" }}>
                {cols.map((c, i) => (
                  <td key={c} className="px-2 py-1 whitespace-nowrap"
                    style={i === 0
                      ? { position: "sticky", left: 0, background: ri % 2 ? "#FAF9F5" : "#fff", fontWeight: 700, color: C.navy, zIndex: 1 }
                      : { color: C.sub }}>
                    {/*
                      THE NUMBER IS THE DOOR (Dr Raghu, 2 Sep 2026: "make it
                      clickable and open each project in its own page. Make
                      the url as genie.nandan.co.in/project/1716").

                      The book answers WHICH project; the page answers what it
                      is. The short number is the address because it is what
                      people say out loud and type from memory.
                    */}
                    {/* THE LIGHTBOX FIRST (Dr Raghu, 9 Sep 2026: "from here
                        while clicked first light box, then a new tab" — and
                        before that, of every other list in Genie: "the
                        clicking of the job should first give lightbox then
                        the person can click deeper"). The book answers WHICH
                        project; the lightbox answers whether it is the one he
                        meant; only then is a tab worth spending. */}
                    {i === 0 && r.name
                      ? (
                        <button onClick={() => setPeek(r)}
                          className="underline decoration-dotted text-left" style={{ color: C.navy }}
                          title={`${String(r.name)} — a look first, then its own tab`}>
                          {String(r.name)}
                        </button>
                      )
                      : cell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > cap && (
        <button onClick={() => setCap((c) => c + 300)} className="mt-2 w-full text-xs font-bold rounded py-1.5 border"
          style={{ color: C.navy, borderColor: C.line, background: "#fff" }}>
          See more ↓ · {rows.length - cap} more projects
        </button>
      )}
      <div className="text-xs mt-2" style={{ color: "#B8B5AC" }}>
        Live from the ERP · scalar fields only (child tables stay there) · ✳ marks the ERP&apos;s custom fields ·
        say which columns go and this table sheds them.
      </div>
      {/* ── a look first ─────────────────────────────────────────────────
          What a man needs to know before deciding whether to open a tab:
          whose it is, where it has got to, when it was promised, and who
          answers for it. Everything else is a tab away. */}
      {peek && (() => {
        const g = (k: string) => { const v = peek[k]; return v === null || v === undefined || v === "" ? "—" : String(v); };
        const num = String(peek.name ?? "").replace(/^NGSE-PROJ-/i, "");
        const F = ({ l, v }: { l: string; v: string }) => (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", background: "#fff", minWidth: 150 }}>
            <div style={{ fontSize: 10.5, color: C.sub, fontWeight: 700, letterSpacing: .5 }}>{l}</div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{v}</div>
          </div>
        );
        return (
          <div onClick={() => setPeek(null)}
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white"
              style={{ width: "min(760px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
                <div className="text-white font-bold text-sm">{g("name")}</div>
                <button onClick={() => setPeek(null)} className="text-white font-bold px-2">✕</button>
              </div>
              <div className="p-4">
                <div style={{ fontFamily: "Barlow, system-ui, sans-serif", fontWeight: 800, fontSize: 19, marginBottom: 10 }}>
                  {g("project_name")}
                </div>
                <div className="flex flex-wrap gap-2">
                  <F l="CUSTOMER" v={g("customer")} />
                  <F l="STATUS" v={g("status")} />
                  <F l="STAGE" v={g("project_stage")} />
                  <F l="PROJECT DIRECTOR" v={g("custom_project_director")} />
                  <F l="SALES ORDER" v={g("sales_order")} />
                  <F l="COMMITTED" v={g("customer_committed_delivery_")} />
                  <F l="EXPECTED END" v={g("expected_end_date")} />
                  <F l="PERCENT COMPLETE" v={g("percent_complete")} />
                </div>
                {String(peek.short_summary_description ?? "").trim() && (
                  <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, color: C.ink }}>
                    {String(peek.short_summary_description)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-4">
                  <a href={`/project/${encodeURIComponent(num)}`} target="_blank" rel="noreferrer"
                    className="rounded px-4 py-2 text-sm font-bold"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    Open the project ↗
                  </a>
                  <button onClick={() => setPeek(null)} className="rounded px-3 py-2 text-sm font-bold"
                    style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Close</button>
                  <span className="ml-auto text-xs" style={{ color: C.sub }}>opens in a new tab</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>

  );
}
