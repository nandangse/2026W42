"use client";
/**
 * CHECK IN, CHECK OUT — the outdoor service team (Dr Raghu, 12 Oct 2026:
 * "a button check in - check out with gps coordinate captured and also
 * photo"). One big button. Pressing it opens the camera; the photo is made
 * small on the phone, the GPS fix is taken at that moment, and both go up
 * together — a punch without either is refused.
 */
import { useEffect, useRef, useState } from "react";

interface Punch { id: string; kind: "in" | "out"; at: string; day: string; lat: number; lng: number; accuracy_m: number | null; photo_url?: string | null }
interface D { installed?: boolean; me: { id: string; name: string; designation: string | null }; mayPunch: boolean; today: string; todays: Punch[]; punches: Punch[] }

const NAVY = "#1B2A41", ORANGE = "#E8711A", GREEN = "#15803D", RED = "#B3392E", MUTED = "#6B7280";
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const dmy = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const map = (p: Punch) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

/** worked minutes in a day: every in closed by the next out; an open in counts to now only for today */
function worked(ps: Punch[], today: string): number {
  const asc = [...ps].sort((a, b) => a.at.localeCompare(b.at));
  let m = 0, open: Punch | null = null;
  for (const p of asc) {
    if (p.kind === "in") open = p;
    else if (open) { m += (new Date(p.at).getTime() - new Date(open.at).getTime()) / 60000; open = null; }
  }
  if (open && open.day === today) m += (Date.now() - new Date(open.at).getTime()) / 60000;
  return Math.max(0, Math.round(m));
}
const hours = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); if (!g) return file;
    g.drawImage(img, 0, 0, c.width, c.height);
    /* the time and place stamped on the picture itself */
    const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, c.height - 34, c.width, 34);
    g.fillStyle = "#fff"; g.font = "bold 18px sans-serif"; g.fillText(`Nandan GSE · ${stamp} IST`, 10, c.height - 11);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b || file), "image/jpeg", 0.78));
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}

function position(): Promise<GeolocationPosition> {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) { no(new Error("This phone gives no location to the browser.")); return; }
    navigator.geolocation.getCurrentPosition(ok, (e) => no(new Error(e.code === 1 ? "Location is blocked — allow location for genie.nandan.co.in in the browser settings, then try again." : "Could not get the GPS position — step outside or switch location on, then try again.")), { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  });
}

export default function FieldAttendance() {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const load = () => fetch("/api/idp/attendance", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not open"); setD(j); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);
  const lastToday = d?.todays?.[0];
  const next: "in" | "out" = lastToday?.kind === "in" ? "out" : "in";

  /* the GPS is asked for first, the camera second — so a blocked location is said before a photo is wasted */
  const start = async () => {
    setErr(null); setDone(null); setBusy("Finding your position…");
    try { await position(); setBusy(null); cam.current?.click(); } catch (e) { setBusy(null); setErr(String((e as Error).message)); }
  };
  const shot = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      setBusy("Taking the GPS position…");
      const pos = await position();
      setBusy("Preparing the photo…");
      const photo = await shrink(f);
      setBusy(next === "in" ? "Checking you in…" : "Checking you out…");
      const fd = new FormData();
      fd.set("kind", next); fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); fd.set("accuracy", String(pos.coords.accuracy));
      fd.set("photo", photo, "punch.jpg");
      const r = await fetch("/api/idp/attendance", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Did not save");
      setDone(next === "in" ? `Checked in at ${hm(j.at)}` : `Checked out at ${hm(j.at)}`);
      await load();
    } catch (e) { setErr(String((e as Error).message)); }
    setBusy(null);
    if (cam.current) cam.current.value = "";
  };

  const byDay = new Map<string, Punch[]>();
  for (const p of d?.punches || []) byDay.set(p.day, [...(byDay.get(p.day) || []), p]);

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EF", color: NAVY, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div style={{ background: NAVY, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <a href="/idp" style={{ color: "#fff", textDecoration: "none", fontWeight: 700 }}>← IDP</a>
        <div style={{ fontWeight: 800, fontSize: 17, marginLeft: 6 }}>Attendance</div>
        <div style={{ marginLeft: "auto", fontSize: 13, opacity: 0.85 }}>{d?.me.name}</div>
      </div>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
        {!d && !err && <div style={{ color: MUTED, padding: 30, textAlign: "center" }}>Opening…</div>}
        {d && d.installed === false && <div style={{ color: RED, fontWeight: 700 }}>Attendance is not set up yet — migration 0225 has to run.</div>}
        {d && d.installed !== false && !d.mayPunch && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #E2E0DA" }}>
            <b>Attendance here is for the outdoor service team.</b>
            <div style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>If you go out on service, ask HR to put you in the Service department.</div>
          </div>
        )}
        {d && d.installed !== false && d.mayPunch && (
          <>
            <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #E2E0DA", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: MUTED }}>{dmy(d.today)} · {lastToday ? (lastToday.kind === "in" ? `checked in since ${hm(lastToday.at)}` : `last checked out ${hm(lastToday.at)}`) : "not checked in yet today"}</div>
              <button onClick={start} disabled={!!busy}
                style={{ marginTop: 14, width: "100%", padding: "26px 10px", borderRadius: 16, border: "none", fontSize: 24, fontWeight: 800, color: "#fff", background: next === "in" ? GREEN : ORANGE, opacity: busy ? 0.6 : 1, boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
                {busy || (next === "in" ? "✅ Check in" : "🏁 Check out")}
              </button>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Your GPS position and a photo are taken with every check in and check out.</div>
              <input ref={cam} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => shot(e.target.files?.[0])} />
              {done && <div style={{ marginTop: 12, color: GREEN, fontWeight: 800, fontSize: 16 }}>{done} ✓</div>}
              {err && <div style={{ marginTop: 12, color: RED, fontWeight: 700, fontSize: 14 }}>{err}</div>}
              {d.todays.length > 0 && <div style={{ marginTop: 12, fontSize: 15 }}>Today: <b>{hours(worked(d.todays, d.today))}</b></div>}
            </div>
            {d.todays.length > 0 && (
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {[...d.todays].reverse().map((p) => (
                  <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", borderRadius: 10, padding: 8, border: "1px solid #E2E0DA" }}>
                    {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} /> : <div style={{ width: 56, height: 56 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: p.kind === "in" ? GREEN : ORANGE }}>{p.kind === "in" ? "In" : "Out"} · {hm(p.at)}</div>
                      <a href={map(p)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563EB" }}>📍 {p.lat.toFixed(5)}, {p.lng.toFixed(5)}{p.accuracy_m ? ` · ±${p.accuracy_m} m` : ""}</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 20, fontWeight: 800 }}>The last 30 days</div>
            <div style={{ marginTop: 8, background: "#fff", borderRadius: 10, border: "1px solid #E2E0DA", overflow: "hidden" }}>
              {[...byDay.entries()].map(([day, ps]) => {
                const asc = [...ps].sort((a, b) => a.at.localeCompare(b.at));
                const first = asc.find((p) => p.kind === "in"), lastOut = [...asc].reverse().find((p) => p.kind === "out");
                return (
                  <div key={day} style={{ display: "flex", padding: "8px 12px", borderBottom: "1px solid #EEE", fontSize: 14 }}>
                    <span style={{ width: 110 }}>{dmy(day)}</span>
                    <span style={{ flex: 1, color: MUTED }}>{first ? hm(first.at) : "—"} → {lastOut ? hm(lastOut.at) : "open"}</span>
                    <b>{hours(worked(ps, d.today))}</b>
                  </div>
                );
              })}
              {byDay.size === 0 && <div style={{ padding: 12, color: MUTED, fontSize: 14 }}>Nothing yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
