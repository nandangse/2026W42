"use client";
/**
 * A text box you can speak into.
 *
 * WHY EVERY BOX HAS ONE. The IDP asks thirteen written questions of people
 * who build machines for a living. Many of them think faster than they type,
 * and several think in Hindi and type in English. Made to type, they write
 * three words. Allowed to speak, they say the real answer.
 *
 * WHAT HAPPENS: the browser turns speech into words, and the server turns
 * those words into plain English and puts it in the box. It is put IN THE
 * BOX, not stored separately — so it can be read, corrected and rewritten
 * before it goes anywhere. What is saved is what the person left in the box,
 * never what the machine heard.
 */
import { useRef, useState } from "react";

const C = { line: "#E2E0DA", dim: "#5A6672", faint: "#8A94A0", orange: "#E8600A", red: "#B3261E", green: "#0D7A3F" };

export default function DictateBox({
  value, onChange, rows = 5, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const textRef = useRef("");
  const runningRef = useRef(false);

  const finish = async () => {
    const said = textRef.current.trim();
    setLive("");
    if (!said) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/idp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "polish", text: said }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not tidy that up");
      // added to whatever is already there, never replacing it silently
      onChange(value.trim() ? `${value.trim()}\n${j.text}` : j.text);
    } catch (e) {
      // the machine failed, the person's words did not — keep them
      onChange(value.trim() ? `${value.trim()}\n${said}` : said);
      setErr(e instanceof Error ? `${e.message}. Your words are in the box, unedited.` : String(e));
    }
    setBusy(false);
  };

  const stop = () => {
    runningRef.current = false;
    if (srRef.current) srRef.current.onend = null;
    try { srRef.current?.stop(); } catch { /* not running */ }
    setRec(false);
    finish();
  };

  const start = () => {
    setErr(""); setLive(""); textRef.current = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("This browser cannot listen. Chrome on a laptop or an Android phone can."); return; }
    runningRef.current = true;
    const startOne = () => {
      const sr = new SR();
      sr.continuous = true; sr.interimResults = true; sr.lang = "en-IN";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sr.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const x = ev.results[i];
          if (x.isFinal) textRef.current = (textRef.current + " " + x[0].transcript).trim();
          else interim += x[0].transcript;
        }
        setLive((textRef.current + " " + interim).trim());
      };
      sr.onerror = () => {};
      // it stops itself after a pause; keep it going until Stop is pressed
      sr.onend = () => { if (runningRef.current) { try { startOne(); } catch { /* give up quietly */ } } };
      sr.start();
      srRef.current = sr;
    };
    try { startOne(); setRec(true); }
    catch { setErr("Could not start listening. Allow the microphone and try again."); }
  };

  return (
    <div>
      <textarea value={value} rows={rows} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded px-2 py-1.5"
        style={{ border: `1px solid ${C.line}`, fontSize: 14, lineHeight: 1.6, background: disabled ? "#F4F2EC" : "#fff" }} />
      {!disabled && (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {!rec ? (
            <button type="button" onClick={start} disabled={busy}
              className="text-xs font-bold rounded px-2.5 py-1"
              style={{ background: busy ? "#E2E0DA" : C.orange, color: busy ? "#8A94A0" : "#fff" }}>
              {busy ? "Writing it out…" : "🎙 Speak the answer"}
            </button>
          ) : (
            <button type="button" onClick={stop}
              className="text-xs font-bold rounded px-2.5 py-1" style={{ background: C.red, color: "#fff" }}>
              ■ Stop and use it
            </button>
          )}
          <span style={{ fontSize: 11, color: C.faint }}>
            {rec
              ? "Listening… speak in English or Hindi, whichever comes."
              : "Speak it and Genie writes it in plain English. You can change every word afterwards."}
          </span>
        </div>
      )}
      {rec && live && (
        <div className="rounded p-2 mt-1" style={{ background: "#FFF7E6", fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
          {live}
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>{err}</div>}
    </div>
  );
}
