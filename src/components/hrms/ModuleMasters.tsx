"use client";
/**
 * Module Masters — every dropdown in HRIS, in one screen.
 *
 * A master is the list of things a field is allowed to say. Left as free
 * text, a company of 380 people ends up with "B+", "B +ve" and "B Positive"
 * as three different blood groups, and no report can count any of them.
 *
 * DELETING IS THE INTERESTING PART. Somebody holds the value being deleted,
 * and their record cannot be left pointing at a list entry that no longer
 * exists — so a delete asks what happens to those people first: move them to
 * another value, or blank the field on every one of them, said out loud.
 * Either way each person gets a line in their own history.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MASTERS } from "@/lib/hrms";
import CompetencyMaster from "./CompetencyMaster";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

type Masters = Record<string, { value: string; sort_order: number; active: boolean }[]>;
type Counts = Record<string, Record<string, number>>;

export default function ModuleMasters({ who }: { who: string }) {
  const [masters, setMasters] = useState<Masters>({});
  const [counts, setCounts] = useState<Counts>({});
  const [needsMigration, setNeedsMigration] = useState(false);
  const [kind, setKind] = useState(MASTERS[0].kind);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/hrms/masters");
      setMasters(r.masters || {});
      setCounts(r.counts || {});
      setNeedsMigration(!!r.needsMigration);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const spec = useMemo(() => MASTERS.find((m) => m.kind === kind)!, [kind]);
  const list = masters[kind] || [];
  const used = counts[kind] || {};

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/hrms/masters", body);
      setMsg(`${ok}${typeof r.moved === "number" && r.moved ? ` — ${r.moved} record${r.moved === 1 ? "" : "s"} moved` : ""} ✓`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const v = adding.trim();
    if (!v) return;
    setAdding("");
    run({ action: "add", kind, value: v }, `Added “${v}”`);
  };

  const rename = (value: string) => {
    const to = window.prompt(`Rename “${value}” to what?\n\nEverybody currently holding it moves with it.`, value);
    if (!to || to.trim() === value) return;
    run({ action: "rename", kind, value, to: to.trim() }, `Renamed to “${to.trim()}”`);
  };

  const remove = (value: string) => {
    const n = used[value] || 0;
    const others = list.filter((l) => l.value !== value).map((l) => l.value);
    if (n === 0) {
      if (!window.confirm(`Delete “${value}” from ${spec.label}?\n\nNobody is using it.`)) return;
      run({ action: "delete", kind, value, reassignTo: "" }, `Deleted “${value}”`);
      return;
    }
    const to = window.prompt(
      `${n} record${n === 1 ? " holds" : "s hold"} “${value}”.\n\n` +
        `Type the value to move them to — one of:\n${others.join(", ") || "(there is nothing else on this list)"}\n\n` +
        `Leave it EMPTY to blank the field on all ${n}.`,
      others[0] || "",
    );
    if (to === null) return;
    if (!to.trim() && !window.confirm(`Blank ${spec.label} on all ${n} record${n === 1 ? "" : "s"}?\n\nEach one gets a line in its history.`)) return;
    run({ action: "delete", kind, value, reassignTo: to.trim() }, `Deleted “${value}”`);
  };

  return (
    <Pane title="Module Masters" who={who}
      blurb="Every dropdown in HRIS. A field backed by a master can only say what is on its list — which is how a report can count it.">
      {needsMigration && (
        <div className="rounded p-3 mb-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
          <b>Run migration 0049 first.</b> The masters table does not exist yet, so these lists have nowhere to live.
        </div>
      )}
      {msg && (
        <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>
      )}

      <div className="flex gap-3" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* which list */}
        <div className="bg-white rounded-lg border" style={{ borderColor: C.line, minWidth: 190 }}>
          {MASTERS.map((m) => (
            <button key={m.kind} onClick={() => { setKind(m.kind); setMsg(""); }}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2"
              style={{
                background: kind === m.kind ? "var(--navy)" : undefined,
                color: kind === m.kind ? "#fff" : C.dim,
                fontWeight: kind === m.kind ? 700 : 500,
                borderTop: "1px solid #EEECE6",
              }}>
              <span className="truncate">{m.label}</span>
              <span className="ml-auto tnum" style={{ fontSize: 10, opacity: 0.7 }}>
                {m.special === "competency" ? "" : (masters[m.kind] || []).length}
              </span>
            </button>
          ))}
        </div>

        {/* the list itself */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {spec.special === "competency" ? <CompetencyMaster note={spec.note} /> : (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
            <div className="font-bold text-sm">{spec.label}</div>
            {spec.note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginTop: 2 }}>{spec.note}</div>}
            {spec.fixed && (
              <div className="rounded p-2 mt-2" style={{ background: "#FFF7E6", fontSize: 11, color: "#8A5B00", lineHeight: 1.5 }}>
                This list is read by payroll and by the statutory filings. Rename freely; add to it only deliberately.
              </div>
            )}

            <div className="flex gap-1.5 mt-3 mb-2">
              <input value={adding} onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder={`Add to ${spec.label}…`} className="text-xs rounded px-2 py-1.5 flex-1"
                style={{ border: `1px solid ${C.line}` }} />
              <button onClick={add} disabled={busy || !adding.trim()}
                className="text-xs font-bold rounded px-3 py-1.5"
                style={{ background: "var(--accent)", color: "#fff", opacity: busy || !adding.trim() ? 0.5 : 1 }}>
                + Add
              </button>
            </div>

            {list.length === 0 && (
              <div className="text-xs py-3" style={{ color: C.faint }}>
                Nothing on this list yet.
              </div>
            )}
            <div>
              {list.map((l) => {
                const n = used[l.value] || 0;
                return (
                  <div key={l.value} className="flex items-center gap-2 px-2 py-1.5" style={{ borderTop: "1px solid #EEECE6" }}>
                    <div className="text-xs" style={{ flex: 1, wordBreak: "break-word" }}>{l.value}</div>
                    <div className="text-xs tnum" style={{ color: n ? C.dim : "#C9C6BD", minWidth: 66, textAlign: "right" }}
                      title={n ? `${n} record${n === 1 ? "" : "s"} hold this` : "Nobody is using this"}>
                      {n ? `${n} in use` : "unused"}
                    </div>
                    <button onClick={() => rename(l.value)} disabled={busy}
                      className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#DCE8F5", color: "var(--blue)" }}
                      title="Rename — everybody holding it moves with it">✎</button>
                    <button onClick={() => remove(l.value)} disabled={busy}
                      className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#FBEDEA", color: C.red }}
                      title={n ? "Delete — you will be asked where those records go" : "Delete"}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>
    </Pane>
  );
}
