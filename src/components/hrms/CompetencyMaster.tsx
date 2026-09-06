"use client";
/**
 * The competency master, inside Module Masters — where somebody looks for
 * "the list of things we can choose from".
 *
 * The difference from every other master is the DEFINITION. A competency is
 * a word that five people would read five ways: "Dependability", "Ownership",
 * "Quality Consciousness". Written down once, for the whole company, it can
 * be argued with; left as a word on a form, it means whatever the person
 * filling it in felt that day.
 *
 * Deleting is refused while anything uses it, and says how many — removing a
 * competency from the master would otherwise take it off every role and every
 * person at once, quietly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { C } from "./RecordFields";

interface Comp { name: string; definition: string; category: string | null }

const CATEGORIES = ["Basics", "Technical", "Quality & Safety", "Delivery", "Commercial", "People"];

export default function CompetencyMaster({ note }: { note?: string }) {
  const [master, setMaster] = useState<Comp[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ name: "", definition: "", category: CATEGORIES[0] });

  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/competency");
      setMaster(j.master || []);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setMaster([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await api.post("/api/hrms/competency", body); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const byCat = useMemo(() => {
    const o: Record<string, Comp[]> = {};
    for (const c of master || []) (o[c.category || "Other"] ||= []).push(c);
    return o;
  }, [master]);

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
      <div className="font-bold text-sm">Competencies</div>
      {note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 2 }}>{note}</div>}
      {msg && <div className="text-xs font-semibold mt-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* add one */}
      <div className="rounded p-2 mt-3" style={{ background: "#F8F7F3", border: `1px solid ${C.line}` }}>
        <div className="flex gap-1.5 flex-wrap items-start">
          <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })}
            placeholder="Competency name" className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, width: 200 }} />
          <select value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })}
            className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
            {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <input value={add.definition} onChange={(e) => setAdd({ ...add, definition: e.target.value })}
            placeholder="What it means, in plain English — this is the point of the master"
            className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, flex: 1, minWidth: 240 }} />
          <button disabled={busy || !add.name.trim() || !add.definition.trim()}
            onClick={() => { run({ action: "master-add", ...add }, `Added “${add.name.trim()}”`); setAdd({ name: "", definition: "", category: add.category }); }}
            className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: add.name.trim() && add.definition.trim() ? "var(--accent)" : "var(--line)", color: add.name.trim() && add.definition.trim() ? "#fff" : "var(--muted)" }}>
            + Add
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
          A competency without a definition is just a word, so both are required.
        </div>
      </div>

      {master === null && <div className="text-xs mt-3" style={{ color: C.faint }}>loading…</div>}
      {master?.length === 0 && (
        <div className="rounded p-2 mt-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
          <b>Nothing here.</b> Run migrations 0056 and 0057 to seed the 68 competencies.
        </div>
      )}

      <div className="mt-3">
        {CATEGORIES.concat(Object.keys(byCat).filter((k) => !CATEGORIES.includes(k))).map((cat) => {
          const list = byCat[cat];
          if (!list?.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div style={{ fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {cat} <span style={{ opacity: 0.6 }}>· {list.length}</span>
              </div>
              {list.map((c) => (
                <div key={c.name} className="flex items-start gap-2 py-1.5" style={{ borderTop: "1px solid #EEECE6" }}>
                  <div className="text-xs font-semibold" style={{ minWidth: 175 }}>{c.name}</div>
                  <input defaultValue={c.definition}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.definition) run({ action: "master-save", name: c.name, definition: e.target.value, category: c.category }, `“${c.name}” rewritten`); }}
                    className="text-xs rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, flex: 1, minWidth: 220 }} />
                  <button onClick={() => { if (window.confirm(`Delete “${c.name}” from the master?`)) run({ action: "master-delete", name: c.name }, `“${c.name}” deleted`); }}
                    disabled={busy} className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#FBEDEA", color: C.red }}>×</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
