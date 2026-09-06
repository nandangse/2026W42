"use client";

/**
 * Vishwakarma — the Design Team's workroom (Dr Raghu, 28 Aug 2026):
 * "references, ideas, problem solving, getting into root causes, planning
 * how they complete the projects; use me [Genie] for solutions, and
 * Consult Raghu for reviews."
 *
 * Five ways of thinking, one door each: References (the library), Ideas
 * (caught raw, grown deliberately), Problems (driven to root cause through
 * the Five Whys), Design Plans (what design owes each job, by when), and
 * the Review bench (Consult Raghu's read, a human's verdict).
 */

import { useCallback, useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";
import { APP_VERSION } from "@/lib/version";
import ModuleMenu from "@/components/ModuleMenu";
import PlaybookScreen from "@/components/Playbook";
import { dmy as fmtD } from "@/lib/fmt";

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A", RED = "#B3261E", GREEN = "#0D7A3F", VIOLET = "#7C3AED";

const SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "plans", label: "Design Plans", icon: "▤" },
  { key: "problems", label: "Problems & Root Causes", icon: "⚙" },
  { key: "ideas", label: "Ideas", icon: "💡" },
  { key: "references", label: "References", icon: "▨" },
  { key: "playbook", label: "Design Playbook", icon: "📖" },
  { key: "reviews", label: "Consult Raghu — Reviews", icon: "🪷" },
];

type Row = Record<string, unknown> & { id: string };

const ago = (at: unknown) => new Date(String(at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function useReg(kind: string): [Row[] | null, { id: string; tag: string }[], boolean, () => void] {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [jobs, setJobs] = useState<{ id: string; tag: string }[]>([]);
  const [installed, setInstalled] = useState(true);
  const load = useCallback(() => {
    fetch(`/api/vishwakarma/reg?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setJobs(j.jobs || []); setInstalled(j.installed !== false); })
      .catch(() => setRows([]));
  }, [kind]);
  useEffect(() => { load(); }, [load]);
  return [rows, jobs, installed, load];
}
async function saveReg(kind: string, action: string, id: string | undefined, row: Record<string, unknown>): Promise<string> {
  const r = await fetch("/api/vishwakarma/reg", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, action, id, row }),
  });
  if (!r.ok) return (await r.json()).error || "Could not save";
  return "";
}

const StatusChip = ({ s: st, palette }: { s: string; palette: Record<string, string> }) => (
  <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: palette[st] ?? MUTED }}>{st.replace("_", " ")}</span>
);
const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{children}</th>
);
const Shell = ({ title, blurb, onAdd, addLabel = "+ Add", children, installed }: {
  title: string; blurb: string; onAdd?: () => void; addLabel?: string; children: React.ReactNode; installed: boolean;
}) => (
  <div style={{ maxWidth: 1050 }}>
    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
      <div>
        <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
        <div className="text-sm" style={{ color: "#5A6672", maxWidth: 680, lineHeight: 1.5 }}>{blurb}</div>
      </div>
      {onAdd && <button onClick={onAdd} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>{addLabel}</button>}
    </div>
    {!installed && (
      <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
        Run migration 0084 first — Vishwakarma&apos;s tables don&apos;t exist yet.
      </div>
    )}
    {children}
  </div>
);
const Box = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh", maxWidth: wide ? 1050 : 950 }}>
    <table className="w-full text-xs" style={{ minWidth: 720, borderCollapse: "separate", borderSpacing: 0 }}>{children}</table>
  </div>
);
const Modal = ({ onClose, children, width = 640 }: { onClose: () => void; children: React.ReactNode; width?: number }) => (
  <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: width, maxHeight: "90vh", overflow: "auto" }}>
      {children}
    </div>
  </div>
);
const L = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-xs font-bold mb-0.5" style={{ color: MUTED }}>{children}</span>
);
const inputCss = { borderColor: BORDER } as const;

/** The Genie/Raghu answer, worn as a card. */
const Counsel = ({ title, text, colour }: { title: string; text: string; colour: string }) => (
  <div className="rounded border p-3 mt-2" style={{ borderColor: colour, borderLeftWidth: 3 }}>
    <div className="text-xs font-bold mb-1" style={{ color: colour, letterSpacing: 0.8 }}>{title}</div>
    <div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: INK }}>{text}</div>
  </div>
);

// ============================ PROBLEMS ============================
const PROBLEM_STATUS = { open: RED, analysing: "#D97706", countermeasure: "#1B6B93", verified: "#7A8A1E", closed: GREEN };
function ProblemsScreen() {
  const [rows, jobs, installed, load] = useReg("problem");
  const [open, setOpen] = useState<Row | "new" | null>(null);
  return (
    <Shell installed={installed} title="Problems & Root Causes" onAdd={() => setOpen("new")} addLabel="+ Raise a problem"
      blurb="A problem is not solved until its root cause is named and its countermeasure is verified. The Five Whys walk you down; Genie works the causes; Consult Raghu reviews the answer.">
      <Box>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>Problem</Th><Th>Job / machine</Th><Th>Owner</Th><Th>Root cause</Th><Th>Raised</Th>
        </tr></thead>
        <tbody>
          {rows?.length === 0 && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>No problems raised — when one appears on the floor, it belongs here within the hour.</td></tr>)}
          {(rows || []).map((r, i) => (
            <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
              <td className="px-2 py-1.5"><StatusChip s={String(r.status)} palette={PROBLEM_STATUS} /></td>
              <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.title)}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.job || "")} {String(r.machine || "")}</td>
              <td className="px-2 py-1.5">{String(r.owner || "—")}</td>
              <td className="px-2 py-1.5" style={{ color: r.root_cause ? GREEN : MUTED }}>{r.root_cause ? "named ✓" : "not yet"}</td>
              <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{ago(r.at)}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      {open && <ProblemBox row={open === "new" ? null : open} jobs={jobs} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}

function ProblemBox({ row, jobs, onClose, onSaved }: { row: Row | null; jobs: { id: string; tag: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    title: String(row?.title ?? ""), job: String(row?.job ?? ""), machine: String(row?.machine ?? ""),
    description: String(row?.description ?? ""), whys: [...((row?.whys as string[]) ?? []), "", "", "", "", ""].slice(0, 5),
    root_cause: String(row?.root_cause ?? ""), countermeasure: String(row?.countermeasure ?? ""),
    status: String(row?.status ?? "open"), owner: String(row?.owner ?? ""),
  }));
  const [genie, setGenie] = useState(String(row?.genie ?? ""));
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const save = async (extra: Record<string, unknown> = {}) => {
    setErr("");
    const payload = { ...f, whys: f.whys.filter(Boolean), ...extra };
    const e = await saveReg("problem", row ? "update" : "add", row?.id, payload);
    if (e) { setErr(e); return false; }
    return true;
  };
  const askGenie = async () => {
    if (!row) { setErr("Save the problem first — Genie reads what is written."); return; }
    setBusy("genie"); setErr("");
    await save();
    const r = await fetch("/api/vishwakarma/genie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "solve", id: row.id }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error || "Genie could not answer"); else setGenie(j.text);
    setBusy("");
  };
  const sendReview = async () => {
    if (!row) { setErr("Save the problem first."); return; }
    const q = window.prompt("Your question to Consult Raghu (optional):") ?? "";
    setBusy("review"); setErr("");
    await save();
    const r = await fetch("/api/vishwakarma/genie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "review", kind: "problem", id: row.id, question: q }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error || "The review bench refused"); else { setErr(""); window.alert("Sent to the review bench — Consult Raghu has read it; the verdict awaits a human hand."); }
    setBusy("");
  };
  return (
    <Modal onClose={onClose} width={720}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The problem" : "Raise a problem"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div><L>What is wrong, in one line</L>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div className="flex gap-2">
          <div className="flex-1"><L>Job</L>
            <input list="vw-jobs" value={f.job} onChange={(e) => setF({ ...f, job: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} />
            <datalist id="vw-jobs">{jobs.map((j) => (<option key={j.id} value={`${j.id} · ${j.tag}`} />))}</datalist></div>
          <div className="flex-1"><L>Machine / assembly</L>
            <input value={f.machine} onChange={(e) => setF({ ...f, machine: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div className="flex-1"><L>Owner</L>
            <input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div><L>What happened — observations, numbers, photos&apos; story</L>
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div><L>The Five Whys — each answer feeds the next question</L>
          {f.whys.map((w, i) => (
            <input key={i} value={w} placeholder={`Why ${i + 1}?`}
              onChange={(e) => setF({ ...f, whys: f.whys.map((x, j) => (j === i ? e.target.value : x)) })}
              className="w-full border rounded px-2 py-1 text-sm mb-1" style={{ ...inputCss, marginLeft: i * 10, width: `calc(100% - ${i * 10}px)` }} />
          ))}</div>
        <div className="flex gap-2">
          <div className="flex-1"><L>Root cause, named</L>
            <input value={f.root_cause} onChange={(e) => setF({ ...f, root_cause: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div className="flex-1"><L>Countermeasure</L>
            <input value={f.countermeasure} onChange={(e) => setF({ ...f, countermeasure: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div><L>Status</L>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white" style={inputCss}>
              {Object.keys(PROBLEM_STATUS).map((st) => (<option key={st}>{st}</option>))}
            </select></div>
        </div>
        {genie && <Counsel title="✨ GENIE — THE ENGINEER'S READ" text={genie} colour={VIOLET} />}
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1 flex-wrap">
          <button onClick={async () => { if (await save()) onSaved(); }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          <button onClick={askGenie} disabled={!!busy} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "#F3EEFB", color: VIOLET }}>
            {busy === "genie" ? "Genie is thinking…" : "✨ Ask Genie for solutions"}
          </button>
          <button onClick={sendReview} disabled={!!busy} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "#FDF3E1", color: "#8A6D1A" }}>
            {busy === "review" ? "On the bench…" : "🪷 Send to Consult Raghu"}
          </button>
          {row && <button onClick={async () => { if (window.confirm("Remove this problem?")) { await saveReg("problem", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============================ IDEAS ============================
const IDEA_STATUS = { raw: MUTED, exploring: "#1B6B93", adopted: GREEN, parked: "#7A5E1E" };
function IdeasScreen() {
  const [rows, , installed, load] = useReg("idea");
  const [open, setOpen] = useState<Row | "new" | null>(null);
  return (
    <Shell installed={installed} title="Ideas" onAdd={() => setOpen("new")} addLabel="+ Catch an idea"
      blurb="Caught raw in two lines, grown deliberately: Genie prices the worth, names the risks and designs the cheapest experiment that proves or kills it.">
      <Box>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>Idea</Th><Th>By</Th><Th>Caught</Th><Th>Genie</Th>
        </tr></thead>
        <tbody>
          {rows?.length === 0 && (<tr><td colSpan={5} className="px-3 py-5 text-center" style={{ color: MUTED }}>No ideas caught yet — the first one is a two-line note away.</td></tr>)}
          {(rows || []).map((r, i) => (
            <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
              <td className="px-2 py-1.5"><StatusChip s={String(r.status)} palette={IDEA_STATUS} /></td>
              <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.title)}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.by || "").split("@")[0]}</td>
              <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{ago(r.at)}</td>
              <td className="px-2 py-1.5" style={{ color: r.genie ? VIOLET : MUTED }}>{r.genie ? "grown ✨" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      {open && <IdeaBox row={open === "new" ? null : open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}
function IdeaBox({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    title: String(row?.title ?? ""), detail: String(row?.detail ?? ""),
    value_note: String(row?.value_note ?? ""), status: String(row?.status ?? "raw"),
  }));
  const [genie, setGenie] = useState(String(row?.genie ?? ""));
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const save = async () => { const e = await saveReg("idea", row ? "update" : "add", row?.id, f); if (e) { setErr(e); return false; } return true; };
  const develop = async () => {
    if (!row) { setErr("Save the idea first."); return; }
    setBusy("genie"); await save();
    const r = await fetch("/api/vishwakarma/genie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "develop", id: row.id }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error || "Genie could not answer"); else setGenie(j.text);
    setBusy("");
  };
  const sendReview = async () => {
    if (!row) { setErr("Save the idea first."); return; }
    const q = window.prompt("Your question to Consult Raghu (optional):") ?? "";
    setBusy("review"); await save();
    const r = await fetch("/api/vishwakarma/genie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "review", kind: "idea", id: row.id, question: q }) });
    if (!r.ok) setErr((await r.json()).error || "The review bench refused"); else window.alert("Sent to the review bench.");
    setBusy("");
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The idea" : "Catch an idea"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div><L>The idea, in one line</L><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div><L>Detail</L><textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div className="flex gap-2">
          <div className="flex-1"><L>Why it is worth something</L><input value={f.value_note} onChange={(e) => setF({ ...f, value_note: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div><L>Status</L>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white" style={inputCss}>
              {Object.keys(IDEA_STATUS).map((st) => (<option key={st}>{st}</option>))}
            </select></div>
        </div>
        {genie && <Counsel title="✨ GENIE — GROWING THE IDEA" text={genie} colour={VIOLET} />}
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1 flex-wrap">
          <button onClick={async () => { if (await save()) onSaved(); }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          <button onClick={develop} disabled={!!busy} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "#F3EEFB", color: VIOLET }}>{busy === "genie" ? "Genie is thinking…" : "✨ Grow it with Genie"}</button>
          <button onClick={sendReview} disabled={!!busy} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "#FDF3E1", color: "#8A6D1A" }}>{busy === "review" ? "On the bench…" : "🪷 Send to Consult Raghu"}</button>
          {row && <button onClick={async () => { if (window.confirm("Remove this idea?")) { await saveReg("idea", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============================ REFERENCES ============================
function ReferencesScreen() {
  const [rows, , installed, load] = useReg("reference");
  const [open, setOpen] = useState<Row | "new" | null>(null);
  const [q, setQ] = useState("");
  const shown = (rows || []).filter((r) => !q || `${r.title} ${r.category} ${r.tags}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell installed={installed} title="References" onAdd={() => setOpen("new")} addLabel="+ Add a reference"
      blurb="The library the drawings lean on — standards, proven details, supplier catalogues, past designs. A link and two honest lines each.">
      <div className="mb-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 title, category or tag" className="px-2 py-1 rounded border text-sm" style={{ ...inputCss, minWidth: 260 }} /></div>
      <Box>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Reference</Th><Th>Category</Th><Th>Tags</Th><Th>Link</Th><Th>By</Th>
        </tr></thead>
        <tbody>
          {shown.length === 0 && (<tr><td colSpan={5} className="px-3 py-5 text-center" style={{ color: MUTED }}>The library is empty — the first standard someone reaches for twice belongs here.</td></tr>)}
          {shown.map((r, i) => (
            <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
              <td className="px-2 py-1.5 font-semibold">{String(r.title)}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.category || "—")}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.tags || "—")}</td>
              <td className="px-2 py-1.5">{r.link ? <a href={String(r.link)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-bold" style={{ color: "#1B3A5C" }}>open ↗</a> : "—"}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.by || "").split("@")[0]}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      {open && (
        <RefBox row={open === "new" ? null : open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
      )}
    </Shell>
  );
}
function RefBox({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    title: String(row?.title ?? ""), category: String(row?.category ?? ""), link: String(row?.link ?? ""),
    notes: String(row?.notes ?? ""), tags: String(row?.tags ?? ""),
  }));
  const [err, setErr] = useState("");
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The reference" : "Add a reference"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div><L>Title</L><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div className="flex gap-2">
          <div className="flex-1"><L>Category</L><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Standard · Hydraulics · Past design…" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div className="flex-1"><L>Tags</L><input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div><L>Link (Drive, site, anywhere)</L><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div><L>Notes — what to use it for, what to beware of</L><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={async () => { const e = await saveReg("reference", row ? "update" : "add", row?.id, f); if (e) setErr(e); else onSaved(); }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          {row && <button onClick={async () => { if (window.confirm("Remove this reference?")) { await saveReg("reference", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============================ DESIGN PLANS ============================
const PLAN_STATUS = { pending: MUTED, in_progress: "#1B6B93", done: GREEN };
/**
 * The Design Plans PROJECT grid (Dr Raghu, 28 Aug 2026): "Project (Design
 * Stage on next line as a drop down) — Jobs (all jobs one per line) — Design
 * Owner — Project Plan (lightbox popup) — Next Milestone — No of Issues to
 * Design — Issues — Design Support needed."
 */
interface ProjRow {
  id: string; mgr: string; erp_stage: string; description: string;
  design_stage: string; design_owner: string; support_needed: string;
  bom_pct: number | null; manuf_pct: number | null; sort_order: number | null;
  design_total: number; design_done: number;
  jobs: { id: string; tag: string }[];
  next: { title: string; job: string | null } | null; done: number; total: number;
  issues: { id: string; title: string; who: string; due: string | null; esc: string; open: boolean }[];
  deliverables: Row[];
}
interface WeekRow { id: string; on_date: string; designer: string; work: string; project_id: string | null; stage: string | null; by: string | null }
const WORK_STAGES = ["GAD", "BOM", "Manuf", "As Built", "Other"];

/** His summary buckets (28 Aug 2026): GAD — BOM — Manuf — As Built. */
const STAGE_BUCKETS: [string, RegExp][] = [
  ["GAD", /kickoff|gad/i], ["BOM", /tbom|full bom/i], ["Manuf", /manuf/i], ["As Built", /as built/i],
];

function PlansScreen() {
  const [data, setData] = useState<{ installed: boolean; stages: string[]; owners: string[]; rows: ProjRow[]; week: WeekRow[] } | null>(null);
  const [planFor, setPlanFor] = useState<ProjRow | null>(null);
  const [supportFor, setSupportFor] = useState<ProjRow | null>(null);
  const [addDeliv, setAddDeliv] = useState<Row | "new" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [stripOpen, setStripOpen] = useState(true);
  const [calOpen, setCalOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [q, setQ] = useState("");
  const [, jobsList, , reloadReg] = useReg("plan");

  const load = useCallback(() => {
    fetch("/api/vishwakarma/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j.rows ? j : { installed: j.installed !== false, stages: [], owners: [], rows: [], week: [] }))
      .catch(() => setData({ installed: true, stages: [], owners: [], rows: [], week: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (pid: string, patch: Record<string, unknown>) => {
    await fetch("/api/vishwakarma/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: pid, patch }),
    });
    load();
  };
  const move = async (pid: string, dir: -1 | 1) => {
    await fetch("/api/vishwakarma/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move", project_id: pid, dir, order: (data?.rows || []).map((r) => r.id) }),
    });
    load();
  };

  const allRows = data?.rows || [];
  const needle = q.trim().toLowerCase();
  const rows = allRows.filter((r) =>
    (ownerFilter === "all" || (ownerFilter === "—" ? !r.design_owner : r.design_owner === ownerFilter))
    && (!needle
      || r.id.toLowerCase().includes(needle)
      || r.description.toLowerCase().includes(needle)
      || r.jobs.some((j) => j.id.includes(needle) || j.tag.toLowerCase().includes(needle))));
  const filtered = ownerFilter !== "all" || needle !== "";

  // Design Engineer — GAD · BOM · Manuf · As Built, totals below (his strip).
  const strip = (() => {
    const by = new Map<string, number[]>();
    for (const r of allRows) {
      const eng = r.design_owner || "— unassigned";
      const arr = by.get(eng) || [0, 0, 0, 0];
      STAGE_BUCKETS.forEach(([, re], i) => { if (re.test(r.design_stage)) arr[i] += 1; });
      by.set(eng, arr);
    }
    return [...by.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  })();
  const stripTotals = STAGE_BUCKETS.map((_, i) => strip.reduce((s2, [, arr]) => s2 + arr[i], 0));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Design Plans</div>
          <div className="text-sm" style={{ color: "#5A6672", maxWidth: 720, lineHeight: 1.5 }}>
            One row per live project. The order is YOURS — the arrows move a row, nothing else sorts it.
            Issues come from the Tasking where the project&apos;s jobs carry a design point.
          </div>
        </div>
        <button onClick={() => setAddDeliv("new")} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>+ Add a deliverable</button>
      </div>
      {data?.installed === false && (
        <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run migrations 0085 and 0089 — the grid saves its words there.
        </div>
      )}

      {/* filters (Dr Raghu, 28 Aug 2026): the designer, and a search that
          reads project number, the one-sentence name, and the jobs */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-white font-semibold"
          style={{ borderColor: ownerFilter === "all" ? BORDER : ORANGE }}>
          <option value="all">All design owners</option>
          <option value="—">— unassigned</option>
          {(data?.owners || []).map((o) => (<option key={o}>{o}</option>))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, name, job…"
          className="border rounded px-2 py-1 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 240 }} />
        {filtered && (
          <span className="text-xs" style={{ color: MUTED }}>
            {rows.length} of {allRows.length} · <button onClick={() => { setOwnerFilter("all"); setQ(""); }} style={{ color: ORANGE, fontWeight: 700 }}>clear</button> · ordering arrows sleep while filtered
          </span>
        )}
      </div>

      {/* the engineer strip — GAD · BOM · Manuf · As Built, totals below */}
      {allRows.length > 0 && (
        <div className="bg-white rounded-lg border mb-2 overflow-auto" style={{ borderColor: BORDER, maxWidth: 560 }}>
          <button onClick={() => setStripOpen((v) => !v)} className="w-full text-left px-2 py-1.5 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>
            {stripOpen ? "▾" : "▸"} DESIGN ENGINEER — GAD · BOM · MANUF · AS BUILT
          </button>
          {stripOpen && (
          <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 420 }}>
            <thead><tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-1.5 text-left">Design Engineer</th>
              {STAGE_BUCKETS.map(([lbl]) => (<th key={lbl} className="px-2 py-1.5 text-right">{lbl}</th>))}
            </tr></thead>
            <tbody>
              {strip.map(([eng, arr], i) => (
                <tr key={eng} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1 font-semibold">{eng}</td>
                  {arr.map((n, j) => (<td key={j} className="px-2 py-1 text-right tnum">{n || "·"}</td>))}
                </tr>
              ))}
              <tr className="border-t font-bold" style={{ borderColor: "#22303C", background: "#F3F1EB" }}>
                <td className="px-2 py-1">TOTAL</td>
                {stripTotals.map((n, j) => (<td key={j} className="px-2 py-1 text-right tnum">{n || "·"}</td>))}
              </tr>
            </tbody>
          </table>
          )}
        </div>
      )}

      <div className="flex gap-3 items-start flex-wrap">
        {/* ------------ the grid ------------ */}
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh", flex: "1 1 720px", minWidth: 0 }}>
          <table className="w-full text-xs" style={{ minWidth: 1200, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, left: 0, background: "#22303C", zIndex: 3, minWidth: 260 }}>Project</th>
              {["Jobs", "Design Plan", "Next Milestone", "Issues to Design", "Design Support", "BOM %", "Manuf Drg %", "Order"].map((h) => (
                <th key={h} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, background: "#22303C", zIndex: 2 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data && rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>{filtered ? "Nothing matches the filter." : "No live projects — a project appears here the moment an active job stands on it."}</td></tr>
              )}
              {!data && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>)}
              {rows.map((p, i) => {
                const openIssues = p.issues.filter((x) => x.open);
                return (
                  <tr key={p.id} className="border-t align-top" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    {/* FROZEN (Dr Raghu, 28 Aug 2026): the project always in
                        sight — number, PM, designer, stage, and the ONE
                        SENTENCE that says what it is and where it goes. */}
                    <td className="px-2 py-2" style={{ position: "sticky", left: 0, zIndex: 1, background: i % 2 ? "#FAF9F5" : "#fff", minWidth: 260, maxWidth: 280, boxShadow: "2px 0 4px rgba(22,35,47,0.06)" }}>
                      <div className="font-bold" style={{ color: INK, fontSize: 13 }}>{p.id}</div>
                      {p.mgr && <div style={{ color: MUTED, fontSize: 10 }}>PM: {p.mgr}</div>}
                      <input list="vw-owners" value={drafts[`o:${p.id}`] ?? p.design_owner}
                        placeholder="designer — type or pick…"
                        onChange={(e) => setDrafts((d) => ({ ...d, [`o:${p.id}`]: e.target.value }))}
                        onBlur={(e) => { if (e.target.value !== p.design_owner) void save(p.id, { design_owner: e.target.value }); }}
                        className="w-full border rounded px-1.5 py-0.5 text-xs mt-1" style={{ borderColor: BORDER }} />
                      <select value={p.design_stage} onChange={(e) => void save(p.id, { design_stage: e.target.value })}
                        className="mt-1 border rounded px-1 py-0.5 text-xs bg-white w-full"
                        style={{ borderColor: p.design_stage ? BORDER : ORANGE, fontWeight: 700, color: p.design_stage ? INK : MUTED }}>
                        <option value="">design stage…</option>
                        {(data?.stages || []).map((st) => (<option key={st}>{st}</option>))}
                      </select>
                      <input value={drafts[`d:${p.id}`] ?? p.description}
                        placeholder="one sentence — what, which product, going where…"
                        onChange={(e) => setDrafts((d) => ({ ...d, [`d:${p.id}`]: e.target.value }))}
                        onBlur={(e) => { if (e.target.value !== p.description) void save(p.id, { description: e.target.value }); }}
                        className="w-full border rounded px-1.5 py-0.5 text-xs mt-1" style={{ borderColor: (drafts[`d:${p.id}`] ?? p.description) ? BORDER : ORANGE, fontStyle: "italic" }} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap" style={{ lineHeight: 1.8 }}>
                      {p.jobs.map((j) => (
                        <div key={j.id}>
                          <a href="/" target="_blank" rel="noreferrer" title={j.tag}
                            style={{ color: "#2C5B82", fontWeight: 700, textDecoration: "underline" }}>{j.id.slice(-4)}</a>
                        </div>
                      ))}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button onClick={() => setPlanFor(p)} className="rounded border px-2 py-1 font-bold" style={{ borderColor: BORDER, color: VIOLET }}>
                        ▤ Plan{p.design_total > 0 && <span style={{ color: MUTED, fontWeight: 400 }}> · {p.design_done}/{p.design_total}</span>}
                      </button>
                    </td>
                    <td className="px-2 py-2" style={{ maxWidth: 160 }}>
                      {p.next ? (<span><b>{p.next.title}</b>{p.next.job && <span style={{ color: MUTED }}> — job {p.next.job}</span>}</span>)
                        : p.total > 0 ? <span style={{ color: GREEN, fontWeight: 700 }}>all milestones done</span>
                        : <span style={{ color: MUTED }}>no plan yet</span>}
                      {p.total > 0 && <div style={{ color: MUTED, fontSize: 10 }}>{p.done}/{p.total} done</div>}
                    </td>
                    <td className="px-2 py-2" style={{ minWidth: 220, maxWidth: 320 }}>
                      {openIssues.length === 0 && <span style={{ color: GREEN, fontWeight: 700 }}>clear</span>}
                      <div className="flex flex-wrap gap-1">
                        {openIssues.map((x) => (
                          <div key={x.id} className="rounded border px-1.5 py-1"
                            style={{ borderColor: RED, background: "#FBEAE8", maxWidth: 150, lineHeight: 1.35 }}
                            title={`${x.who}${x.due ? ` · due ${fmtD(x.due)}` : ""}${x.esc !== "None" ? ` · ${x.esc}` : ""}`}>
                            <div className="font-bold" style={{ color: "#8E2C20", fontSize: 10.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{x.title}</div>
                            <div style={{ color: "#8E2C20", fontSize: 9.5 }}>{x.who || "—"}{x.due ? ` · ${fmtD(x.due)}` : ""}{x.esc !== "None" ? ` · ${x.esc}` : ""}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button onClick={() => setSupportFor(p)} className="rounded border px-2 py-1 font-bold" style={{ borderColor: ORANGE, color: ORANGE }}
                        title="Files a task — to RJ, escalation L2, due in 3 days">
                        ＋ Task to RJ
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <PctBox value={p.bom_pct} onSave={(v) => void save(p.id, { bom_pct: v })} />
                    </td>
                    <td className="px-2 py-2">
                      <PctBox value={p.manuf_pct} onSave={(v) => void save(p.id, { manuf_pct: v })} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button onClick={() => void move(p.id, -1)} disabled={filtered || i === 0} title={filtered ? "Clear the filter to reorder" : "Move up"} style={{ color: filtered || i === 0 ? "#D5D2C8" : INK, fontWeight: 700 }}>↑</button>
                      <button onClick={() => void move(p.id, 1)} disabled={filtered || i === rows.length - 1} title={filtered ? "Clear the filter to reorder" : "Move down"} className="ml-1" style={{ color: filtered || i === rows.length - 1 ? "#D5D2C8" : INK, fontWeight: 700 }}>↓</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="vw-owners">{(data?.owners || []).map((o) => (<option key={o} value={o} />))}</datalist>
        </div>

        {/* ------------ this week's working ------------ */}
        <WeekPanel week={data?.week || []} owners={data?.owners || []} projects={allRows.map((r) => r.id)} onChanged={load}
          calOpen={calOpen} onToggleCal={() => setCalOpen((v) => !v)} />
      </div>

      {/* the LOAD CALENDAR (Dr Raghu, 28 Aug 2026): Designer × Date, a ＋ in
          every cell — project and stage per day, the week's load in one look */}
      {calOpen && <LoadCalendar week={data?.week || []} owners={data?.owners || []} projects={allRows.map((r) => r.id)} onChanged={load} />}

      {planFor && <ProjectPlanBox p={planFor} onClose={() => setPlanFor(null)} onSaved={() => { setPlanFor(null); load(); }} />}
      {supportFor && <SupportBox p={supportFor} onClose={() => setSupportFor(null)} onSaved={() => { setSupportFor(null); load(); }} />}
      {addDeliv && <PlanBox row={addDeliv === "new" ? null : addDeliv} jobs={jobsList} onClose={() => setAddDeliv(null)} onSaved={() => { setAddDeliv(null); reloadReg(); load(); }} />}
    </div>
  );
}

/** A percentage, typed plainly, saved on blur. */
function PctBox({ value, onSave }: { value: number | null; onSave: (v: string) => void }) {
  const [t, setT] = useState(value == null ? "" : String(value));
  useEffect(() => { setT(value == null ? "" : String(value)); }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input value={t} onChange={(e) => setT(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => { if (t !== (value == null ? "" : String(value))) onSave(t); }}
        className="border rounded px-1.5 py-1 text-xs text-right tnum" style={{ borderColor: BORDER, width: 52 }} />
      <span style={{ color: MUTED }}>%</span>
    </div>
  );
}

/** DESIGN SUPPORT NEEDED, filed as a real task — his defaults: RJ, L2,
 *  due in three days. It lands in the main Tasking, where he correlates. */
function SupportBox({ p, onClose, onSaved }: { p: ProjRow; onClose: () => void; onSaved: () => void }) {
  const plus3 = new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [f, setF] = useState({ title: "", detail: "", job_id: p.jobs[0]?.id || "", due: plus3 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} width={520}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>Design support needed — {p.id}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2 text-sm">
        <div><L>What support is needed</L>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full border rounded px-2 py-1.5" style={inputCss} /></div>
        <div><L>Details</L>
          <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={3} className="w-full border rounded px-2 py-1.5" style={inputCss} /></div>
        <div className="flex gap-2">
          <div><L>Job</L>
            <select value={f.job_id} onChange={(e) => setF({ ...f, job_id: e.target.value })} className="border rounded px-2 py-1.5 bg-white" style={inputCss}>
              {p.jobs.map((j) => (<option key={j.id} value={j.id}>{j.id.slice(-4)} · {j.tag}</option>))}
            </select></div>
          <div><L>Due</L>
            <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className="border rounded px-2 py-1.5 tnum" style={inputCss} /></div>
        </div>
        <div className="text-xs" style={{ color: MUTED }}>Files as a task: assigned to <b>RJ</b>, escalation <b>L2</b>, category Design — it shows in the main Tasking and back here under Issues.</div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button disabled={busy} onClick={async () => {
            setBusy(true); setErr("");
            const r = await fetch("/api/vishwakarma/projects", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "support_task", project_id: p.id, ...f }),
            });
            setBusy(false);
            if (!r.ok) setErr((await r.json()).error || "Could not file it"); else onSaved();
          }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>💾 File the task</button>
        </div>
      </div>
    </Modal>
  );
}

/** THIS WEEK'S WORKING — date, designer, work — each tied to its project. */
function WeekPanel({ week, owners, projects, onChanged, calOpen, onToggleCal }: {
  week: WeekRow[]; owners: string[]; projects: string[]; onChanged: () => void;
  calOpen: boolean; onToggleCal: () => void;
}) {
  const [f, setF] = useState({ on_date: TODAY(), designer: "", work: "", project_id: "", stage: "" });
  const [busy, setBusy] = useState(false);
  const monday = (() => { const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); })();
  const shown = week.filter((w) => w.on_date >= monday);
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER, flex: "0 1 300px", minWidth: 260 }}>
      <div className="flex items-center mb-1">
        <span className="text-xs font-bold" style={{ color: VIOLET, letterSpacing: 0.8 }}>THIS WEEK&apos;S WORKING</span>
        <button onClick={onToggleCal} className="ml-auto rounded border px-2 py-0.5 text-xs font-bold"
          style={calOpen ? { background: VIOLET, color: "#fff", borderColor: VIOLET } : { color: VIOLET, borderColor: BORDER }}
          title="Designer × date — the week's load in one look">▦ Load view</button>
      </div>
      {shown.length === 0 && <div className="text-sm mb-1" style={{ color: MUTED }}>Nothing yet — the first record starts the week.</div>}
      {shown.map((w) => (
        <div key={w.id} className="border-t py-1.5 text-sm" style={{ borderColor: "#EFEDE7" }}>
          <div className="flex items-center gap-2">
            <b className="tnum" style={{ fontSize: 11 }}>{fmtD(w.on_date)}</b>
            <span className="font-semibold" style={{ color: "#1B6B93" }}>{w.designer || "—"}</span>
            <button className="ml-auto" title="Remove" style={{ color: MUTED }}
              onClick={async () => {
                if (!window.confirm("Remove this record?")) return;
                await fetch("/api/vishwakarma/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "week_delete", id: w.id }) });
                onChanged();
              }}>✕</button>
          </div>
          {(w.project_id || w.stage) && (
            <div style={{ fontSize: 10.5 }}>
              <b style={{ color: VIOLET }}>{w.project_id || ""}</b>{w.project_id && w.stage ? " · " : ""}<b>{w.stage || ""}</b>
            </div>
          )}
          <div style={{ lineHeight: 1.5 }}>{w.work}</div>
        </div>
      ))}
      <div className="border-t mt-1 pt-2 space-y-1.5" style={{ borderColor: BORDER }}>
        <div className="flex gap-1">
          <input type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} className="border rounded px-1.5 py-1 text-xs tnum" style={{ borderColor: BORDER, width: 118 }} />
          <input list="vw-owners" value={f.designer} onChange={(e) => setF({ ...f, designer: e.target.value })} placeholder="designer" className="flex-1 border rounded px-1.5 py-1 text-xs" style={{ borderColor: BORDER, minWidth: 0 }} />
        </div>
        <div className="flex gap-1">
          <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className="flex-1 border rounded px-1 py-1 text-xs bg-white" style={{ borderColor: BORDER, minWidth: 0 }}>
            <option value="">project…</option>
            {projects.map((pj) => (<option key={pj}>{pj}</option>))}
          </select>
          <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} className="border rounded px-1 py-1 text-xs bg-white" style={{ borderColor: BORDER, width: 86 }}>
            <option value="">stage…</option>
            {WORK_STAGES.map((st) => (<option key={st}>{st}</option>))}
          </select>
        </div>
        <textarea value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} placeholder="work to be done…" rows={2} className="w-full border rounded px-1.5 py-1 text-xs" style={{ borderColor: BORDER }} />
        <button disabled={busy || !f.work.trim()} onClick={async () => {
          setBusy(true);
          await fetch("/api/vishwakarma/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "week_add", ...f }) });
          setBusy(false); setF({ on_date: TODAY(), designer: f.designer, work: "", project_id: f.project_id, stage: "" }); onChanged();
        }} className="w-full rounded py-1 text-xs font-bold text-white" style={{ background: busy || !f.work.trim() ? "#B9BEC4" : ORANGE }}>＋ Add a record</button>
      </div>
    </div>
  );
}

/**
 * THE LOAD CALENDAR (Dr Raghu, 28 Aug 2026): Designer down the side, the
 * week's dates across, a ＋ in every cell — each entry names the project and
 * the stage (GAD · BOM · Manuf · As Built). "This will give the load
 * visibility."
 */
function LoadCalendar({ week, owners, projects, onChanged }: { week: WeekRow[]; owners: string[]; projects: string[]; onChanged: () => void }) {
  const addD = (iso: string, n: number) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const today = TODAY();
  const monday = (() => { const d = new Date(today + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; return addD(today, -dow); })();
  const [weekStart, setWeekStart] = useState(monday);
  const days = Array.from({ length: 7 }, (_, i) => addD(weekStart, i));
  const [adding, setAdding] = useState<{ designer: string; on_date: string } | null>(null);
  const [f, setF] = useState({ project_id: "", stage: "", work: "" });
  const [busy, setBusy] = useState(false);

  const designers = [...new Set([...owners, ...week.map((w) => w.designer).filter(Boolean)])].sort();
  const cell = (eng: string, d: string) => week.filter((w) => w.designer === eng && w.on_date === d);
  const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });

  return (
    <div className="bg-white rounded-lg border mt-3 overflow-auto" style={{ borderColor: BORDER }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-bold" style={{ color: VIOLET, letterSpacing: 0.8 }}>LOAD — DESIGNER × DATE</span>
        <button onClick={() => setWeekStart(addD(weekStart, -7))} className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: BORDER, color: INK }}>‹ prev</button>
        <button onClick={() => setWeekStart(monday)} className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: weekStart === monday ? VIOLET : BORDER, color: weekStart === monday ? VIOLET : INK }}>this week</button>
        <button onClick={() => setWeekStart(addD(weekStart, 7))} className="rounded border px-2 py-0.5 text-xs font-bold" style={{ borderColor: BORDER, color: INK }}>next ›</button>
      </div>
      <table className="text-xs" style={{ minWidth: 980, borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <th className="px-2 py-2 text-left" style={{ position: "sticky", left: 0, background: "#22303C", minWidth: 120 }}>Designer</th>
          {days.map((d) => (
            <th key={d} className="px-2 py-2 text-left whitespace-nowrap" style={{ minWidth: 118, opacity: d === today ? 1 : 0.85, borderBottom: d === today ? `2px solid ${ORANGE}` : undefined }}>{dayLabel(d)}</th>
          ))}
        </tr></thead>
        <tbody>
          {designers.length === 0 && (<tr><td colSpan={8} className="px-3 py-4 text-center" style={{ color: MUTED }}>No designers yet.</td></tr>)}
          {designers.map((eng, i) => (
            <tr key={eng} className="border-t align-top" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: i % 2 ? "#FAF9F5" : "#fff", color: INK }}>{eng}</td>
              {days.map((d) => (
                <td key={d} className="px-1.5 py-1.5" style={{ verticalAlign: "top" }}>
                  {cell(eng, d).map((w) => (
                    <div key={w.id} className="rounded border px-1.5 py-1 mb-1" style={{ borderColor: VIOLET, background: "#F5F0FE", lineHeight: 1.3 }} title={w.work}>
                      <div className="font-bold" style={{ color: VIOLET, fontSize: 10 }}>{w.project_id ? w.project_id.replace("NGSE-PROJ-", "P-") : "—"}{w.stage ? ` · ${w.stage}` : ""}</div>
                      {w.work && <div style={{ fontSize: 9.5, color: "#5A6672", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{w.work}</div>}
                    </div>
                  ))}
                  <button onClick={() => { setAdding({ designer: eng, on_date: d }); setF({ project_id: "", stage: "", work: "" }); }}
                    className="rounded border w-full py-0.5 font-bold" style={{ borderColor: "#E5E2DA", color: MUTED }} title={`Add for ${eng}, ${dayLabel(d)}`}>＋</button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {adding && (
        <Modal onClose={() => setAdding(null)} width={420}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: INK }}>{adding.designer} — {dayLabel(adding.on_date)}</div>
            <button onClick={() => setAdding(null)} style={{ color: MUTED }}>✕</button>
          </div>
          <div className="space-y-2 text-sm">
            <div><L>Project</L>
              <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-white" style={inputCss}>
                <option value="">—</option>
                {projects.map((pj) => (<option key={pj}>{pj}</option>))}
              </select></div>
            <div><L>Stage</L>
              <div className="flex gap-1">
                {WORK_STAGES.map((st) => (
                  <button key={st} onClick={() => setF({ ...f, stage: st })}
                    className="rounded-full border px-2.5 py-1 text-xs font-bold"
                    style={f.stage === st ? { background: VIOLET, color: "#fff", borderColor: VIOLET } : { color: MUTED, borderColor: BORDER }}>{st}</button>
                ))}
              </div></div>
            <div><L>Note (optional)</L>
              <input value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} className="w-full border rounded px-2 py-1.5" style={inputCss} /></div>
            <button disabled={busy} onClick={async () => {
              setBusy(true);
              await fetch("/api/vishwakarma/projects", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "week_add", on_date: adding.on_date, designer: adding.designer, ...f }),
              });
              setBusy(false); setAdding(null); onChanged();
            }} className="w-full rounded py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>💾 Add</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * The DESIGN PLAN, worn as a lightbox (Dr Raghu, 28 Aug 2026): "similar like
 * the main plan but only related to Design — design makes it HERE, and it
 * shows in the project THERE." Only three things stand on it: the project's
 * START date, design's own dated stages (Kickoff → GAD → TBOM → Manuf
 * Drawings → Full BOM → As-Built Checks, plus whatever the designer adds),
 * and the project's COMPLETION date. Start and completion are the planning
 * layer's dates — read here, never changed here.
 */
const DESIGN_LADDER = ["Design Kickoff", "Design GAD", "Design TBOM", "Design Manuf Drawings", "Design Full BOM", "As Built Checks"];

function ProjectPlanBox({ p, onClose, onSaved }: { p: ProjRow; onClose: () => void; onSaved: () => void }) {
  // (width raised for the start · end · days row)
  const [data, setData] = useState<{ installed: boolean; start: string | null; completion: string | null } | null>(null);
  const [stages, setStages] = useState<{ title: string; start_date: string; end_date: string; days: string; done: boolean }[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/vishwakarma/projects?plan=${encodeURIComponent(p.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setData({ installed: j.installed !== false, start: j.start ?? null, completion: j.completion ?? null });
        const got = (j.stages || []) as { title: string; start_date: string; end_date: string; days: string; done: boolean }[];
        setStages(got.length ? got : DESIGN_LADDER.map((t) => ({ title: t, start_date: "", end_date: "", days: "", done: false })));
      })
      .catch(() => { setData({ installed: true, start: null, completion: null }); setStages([]); });
  }, [p.id]);

  // The triangle (Dr Raghu, 28 Aug 2026): start + end tells the days;
  // change the days and the end moves; days are INCLUSIVE — start on the
  // 1st, 5 days, end on the 5th.
  const addD = (iso: string, n: number) => {
    const t = new Date(iso + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const diffD = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
  const set = (i: number, patch: Partial<{ title: string; start_date: string; end_date: string; days: string; done: boolean }>) =>
    setStages((st) => st!.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...patch };
      if ("start_date" in patch && n.start_date) {
        if (n.days) n.end_date = addD(n.start_date, Math.max(1, Number(n.days)) - 1);
        else if (n.end_date) n.days = String(Math.max(1, diffD(n.start_date, n.end_date) + 1));
      } else if ("end_date" in patch && n.end_date) {
        if (n.start_date) n.days = String(Math.max(1, diffD(n.start_date, n.end_date) + 1));
      } else if ("days" in patch && n.days) {
        const d = Math.max(1, Number(n.days) || 1);
        if (n.start_date) n.end_date = addD(n.start_date, d - 1);
        else if (n.end_date) n.start_date = addD(n.end_date, -(d - 1));
      }
      return n;
    }));

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/vishwakarma/projects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "design_plan", project_id: p.id, stages }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not save the plan");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const DateChip = ({ label, value }: { label: string; value: string | null }) => (
    <div className="rounded border px-3 py-2" style={{ borderColor: BORDER, background: "#FAF9F5" }}>
      <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
      <div className="text-sm font-bold tnum" style={{ color: value ? INK : MUTED }}>{value ? fmtD(value) : "not set by Planning"}</div>
    </div>
  );

  return (
    <Modal onClose={onClose} width={780}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{p.id} — the design plan</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      {data?.installed === false && (
        <div className="rounded p-2 mb-2 text-xs font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run migration 0088 first — the design plan has nowhere to live yet.
        </div>
      )}
      {!data || !stages ? <div className="text-sm" style={{ color: MUTED }}>loading…</div> : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <DateChip label="PROJECT START" value={data.start} />
            <DateChip label="PROJECT COMPLETION" value={data.completion} />
          </div>
          <div className="text-xs font-bold mb-1" style={{ color: VIOLET, letterSpacing: 0.8 }}>DESIGN STAGES — start · end · days keep each other honest; change any one</div>
          <div className="flex items-center gap-2 py-0.5 text-xs font-bold" style={{ color: MUTED }}>
            <span style={{ width: 13 }} /><span className="flex-1">Stage</span>
            <span style={{ width: 128 }}>Start</span><span style={{ width: 128 }}>End</span><span style={{ width: 52, textAlign: "right" }}>Days</span><span style={{ width: 14 }} />
          </div>
          {stages.map((st, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-t" style={{ borderColor: "#EFEDE7" }}>
              <input type="checkbox" checked={st.done} onChange={(e) => set(i, { done: e.target.checked })} style={{ accentColor: GREEN }} title="Done" />
              <input value={st.title} onChange={(e) => set(i, { title: e.target.value })}
                className="flex-1 border rounded px-2 py-1 text-sm" style={{ borderColor: BORDER, textDecoration: st.done ? "line-through" : "none", color: st.done ? MUTED : INK, minWidth: 0 }} />
              <input type="date" value={st.start_date} onChange={(e) => set(i, { start_date: e.target.value })}
                min={data.start || undefined} max={data.completion || undefined}
                className="border rounded px-1.5 py-1 text-sm tnum" style={{ borderColor: st.start_date ? BORDER : ORANGE, width: 128 }} />
              <input type="date" value={st.end_date} onChange={(e) => set(i, { end_date: e.target.value })}
                min={st.start_date || data.start || undefined} max={data.completion || undefined}
                className="border rounded px-1.5 py-1 text-sm tnum" style={{ borderColor: st.end_date ? BORDER : ORANGE, width: 128 }} />
              <input value={st.days} onChange={(e) => set(i, { days: e.target.value.replace(/[^0-9]/g, "") })}
                className="border rounded px-1.5 py-1 text-sm tnum text-right" style={{ borderColor: BORDER, width: 52 }} title="Inclusive — start on the 1st, 5 days, end on the 5th" />
              <button onClick={() => setStages((x) => x!.filter((_, j) => j !== i))} title="Remove this stage" style={{ color: MUTED }}>✕</button>
            </div>
          ))}
          <button onClick={() => setStages((x) => [...x!, { title: "", start_date: "", end_date: "", days: "", done: false }])}
            className="mt-1 rounded border px-2 py-1 text-xs font-bold" style={{ borderColor: BORDER, color: VIOLET }}>
            ＋ Add a stage
          </button>
          {err && <div className="text-xs font-bold mt-1" style={{ color: RED }}>{err}</div>}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={save} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
              {busy ? "Saving…" : "💾 Save the design plan"}
            </button>
            <span className="text-xs" style={{ color: MUTED }}>Start and completion are Planning&apos;s dates — not changeable here. The stages show on the project&apos;s timeline in Main Genie.</span>
          </div>
        </>
      )}
    </Modal>
  );
}

function PlanBox({ row, jobs, onClose, onSaved }: { row: Row | null; jobs: { id: string; tag: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    job: String(row?.job ?? ""), deliverable: String(row?.deliverable ?? ""), owner: String(row?.owner ?? ""),
    target: String(row?.target ?? "").slice(0, 10), status: String(row?.status ?? "pending"), note: String(row?.note ?? ""),
  }));
  const [err, setErr] = useState("");
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{row ? "The deliverable" : "Add a deliverable"}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1"><L>Job</L>
            <input list="vw-jobs2" value={f.job} onChange={(e) => setF({ ...f, job: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} />
            <datalist id="vw-jobs2">{jobs.map((j) => (<option key={j.id} value={`${j.id} · ${j.tag}`} />))}</datalist></div>
          <div className="flex-1"><L>Owner</L><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        <div><L>What design will deliver</L><input value={f.deliverable} onChange={(e) => setF({ ...f, deliverable: e.target.value })} placeholder="GA drawing rev B · hydraulic calc · BOM release…" className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        <div className="flex gap-2">
          <div><L>Target</L><input type="date" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className="border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
          <div><L>Status</L>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="border rounded px-2 py-1.5 text-sm bg-white" style={inputCss}>
              {Object.keys(PLAN_STATUS).map((st) => (<option key={st}>{st}</option>))}
            </select></div>
          <div className="flex-1"><L>Note</L><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
        </div>
        {err && <div className="text-xs font-bold" style={{ color: RED }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={async () => { const e = await saveReg("plan", row ? "update" : "add", row?.id, f); if (e) setErr(e); else onSaved(); }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Save</button>
          {row && <button onClick={async () => { if (window.confirm("Remove this deliverable?")) { await saveReg("plan", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============================ REVIEWS ============================
function ReviewsScreen({ me }: { me: string }) {
  const [rows, , installed, load] = useReg("review");
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <Shell installed={installed} title="Consult Raghu — the review bench"
      blurb="Anything sent up from a problem, an idea or a plan lands here with Consult Raghu's read already written. The verdict is signed by a human — the AI advises, it never decides.">
      <Box>
        <thead><tr style={{ background: "#22303C", color: "#fff" }}>
          <Th>Status</Th><Th>What</Th><Th>Item</Th><Th>Sent by</Th><Th>When</Th><Th>Verdict</Th>
        </tr></thead>
        <tbody>
          {rows?.length === 0 && (<tr><td colSpan={6} className="px-3 py-5 text-center" style={{ color: MUTED }}>The bench is clear — 🪷 Send to Consult Raghu from any problem or idea puts it here.</td></tr>)}
          {(rows || []).map((r, i) => (
            <tr key={r.id} className="border-t" onClick={() => setOpen(r)} style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}>
              <td className="px-2 py-1.5"><StatusChip s={String(r.status)} palette={{ waiting: "#D97706", reviewed: GREEN }} /></td>
              <td className="px-2 py-1.5 font-bold" style={{ color: MUTED }}>{String(r.source_kind)}</td>
              <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.title)}</td>
              <td className="px-2 py-1.5" style={{ color: MUTED }}>{String(r.by || "").split("@")[0]}</td>
              <td className="px-2 py-1.5 tnum" style={{ color: MUTED }}>{ago(r.at)}</td>
              <td className="px-2 py-1.5" style={{ color: r.verdict ? GREEN : MUTED }}>{r.verdict ? "signed ✓" : "awaited"}</td>
            </tr>
          ))}
        </tbody>
      </Box>
      {open && <ReviewBox row={open} me={me} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}
function ReviewBox({ row, me, onClose, onSaved }: { row: Row; me: string; onClose: () => void; onSaved: () => void }) {
  const [verdict, setVerdict] = useState(String(row.verdict ?? ""));
  const [err, setErr] = useState("");
  return (
    <Modal onClose={onClose} width={720}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm" style={{ color: INK }}>{String(row.source_kind)} · {String(row.title)}</div>
        <button onClick={onClose} style={{ color: MUTED }}>✕</button>
      </div>
      {String(row.question || "") && (
        <div className="text-sm mb-2" style={{ color: "#5A6672" }}><b>The team asked:</b> {String(row.question)}</div>
      )}
      <Counsel title="🪷 CONSULT RAGHU — THE READ" text={String(row.ai_review || "—")} colour="#8A6D1A" />
      <div className="mt-3"><L>The verdict — a human signs it{row.verdict_by ? ` (signed by ${String(row.verdict_by)})` : ""}</L>
        <textarea value={verdict} onChange={(e) => setVerdict(e.target.value)} rows={3}
          placeholder="Proceed / fix first / rethink — and the one condition that matters"
          className="w-full border rounded px-2 py-1.5 text-sm" style={inputCss} /></div>
      {err && <div className="text-xs font-bold mt-1" style={{ color: RED }}>{err}</div>}
      <div className="flex gap-2 mt-2">
        <button onClick={async () => {
          const e = await saveReg("review", "update", row.id, { verdict, verdict_by: me, status: verdict.trim() ? "reviewed" : "waiting" });
          if (e) setErr(e); else onSaved();
        }} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>💾 Sign the verdict</button>
        <button onClick={async () => { if (window.confirm("Remove this review?")) { await saveReg("review", "delete", row.id, {}); onSaved(); } }} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: RED }}>🗑</button>
      </div>
    </Modal>
  );
}

// ============================ DASHBOARD ============================
function VishwaDashboard({ go }: { go: (k: string) => void }) {
  const [problems] = useReg("problem");
  const [ideas] = useReg("idea");
  const [plans] = useReg("plan");
  const [reviews] = useReg("review");
  const today = TODAY();
  const openProblems = (problems || []).filter((r) => r.status !== "closed");
  const lateP = (plans || []).filter((r) => r.target && String(r.target) < today && r.status !== "done");
  const waiting = (reviews || []).filter((r) => r.status === "waiting");
  const Card2 = ({ label, value, sub, colour, onClick }: { label: string; value: string; sub: string; colour: string; onClick: () => void }) => (
    <button onClick={onClick} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color: colour }}>{value}</div>
      <div className="text-xs" style={{ color: MUTED }}>{sub}</div>
    </button>
  );
  return (
    <div style={{ maxWidth: 1050 }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Card2 label="OPEN PROBLEMS" value={String(openProblems.length)} sub={`${openProblems.filter((r) => !r.root_cause).length} without a root cause yet`} colour={openProblems.length ? RED : GREEN} onClick={() => go("problems")} />
        <Card2 label="IDEAS ALIVE" value={String((ideas || []).filter((r) => r.status === "raw" || r.status === "exploring").length)} sub={`${(ideas || []).filter((r) => r.status === "adopted").length} adopted so far`} colour="#1B6B93" onClick={() => go("ideas")} />
        <Card2 label="DELIVERABLES LATE" value={String(lateP.length)} sub={`${(plans || []).filter((r) => r.status !== "done").length} open in all`} colour={lateP.length ? RED : GREEN} onClick={() => go("plans")} />
        <Card2 label="REVIEWS WAITING" value={String(waiting.length)} sub="Consult Raghu has read them; a signature is owed" colour={waiting.length ? "#D97706" : GREEN} onClick={() => go("reviews")} />
      </div>
      <div className="bg-white rounded-lg border p-4" style={{ borderColor: BORDER, maxWidth: 720 }}>
        <div className="text-sm font-bold mb-2" style={{ color: INK }}>How this room works</div>
        <div className="text-sm" style={{ color: "#5A6672", lineHeight: 1.7 }}>
          A problem from the floor goes into <b>Problems</b> and is walked down the Five Whys.
          <b> ✨ Genie</b> works the causes and solutions with you. What deserves a second pair of eyes goes
          <b> 🪷 to Consult Raghu</b> — his read arrives on the bench, and a human signs the verdict.
          Ideas are caught raw in <b>Ideas</b> and grown the same way. <b>Design Plans</b> holds what design
          owes each job, by when. <b>References</b> is the library everything leans on.
        </div>
      </div>
    </div>
  );
}

// ============================ THE SHELL ============================
export default function Vishwakarma({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(true);
  useEffect(() => {
    try { setNavOpen(localStorage.getItem("vishwakarma.nav") !== "0"); } catch (e) { swallow("Vishwakarma", e); /* fine */ }
  }, []);
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && SECTIONS.some((s2) => s2.key === h)) setOpenKey(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  const go = (key: string) => {
    setOpenKey(key);
    try { window.history.replaceState(null, "", `#${key}`); } catch (e) { swallow("Vishwakarma", e); /* SSR */ }
  };
  const toggleNav = () => setNavOpen((v) => {
    try { localStorage.setItem("vishwakarma.nav", v ? "0" : "1"); } catch (e) { swallow("Vishwakarma", e); /* fine */ }
    return !v;
  });

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      <div style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest" style={{ fontSize: 11, color: "#F5B32B" }}>
                🛠 NANDAN VISHWAKARMA GENIE
              </span>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#22303C", color: "#8FA1B3" }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              The design team&apos;s workroom — problems to root cause, ideas to proof
            </div>
          </div>
          <span className="ml-auto" />
          <ModuleMenu current="vishwakarma" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        <nav style={{ width: navOpen ? 236 : 54, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 6px", transition: "width .15s ease" }}>
          <button onClick={toggleNav} className="w-full rounded px-2 py-1.5 text-xs font-bold mb-1 text-left" style={{ color: MUTED }}
            title={navOpen ? "Fold the sidebar to icons" : "Open the sidebar"}>
            {navOpen ? "« fold" : "»"}
          </button>
          {SECTIONS.map((s2) => (
            <button key={s2.key} onClick={() => go(s2.key)}
              className="w-full text-left rounded px-2 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5"
              title={navOpen ? undefined : s2.label}
              style={openKey === s2.key ? { background: "#16232F", color: "#fff" } : { color: "#5A6672" }}>
              <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{s2.icon}</span>
              {navOpen && s2.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 p-5" style={{ minWidth: 0 }}>
          {openKey === "dashboard" && <VishwaDashboard go={go} />}
          {openKey === "plans" && <PlansScreen />}
          {openKey === "problems" && <ProblemsScreen />}
          {openKey === "ideas" && <IdeasScreen />}
          {openKey === "references" && <ReferencesScreen />}
          {openKey === "playbook" && <PlaybookScreen kind="design" email={email} />}
          {openKey === "reviews" && <ReviewsScreen me={displayName || email} />}
        </main>
      </div>
    </div>
  );
}
