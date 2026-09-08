"use client";
/**
 * ATTENDANCE, FROM A PHONE IN THE FIELD (Dr Raghu, 8 Sep 2026).
 *
 * "The photo he will click which will have the GPS record and the time stamp
 * with his photo ... this will allow him to put in the attendance when it's
 * Outdoor duty. Especially for service and sales ... After the attendance is
 * mapped it will show his attendance daily basis for the last 30 days. He can
 * do a raise ticket for anything else! Then he will sign out too."
 *
 * THE FIX IS ASKED FOR FIRST AND THE CAMERA SECOND, because location takes
 * seconds and a camera takes a press. By the time he has framed himself the
 * fix has usually arrived, and the punch carries both.
 *
 * IT DOES NOT WAIT FOR A PERFECT FIX. A phone inside a workshop may never get
 * one, and refusing the punch would mark a man absent who is standing at the
 * gate. What it will not do is pretend: no fix is shown as "location not
 * available", never as a zero.
 *
 * THE PHOTO IS TAKEN SMALL ON PURPOSE — 720px wide, JPEG at 0.7. A service
 * engineer on a site with one bar should not be waiting on a 4 MB upload to
 * be counted as present.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const NAVY = "#1B2233", ORANGE = "#E4580B", GREEN = "#2A6B39", MUTED = "#5C6577", LINE = "#DCE0E8", RED = "#8E2C20";

type Mark = { id: string; for_date: string; at: string; kind: "in" | "out"; source: string; lat: number | null; lng: number | null; photo_link: string | null; note: string | null };
type Day = { date: string; in: string | null; out: string | null; minutes: number | null; marks: Mark[] };

const hhmm = (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
  : "—";
const dayLabel = (d: string) => {
  const dt = new Date(`${d}T00:00:00+05:30`);
  return dt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short" });
};
const hours = (m: number | null) => (m == null ? "—" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

export default function PresentScreen() {
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [left, setLeft] = useState(3);
  const [openNow, setOpenNow] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [fixState, setFixState] = useState<"asking" | "ok" | "refused">("asking");
  const [camOn, setCamOn] = useState(false);
  const [pendingKind, setPendingKind] = useState<"in" | "out">("in");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/present", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not read your attendance.");
      setMe(j.me); setDays(j.days || []); setLeft(j.backdatedLeft ?? 3);
      setOpenNow(!!j.openNow); setNeedsMigration(!!j.needsMigration);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /* the fix, asked for on arrival so it is ready when he presses */
  useEffect(() => {
    if (!navigator.geolocation) { setFixState("refused"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setFixState("ok"); },
      () => setFixState("refused"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setCamOn(false);
  }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = async (kind: "in" | "out") => {
    setErr(""); setMsg(""); setPendingKind(kind);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      streamRef.current = s; setCamOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play(); } }, 50);
    } catch {
      setErr("The camera would not open. Allow it for this site in your browser settings, then try again.");
    }
  };

  const snapAndSend = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const w = 720, h = Math.round((v.videoHeight / v.videoWidth) * w) || 960;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("This browser will not let Genie take the picture.");
      ctx.drawImage(v, 0, 0, w, h);

      /* THE STAMP IS BURNED INTO THE PICTURE, not only into the row beside it.
         A photograph that carries its own time and place is evidence on its
         own, in a folder, a year from now, to somebody who never saw Genie. */
      const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
      const where = fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} ±${Math.round(fix.acc)}m` : "location not available";
      ctx.fillStyle = "rgba(0,0,0,.62)"; ctx.fillRect(0, h - 58, w, 58);
      ctx.fillStyle = "#fff"; ctx.font = "600 17px system-ui, sans-serif";
      ctx.fillText(when, 12, h - 34);
      ctx.font = "400 14px system-ui, sans-serif";
      ctx.fillText(where, 12, h - 13);

      const photo = c.toDataURL("image/jpeg", 0.7);
      const r = await fetch("/api/present", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: pendingKind, photo, lat: fix?.lat, lng: fix?.lng, accuracy: fix?.acc }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The mark did not save.");
      stopCam();
      setMsg(pendingKind === "in" ? "Signed in. Have a good day." : "Signed out. Thank you.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const backdate = async (date: string, kind: "in" | "out") => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/present", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, for_date: date, note: "marked later, no photo" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "That did not save.");
      setMsg(`${dayLabel(date)} marked.`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const backDays = [1, 2, 3].map((n) =>
    new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const marked = new Set(days.map((d) => d.date));

  return (
    <div style={{ minHeight: "100vh", background: "#F7F6F2", fontFamily: '"Source Sans 3", system-ui, sans-serif', color: NAVY }}>
      <div style={{ background: NAVY, color: "#fff", padding: "14px 16px" }}>
        <div style={{ fontFamily: "Barlow, system-ui, sans-serif", fontWeight: 800, fontSize: 19 }}>Attendance</div>
        <div style={{ fontSize: 13, opacity: .8 }}>{me ? `${me.name} · ${me.id}` : "…"}</div>
      </div>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: 16 }}>
        {needsMigration && <Note kind="warn">Run migration 0163 — attendance has nowhere to live yet.</Note>}
        {err && <Note kind="error">{err}</Note>}
        {msg && <Note kind="ok">{msg}</Note>}

        {/* ── the fix, always visible, never faked ── */}
        <div style={{ fontSize: 12.5, color: fixState === "ok" ? GREEN : fixState === "refused" ? RED : MUTED, marginBottom: 10, fontWeight: 600 }}>
          {fixState === "asking" && "Finding your location…"}
          {fixState === "ok" && fix && `📍 ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} · to within ${Math.round(fix.acc)} m`}
          {fixState === "refused" && "📍 Location not available — the mark will still save, and will say so."}
        </div>

        {!camOn && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => void startCam("in")} disabled={busy}
              style={{ ...btn, background: openNow ? "#fff" : ORANGE, color: openNow ? NAVY : "#fff", border: openNow ? `1.5px solid ${LINE}` : "none" }}>
              📷 Sign in
            </button>
            <button onClick={() => void startCam("out")} disabled={busy}
              style={{ ...btn, background: openNow ? GREEN : "#fff", color: openNow ? "#fff" : NAVY, border: openNow ? "none" : `1.5px solid ${LINE}` }}>
              📷 Sign out
            </button>
          </div>
        )}

        {camOn && (
          <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", position: "relative" }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
            <div style={{ display: "flex", gap: 10, padding: 12, background: "#111" }}>
              <button onClick={() => void snapAndSend()} disabled={busy}
                style={{ ...btn, background: busy ? "#8B8F98" : ORANGE, color: "#fff", border: "none" }}>
                {busy ? "Saving…" : `Take the photo · sign ${pendingKind}`}
              </button>
              <button onClick={stopCam} disabled={busy} style={{ ...btn, background: "#2A3242", color: "#fff", border: "none", flex: "0 0 100px" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── the three-a-month allowance ── */}
        <div style={{ marginTop: 18, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: .6 }}>MARK A DAY YOU MISSED</div>
          <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>
            Up to three days back, without a photo. <b>{left} of 3 left</b> this month.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {backDays.map((d) => (
              <button key={d} disabled={busy || left <= 0 || marked.has(d)}
                onClick={() => void backdate(d, "in")}
                style={{
                  ...chip,
                  opacity: busy || left <= 0 || marked.has(d) ? .45 : 1,
                  cursor: busy || left <= 0 || marked.has(d) ? "default" : "pointer",
                }}>
                {dayLabel(d)}{marked.has(d) ? " · marked" : ""}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
            Anything older, or anything that looks wrong below — <a href="/idp?ask=1" style={{ color: ORANGE, fontWeight: 700 }}>raise a ticket</a> and HR will put it right.
          </div>
        </div>

        {/* ── the last thirty days ── */}
        <div style={{ marginTop: 18, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: .6, padding: "10px 12px", borderBottom: `1px solid ${LINE}` }}>
            THE LAST 30 DAYS
          </div>
          {days.length === 0 && <div style={{ padding: 14, fontSize: 13.5, color: MUTED }}>Nothing marked yet. The first press above starts it.</div>}
          {days.map((d) => (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ width: 96, fontSize: 13, fontWeight: 700 }}>{dayLabel(d.date)}</div>
              <div style={{ flex: 1, fontSize: 13, color: MUTED }}>
                <b style={{ color: NAVY }}>{hhmm(d.in)}</b> → <b style={{ color: NAVY }}>{hhmm(d.out)}</b>
                {d.marks.some((m) => m.source === "backdated") && <span style={{ color: "#B26A00" }}> · marked later</span>}
                {d.marks.some((m) => m.source === "essl") && <span style={{ color: MUTED }}> · biometric</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: d.minutes == null ? MUTED : GREEN, fontVariantNumeric: "tabular-nums" }}>
                {hours(d.minutes)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: MUTED, marginTop: 14, lineHeight: 1.5 }}>
          Every mark keeps its photo, its time and where you were. Nothing here decides your pay —
          it is the record the month's muster will be checked against.
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { flex: 1, padding: "13px 14px", borderRadius: 12, fontWeight: 800, fontSize: 15.5, cursor: "pointer" };
const chip: React.CSSProperties = { padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${LINE}`, background: "#fff", fontWeight: 700, fontSize: 13 };

function Note({ kind, children }: { kind: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const s = kind === "ok" ? { bg: "#EAF5EC", bd: "#BFDCC6", fg: GREEN }
    : kind === "warn" ? { bg: "#FDF0E7", bd: "#F0C9A8", fg: "#8A4520" }
      : { bg: "#FBEAE8", bd: "#F0C0BA", fg: RED };
  return <div style={{ background: s.bg, border: `1px solid ${s.bd}`, color: s.fg, borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>{children}</div>;
}
