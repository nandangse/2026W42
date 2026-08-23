"use client";
/**
 * Two tabs on a person's record.
 *
 * ROLE CLARITY DOCUMENT — everything the company has written about what this
 * person is for, gathered in one place and printable. Somebody's roles, and
 * for each one the job description, the deliverable, the metric and the
 * Managing Director's own note. It is the document handed across the table in
 * a one-to-one, and until now it existed only in pieces.
 *
 * COMPETENCY — what they must be able to DO. Built rather than stored: their
 * roles' requirements, plus anything HR adds to them by hand. Both are shown
 * as what they are, because "your role asks for this" and "we expect this of
 * you personally" are different sentences and should not be confused.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LEVELS, LEVEL_SHORT } from "@/lib/competency";
import { RichTextView } from "./RichText";
import { C } from "./RecordFields";

interface RoleDoc {
  role: string; department: string | null; grade: string | null; reports_to: string | null; location: string | null;
  stage: string; job_description: string | null; deliverable: string | null; metric: string | null;
  summary: string | null; transcript: string | null; url: string | null;
  competencies: { competency: string; level: number }[];
}
interface Comp {
  competency: string; definition: string; category: string | null;
  level: number; roleLevel: number | null; fromRoles: string[];
  added: boolean; reason: string | null; addedBy: string | null;
}
interface Master { name: string; definition: string; category: string | null }

export function RoleClarity({ employeeId, roles }: { employeeId: string; roles: string[] }) {
  const [docs, setDocs] = useState<RoleDoc[] | null>(null);

  useEffect(() => {
    api.get("/api/hrms/roles")
      .then((j) => setDocs((j.roles || []).filter((r: RoleDoc) => roles.includes(r.role))))
      .catch(() => setDocs([]));
  }, [roles]);

  if (docs === null) return <div className="text-xs" style={{ color: C.faint }}>loading…</div>;
  if (!roles.length)
    return (
      <div className="rounded p-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00", lineHeight: 1.6 }}>
        No role is set on this record, so there is nothing to be clear about. Set the role under <b>Identity &amp; role</b>.
      </div>
    );

  return (
    <>
      <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
        Everything the company has written about what this person is for — one page, printable, and the right thing to
        put on the table in a one-to-one. {roles.length > 1 && <b>They hold {roles.length} roles and are accountable for each.</b>}
      </div>
      {docs.length === 0 && (
        <div className="text-xs" style={{ color: C.faint }}>
          Their role is not in the register yet, so nothing has been written about it.
        </div>
      )}
      {docs.map((d, i) => (
        <div key={d.role} className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.line }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-bold" style={{ fontSize: 16 }}>{d.role}</div>
            <span className="rounded px-1.5 py-0.5 font-bold" style={{
              fontSize: 10, background: d.stage === "Final" ? "#E6F4EA" : "#FFF3E8",
              color: d.stage === "Final" ? C.green : "#8A5B00",
            }}>{d.stage}</span>
            {docs.length > 1 && <span style={{ fontSize: 11, color: C.faint }}>Role {i + 1} of {docs.length}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint }}>
            {[d.department, d.grade, d.location].filter(Boolean).join(" · ")}
            {d.reports_to && <> · reports to <b>{d.reports_to}</b></>}
          </div>

          <Block label="Job Description" html={d.job_description} />
          <Block label="Deliverable" html={d.deliverable} />
          <Block label="Measurement Metric" html={d.metric} />

          {(d.url || d.summary) && (
            <div className="rounded p-2 mt-3" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8" }}>
              <div className="font-bold text-xs">What the Managing Director expects of this role</div>
              {d.url && <audio controls src={d.url} className="no-print" style={{ height: 30, width: "100%", maxWidth: 380, marginTop: 4 }} />}
              {d.summary && (
                <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6 }}>{d.summary}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Block({ label, html }: { label: string; html: string | null }) {
  if (!html) return null;
  return (
    <div className="mt-3">
      <div className="font-bold" style={{ fontSize: 12.5 }}>{label}</div>
      <div className="rounded p-2 mt-1" style={{ background: "#F8F7F3" }}><RichTextView html={html} /></div>
    </div>
  );
}

/* ────────────────────────────── competency ────────────────────────────── */

export function PersonCompetency({ employeeId }: { employeeId: string }) {
  const [list, setList] = useState<Comp[] | null>(null);
  const [master, setMaster] = useState<Master[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api.get(`/api/hrms/competency?employee=${encodeURIComponent(employeeId)}`);
      setList(j.competencies || []);
      setMaster(j.master || []);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setList([]); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await api.post("/api/hrms/competency", { employee: employeeId, ...body }); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  if (list === null) return <div className="text-xs" style={{ color: C.faint }}>loading…</div>;

  const taken = new Set(list.map((c) => c.competency));
  const byCat = master.filter((m) => !taken.has(m.name)).reduce<Record<string, Master[]>>((a, c) => {
    (a[c.category || "Other"] ||= []).push(c);
    return a;
  }, {});

  return (
    <>
      <div className="rounded p-2 mb-2" style={{ background: "#F4F2EC", fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
        What this person must be able to <b>do</b>, and to what level out of 5. Most come from the roles they hold;
        HR can add more for this person alone, or set a different level for them. Removing only ever removes what was
        added here — a competency the role requires is changed on the <b>role</b>, not one record at a time.
      </div>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {list.length === 0 && (
        <div className="text-xs mb-2" style={{ color: C.faint }}>
          Nothing yet. Either no role is set, or the role has no competencies against it.
        </div>
      )}

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {list.map((c, i) => (
          <div key={c.competency} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-semibold text-xs" style={{ minWidth: 170, flex: 1 }}>{c.competency}</div>
              <select value={c.level} disabled={busy}
                onChange={(e) => run({ competency: c.competency, level: Number(e.target.value) }, `${c.competency} set to level ${e.target.value}`)}
                className="text-xs rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}>
                {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n} — {LEVEL_SHORT[n]}</option>))}
              </select>
              {c.added ? (
                <button onClick={() => run({ competency: c.competency, remove: true }, `${c.competency} removed`)} disabled={busy}
                  className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#FBEDEA", color: C.red }}
                  title="Remove what was added for this person">×</button>
              ) : (
                <span className="rounded px-1.5 py-0.5" style={{ fontSize: 10, background: "#F4F2EC", color: C.faint }}
                  title="Required by the role — change it on the role">from role</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>{c.definition}</div>
            <div style={{ fontSize: 11, color: "#8A5B00", marginTop: 2 }}>
              <b>Level {c.level}</b> — {LEVELS[c.level]}
            </div>
            {c.fromRoles.length > 0 && (
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                required by {c.fromRoles.join(", ")}
                {c.added && c.roleLevel !== null && c.roleLevel !== c.level && (
                  <> at level {c.roleLevel} — <b style={{ color: "#8A5B00" }}>set to {c.level} for this person</b></>
                )}
              </div>
            )}
            {c.added && !c.fromRoles.length && (
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                added for this person{c.addedBy ? ` by ${String(c.addedBy).split("·")[0].trim()}` : ""}
                {c.reason ? ` — ${c.reason}` : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      <select value="" disabled={busy}
        onChange={(e) => { const v = e.target.value; if (v) run({ competency: v, level: 3 }, `${v} added`); }}
        className="text-xs rounded px-2 py-1 bg-white mt-2 no-print" style={{ border: `1px solid ${C.line}`, maxWidth: 340 }}>
        <option value="">+ add a competency for this person…</option>
        {Object.entries(byCat).map(([cat, l]) => (
          <optgroup key={cat} label={cat}>
            {l.map((m) => (<option key={m.name} value={m.name}>{m.name}</option>))}
          </optgroup>
        ))}
      </select>
    </>
  );
}
