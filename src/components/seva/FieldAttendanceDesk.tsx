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
  useEffect(() => { setD(null); fetch(`/api/seva/attendance?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ installed: true, team: [], punches: [] })); }, [from, to]);
  const days: string[] = [];
  for (let x = new Date(from + "T00:00:00Z"); x <= new Date(to + "T00:00:00Z") && days.length < 62; x.setUTCDate(x.getUTCDate() + 1)) days.push(x.toISOString().slice(0, 10));
  const of = (id: string, dd: string) => (d?.punches || []).filter((p) => p.employee_id === id && p.day === dd);
  const present = new Set((d?.punches || []).filter((p) => p.day === to).map((p) => p.employee_id));
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="font-bold" style={{ fontSize: 20, color: "var(--navy)" }}>Field attendance</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>punched on genie.nandan.co.in/idp/attendance — GPS and a photo each time</span>
        <span className="ml-auto" />
        <button onClick={() => { setFrom(today()); setTo(today()); }} style={{ ...ctl, fontWeight: 700 }}>Today</button>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={ctl} />
        <span className="text-xs">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={ctl} />
      </div>
      {!d && <div className="text-sm" style={{ color: "var(--muted)" }}>Reading…</div>}
      {d && !d.installed && <div className="text-sm font-bold" style={{ color: "var(--red)" }}>Run migration 0225 first — attendance has nowhere to live yet.</div>}
      {d && d.installed && (
        <>
          <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>{d.team.length} on the service team · {present.size} punched on {to}</div>
          <div className="rounded-lg bg-white" style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
            <table className="genie-table" style={{ minWidth: 760 }}>
              <thead><tr><th style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>Person</th>{days.length > 1 && <th>Day</th>}<th>In</th><th>Out</th><th>Hours</th><th>Where</th><th>Photos</th></tr></thead>
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
      {big && <div onClick={() => setBig(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}><img src={big} alt="" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 8 }} /></div>}
    </div>
  );
}
