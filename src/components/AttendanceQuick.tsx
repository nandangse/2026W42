"use client";
/**
 * THE THREE BUTTONS AT THE TOP OF /idp (Dr Raghu, 12 Oct 2026: "show these
 * buttons saying Attendance Login, Attendance Log Off, and Check My
 * Attendance. These three things will be the most important for him, so show
 * them above the orange button, which is for My IDP"). Login and Log Off punch
 * right here — the GPS position, then the camera, then saved — and Check My
 * Attendance opens the page with the days.
 */
import { useEffect, useRef, useState } from "react";
import { position, shrink } from "@/components/FieldAttendance";

type Punch = { kind: "in" | "out"; at: string; day: string };
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

export default function AttendanceQuick() {
  const [last, setLast] = useState<Punch | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [want, setWant] = useState<"in" | "out">("in");
  const cam = useRef<HTMLInputElement>(null);
  const load = () => fetch("/api/idp/attendance", { cache: "no-store" }).then((r) => r.json()).then((j) => setLast((j.todays || [])[0] || null)).catch(() => setLast(null));
  useEffect(() => { load(); }, []);
  const isIn = last?.kind === "in";
  const go = async (kind: "in" | "out") => {
    setMsg(null); setWant(kind);
    if (kind === "in" && isIn) { setMsg({ ok: false, t: `You are already logged in since ${hm(last!.at)}.` }); return; }
    if (kind === "out" && !isIn) { setMsg({ ok: false, t: "Log in first — there is no login today to close." }); return; }
    setBusy("Finding your position…");
    try { await position(); setBusy(null); cam.current?.click(); } catch (e) { setBusy(null); setMsg({ ok: false, t: String((e as Error).message) }); }
  };
  const shot = async (f: File | undefined) => {
    if (!f) return;
    try {
      setBusy("Taking the GPS position…"); const pos = await position();
      setBusy("Preparing the photo…"); const photo = await shrink(f);
      setBusy(want === "in" ? "Logging you in…" : "Logging you off…");
      const fd = new FormData();
      fd.set("kind", want); fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); fd.set("accuracy", String(pos.coords.accuracy)); fd.set("photo", photo, "punch.jpg");
      const r = await fetch("/api/idp/attendance", { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Did not save");
      setMsg({ ok: true, t: want === "in" ? `Logged in at ${hm(j.at)} ✓` : `Logged off at ${hm(j.at)} ✓` });
      await load();
    } catch (e) { setMsg({ ok: false, t: String((e as Error).message) }); }
    setBusy(null); if (cam.current) cam.current.value = "";
  };
  const big = (bg: string, dim: boolean): React.CSSProperties => ({ flex: 1, minWidth: 0, border: "none", borderRadius: 12, padding: "14px 6px", color: "#fff", background: bg, fontWeight: 800, fontSize: 15, lineHeight: 1.15, opacity: dim ? 0.45 : 1, boxShadow: "0 3px 10px rgba(0,0,0,.12)" });
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => go("in")} disabled={!!busy} style={big("#15803D", isIn)}>✅<br />Attendance Login</button>
        <button onClick={() => go("out")} disabled={!!busy} style={big("#E8711A", !isIn)}>🏁<br />Attendance Log Off</button>
        <a href="/idp/attendance" style={{ ...big("#1B2A41", false), textDecoration: "none", textAlign: "center" }}>📋<br />Check My Attendance</a>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => shot(e.target.files?.[0])} />
      <div style={{ fontSize: 13, marginTop: 6, textAlign: "center", color: msg ? (msg.ok ? "#15803D" : "#B3392E") : "var(--i-muted, #6B7280)", fontWeight: msg ? 700 : 500 }}>
        {busy || msg?.t || (last === undefined ? " " : isIn ? `Logged in since ${hm(last!.at)} — log off when you leave the site` : last ? `Logged off at ${hm(last.at)}` : "Not logged in today — GPS and a photo go with every login and log off")}
      </div>
    </div>
  );
}
