"use client";

/**
 * MY SHEET — the employee's own page (Dr Raghu, 5 Sep 2026): "Whoever has
 * filled in the IDP, once they are finalised, they will see a screen which
 * says Dear Name ... Put in a date ... the Nandan logo ... Data of yours as
 * per Genie ... HRIS Records ... Payslips ... Leave Register, Loan Register,
 * Employee Handbook, HR Queries ... Apply for Leave / Advance / Loan / Leave
 * Encashment / Uniform / Shoes / Other Things ... IDP Results ... Learning
 * Goals ... on a mobile ... no other header, footer, nothing."
 *
 * One column, big taps, the tabs scroll sideways under the thumb. What a
 * person wants first is on top: leave left, loan left, last pay, and what is
 * still waiting on them.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LOGO } from "@/lib/logo";
import { MONTHS } from "@/lib/salary-sheet";
import { IDP_SECTIONS, IDP_RATINGS } from "@/lib/idp";
import { inr } from "@/lib/fmt";
import { firstName } from "@/lib/person-name";

const C = { ink: "var(--ink)", dim: "var(--dim)", faint: "var(--muted)", line: "var(--line)", orange: "var(--accent)", green: "var(--green)", red: "var(--red)", navy: "var(--navy)", paper: "var(--paper)" };

const d1 = (n: number | null | undefined) => (n == null ? "—" : String(Math.round(Number(n) * 10) / 10));
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "—");

interface Slip { net: number | null; leave_ob: number | null; leave_added: number | null; leave_used: number | null; leave_encashed: number | null; leave_cb: number | null; compoff_days?: number | null; compoff_encashed_days?: number | null; loan_ob: number | null; loan_added: number | null; loan_ded: number | null; loan_cb: number | null; leave_encash: number | null; attendance: number | null; paid_days: number | null }
interface Month { id: string; month: number; year: number; status: string; net: number | null; slip: Slip | null; frozen: boolean }
interface Field { key: string; label: string; type: "date" | "number" | "text" | "select"; options?: string[]; required?: boolean }
interface Sheet {
  linked: boolean; name?: string; email?: string;
  me: { id: string; name: string; email: string; type: string; department: string | null; designation: string | null; doj: string | null; location: string | null; manager: string | null; phone: string };
  record: { key: string; label: string; fields: { key: string; label: string; kind: string; value: string }[] }[];
  months: Month[];
  idps: { id: string; submitted_at: string; answers: Record<string, string>; ratings: Record<string, number>; role_at_time: string | null; cycle: string }[];
  reviews: { idp_id: string; reviewer: string | null; ratings: Record<string, number>; notes: string | null; at: string }[];
  released: { cycle: string; new_gross: number | null; prev_gross: number | null; new_designation: string | null; brief: string | null; at: string }[];
  learning: { id: string; note: string; at: string }[];
  queries: { id: string; subject: string; question: string; topic: string; status: string; answer: string | null; raised_at: string; answered_at: string | null; answered_by: string | null }[];
  handbook: { edition: string; acknowledged: string | null };
  /** The IDP Results page: the table, the growth note, the role. */
  salary?: { rows: { label: string; monthly: number | null; yearly: number | null; kind: string }[]; gross: number; ctcLakhs: string } | null;
  growth?: { note: string; hi: string | null; at: string | null } | null;
  roles?: { role: string; job_description: string | null; deliverable: string | null; metric: string | null; competencies: { competency: string; level: string | null; note: string | null }[] }[];
  kinds: Record<string, { label: string; fields: Field[] }>;
  today: string;
}
type Tab = "home" | "idpform" | "records" | "slips" | "leave" | "loan" | "idp" | "learning" | "handbook" | "queries" | "more";
/**
 * The IDP FORM tab is deliberately absent (Dr Raghu, 7 Sep 2026: "remove the
 * IDP edit option for all now — hide the tab"). The round is written; what a
 * person reads from here on is the RESULT, under IDP Results, not a box they
 * could still type into. The panel itself is left in the file, unreachable,
 * because the next round will want it back.
 */
const TABS: [Tab, string][] = [["home", "Home"], ["records", "HRIS Records"], ["slips", "Payslips"], ["leave", "Leave Register"], ["loan", "Loan Register"], ["idp", "IDP Results"], ["learning", "Learning Goals"], ["handbook", "Employee Handbook"], ["queries", "HR Queries"]];
/** One picture per request, so a man who reads slowly still finds his. */
const APPLY_ICON: Record<string, string> = {
  leave: "🗓️", advance: "💳", loan: "🏦", encashment: "💰", uniform: "👕", shoes: "🥾", other: "⋯",
};
const APPLY: [string, string][] = [["leave", "Apply for Leave"], ["advance", "Apply for Advance"], ["loan", "Apply for Loan"], ["encashment", "Apply for Leave Encashment"], ["uniform", "Apply for Uniform"], ["shoes", "Apply for Shoes"], ["other", "Apply for Other Things"]];

/**
 * COMING SOON, said plainly (Dr Raghu, 7 Sep 2026). The tab stays where it
 * is so nobody hunts for it later; it simply says the truth rather than
 * showing half a register somebody might act on.
 */
/** Flip to true the day the three registers are finished for the employee. */
const REGISTERS_READY = false;

/** A wide, thumb-sized button. The IDP page is read on a phone, standing up. */
function BigButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "ink" | "orange" | "plain" }) {
  const bg = tone === "orange" ? C.orange : tone === "ink" ? C.navy : "#fff";
  const fg = tone === "plain" ? C.ink : "#fff";
  return (
    <button onClick={onClick} className="text-left font-bold rounded-lg"
      style={{ background: bg, color: fg, border: tone === "plain" ? `1px solid ${C.line}` : "none",
        padding: "13px 16px", fontSize: 15, width: "100%" }}>
      {label}
    </button>
  );
}

function ComingSoon({ what, line }: { what: string; line: string }) {
  return (
    <div className="rounded-lg px-4 py-6 text-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 26 }}>🔒</div>
      <div className="font-bold mt-1" style={{ fontSize: 16 }}>{what} — coming soon</div>
      <div className="text-sm mt-1" style={{ color: C.dim, lineHeight: 1.6, maxWidth: 380, margin: "6px auto 0" }}>{line}<br />It is being finished now. Until then, HR has it — write under HR Queries and they will answer.</div>
    </div>
  );
}

export default function MySheet({ name, children, teamBox, embedded, dashboard, idpPanel, idpStatus }: { name: string; children?: React.ReactNode; teamBox?: React.ReactNode; embedded?: boolean; dashboard?: React.ReactNode; idpPanel?: React.ReactNode; idpStatus?: "done" | "open" | "none" }) {
  const [d, setD] = useState<Sheet | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [msg, setMsg] = useState("");
  const [apply, setApply] = useState<string | null>(null);
  const load = useCallback(async () => { try { setD(await api.get("/api/my/sheet")); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } }, []);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="p-6 text-sm" style={{ color: C.faint }}>{msg || "Loading your sheet…"}</div>;
  const latest = d.linked ? d.months.find((m) => m.slip) : undefined;
  const lastIdp = d.linked ? d.idps[0] : undefined;
  const pending: string[] = [];
  if (d.linked && !d.handbook.acknowledged) pending.push("Read and acknowledge the Employee Handbook");
  if (d.linked && lastIdp && !(lastIdp.answers?.learning || "").trim()) pending.push("Write your learning goals");

  const openQ = d.linked ? d.queries.filter((q) => q.status === "Open").length : 0;
  const initials = (d.linked ? d.me.name : name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  return (
    <div className="idpm" style={{ minHeight: "100vh", background: "var(--i-ground)", color: "var(--i-text)" }}>
      {/*
        THE PHONE, NOT THE DESKTOP (Dr Raghu, 7 Sep 2026, with a design of his
        own: "make the genie.nandan.co.in/idp like this").

        Nine tabs in a strip that had to be scrolled sideways was a desktop
        habit put on a phone — and almost everybody who opens this page opens
        it on a phone. So: five things along the bottom where a thumb reaches,
        the four a man actually wants (Home, Leave, Pay, Ask HR) and More for
        the rest. Big targets, one column, and type at 17px because these are
        read on the shop floor.
      */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" />
      <style>{`
        .idpm{
          --i-ink:#1B2233; --i-accent:#E4580B; --i-accent-ink:#fff; --i-accent-soft:#FDEBDF;
          --i-ground:#F3F4F7; --i-surface:#fff; --i-surface-2:#F8F9FB; --i-line:#DCE0E8; --i-line-2:#C5CAD6;
          --i-text:#1B2233; --i-muted:#5C6577; --i-faint:#8A93A5;
          --i-good:#1F8A4C; --i-good-soft:#E3F3E9; --i-warn:#B8771A; --i-warn-soft:#FBF1DC;
          --i-crit:#C13A2B; --i-header-muted:#AEB6C7;
          --i-shadow:0 1px 2px rgba(27,34,51,.06),0 4px 14px rgba(27,34,51,.08);
          font-family:"Source Sans 3","Segoe UI",system-ui,Roboto,Arial,sans-serif;
          font-size:17px; line-height:1.4; -webkit-font-smoothing:antialiased;
        }
        .idpm h1,.idpm h2,.idpm h3,.idpm .disp{font-family:"Barlow","Segoe UI",system-ui,Roboto,Arial,sans-serif}
        .idpm .top{position:sticky;top:0;z-index:30;background:var(--i-ink);color:#fff;
          padding:12px 16px;display:flex;align-items:center;gap:12px;min-height:60px}
        .idpm .logo{width:34px;height:34px;border-radius:9px;background:var(--i-accent);display:grid;place-items:center;
          font-family:Barlow,system-ui,sans-serif;font-weight:700;color:#fff;font-size:15px;flex:none}
        .idpm .avatar{width:40px;height:40px;border-radius:50%;background:var(--i-accent);color:#fff;display:grid;
          place-items:center;font-family:Barlow,system-ui,sans-serif;font-weight:700;font-size:15px;flex:none}
        .idpm .wrap{max-width:560px;margin:0 auto;padding:16px 16px 104px}
        .idpm .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .idpm .tile{background:var(--i-surface);border:1px solid var(--i-line);border-radius:10px;padding:10px;
          min-height:78px;display:flex;flex-direction:column;justify-content:space-between;text-align:left}
        .idpm .tile .l{font-size:12px;color:var(--i-muted);line-height:1.2}
        .idpm .tile .v{font-family:Barlow,system-ui,sans-serif;font-weight:700;font-size:19px;line-height:1.1;margin-top:6px}
        .idpm .tile .f{font-size:11.5px;color:var(--i-faint);margin-top:4px}
        @media (max-width:360px){.idpm .tiles{grid-template-columns:1fr 1fr}.idpm .tile:first-child{grid-column:1/-1}}
        .idpm .alert{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:10px;width:100%;
          background:var(--i-warn-soft);border-left:4px solid var(--i-warn);min-height:56px;text-align:left}
        .idpm .action{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--i-surface);
          border:1px solid var(--i-line);border-radius:14px;padding:14px;min-height:64px;box-shadow:var(--i-shadow)}
        .idpm .action:active{transform:scale(.99)}
        .idpm .action .ic{width:44px;height:44px;border-radius:12px;background:var(--i-surface-2);display:grid;
          place-items:center;flex:none;border:1px solid var(--i-line);font-size:20px}
        .idpm .action .h{font-family:Barlow,system-ui,sans-serif;font-weight:600;font-size:17.5px}
        .idpm .action .dsc{font-size:14px;color:var(--i-muted);margin-top:2px}
        .idpm .action.primary{background:var(--i-ink);border-color:var(--i-ink);color:#fff}
        .idpm .action.primary .ic{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.14)}
        .idpm .action.primary .dsc{color:var(--i-header-muted)}
        .idpm .action.accent{background:var(--i-accent);border-color:var(--i-accent);color:#fff}
        .idpm .action.accent .ic{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.25)}
        .idpm .action.accent .dsc{color:#fff;opacity:.85}
        .idpm .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .idpm .gbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
          background:var(--i-surface);border:1px solid var(--i-line);border-radius:10px;min-height:84px;padding:10px 6px;
          font-family:Barlow,system-ui,sans-serif;font-weight:600;font-size:14px;text-align:center;line-height:1.15}
        .idpm .gbtn .e{font-size:22px}
        .idpm .sect{font-family:Barlow,system-ui,sans-serif;font-size:15px;font-weight:600;letter-spacing:.06em;
          text-transform:uppercase;color:var(--i-muted);margin-top:4px}
        .idpm .nav{position:fixed;left:0;right:0;bottom:0;z-index:40;display:grid;grid-template-columns:repeat(5,1fr);
          background:#fff;border-top:1px solid var(--i-line);padding:6px 4px calc(8px + env(safe-area-inset-bottom));
          max-width:560px;margin:0 auto}
        .idpm .nav button{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:56px;padding:6px 2px;
          border-radius:12px;color:var(--i-muted);font-family:Barlow,system-ui,sans-serif;font-size:12px;font-weight:600}
        .idpm .nav button .e{font-size:21px;line-height:1}
        .idpm .nav button[data-on="1"]{color:var(--i-accent)}
        .idpm .nav .cnt{position:absolute;margin-left:20px;margin-top:-3px;background:var(--i-accent);color:#fff;
          font-size:11px;font-weight:700;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:grid;place-items:center}
        .idpm .list{display:flex;flex-direction:column;background:var(--i-surface);border:1px solid var(--i-line);
          border-radius:14px;overflow:hidden}
        .idpm .item{display:flex;align-items:center;gap:12px;padding:12px 14px;min-height:60px;
          border-top:1px solid var(--i-line);text-align:left;width:100%}
        .idpm .item:first-child{border-top:0}
      `}</style>

      {/* ── THE BAR AT THE TOP, only when nothing else is drawing one ──
          /idp renders this inside IdpDiscussion's own Shell, which already
          has a navy header with the logo, ← Genie and the initials. Drawing
          a second one under it is what broke the page. */}
      {!embedded && (
      <div className="top">
        <div className="logo">N</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="disp" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>Nandan Genie</div>
          <div style={{ fontSize: 12.5, color: "var(--i-header-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.linked ? `${d.me.id} · ${d.me.designation || d.me.type}` : "Employee self-service"}
          </div>
        </div>
        <div className="avatar">{initials || "N"}</div>
      </div>
      )}
      {msg && <div className="px-4 pt-3 text-sm font-semibold" style={{ color: msg.endsWith("✓") ? C.green : C.red }}>{msg}</div>}

      <div className="wrap">
        {tab === "home" ? (
          <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--i-muted)" }}>{d.today}</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.15 }}>
            Namaste, {d.linked ? firstName(d.me.name) : firstName(name)}
          </h1>
          {d.linked && (
            <>
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {d.me.designation || d.me.type}{d.me.department ? ` · ${d.me.department}` : ""}
              </div>
              <div style={{ color: "var(--i-muted)", fontSize: 14, marginTop: 2 }}>
                {d.me.id}{d.me.doj ? ` · with Nandan since ${when(d.me.doj)}` : ""}{d.me.manager ? ` · reports to ${d.me.manager}` : ""}
              </div>
            </>
          )}
        </div>

        {!d.linked && (
          <div className="alert"><div style={{ flex: 1, fontSize: 15 }}>
            Your login is not linked to your employee record yet. Ask HR to set your Genie user on your record, and everything below fills in.
          </div></div>
        )}

        {d.linked && (
          <>
            <div className="tiles">
              <button className="tile" onClick={() => setTab("slips")}>
                <div className="l">Last net pay</div>
                <div className="v tnum">₹{inr(latest?.net)}</div>
                <div className="f">{latest ? `for ${MONTHS[latest.month - 1]} ${latest.year}` : "no month yet"}</div>
              </button>
              <button className="tile" onClick={() => setTab("leave")}>
                <div className="l">Leave balance</div>
                <div className="v tnum">{d1(latest?.slip?.leave_cb)}</div>
                <div className="f">{latest ? `as at ${MONTHS[latest.month - 1].slice(0, 3)} ${latest.year}` : "no month yet"}</div>
              </button>
              <button className="tile" onClick={() => setTab("loan")}>
                <div className="l">Loan balance</div>
                <div className="v tnum">₹{inr(latest?.slip?.loan_cb ?? 0)}</div>
                <div className="f">{latest ? `as at ${MONTHS[latest.month - 1].slice(0, 3)} ${latest.year}` : "—"}</div>
              </button>
            </div>

            {/* what is actually waiting on him, not a general notice */}
            {pending.map((pnd) => (
              <button key={pnd} className="alert" onClick={() => setTab(/handbook/i.test(pnd) ? "handbook" : "learning")}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1, fontSize: 15 }}><b>Waiting on you:</b> {pnd}</div>
                <span className="disp" style={{ fontWeight: 600, color: "var(--i-warn)" }}>Open</span>
              </button>
            ))}

            {teamBox}
            {dashboard}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="action accent" onClick={() => { setApply("leave"); setMsg(""); }}>
                <div className="ic">🗓️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h">Apply for Leave</div>
                  <div className="dsc">{latest?.slip?.leave_cb != null ? `${d1(latest.slip.leave_cb)} days available` : "Goes to your reporting manager"}</div>
                </div>
                <span style={{ opacity: .8 }}>›</span>
              </button>
              <button className="action" onClick={() => setTab("slips")}>
                <div className="ic">📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h">Payslip{latest ? ` for ${MONTHS[latest.month - 1]} ${latest.year}` : "s"}</div>
                  <div className="dsc">View, download, or ask a question</div>
                </div>
                <span style={{ color: "var(--i-faint)" }}>›</span>
              </button>
              <button className="action" onClick={() => setTab("queries")}>
                <div className="ic">💬</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h">Ask HR</div>
                  <div className="dsc">{openQ ? `${openQ} open · ` : ""}Leave, pay, uniform, safety</div>
                </div>
                <span style={{ color: "var(--i-faint)" }}>›</span>
              </button>
              <button className="action" onClick={() => setTab("learning")}>
                <div className="ic">🎯</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="h">Learning Goals</div>
                  <div className="dsc">{d.learning.length ? `${d.learning.length} noted` : "Set with your manager"}</div>
                </div>
                <span style={{ color: "var(--i-faint)" }}>›</span>
              </button>
            </div>

            <div className="sect">Requests</div>
            <div className="grid3">
              {APPLY.filter(([k]) => k !== "leave").map(([k, l]) => (
                <button key={k} className="gbtn" onClick={() => { setApply(k); setMsg(""); }}>
                  <span className="e">{APPLY_ICON[k] || "•"}</span>
                  <span>{l.replace(/^Apply for /, "")}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--i-faint)", textAlign: "center" }}>
              Every request goes to your reporting manager first, then to HR.
            </div>
          </>
        )}
      </div>
      </div>
        ) : tab === "idpform" ? (
          <>{idpPanel ?? <Empty>The IDP is not open on this page.</Empty>}</>
        ) : !d.linked ? null : tab === "records" ? (
          <>
            <Note>Your record as HR holds it. Spot a mistake? <a href="/hrms/query" target="_blank" rel="noreferrer" style={{ color: C.orange, fontWeight: 700 }}>Tell HR through HR Queries</a> and it is corrected on the record, not here.</Note>
            {d.record.map((g) => (
              <Card key={g.key} title={g.label}>
                {g.fields.map((f) => (
                  <div key={f.key} className="flex gap-2 py-1.5 text-sm" style={{ borderTop: "1px solid #F4F2EC" }}>
                    <div style={{ color: C.faint, flex: "0 0 42%" }}>{f.label}</div>
                    <div style={{ flex: 1, wordBreak: "break-word" }}>{f.kind === "url" ? <a href={f.value} target="_blank" rel="noreferrer" style={{ color: C.orange, fontWeight: 700 }}>open ↗</a> : f.kind === "date" ? when(f.value) : f.value}</div>
                  </div>
                ))}
              </Card>
            ))}
          </>
        ) : tab === "slips" ? (
          !REGISTERS_READY ? <ComingSoon what="Payslips" line="Your monthly slips will open here, one for each month HR has closed." /> : (
          <>
            <Note>Every month HR has closed, newest first. A month opens as your salary slip once it is frozen.</Note>
            {d.months.length === 0 && <Empty>No month yet.</Empty>}
            {d.months.map((m) => (
              <a key={m.id} href={m.frozen ? `/my/salary-slips/${m.id}` : undefined} className="flex items-center gap-3 rounded-lg px-3 py-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.line}`, textDecoration: "none", color: C.ink, opacity: m.frozen ? 1 : 0.65 }}>
                <div style={{ flex: 1 }}><div className="font-bold text-sm">{MONTHS[m.month - 1]} {m.year}</div><div className="text-xs" style={{ color: C.faint }}>{m.frozen ? `Attendance ${d1(m.slip?.attendance)} · paid days ${d1(m.slip?.paid_days)}` : "Not frozen yet — the figures may still change"}</div></div>
                <div className="tnum font-bold" style={{ fontSize: 16 }}>₹{inr(m.net)}</div>
                {m.frozen && <span style={{ color: C.orange, fontWeight: 700 }}>›</span>}
              </a>
            ))}
          </>
          )
        ) : tab === "leave" ? (
          !REGISTERS_READY ? <ComingSoon what="Leave Register" line="Your leave — opening, earned, comp off, used and closing, month by month." /> : (
          <>
            <Note>Opening + earned + comp off − used − encashed = closing, month by month. Comp off is added to your leave and taken out again when it is encashed.</Note>
            <Table head={["Month", "OB", "Earned", "Comp off", "Used", "Encashed", "Closing"]} rows={d.months.filter((m) => m.slip && m.slip.leave_cb != null).map((m) => [`${MONTHS[m.month - 1].slice(0, 3)} ${m.year}`, d1(m.slip!.leave_ob), d1(m.slip!.leave_added), d1(m.slip!.compoff_days), d1(m.slip!.leave_used), d1(m.slip!.leave_encashed), <b key="c">{d1(m.slip!.leave_cb)}</b>])} />
          </>
          )
        ) : tab === "loan" ? (
          !REGISTERS_READY ? <ComingSoon what="Loan Register" line="Your loan — opening, taken, deducted and closing, month by month." /> : (
          <>
            <Note>Opening + taken − deducted = closing, month by month.</Note>
            <Table head={["Month", "OB", "Taken", "Deducted", "Closing"]} rows={d.months.filter((m) => m.slip && (m.slip.loan_cb != null || m.slip.loan_ded)).map((m) => [`${MONTHS[m.month - 1].slice(0, 3)} ${m.year}`, `₹${inr(m.slip!.loan_ob)}`, `₹${inr(m.slip!.loan_added)}`, `₹${inr(m.slip!.loan_ded)}`, <b key="c">₹{inr(m.slip!.loan_cb)}</b>])} />
          </>
          )
        ) : tab === "idp" ? (
          <>
            {/* HIS ORDER (Dr Raghu, 7 Sep 2026): "show the table up front,
                then Raghu's message, then the Growth Plan, then the Role,
                responsibility, KRA, KPI, Competence, then his form filled
                up." Read top to bottom, it is the whole conversation. */}

            {/* 1 · the table */}
            {d.salary && (
              <Card title="Your salary, as it stands">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <tbody>
                    {/* every earning line, up to the gross and no further
                        (Dr Raghu, 7 Sep 2026: "use all the fields, upto
                        gross") — what is below it is deductions and cost to
                        the company, and neither is what he asked to show. */}
                    {d.salary.rows.slice(0, d.salary.rows.findIndex((x) => x.kind === "total") + 1)
                      .filter((r) => r.kind !== "note" && r.kind !== "head" && r.monthly != null).map((r, i) => (
                      <tr key={i} style={{ background: r.kind === "total" ? "#FFF9C4" : undefined, fontWeight: r.kind === "row" ? 400 : 700 }}>
                        <td style={{ padding: "5px 6px", borderTop: "1px solid #EEECE6" }}>{r.label}</td>
                        <td className="tnum" style={{ padding: "5px 6px", borderTop: "1px solid #EEECE6", textAlign: "right" }}>₹{inr(r.monthly)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* WHEN IT STARTS (Dr Raghu, 7 Sep 2026). The figures are the
                    new ones and a man reading them needs to know from which
                    month they are his — otherwise he checks them against
                    July's slip and thinks something is wrong. */}
                <div className="text-sm mt-2" style={{ fontWeight: 700 }}>
                  IDP valid from 1st August 2026.
                </div>
              </Card>
            )}

            {/* 2 · Raghu's message to everybody */}
            <Card title="A message from Dr Raghunandan Jagdish">
              <audio controls preload="none" style={{ width: "100%" }} src="/raghu-message.mp3"
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
              <div className="text-sm mt-2" style={{ lineHeight: 1.7 }}>
                Every one of you matters to Nandan, and this year&apos;s plan is how we get the best from each other.
                Read your growth note below, and your role beneath it.
              </div>
            </Card>

            {/* 3 · the growth plan */}
            {d.growth && (
              <Card title="Your growth plan" tone="amber">
                <div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{d.growth.note}</div>
                {d.growth.hi && (
                  <div className="text-sm mt-3 pt-3" style={{ whiteSpace: "pre-wrap", lineHeight: 1.85, borderTop: "1px solid #EEECE6" }}>{d.growth.hi}</div>
                )}
              </Card>
            )}

            {/* 4 · the role, and what it asks of them */}
            {d.roles?.map((r, i) => (
              <Card key={i} title={`Your role — ${r.role}`}>
                {r.job_description && <><div className="text-xs font-bold" style={{ color: C.faint }}>WHAT THE JOB IS</div><div className="text-sm mb-2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{r.job_description}</div></>}
                {r.deliverable && <><div className="text-xs font-bold" style={{ color: C.faint }}>WHAT YOU MUST DELIVER — KRA</div><div className="text-sm mb-2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{r.deliverable}</div></>}
                {r.metric && <><div className="text-xs font-bold" style={{ color: C.faint }}>HOW IT IS MEASURED — KPI</div><div className="text-sm mb-2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{r.metric}</div></>}
                {r.competencies.length > 0 && (
                  <>
                    <div className="text-xs font-bold" style={{ color: C.faint }}>COMPETENCIES THIS ROLE ASKS FOR</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {r.competencies.map((c, k) => (
                        <span key={k} title={c.note || undefined} className="rounded px-2 py-1 text-xs font-semibold"
                          style={{ background: "#F4F2EC", border: `1px solid ${C.line}` }}>
                          {c.competency}{c.level ? ` · ${c.level}` : ""}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            ))}

            {/* 5 · and finally, what they wrote themselves */}
            {d.released.map((r, i) => (
              <Card key={i} title={`Released — ${r.cycle}`} tone="green">
                {r.new_designation && <div className="text-sm"><b>Designation:</b> {r.new_designation}</div>}
                {r.new_gross != null && <div className="text-sm"><b>Gross:</b> ₹{inr(r.prev_gross)} → <b>₹{inr(r.new_gross)}</b> a month</div>}
                {r.brief && <div className="text-sm mt-2" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{r.brief}</div>}
                <div className="text-xs mt-2" style={{ color: C.faint }}>Released {when(r.at)}</div>
              </Card>
            ))}
            {d.idps.length === 0 && <Empty>No IDP submitted yet.</Empty>}
            {d.idps.map((idp) => {
              const rv = d.reviews.filter((r) => r.idp_id === idp.id);
              return (
                <div key={idp.id}>
                  <Card title={`My IDP · ${idp.cycle} · submitted ${when(idp.submitted_at)}`}>
                    <div className="text-xs mb-1" style={{ color: C.faint }}>How I rated myself{rv.length ? ", and how it came back" : ""}</div>
                    <Table head={["", "Me", ...rv.map((r) => r.reviewer || "Reviewer")]} rows={IDP_RATINGS.map((dim) => [dim.key, <b key="m">{idp.ratings?.[dim.key] ?? "—"}</b>, ...rv.map((r, i) => <span key={i} style={{ color: C.orange, fontWeight: 700 }}>{r.ratings?.[dim.key] ?? "—"}</span>)])} />
                    {rv.filter((r) => r.notes).map((r, i) => <div key={i} className="text-sm mt-2 rounded p-2" style={{ background: "#FFF3E8", whiteSpace: "pre-wrap", lineHeight: 1.6 }}><b>{r.reviewer || "Reviewer"}:</b> {r.notes}</div>)}
                  </Card>
                  {IDP_SECTIONS.map((sec) => {
                    const qs = sec.questions.filter((q) => (idp.answers?.[q.id] || "").trim());
                    return qs.length ? (
                      <Card key={sec.key} title={sec.title}>
                        {qs.map((q) => <div key={q.id} className="py-1.5" style={{ borderTop: "1px solid #F4F2EC" }}><div className="text-xs font-bold" style={{ color: C.dim }}>{q.label}</div><div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{idp.answers[q.id]}</div></div>)}
                      </Card>
                    ) : null;
                  })}
                </div>
              );
            })}
            {children}
          </>
        ) : tab === "learning" ? (
          <Learning d={d} onChanged={load} setMsg={setMsg} />
        ) : tab === "handbook" ? (
          <>
            <a href="/idp/employee-handbook" className="block rounded-lg p-4" style={{ background: C.navy, color: "#fff", textDecoration: "none" }}>
              <div className="font-bold" style={{ fontSize: 16 }}>📘 Open the Employee Handbook</div>
              <div className="text-xs mt-1" style={{ color: "#8FA1B3", lineHeight: 1.6 }}>Edition {d.handbook.edition}. English, हिन्दी or मराठी. Read it, ask HR under any section, and acknowledge at the end.</div>
            </a>
            <div className="text-sm mt-3" style={{ color: d.handbook.acknowledged ? C.green : "#8A5B00" }}>{d.handbook.acknowledged ? `✓ You acknowledged this edition on ${when(d.handbook.acknowledged)}.` : "You have not acknowledged this edition yet."}</div>
          </>
        ) : tab === "queries" ? (
          <>
            <a href="/hrms/query" target="_blank" rel="noreferrer" className="block rounded-lg p-3 mb-3 text-sm font-bold" style={{ background: C.orange, color: "#fff", textDecoration: "none" }}>+ Raise an HR query ↗</a>
            {d.queries.length === 0 && <Empty>Nothing raised yet.</Empty>}
            {d.queries.map((q) => (
              <Card key={q.id} title={q.subject} tone={q.status === "Open" ? "amber" : "plain"}>
                <div className="text-xs" style={{ color: C.faint }}>{q.topic} · {when(q.raised_at)} · {q.status}</div>
                {q.question && <div className="text-sm mt-1" style={{ whiteSpace: "pre-wrap", color: C.dim, lineHeight: 1.6 }}>{q.question}</div>}
                {q.answer && <div className="text-sm mt-2 rounded p-2" style={{ background: "#E6F4EA", whiteSpace: "pre-wrap", lineHeight: 1.6 }}><b>HR{q.answered_by ? ` (${String(q.answered_by).split("·")[0].trim()})` : ""}:</b> {q.answer}</div>}
              </Card>
            ))}
          </>
        ) : tab === "more" ? (
          /* EVERYTHING THE FIVE DO NOT CARRY. The old nine-tab strip lives on
             here as a list — reachable, but not in the way of the four things
             a man opens this page for. */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} key="more">
            <div className="list">
              {([["records", "HRIS record", "Address, bank, nominee, ID proofs"],
                 ["loan", "Loan register", "Opening, added, deducted, closing"],
                 ["idp", "IDP results", "Your sheet, the growth plan, your role"],
                 ["learning", "Learning goals", "What you are working towards"],
                 ["handbook", "Employee Handbook", `Edition ${d.handbook.edition}${d.handbook.acknowledged ? " · acknowledged" : " · not yet acknowledged"}`],
                ] as [Tab, string, string][]).map(([k, h, sub]) => (
                <button key={k} className="item" onClick={() => setTab(k)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{h}</div>
                    <div style={{ fontSize: 13.5, color: "var(--i-muted)", marginTop: 1 }}>{sub}</div>
                  </div>
                  <span style={{ color: "var(--i-faint)" }}>›</span>
                </button>
              ))}
            </div>

            <div className="sect">Requests</div>
            <div className="grid3">
              {APPLY.map(([k, l]) => (
                <button key={k} className="gbtn" onClick={() => { setApply(k); setMsg(""); }}>
                  <span className="e">{APPLY_ICON[k] || "•"}</span>
                  <span>{l.replace(/^Apply for /, "")}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--i-faint)", textAlign: "center" }}>
              Nandan Genie · genie.nandan.co.in · Nandan GSE Pvt Ltd
            </div>
          </div>
        ) : null}
      </div>

      {/* ── the five along the bottom, where a thumb reaches ── */}
      <div className="nav">
        {([["home", "Home", "\u{1F3E0}"], ["leave", "Leave", "\u{1F5D3}\uFE0F"], ["slips", "Pay", "\u{1F4C4}"],
           ["queries", "Ask HR", "\u{1F4AC}"], ["more", "More", "\u2630"]] as [Tab, string, string][]).map(([k, l, e]) => (
          <button key={k} data-on={tab === k || (k === "more" && !["home", "leave", "slips", "queries"].includes(tab)) ? "1" : "0"}
            onClick={() => setTab(k)}>
            {k === "queries" && openQ > 0 && <span className="cnt">{openQ}</span>}
            <span className="e">{e}</span>
            <span>{l}</span>
          </button>
        ))}
      </div>

      {apply && d.linked && <ApplyBox kind={apply} spec={d.kinds[apply]} onClose={() => setApply(null)} onDone={(s) => { setApply(null); setMsg(`Sent to HR: ${s} ✓`); setTab("queries"); load(); }} />}
    </div>
  );
}

function Tile({ label, value, hint, onClick }: { label: string; value: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg p-2 text-left" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-xs" style={{ color: C.faint }}>{label}</div>
      <div className="font-bold tnum" style={{ fontSize: 17, lineHeight: 1.2 }}>{value}</div>
      <div className="text-xs" style={{ color: C.faint }}>{hint}</div>
    </button>
  );
}
function Card({ title, children, tone = "plain" }: { title: string; children: React.ReactNode; tone?: "plain" | "green" | "amber" }) {
  const bg = tone === "green" ? "#E6F4EA" : tone === "amber" ? "#FFF7E6" : "#fff";
  return <div className="rounded-lg p-3 mb-2" style={{ background: bg, border: `1px solid ${C.line}` }}><div className="font-bold text-sm mb-1">{title}</div>{children}</div>;
}
const Note = ({ children }: { children: React.ReactNode }) => <div className="text-xs mb-2" style={{ color: C.dim, lineHeight: 1.6 }}>{children}</div>;
const Empty = ({ children }: { children: React.ReactNode }) => <div className="rounded-lg p-4 text-sm" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.faint }}>{children}</div>;
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  return (
    <div className="rounded-lg overflow-x-auto" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <table className="text-xs genie-table" style={{ borderCollapse: "collapse", minWidth: "100%" }}>
        <thead><tr>{head.map((h, i) => <th key={i} className="px-2 py-2 text-left" style={{ background: "#F4F2EC", color: C.dim, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-2 tnum" style={{ borderTop: "1px solid #F4F2EC", whiteSpace: "nowrap" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ApplyBox({ kind, spec, onClose, onDone }: { kind: string; spec: { label: string; fields: Field[] }; onClose: () => void; onDone: (subject: string) => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try { const j = await api.post("/api/my/sheet", { action: "apply", kind, fields: f }); onDone(String(j.subject || spec.label)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} role="button" tabIndex={0} onClick={onClose}>
      <div className="w-full p-4" style={{ background: "#fff", borderRadius: "14px 14px 0 0", maxWidth: 640, maxHeight: "88vh", overflowY: "auto" }} role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
        <div className="font-bold" style={{ fontSize: 18 }}>Apply for {spec.label}</div>
        <div className="text-xs mt-1" style={{ color: C.faint }}>Goes to HR as an application under HR Queries. You see the answer there.</div>
        {err && <div className="text-sm font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
        {spec.fields.map((fl) => (
          <div key={fl.key} className="mt-3">
            <div className="text-xs font-bold mb-1" style={{ color: C.dim }}>{fl.label}{fl.required ? " *" : ""}</div>
            {fl.type === "select" ? (
              <select value={f[fl.key] || ""} onChange={(e) => setF({ ...f, [fl.key]: e.target.value })} className="w-full rounded px-3 py-2.5 text-sm bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">—</option>{(fl.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            ) : fl.type === "text" ? (
              <textarea value={f[fl.key] || ""} onChange={(e) => setF({ ...f, [fl.key]: e.target.value })} rows={2} className="w-full rounded px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.line}` }} />
            ) : (
              <input type={fl.type} value={f[fl.key] || ""} onChange={(e) => setF({ ...f, [fl.key]: e.target.value })} className="w-full rounded px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.line}` }} />
            )}
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <button onClick={send} disabled={busy} className="flex-1 rounded font-bold py-3 text-sm" style={{ background: C.orange, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Submit to HR"}</button>
          <button onClick={onClose} className="rounded font-bold py-3 px-4 text-sm" style={{ background: "#F4F2EC", color: C.dim }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Learning({ d, onChanged, setMsg }: { d: Sheet; onChanged: () => void; setMsg: (s: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const idp = d.idps[0];
  const add = async () => {
    setBusy(true);
    try { await api.post("/api/my/sheet", { action: "learning", note }); setNote(""); setMsg("Added to your learning log ✓"); onChanged(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Card title="My learning goals" tone="plain">
        {idp?.answers?.learning ? <div className="text-sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{idp.answers.learning}</div> : <div className="text-sm" style={{ color: C.faint }}>You have not written learning goals in your IDP yet.</div>}
        {idp?.answers?.next_role && <div className="text-sm mt-3" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}><b>Where I want to be in two to three years:</b> {idp.answers.next_role}</div>}
      </Card>
      <Card title="What I did towards them">
        <div className="text-xs mb-2" style={{ color: C.faint }}>A line whenever you learn something — a machine, a drawing, a customer, a course. Dated, yours, and read at your next IDP.</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="This week I…" className="w-full rounded px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.line}` }} />
        <button onClick={add} disabled={busy || !note.trim()} className="mt-2 rounded font-bold px-4 py-2.5 text-sm" style={{ background: C.orange, color: "#fff", opacity: busy || !note.trim() ? 0.5 : 1 }}>+ Add</button>
        {d.learning.map((l) => (
          <div key={l.id} className="flex gap-2 py-2 text-sm" style={{ borderTop: "1px solid #F4F2EC" }}>
            <div className="text-xs" style={{ color: C.faint, flex: "0 0 74px" }}>{when(l.at)}</div>
            <div style={{ flex: 1, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{l.note}</div>
            <button onClick={async () => { await api.post("/api/my/sheet", { action: "learning_remove", id: l.id }); onChanged(); }} className="text-xs" style={{ color: C.faint }} title="Remove">✕</button>
          </div>
        ))}
      </Card>
    </>
  );
}
