"use client";
/**
 * The access log (Dr Raghu, 6 Sep 2026): "show by date last 60 days with
 * latest on top. Show this week wise i.e. week 36 then 7 days from Sunday
 * onwards. If the person has logged in then it should mark as dark green
 * and mouseover should show how many records and how many minutes he was
 * on site."
 *
 * One row per ISO week, Sunday first, newest week on top; a day is dark
 * green when the shell's heartbeat saw them; hover says the minutes and the
 * API records the browser pulled that day.
 */
import { useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";

type Day = { day: string; minutes: number; requests: number; first_seen: string; last_seen: string };

const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (s: string) => new Date(s).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const dm = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

export default function AccessLog({ userId }: { userId: string }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [installed, setInstalled] = useState(true);
  useEffect(() => {
    fetch(`/api/usage?user=${encodeURIComponent(userId)}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setDays(j.days || []); setInstalled(j.installed !== false); })
      .catch((e) => { swallow("access-log", e); setDays([]); });
  }, [userId]);

  if (days === null) return <div className="text-xs" style={{ color: "var(--muted)" }}>reading…</div>;
  if (!installed) return <div className="text-xs" style={{ color: "var(--red)" }}>Run migration 0144 first — the access log has nowhere to write yet.</div>;

  const byDay = new Map(days.map((d) => [d.day, d]));
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00Z");
  const weeks: { no: number; start: Date; days: Date[] }[] = [];
  let cursor = new Date(today);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  for (let w = 0; w < 9; w++) {
    const start = new Date(cursor);
    const ds: Date[] = [];
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); ds.push(d); }
    weeks.push({ no: isoWeek(new Date(start.getTime() + 3 * 86400000)), start, days: ds });
    cursor = new Date(start); cursor.setUTCDate(start.getUTCDate() - 7);
  }
  const cutoff = new Date(today); cutoff.setUTCDate(cutoff.getUTCDate() - 60);
  const totalMin = days.reduce((a, d) => a + d.minutes, 0);
  const totalReq = days.reduce((a, d) => a + d.requests, 0);
  const activeDays = days.filter((d) => d.minutes > 0).length;

  return (
    <div>
      <div className="flex gap-4 flex-wrap text-xs mb-3" style={{ color: "var(--dim)" }}>
        <span><b style={{ color: "var(--navy)" }}>{activeDays}</b> days on Genie in the last 60</span>
        <span><b style={{ color: "var(--navy)" }}>{totalMin}</b> minutes</span>
        <span><b style={{ color: "var(--navy)" }}>{totalReq}</b> records pulled</span>
        <span className="ml-auto" style={{ color: "var(--muted)" }}>Sunday to Saturday · newest week on top · hover a day</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="genie-table" style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 12 }}>
          <thead>
            <tr>
              <th className="text-left pr-2" style={{ color: "var(--muted)", fontWeight: 600 }}>Week</th>
              {DOW.map((d) => <th key={d} style={{ color: "var(--muted)", fontWeight: 600, minWidth: 54 }}>{d}</th>)}
              <th className="text-right pl-2" style={{ color: "var(--muted)", fontWeight: 600 }}>min</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const wk = w.days.map((d) => byDay.get(iso(d)));
              const wmin = wk.reduce((a, d) => a + (d?.minutes || 0), 0);
              return (
                <tr key={iso(w.start)}>
                  <td className="pr-2 tnum" style={{ color: "var(--navy)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    Week {w.no}<div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>{dm(w.start)}</div>
                  </td>
                  {w.days.map((d, i) => {
                    const rec = wk[i];
                    const future = d > today, old = d < cutoff, out = future || old;
                    const on = !!rec && rec.minutes > 0;
                    const title = out ? "" : rec
                      ? `${dm(d)}: ${rec.minutes} min on site · ${rec.requests} records · ${hm(rec.first_seen)}–${hm(rec.last_seen)}`
                      : `${dm(d)}: not on Genie`;
                    return (
                      <td key={i} title={title} className="text-center tnum" style={{
                        height: 34, borderRadius: 5, cursor: out ? "default" : "help",
                        background: out ? "transparent" : on ? "#0B5D2E" : "var(--paper)",
                        color: on ? "#fff" : out ? "#D9D6CD" : "var(--muted)",
                        fontWeight: on ? 700 : 400, border: `1px solid ${out ? "transparent" : on ? "#0B5D2E" : "var(--line)"}`,
                      }}>
                        {d.getUTCDate()}{on && <div style={{ fontSize: 9, fontWeight: 400 }}>{rec.minutes}m</div>}
                      </td>
                    );
                  })}
                  <td className="text-right pl-2 tnum" style={{ color: wmin ? "var(--navy)" : "#B8B5AC", fontWeight: 600 }}>{wmin || "·"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>A minute is counted while the tab is open and visible; records are the API calls the browser made. Thresholds for copying or screenshotting come next, on these numbers.</div>
    </div>
  );
}
