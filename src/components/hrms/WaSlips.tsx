"use client";
/**
 * PAYSLIPS ON WHATSAPP, ONE BY ONE, FROM VINAY'S OWN NUMBER (Dr Raghu, 7 Oct
 * 2026): "Each one will be a message and open a new tab, just attach the
 * payslip to their WhatsApp number in that tab. Vinay then only has to click
 * on send on each. This will give it the human touch also. If it's possible
 * to also send, then send at the rate of 10 per minute … then randomly
 * increasing the send time."
 *
 * The screen is the queue and the pacer; the Genie WhatsApp helper (a tiny
 * Chrome extension, downloaded from here) does the attaching in the tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Row { id: string; name: string; hold: boolean; phone: string; text: string; why: string; sent_at: string | null; opened_at: string | null; token: string }
interface Data { period: string; status: string; template: string; list: Row[]; api: string }
const C = { ink: "#1F2328", dim: "#5B6470", faint: "#8B8F87", line: "#E2E0DA", green: "#2A6B39", red: "#8E2C20", amber: "#B26A00", navy: "#16232F" };
const ist = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function WaSlips({ sheetId }: { sheetId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [auto, setAuto] = useState(false);          // the helper presses Send
  const [chain, setChain] = useState(false);        // open the next one by itself
  const [closeTab, setCloseTab] = useState(true);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const sentCount = useRef(0);
  const timer = useRef<number | null>(null);
  const load = useCallback(async () => { try { setD(await api.get(`/api/hrms/wa-slips?sheet=${encodeURIComponent(sheetId)}`)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }, [sheetId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = window.setInterval(load, 6000); return () => window.clearInterval(t); }, [load]);

  const todo = (d?.list || []).filter((r) => !r.why && !r.sent_at);
  const sent = (d?.list || []).filter((r) => r.sent_at).length;
  const cannot = (d?.list || []).filter((r) => r.why);

  const urlFor = (r: Row) => `https://web.whatsapp.com/send?phone=${r.phone}&text=${encodeURIComponent(r.text)}#genie=${encodeURIComponent(r.token)}&api=${encodeURIComponent(d?.api || location.origin)}&auto=${auto ? 1 : 0}&close=${closeTab ? 1 : 0}`;
  const openOne = (r: Row) => {
    setCurrent(r.id);
    window.open(urlFor(r), "_blank", "noopener");
    setLog((l) => [`${ist(new Date().toISOString())} opened ${r.id} ${r.name}`, ...l].slice(0, 60));
  };
  /* THE PACE: ten a minute to begin with — six seconds between opens — and
     the gap grows: a random 0–8 s on top, plus a second more for every ten
     sent, so the rhythm is never a metronome ("then randomly increasing the
     send time"). */
  const nextDelay = () => 6000 + Math.random() * 8000 + Math.floor(sentCount.current / 10) * 1000;
  const stop = useCallback(() => { setRunning(false); setCountdown(null); if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } }, []);
  // chain: when the current one is recorded sent, wait, then open the next
  useEffect(() => {
    if (!running || !chain || !d) return;
    const cur = d.list.find((r) => r.id === current);
    if (current && !(cur && cur.sent_at)) return;           // still with Vinay
    if (current && cur?.sent_at) sentCount.current += 1;
    const next = d.list.find((r) => !r.why && !r.sent_at && r.id !== current);
    if (!next) { stop(); setLog((l) => ["all done", ...l]); return; }
    const ms = current ? nextDelay() : 500;
    const t0 = Date.now();
    setCountdown(Math.ceil(ms / 1000));
    const tick = window.setInterval(() => setCountdown(Math.max(0, Math.ceil((ms - (Date.now() - t0)) / 1000))), 500);
    timer.current = window.setTimeout(() => { window.clearInterval(tick); setCountdown(null); openOne(next); }, ms);
    return () => { window.clearInterval(tick); if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, chain, d, current]);

  const markSent = async (r: Row) => { try { await api.post("/api/hrms/wa-slips", { action: "sent", token: r.token, by: "marked sent on the Genie screen" }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: C.ink, background: "#EFEDE7", minHeight: "100vh" }}>
      <div style={{ background: C.navy, color: "#fff", padding: "10px 16px", display: "flex", gap: 14, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>💬 Payslips on WhatsApp — {d?.period || "…"}</b>
        <span style={{ opacity: .75 }}>{d ? `${sent} sent · ${todo.length} to go · ${cannot.length} cannot` : ""}</span>
        <span style={{ flex: 1 }} />
        <a href="/wa-genie.zip" style={{ color: "#D7DEE6", fontSize: 12 }} download>⬇ Genie WhatsApp helper (Chrome extension)</a>
      </div>
      {err && <div style={{ padding: "8px 16px", color: C.red, fontSize: 12 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, padding: 16 }}>
        <div>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} /> Open the next one by itself <span style={{ color: C.faint, fontSize: 11 }}>(10 a minute to start, slowing at random)</span></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> The helper presses Send <span style={{ color: C.amber, fontSize: 11 }}>(off = Vinay presses Send on each — the human touch)</span></label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={closeTab} onChange={(e) => setCloseTab(e.target.checked)} /> Close the tab after sending</label>
            <span style={{ flex: 1 }} />
            {!running
              ? <button onClick={() => { setRunning(true); if (!chain) { const n = todo[0]; if (n) openOne(n); } }} disabled={!todo.length} style={{ background: C.green, color: "#fff", border: 0, borderRadius: 5, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>▶ Start{chain ? "" : " — open the first"}</button>
              : <button onClick={stop} style={{ background: C.red, color: "#fff", border: 0, borderRadius: 5, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>■ Stop</button>}
            {running && countdown != null && <span style={{ color: C.dim }}>next in {countdown}s</span>}
            {running && current && countdown == null && <span style={{ color: C.amber }}>with Vinay: {current}</span>}
          </div>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: C.navy, color: "#fff", fontSize: 11 }}>{["Emp", "Name", "Mobile", "Status", ""].map((h) => <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {(d?.list || []).map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.line}`, background: r.id === current ? "#FFF7E6" : r.sent_at ? "#F2F8F3" : "#fff" }}>
                    <td style={{ padding: "5px 8px", fontWeight: 700 }}>{r.id}</td>
                    <td style={{ padding: "5px 8px" }}>{r.name}</td>
                    <td style={{ padding: "5px 8px", fontVariantNumeric: "tabular-nums", color: C.dim }}>{r.phone || "—"}</td>
                    <td style={{ padding: "5px 8px", color: r.sent_at ? C.green : r.why ? C.red : r.opened_at ? C.amber : C.faint }}>{r.sent_at ? `✓ sent ${ist(r.sent_at)}` : r.why ? r.why : r.opened_at ? `opened ${ist(r.opened_at)} — not yet sent` : "waiting"}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                      {!r.why && !r.sent_at && <button onClick={() => openOne(r)} style={{ background: "#25D366", color: "#0B3D1E", border: 0, borderRadius: 4, padding: "3px 8px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}>Open in WhatsApp</button>}
                      {!r.why && !r.sent_at && <button onClick={() => markSent(r)} style={{ marginLeft: 6, background: "#F4F2EC", color: C.ink, border: 0, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11 }} title="If you sent it by hand">Mark sent</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, letterSpacing: .4, fontSize: 11, color: C.faint, marginBottom: 6 }}>SOP — PAYSLIPS ON WHATSAPP (VINAY)</div>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li><b>Once only:</b> download the <a href="/wa-genie.zip" download>Genie WhatsApp helper</a>, unzip it, open <code>chrome://extensions</code>, switch on <i>Developer mode</i> (top right), press <i>Load unpacked</i> and choose the unzipped <code>wa-genie</code> folder.</li>
              <li>In Chrome, open <b>web.whatsapp.com</b> and sign in with <b>your own number</b> (scan the code). Keep that tab open.</li>
              <li>Allow pop-ups for genie.nandan.co.in (click the icon at the right of the address bar the first time it blocks one) — otherwise only one tab opens per click.</li>
              <li>Here, leave <b>“The helper presses Send”</b> OFF for the human touch. Tick <b>“Open the next one by itself”</b>. Press <b>▶ Start</b>.</li>
              <li>A tab opens on the person's chat with the message typed and the payslip attached. Read it, press <b>Send</b>. The tab closes, Genie records it, waits a few seconds, and opens the next.</li>
              <li>Anyone whose tab shows a red bar: attach the slip by hand (download from Salary Slips), send, and press <b>Mark sent</b> here.</li>
              <li>Press <b>■ Stop</b> any time; <b>▶ Start</b> carries on from whoever is left — nobody gets a slip twice.</li>
            </ol>
            <div style={{ marginTop: 8, color: C.dim }}>Pace: ten a minute to begin with, and the gap grows at random as it goes. With the helper pressing Send, 200 people take about half an hour; with Vinay pressing, as long as he takes.</div>
            <div style={{ marginTop: 8, color: C.amber }}>Note: this drives WhatsApp Web on Vinay's own number. WhatsApp tolerates a person sending one by one; it does not tolerate a machine blasting. Keep the helper's Send off unless the pace matters more than the number.</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 800, letterSpacing: .4, fontSize: 11, color: C.faint, marginBottom: 6 }}>THE MESSAGE (Masters → Standard Texts → salary_slip_whatsapp)</div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, color: C.dim }}>{d?.template}</pre>
          </div>
          {log.length > 0 && <div style={{ marginTop: 12, fontSize: 11, color: C.faint }}>{log.slice(0, 12).map((l, i) => <div key={i}>{l}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}
