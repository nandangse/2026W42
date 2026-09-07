"use client";
/**
 * THE INDIVIDUAL REPORT CARD — one person, one page (Dr Raghu, 7 Sep 2026).
 *
 * "I should be able to choose one person, and that person's data will all be
 * seen. Most of it will be what will be seen in his IDP that he sees."
 *
 * So this reads the very sheet the employee reads — /api/my/sheet with a
 * person named — rather than assembling a second, slightly different truth
 * beside it. What is added on top is HR's own: the MIS line, the attendance
 * roster month by month, and the change requests.
 *
 * Nine sections, his order: MIS · HRIS · IDP · Learning goals · Leave ·
 * Attendance · HR queries · Onboarding · (the picture and the pencils).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/hrms-template";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import { queryLine, genericSubject } from "@/lib/query-line";

type Sheet = {
  linked: boolean;
  me: { id: string; name: string; email: string; type: string; department: string | null; designation: string | null; doj: string | null; location: string | null; manager: string | null; phone: string };
  record: { key: string; label: string; fields: { key: string; label: string; kind: string; value: string | null }[] }[];
  months: { id: string; month: number; year: number; status: string; net: number | null }[];
  idps: { id: string; submitted_at: string | null; answers: Record<string, unknown>; cycle: string }[];
  reviews: { idp_id: string; reviewer: string; notes: unknown; at: string }[];
  released: unknown;
  learning: unknown[];
  queries: { id: string; subject: string; question: string; topic: string; status: string; answer: string | null; raised_at: string; answered_at: string | null; answered_by: string | null }[];
  handbook: { edition: string; acknowledged: string | null };
};
type Week = { n: number; from: number; to: number; present: number; absent: number; marks: string[] };
type Att = {
  months: { id: string; month: number; year: number; status: string; hasMuster: boolean; days: string[]; weeks: Week[]; present: number | null; absent: number | null; late: number | null; compoff: number | null; et: number | null; payDays: number | null; attendancePct: number | null }[];
  missing: { month: number; year: number; status: string }[];
  averages: { attendancePct: number | null; latePerMonth: number | null; monthsCounted: number };
};
type ListRow = { employee_id: string | null; idpId: string; name: string };

const SECTIONS = [
  ["mis", "1 · Main MIS"], ["hris", "2 · HRIS"], ["idp", "3 · IDP"],
  ["learning", "4 · Learning goals"], ["leave", "5 · Leave register"],
  ["attendance", "6 · Attendance"], ["queries", "7 · HR queries"],
  ["onboarding", "8 · Onboarding"],
] as const;
type Sec = typeof SECTIONS[number][0];

const yearsSince = (d: string | null | undefined) => {
  if (!d) return null;
  const t = Date.parse(String(d));
  if (!Number.isFinite(t)) return null;
  return Math.round(((Date.now() - t) / (365.25 * 864e5)) * 10) / 10;
};

export default function ReportCard({ who }: { who: string }) {
  const [people, setPeople] = useState<ListRow[] | null>(null);
  const [pick, setPick] = useState("");
  const [pickQ, setPickQ] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [sec, setSec] = useState<Sec>("mis");
  const [d, setD] = useState<Sheet | null>(null);
  const [att, setAtt] = useState<Att | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/hrms/idp").then((j) => setPeople((j.idps || []).filter((r: ListRow) => r.employee_id)))
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setBusy(true); setMsg(""); setD(null); setAtt(null);
    try {
      const [sheet, a] = await Promise.all([
        api.get(`/api/my/sheet?person=${encodeURIComponent(id)}`),
        api.get(`/api/hrms/attendance?person=${encodeURIComponent(id)}`).catch(() => null),
      ]);
      setD(sheet); setAtt(a);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }, []);
  useEffect(() => { if (pick) load(pick); }, [pick, load]);

  const hits = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    const all = people || [];
    if (!q) return all.slice(0, 60);
    return all.filter((p) => `${p.employee_id || ""} ${p.name}`.toLowerCase().includes(q)).slice(0, 60);
  }, [people, pickQ]);

  const v = (k: string) => {
    for (const g of d?.record || []) { const f = g.fields.find((x) => x.key === k); if (f) return f.value; }
    return null;
  };

  return (
    <Pane title="Individual Report Card" who={who}
      blurb="One person, one page — the MIS line, the record, the IDP, learning, leave, the attendance roster and every query. The same material the person sees on their own page, read from the same place.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 items-center flex-wrap mb-3 no-print">
        <span className="relative" style={{ minWidth: 280 }}>
          <input value={pickQ} onFocus={() => setPickOpen(true)} onChange={(e) => { setPickQ(e.target.value); setPickOpen(true); }}
            placeholder="Type a name or an employee ID…" className="text-sm rounded px-3 py-2 w-full"
            style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
          {pickOpen && (
            <div className="absolute z-30 bg-white rounded shadow-lg mt-1 w-full" style={{ border: `1px solid ${C.line}`, maxHeight: 320, overflowY: "auto" }}>
              {!hits.length && <div className="px-3 py-2 text-sm" style={{ color: C.faint }}>Nobody matches.</div>}
              {hits.map((p) => (
                <button key={p.idpId} onClick={() => { setPick(String(p.employee_id)); setPickQ(p.name); setPickOpen(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                  style={{ background: p.employee_id === pick ? "#FFF3E8" : undefined }}>
                  <b>{p.employee_id}</b> · {p.name}
                </button>
              ))}
            </div>
          )}
        </span>
        {pickOpen && <button onClick={() => setPickOpen(false)} className="text-xs" style={{ color: C.faint }}>close</button>}
        {busy && <span className="text-xs" style={{ color: C.faint }}>reading…</span>}
      </div>

      {!pick && <div className="text-sm rounded-lg border bg-white p-4" style={{ borderColor: C.line, color: C.faint }}>Choose somebody and their whole page opens here.</div>}

      {d && (
        <>
          <Head d={d} att={att} />
          <div className="flex gap-1.5 flex-wrap my-3 no-print">
            {SECTIONS.map(([k, l]) => (
              <button key={k} onClick={() => setSec(k)} className="text-xs font-bold rounded px-3 py-1.5"
                style={{ background: sec === k ? C.ink : "#fff", color: sec === k ? "#fff" : C.dim, border: `1px solid ${sec === k ? C.ink : C.line}` }}>{l}</button>
            ))}
          </div>

          {sec === "mis" && <Mis d={d} att={att} />}
          {sec === "hris" && <Hris d={d} />}
          {sec === "idp" && <Idp d={d} />}
          {sec === "learning" && <Simple title="Learning goals" rows={(d.learning || []).length} note="Learning goals and the log the person keeps, the same ones the LMS reads." body={<pre className="text-xs" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(d.learning, null, 1)}</pre>} />}
          {sec === "leave" && <Leave d={d} />}
          {sec === "attendance" && <Attendance att={att} />}
          {sec === "queries" && <Queries d={d} />}
          {sec === "onboarding" && <Onboarding />}
        </>
      )}
      {d && v("dob") === null && null}
    </Pane>
  );
}

/* ── the head: the picture and the name ── */
function Head({ d, att }: { d: Sheet; att: Att | null }) {
  const m = d.me;
  return (
    <div className="rounded-lg border bg-white p-3 flex gap-4 items-center flex-wrap" style={{ borderColor: C.line }}>
      <div className="rounded-full flex items-center justify-center font-bold"
        style={{ width: 62, height: 62, background: "#F4F2EC", color: C.dim, fontSize: 20 }}>
        {m.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join("")}
      </div>
      <div>
        <div className="font-bold" style={{ fontSize: 17 }}>{m.name}</div>
        <div className="text-xs" style={{ color: C.dim }}>{m.id} · {m.designation || "—"} · {m.department || "—"} · {m.type}</div>
        <div className="text-xs" style={{ color: C.faint }}>{m.email || "no e-mail on the record"}{m.phone ? ` · ${m.phone}` : ""}</div>
      </div>
      <span style={{ flex: 1 }} />
      {att?.averages.monthsCounted ? (
        <div className="text-xs text-right" style={{ color: C.dim }}>
          <div><b style={{ fontSize: 16, color: C.ink }}>{att.averages.attendancePct ?? "—"}%</b> average attendance</div>
          <div>over {att.averages.monthsCounted} {att.averages.monthsCounted === 1 ? "month" : "months"} of muster</div>
        </div>
      ) : null}
    </div>
  );
}

/* ── 1 · Main MIS ── */
function Mis({ d, att }: { d: Sheet; att: Att | null }) {
  const m = d.me;
  const dob = (() => { for (const g of d.record) { const f = g.fields.find((x) => x.key === "dob"); if (f) return f.value; } return null; })();
  const rows: [string, React.ReactNode][] = [
    ["Company", "Nandan GSE"],
    ["Since", m.doj ? `${String(m.doj).slice(0, 10)} · ${yearsSince(m.doj) ?? "—"} years` : "—"],
    ["Age", yearsSince(dob) != null ? `${yearsSince(dob)} years` : "—"],
    ["Birth date", dob ? String(dob).slice(0, 10) : "—"],
    ["Department", m.department || "—"],
    ["Reporting manager", m.manager || "—"],
    ["Designation", m.designation || "—"],
    ["Average attendance", att?.averages.attendancePct != null ? `${att.averages.attendancePct}%` : "no muster loaded yet"],
    ["Average late coming", att?.averages.latePerMonth != null ? `${att.averages.latePerMonth} a month` : "no muster loaded yet"],
    ["Engagement score", <span key="e" style={{ color: C.faint }}>not worked out yet — it needs a rule before it can be a number</span>],
  ];
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, maxWidth: 720 }}>
      {rows.map(([k, val], i) => (
        <div key={k} className="px-3 py-2 flex gap-3 text-sm" style={{ borderTop: i ? "1px solid #F1EFE9" : undefined }}>
          <span style={{ color: C.dim, width: 200, flexShrink: 0 }}>{k}</span>
          <span className="font-semibold">{val}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 2 · HRIS ── */
function Hris({ d }: { d: Sheet }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {d.record.map((g) => (
        <div key={g.key} className="rounded-lg border bg-white" style={{ borderColor: C.line }}>
          <div className="px-3 py-1.5 font-bold text-xs" style={{ background: "#F4F2EC", color: C.dim }}>{g.label}</div>
          {g.fields.map((f, i) => (
            <div key={f.key} className="px-3 py-1.5 flex gap-2 text-xs" style={{ borderTop: i ? "1px solid #F5F3EE" : undefined }}>
              <span style={{ color: C.faint, width: 150, flexShrink: 0 }}>{f.label}</span>
              <span className="font-semibold" style={{ flex: 1 }}>{f.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 3 · IDP ── */
function Idp({ d }: { d: Sheet }) {
  if (!d.idps.length) return <Empty what="No IDP has been started for this person yet." />;
  return (
    <div className="grid gap-3">
      {d.idps.map((x) => (
        <div key={x.id} className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
          <div className="text-xs mb-2" style={{ color: C.dim }}>
            <b>{x.cycle}</b> · {x.submitted_at ? `submitted ${fmtFull(String(x.submitted_at))}` : "started, not submitted"}
          </div>
          {Object.entries(x.answers || {}).map(([k, val]) => (
            <div key={k} className="mb-2">
              <div className="text-xs font-bold" style={{ color: C.faint }}>{k}</div>
              <div className="text-sm" style={{ whiteSpace: "pre-wrap" }}>{typeof val === "string" ? val : JSON.stringify(val)}</div>
            </div>
          ))}
          {d.reviews.filter((r) => r.idp_id === x.id).map((r, i) => (
            <div key={i} className="mt-2 rounded p-2" style={{ background: "#F4F2EC" }}>
              <div className="text-xs font-bold" style={{ color: C.dim }}>{r.reviewer} · {fmtFull(String(r.at))}</div>
              <div className="text-sm" style={{ whiteSpace: "pre-wrap" }}>{typeof r.notes === "string" ? r.notes : JSON.stringify(r.notes)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 5 · Leave register ── */
function Leave({ d }: { d: Sheet }) {
  if (!d.months.length) return <Empty what="No salary month carries this person yet." />;
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, maxWidth: 520 }}>
      {d.months.map((m, i) => (
        <div key={m.id} className="px-3 py-1.5 flex gap-3 text-xs" style={{ borderTop: i ? "1px solid #F1EFE9" : undefined }}>
          <span className="font-semibold" style={{ width: 120 }}>{MONTHS[m.month - 1]} {m.year}</span>
          <span style={{ color: C.faint }}>{m.status}</span>
          <span style={{ flex: 1 }} />
          <span className="tnum">{m.net == null ? "" : `₹ ${Math.round(m.net).toLocaleString("en-IN")}`}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 6 · Attendance ── */
function Attendance({ att }: { att: Att | null }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  if (!att) return <Empty what="The attendance could not be read." />;
  const shown = att.months.filter((m) => m.present != null);
  return (
    <div>
      <div className="flex gap-1.5 items-center mb-2 no-print">
        {(["day", "week"] as const).map((k) => (
          <button key={k} onClick={() => setMode(k)} className="text-xs font-bold rounded px-3 py-1"
            style={{ background: mode === k ? C.ink : "#fff", color: mode === k ? "#fff" : C.dim, border: `1px solid ${mode === k ? C.ink : C.line}` }}>
            by {k}
          </button>
        ))}
        <span className="text-xs" style={{ color: C.faint }}>ET is extra time.</span>
      </div>

      {!shown.length && <Empty what="No month has a muster carrying this person yet." />}

      {shown.map((m) => (
        <div key={m.id} className="rounded-lg border bg-white mb-2" style={{ borderColor: C.line }}>
          <div className="flex gap-3 items-center flex-wrap px-3 py-2" style={{ background: "#FBFAF7" }}>
            <span className="font-bold" style={{ width: 130 }}>{MONTHS[m.month - 1]} {m.year}</span>
            <Tot l="present" n={m.present} green />
            <Tot l="absent" n={m.absent} />
            <Tot l="late" n={m.late} />
            <Tot l="comp off" n={m.compoff} />
            <Tot l="ET" n={m.et} />
            <span style={{ flex: 1 }} />
            {m.attendancePct != null && <span className="text-xs font-bold" style={{ color: C.dim }}>{m.attendancePct}%</span>}
          </div>
          {mode === "day" ? (
            <div className="px-3 py-2 flex flex-wrap gap-1">
              {m.days.map((mark, i) => {
                const t = String(mark || "").trim().toUpperCase();
                const bg = t === "P" ? "#E6F4EA" : t === "A" ? "#FBE9E7" : t ? "#F4F2EC" : "#fff";
                const fg = t === "P" ? "var(--green)" : t === "A" ? "var(--red)" : C.dim;
                return (
                  <span key={i} title={`${i + 1} — ${t || "no mark"}`} className="rounded text-center"
                    style={{ width: 34, padding: "2px 0", background: bg, color: fg, border: `1px solid ${C.line}`, fontSize: 10, fontWeight: 700 }}>
                    <span style={{ display: "block", color: C.faint, fontSize: 9 }}>{i + 1}</span>{t || "·"}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2">
              {m.weeks.map((w) => (
                <div key={w.n} className="flex gap-3 text-xs py-1" style={{ borderTop: w.n > 1 ? "1px solid #F5F3EE" : undefined }}>
                  <span className="font-bold" style={{ width: 70 }}>Week {w.n}</span>
                  <span style={{ color: C.faint, width: 110 }}>{w.from} – {w.to} {MONTHS[m.month - 1]}</span>
                  <span style={{ color: "var(--green)" }}><b>{w.present}</b> present</span>
                  <span style={{ color: w.absent ? "var(--red)" : C.faint }}><b>{w.absent}</b> absent</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {att.missing.length > 0 && (
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: C.line, background: "#FFF6E5", color: "#8A5B00" }}>
          <b>These months have a payroll run but no muster uploaded</b>, so there is no roster to show — an empty row is not the same as an absence:{" "}
          {att.missing.map((x) => `${MONTHS[x.month - 1]} ${x.year}`).join(", ")}. Uploading each month&apos;s muster onto its run fills this in.
        </div>
      )}
    </div>
  );
}
const Tot = ({ l, n, green }: { l: string; n: number | null; green?: boolean }) => (
  <span className="text-xs" style={{ color: C.dim }}>
    <b className="tnum" style={{ color: green ? "var(--green)" : C.ink }}>{n ?? "—"}</b> {l}
  </span>
);

/* ── 7 · HR queries ── */
function Queries({ d }: { d: Sheet }) {
  if (!d.queries.length) return <Empty what="This person has raised nothing yet." />;
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line }}>
      {d.queries.map((q, i) => (
        <div key={q.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #F1EFE9" : undefined }}>
          <div className="flex gap-2 items-baseline text-xs flex-wrap">
            <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: q.status === "Open" ? "#FFF3E8" : "#E6F4EA", color: q.status === "Open" ? "#8A5B00" : "var(--green)", fontSize: 10 }}>{q.status}</span>
            <b>{genericSubject(q.subject) ? (queryLine(q.question, q.subject) || q.topic) : q.subject}</b>
            <span style={{ flex: 1 }} />
            <span style={{ color: C.faint }}>{fmtFull(String(q.raised_at))}</span>
          </div>
          <div className="text-sm mt-1" style={{ whiteSpace: "pre-wrap" }}>{q.question}</div>
          {q.answer && (
            <div className="text-sm mt-1 rounded p-2" style={{ background: "#F4F2EC", whiteSpace: "pre-wrap" }}>
              {q.answer}
              <div className="text-xs mt-1" style={{ color: C.faint }}>{q.answered_by} · {q.answered_at ? fmtFull(String(q.answered_at)) : ""}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 8 · Onboarding ── */
function Onboarding() {
  return (
    <div className="rounded-lg border bg-white p-4 text-sm" style={{ borderColor: C.line, maxWidth: 700, color: C.dim, lineHeight: 1.6 }}>
      <b style={{ color: "#8A5B00" }}>The checklist has no source yet.</b><br />
      Genie holds no onboarding checklist today — not an empty one, none at all. Say what the steps are and who
      ticks each, and this becomes a real list against every joiner rather than a page that looks complete and is not.
    </div>
  );
}

const Empty = ({ what }: { what: string }) => (
  <div className="rounded-lg border bg-white p-4 text-sm" style={{ borderColor: C.line, color: C.faint }}>{what}</div>
);
const Simple = ({ title, rows, note, body }: { title: string; rows: number; note: string; body: React.ReactNode }) => (
  <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
    <div className="font-bold text-sm">{title} <span style={{ color: C.faint, fontWeight: 400 }}>· {rows}</span></div>
    <div className="text-xs mb-2" style={{ color: C.faint }}>{note}</div>
    {rows ? body : <span className="text-sm" style={{ color: C.faint }}>Nothing here yet.</span>}
  </div>
);
