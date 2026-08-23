"use client";
/**
 * A text box you can speak into, that also KEEPS what you said.
 *
 * WHY EVERY BOX HAS ONE. The IDP asks thirteen written questions of people
 * who build machines for a living, many of whom think in Hindi and type in
 * English. Made to type, they write three words. Allowed to speak, they say
 * the real answer.
 *
 * THE RECOGNISER STOPS BY ITSELF, CONSTANTLY, and that is the whole problem
 * this file exists to solve. Chrome ends a session after a few seconds of
 * quiet, on a network blip, and after roughly a minute regardless. Restarting
 * it inside its own onend handler throws InvalidStateError as often as not,
 * because the old session has not finished tearing down — which is exactly
 * how dictation "stops in between". So:
 *
 *   · the restart is DEFERRED, not immediate, and RETRIED if it throws
 *   · finished phrases are appended once via resultIndex and kept across
 *     every restart, so nothing said earlier is ever lost
 *   · the running state is a ref, so a restart cannot be triggered after Stop
 *   · and it SAYS on screen that it is still listening, with a counter, so
 *     nobody is left wondering whether it died
 *
 * THE AUDIO IS KEPT TOO. The transcript is the machine's version of what
 * somebody said; the recording is them. Each press ADDS a recording and adds
 * its words — nothing replaces anything, because a question is not answered
 * in one breath.
 */
import { useEffect, useRef, useState } from "react";

const C = { line: "#E2E0DA", dim: "#5A6672", faint: "#8A94A0", orange: "#E8600A", red: "#B3261E", green: "#0D7A3F" };

export interface Recording { url: string | null; seconds: number | null; at: string; transcript?: string | null }

export default function DictateBox({
  value, onChange, rows = 5, placeholder, disabled, idpId, qid, recordings = [], onRecorded, uploadKind, uploadUrl,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Needed to store the audio. Without them it still dictates, just no audio. */
  idpId?: string;
  qid?: string;
  /** Where the recording goes. Default: the person's own IDP. */
  uploadKind?: string;
  uploadUrl?: string;
  recordings?: Recording[];
  onRecorded?: (r: Recording) => void;
}) {
  const [rec, setRec] = useState(false);
  /**
   * THE LATEST TEXT, always. finish() used to append to the value captured
   * when Record was pressed — so anything typed WHILE recording was silently
   * overwritten when the recording landed. The ref is updated every render,
   * so the append always starts from what is actually in the box.
   */
  const valueRef = useRef(value);
  valueRef.current = value;
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(0);
  const [deaf, setDeaf] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const textRef = useRef("");
  const runningRef = useRef(false);
  const startedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { runningRef.current = false; if (tickRef.current) clearInterval(tickRef.current); }, []);

  const polish = async (said: string) => {
    try {
      const res = await fetch("/api/idp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "polish", text: said }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not tidy that up");
      return j.text as string;
    } catch {
      // the machine failed; the person's words did not
      setErr("Could not tidy that into English — your own words are in the box.");
      return said;
    }
  };

  const finish = async (blob: Blob | null, seconds: number) => {
    const said = textRef.current.trim();
    setLive("");
    if (!said && !blob) return;
    setBusy(true);
    if (said) {
      const text = await polish(said);
      const base = valueRef.current.trim();
      onChange(base ? `${base}\n${text}` : text);
    }
    if (blob && blob.size && idpId && qid) {
      try {
        const fd = new FormData();
        if (uploadKind) fd.append("kind", uploadKind);
        fd.append("id", idpId);
        fd.append("qid", qid);
        fd.append("seconds", String(seconds));
        fd.append("transcript", said);
        fd.append("file", new File([blob], "note.webm", { type: blob.type || "audio/webm" }));
        const r = await fetch(uploadUrl || "/api/idp", { method: "POST", body: fd });
        const j = await r.json();
        if (r.ok) {
          /**
           * THE SERVER GETS A SECOND CHANCE AT THE WORDS. When the browser
           * caught nothing, the audio still went up — and if the server can
           * transcribe it, the answer comes back here and lands in the box
           * exactly as a browser transcription would have.
           */
          if (!said && typeof j.text === "string" && j.text.trim()) {
            const base = valueRef.current.trim();
            onChange(base ? `${base}\n${j.text.trim()}` : j.text.trim());
          } else if (!said && !j.text) {
            setErr("The recording is saved and attached. This browser caught no words — type your answer, or use Chrome on a laptop or Android phone next time.");
          }
          onRecorded?.({ url: j.url, seconds: j.seconds, at: new Date().toISOString(), transcript: said || j.transcript || null });
        }
      } catch { /* the words are saved; the audio is the bonus */ }
    }
    setBusy(false);
  };

  const stop = () => {
    runningRef.current = false;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (srRef.current) { srRef.current.onend = null; srRef.current.onerror = null; }
    try { srRef.current?.stop(); } catch { /* not running */ }
    setRec(false);
    /**
     * THE LAST SENTENCE ARRIVES AFTER STOP IS PRESSED. The recogniser
     * delivers the final result for whatever was being said a moment later,
     * so reading the transcript immediately loses the end of it — which is
     * usually the point somebody was building to. Half a second is enough.
     */
    const secondsNow = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
    const mr = mediaRef.current;
    if (mr && mr.state !== "inactive") { try { mr.stop(); } catch { /* already stopped */ } }
    else setTimeout(() => finish(null, secondsNow), 600);
  };

  const start = async () => {
    setErr(""); setLive(""); textRef.current = ""; setSecs(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // ---- the recording ----
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const secs2 = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        // see stop(): the recogniser's last result lands after this fires
        setTimeout(() => finish(blob, secs2), 600);
      };
      mr.start();
      mediaRef.current = mr;
    } catch {
      setErr("The microphone did not open. Allow it in the address bar and press again.");
      return;
    }

    startedRef.current = Date.now();
    setRec(true);
    setDeaf(false);
    tickRef.current = setInterval(() => {
      const el = Math.round((Date.now() - startedRef.current) / 1000);
      setSecs(el);
      // eight seconds of recording with not one word caught is not a pause —
      // this browser's dictation is not working, and the person should know
      // WHILE speaking, not after
      if (el >= 8 && !textRef.current.trim()) setDeaf(true);
      else if (textRef.current.trim()) setDeaf(false);
    }, 1000);

    // ---- the dictation, restarted for as long as we are recording ----
    if (!SR) { setErr("This browser cannot turn speech into words, but it IS recording you."); return; }
    runningRef.current = true;
    let attempts = 0;

    const spin = () => {
      if (!runningRef.current) return;
      let sr: { start: () => void; stop: () => void; onresult: unknown; onend: unknown; onerror: unknown };
      try { sr = new SR(); } catch { return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const any = sr as any;
      any.continuous = true; any.interimResults = true; any.lang = "en-IN";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any.onresult = (ev: any) => {
        attempts = 0; // it is working again
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const x = ev.results[i];
          if (x.isFinal) textRef.current = (textRef.current + " " + x[0].transcript).trim();
          else interim += x[0].transcript;
        }
        setLive((textRef.current + " " + interim).trim());
      };
      // 'no-speech' and 'aborted' are ordinary; only a refused mic is fatal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any.onerror = (ev: any) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          runningRef.current = false;
          setErr("The browser blocked the microphone for dictation. The recording is still being kept.");
        }
      };
      any.onend = () => {
        // DEFERRED, never immediate: restarting inside onend throws
        // InvalidStateError while the old session is still tearing down, and
        // a swallowed throw is precisely how dictation dies mid-sentence.
        if (!runningRef.current) return;
        attempts++;
        if (attempts > 40) { setErr("Dictation keeps stopping. Your recording is still being kept."); return; }
        setTimeout(spin, 80);
      };
      try { any.start(); } catch { setTimeout(spin, 250); }
      srRef.current = any;
    };
    spin();
  };

  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

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
              {busy ? "Writing it out…" : recordings.length ? "🎙 Say some more" : "🎙 Speak the answer"}
            </button>
          ) : (
            <button type="button" onClick={stop}
              className="text-xs font-bold rounded px-2.5 py-1" style={{ background: C.red, color: "#fff" }}>
              ■ Stop and use it
            </button>
          )}
          <span style={{ fontSize: 11, color: rec ? C.red : C.faint }}>
            {rec
              ? `● listening ${mmss(secs)} · ${textRef.current.trim().split(/\s+/).filter(Boolean).length} words caught — take your time, pauses are fine`
              : "Speak it and Genie writes it in plain English, added under what is already there. Your recording is kept."}
          </span>
        </div>
      )}

      {rec && deaf && (
        <div className="rounded p-2 mt-1" style={{ background: "#FBEDEA", border: "1px solid #E5B3AE", fontSize: 12, color: C.red, lineHeight: 1.5 }}>
          <b>Your voice IS being recorded, but this browser is not turning it into words.</b> On an iPhone, switch on
          Settings → General → Keyboard → Enable Dictation, or use Chrome on a laptop or Android phone. Keep talking —
          the recording is kept either way, and you can type after you stop.
        </div>
      )}
      {rec && live && (
        <div className="rounded p-2 mt-1" style={{ background: "#FFF7E6", fontSize: 12, color: C.dim, lineHeight: 1.5, maxHeight: 260, overflowY: "auto" }}>
          {live}
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>{err}</div>}

      {recordings.length > 0 && (
        <div className="mt-2">
          <div style={{ fontSize: 11, color: C.faint }}>
            What you said {recordings.length > 1 ? `(${recordings.length} recordings)` : ""} — kept with your answer
          </div>
          {recordings.map((r, i) => (
            <div key={i} className="mt-1">
              <div className="flex items-center gap-2">
                {/* the recording is evidence, not a file to hand around — no download */}
                {r.url ? (
                  <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()}
                    src={r.url} style={{ height: 28, maxWidth: 320 }} />
                ) : <span style={{ fontSize: 11, color: C.faint }}>saved</span>}
                {r.seconds ? <span className="tnum" style={{ fontSize: 11, color: C.faint }}>{mmss(r.seconds)}</span> : null}
              </div>
              {r.transcript && (
                <details className="mt-0.5">
                  <summary style={{ fontSize: 11, color: C.faint, cursor: "pointer" }}>the words as heard</summary>
                  <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginTop: 2 }}>{r.transcript}</div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
