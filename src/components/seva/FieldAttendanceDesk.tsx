"use client";
/**
 * FIELD ATTENDANCE, ON THE SEVA DESK (12 Oct 2026). What the outdoor service
 * team punched on /idp/attendance — a day or a range: first in, last out,
 * hours, the place on the map, the photos. Nobody types here; the phone is
 * the record.
 */
import { useEffect, useState } from "react";

interface P { id: string; employee_id: string; employee_name: string; kind: "in" | "out"; at: string; day: string; lat: number; lng: number; accuracy_m: number | null; photo_url: string | null }
interface Person { id: string; name: string; designation: string | null }
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const mins = (ps: P[]) => { let m = 0, open: P | null = null; for (const p of ps) { if (p.kind === "in") open = p; else if (open) { m += (new Date(p.at).getTime() - new Date(open.at).getTime()) / 60000; open = null; } } return Math.round(m); };
const hrs = (m: number) => (m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—");
const ctl: React.CSSProperties = { border: "1px solid var(--line)", background: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 12 };

export default function FieldAttendanceDesk() {
  const [from, setFrom] = useState(today()); const [to, setTo] = useState(today());
  const [d, setD] = useState<{ installed: boolean; team: Person[]; punches: P[] } | null>(null);
  const [big, setBig] = useState<string | null>(null);
  /* "make a view by calendar. name on left and dates on the column headings" (Dr Raghu, 12 Oct 2026) */
  const [view, setView] = useState<"list" | "calendar">(() => { try { return (localStorage.getItem("seva.att.view") as "list" | "calendar") || "list"; } catch { return "list"; } });
  const [cell, setCell] = useState<{ person: Person; day: string } | null>(null);
  const pick = (v: "list" | "calendar") => {
    setView(v); try { localStorage.setItem("seva.att.view", v); } catch { /* fine */ }
    /* a calendar of one day is a list — open it on this month so far */
    if (v === "calendar" && from === to) { const t = today(); setFrom(t.slice(0, 8) + "01"); setTo(t); }
  };
  const monthSoFar = () => { const t = today(); setFrom(t.slice(0, 8) + "01"); setTo(t); };
  const weekSoFar = () => { const t = today(); const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); setFrom(d.toISOString().slice(0, 10)); setTo(t); };
  useEffect(() => { setD(null); fetch(`/api/seva/attendance?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ installed: true, team: [], punches: [] })); }, [from, to]);
  const days: string[] = [];
  for (let x = new Date(from + "T00:00:00Z"); x <= new Date(to + "T00:00:00Z") && days.length < 62; x.setUTCDate(x.getUTCDate() + 1)) days.push(x.toISOString().slice(0, 10));
  const of = (id: string, dd: string) => (d?.punches || []).filter((p) => p.employee_id === id && p.day === dd);
  const present = new Set((d?.punches || []).filter((p) => p.day === to).map((p) => p.employee_id));
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: "var(--navy)" }}>Field attendance</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>punched on genie.nandan.co.in/idp/attendance — GPS and a photo each time</span>
      </div>
      {/* TODAY, THEN FROM AND TO (Dr Raghu, 12 Oct 2026) — the same date in both is that one day */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(["list", "calendar"] as const).map((v) => <button key={v} onClick={() => pick(v)} style={{ ...ctl, fontWeight: 700, background: view === v ? "var(--accent)" : "#fff", color: view === v ? "#fff" : "var(--navy)", borderColor: view === v ? "var(--accent)" : "var(--line)" }}>{v === "list" ? "☰ List" : "▦ Calendar"}</button>)}
        <span style={{ width: 8 }} />
        <button onClick={() => { setFrom(today()); setTo(today()); }} style={{ ...ctl, fontWeight: 700, background: from === today() && to === today() ? "var(--navy)" : "#fff", color: from === today() && to === today() ? "#fff" : "var(--navy)" }}>Today</button>
        <button onClick={weekSoFar} style={{ ...ctl, fontWeight: 700 }}>This week</button>
        <button onClick={monthSoFar} style={{ ...ctl, fontWeight: 700 }}>This month</button>
        <span className="text-xs font-bold" style={{ color: "var(--dim)", marginLeft: 6 }}>From</span>
        <input type="date" value={from} max={today()} onChange={(e) => { const v = e.target.value; setFrom(v); if (v > to) setTo(v); }} style={ctl} />
        <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>To</span>
        <input type="date" value={to} min={from} max={today()} onChange={(e) => { const v = e.target.value; setTo(v); if (v < from) setFrom(v); }} style={ctl} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>{from === to ? `one day — ${new Date(from + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : `${days.length} days`}</span>
      </div>
      {!d && <div className="text-sm" style={{ color: "var(--muted)" }}>Reading…</div>}
      {d && !d.installed && <div className="text-sm font-bold" style={{ color: "var(--red)" }}>Run migration 0225 first — attendance has nowhere to live yet.</div>}
      {d && d.installed && view === "calendar" && <Calendar team={d.team} punches={d.punches} days={days} onCell={(person, day) => setCell({ person, day })} />}
      {d && d.installed && view === "list" && (
        <>
          <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>{d.team.length} on the service team · {from === to ? `${present.size} punched that day` : `${new Set((d.punches || []).map((p) => p.employee_id)).size} punched in these ${days.length} days`}</div>
          <div className="rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
            <table className="genie-table" style={{ minWidth: 760, tableLayout: "fixed" }}>
              <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3, width: 220 }}>Person</th>{days.length > 1 && <th>Day</th>}<th>In</th><th>Out</th><th>Hours</th><th>Where</th><th>Photos</th></tr></thead>
              <tbody>
                {d.team.flatMap((t) => days.map((dd) => {
                  const ps = of(t.id, dd); if (days.length > 1 && !ps.length) return null;
                  const first = ps.find((p) => p.kind === "in"), last = [...ps].reverse().find((p) => p.kind === "out");
                  return (
                    <tr key={t.id + dd} style={ps.length ? undefined : { opacity: 0.55 }}>
                      <td style={{ position: "sticky", left: 0, background: "#fff" }}><b>{t.name}</b><div className="text-xs" style={{ color: "var(--muted)" }}>{t.designation}</div></td>
                      {days.length > 1 && <td className="tnum" style={{ whiteSpace: "nowrap" }}>{new Date(dd + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" })}</td>}
                      <td className="tnum">{first ? hm(first.at) : "—"}</td>
                      <td className="tnum">{last ? hm(last.at) : first ? <span style={{ color: "var(--accent)" }}>still in</span> : "—"}</td>
                      <td className="tnum font-bold">{hrs(mins(ps))}</td>
                      <td className="text-xs">{ps.map((p) => <a key={p.id} href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" className="block hover:underline" style={{ color: "var(--blue)" }}>📍 {p.kind} {hm(p.at)}{p.accuracy_m ? ` ±${p.accuracy_m}m` : ""}</a>)}</td>
                      <td>{ps.filter((p) => p.photo_url).map((p) => <img key={p.id} src={p.photo_url!} alt="" onClick={() => setBig(p.photo_url)} title={`${p.kind} ${hm(p.at)}`} style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 6, display: "inline-block", marginRight: 4, cursor: "zoom-in", border: `2px solid ${p.kind === "in" ? "#15803D" : "#E8711A"}` }} />)}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {cell && d && (
        <div onClick={() => setCell(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-xl bg-white p-4" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center mb-2"><b style={{ color: "var(--navy)", fontSize: 16 }}>{cell.person.name}</b><span className="ml-2 text-sm" style={{ color: "var(--muted)" }}>{new Date(cell.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span><button onClick={() => setCell(null)} className="ml-auto font-bold" style={{ color: "var(--muted)" }}>✕</button></div>
            {of(cell.person.id, cell.day).length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>No punch this day.</div>}
            {of(cell.person.id, cell.day).map((p) => (
              <div key={p.id} className="flex gap-3 items-center py-2" style={{ borderBottom: "1px solid var(--line)" }}>
                {p.photo_url ? <img src={p.photo_url} alt="" onClick={() => setBig(p.photo_url)} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} /> : <div style={{ width: 72 }} />}
                <div><div className="font-bold" style={{ color: p.kind === "in" ? "#15803D" : "#E8711A" }}>{p.kind === "in" ? "In" : "Out"} · {hm(p.at)}</div>
                  <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: "var(--blue)" }}>📍 {p.lat.toFixed(5)}, {p.lng.toFixed(5)}{p.accuracy_m ? ` · ±${p.accuracy_m} m` : ""}</a></div>
              </div>
            ))}
            {of(cell.person.id, cell.day).length > 0 && <div className="text-sm mt-2">Hours: <b>{hrs(mins(of(cell.person.id, cell.day)))}</b></div>}
          </div>
        </div>
      )}
      {big && <div onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}><img src={big} alt="" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 8 }} /></div>}
    </div>
  );
}

/** THE CALENDAR — names down the left, the dates across; each cell the day's in, out and hours. Click one for the photos and the map. */
function Calendar({ team, punches, days, onCell }: { team: Person[]; punches: P[]; days: string[]; onCell: (p: Person, day: string) => void }) {
  const t = today();
  const of = (id: string, dd: string) => punches.filter((p) => p.employee_id === id && p.day === dd);
  return (
    <div className="rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflow: "auto", maxHeight: "72vh" }}>
      <table className="genie-table" style={{ tableLayout: "fixed", width: 220 + 120 + days.length * 84 }}>
        <thead><tr>
          <th style={{ position: "sticky", left: 0, zIndex: 4, width: 220 }}>Name</th>
          <th style={{ position: "sticky", left: 220, zIndex: 4, width: 120 }}>Days · hours</th>
          {days.map((dd) => {
            const dt = new Date(dd + "T00:00:00Z"); const sun = dt.getUTCDay() === 0;
            return <th key={dd} style={{ width: 84, textAlign: "center", padding: "6px 2px", background: dd === t ? "var(--accent)" : sun ? "#334155" : undefined }}><div style={{ fontSize: 11, opacity: 0.8 }}>{dt.toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" })}</div><div>{dt.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" })}</div></th>;
          })}
        </tr></thead>
        <tbody>
          {team.map((person) => {
            const mine = punches.filter((p) => p.employee_id === person.id);
            const present = new Set(mine.map((p) => p.day));
            const total = days.reduce((a, dd) => a + mins(of(person.id, dd)), 0);
            return (
              <tr key={person.id}>
                <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}><b style={{ fontSize: 12.5 }}>{person.name}</b><div style={{ fontSize: 10.5, color: "var(--muted)" }}>{person.designation}</div></td>
                <td className="tnum" style={{ position: "sticky", left: 220, background: "#fff", zIndex: 1, fontSize: 12 }}><b>{present.size}</b> <span style={{ color: "var(--muted)" }}>of {days.length}</span><div style={{ color: "var(--muted)" }}>{hrs(total)}</div></td>
                {days.map((dd) => {
                  const ps = of(person.id, dd);
                  const first = ps.find((p) => p.kind === "in"), last = [...ps].reverse().find((p) => p.kind === "out");
                  const sun = new Date(dd + "T00:00:00Z").getUTCDay() === 0;
                  return (
                    <td key={dd} onClick={() => ps.length && onCell(person, dd)} title={ps.length ? "Photos and the map" : ""} className="tnum" style={{ textAlign: "center", padding: "4px 2px", fontSize: 11, cursor: ps.length ? "pointer" : "default", background: ps.length ? (last ? "#DCFCE7" : "#FEF3C7") : sun ? "#F1F5F9" : undefined }}>
                      {ps.length ? <><div style={{ fontWeight: 700, color: "#15803D" }}>{first ? hm(first.at) : "—"}</div><div style={{ color: last ? "#9A3412" : "var(--accent)" }}>{last ? hm(last.at) : dd === t ? "in" : "no out"}</div><div style={{ color: "var(--muted)" }}>{hrs(mins(ps))}</div></> : <span style={{ color: "#CBD5E1" }}>·</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
