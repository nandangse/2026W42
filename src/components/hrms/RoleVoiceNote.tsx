"use client";
/**
 * The Management Expectation Note — one recording, one transcript, one summary.
 *
 * Dr Raghu's rule (23 Aug 2026): recording again REPLACES what is there. The
 * summary is what flows into the IDP, and three competing summaries would mean
 * nobody knows which one counts. What was replaced is not lost — it goes to
 * the role's Changes, audio and all.
 */
import { useRef, useState } from "react";
import { C } from "./RecordFields";

interface RoleLike {
  id: string;
  url: string | null;
  voice_seconds: number | null;
  transcript: string | null;
  summary: string | null;
}


export default function VoiceNote({ r, reload, onSaved }: { r: RoleLike; reload: () => Promise<void>; onSaved?: () => void }) {
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const startedRef = useRef(0);
  const textRef = useRef("");

  const stop = () => {
    try { mediaRef.current?.stop(); } catch { /* already stopped */ }
    try { srRef.current?.stop(); } catch { /* dictation may not be running */ }
    setRec(false);
  };

  const start = async () => {
    setErr(""); setLive(""); textRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const transcript = textRef.current.trim();
        if (!blob.size && !transcript) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("id", r.id);
          fd.append("transcript", transcript);
          fd.append("seconds", String(seconds));
          if (blob.size) fd.append("file", new File([blob], "note.webm", { type: blob.type }));
          const res = await fetch("/api/hrms/roles", { method: "POST", body: fd });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Could not save the note");
          onSaved?.();
          await reload();
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        setBusy(false);
        setLive("");
      };
      mr.start();
      mediaRef.current = mr;
      startedRef.current = Date.now();
      setRec(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const sr = new SR();
        sr.continuous = true; sr.interimResults = true; sr.lang = "en-IN";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sr.onresult = (ev: any) => {
          let done = "", interim = "";
          for (let i = 0; i < ev.results.length; i++) {
            const x = ev.results[i];
            if (x.isFinal) done += x[0].transcript + " "; else interim += x[0].transcript;
          }
          textRef.current = done.trim();
          setLive((done + interim).trim());
        };
        sr.onerror = () => {};
        sr.start();
        srRef.current = sr;
      }
    } catch (e) {
      const name = (e as { name?: string })?.name || "";
      setErr(
        name === "NotAllowedError"
          ? "The browser blocked the microphone. Click the padlock in the address bar → Microphone → Allow, then press Record again."
          : name === "NotFoundError" ? "No microphone is connected to this machine."
          : name === "NotReadableError" ? "Something else is using the microphone — close it and press Record again."
          : "Could not open the microphone on this browser.",
      );
    }
  };

  return (
    <div className="rounded p-2 mt-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold" style={{ color: C.dim }}>Management Expectation Note</div>
        {!rec ? (
          <button onClick={start} disabled={busy} className="text-xs font-bold rounded px-2.5 py-1"
            style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : r.summary ? "🎙 Record again" : "🎙 Record"}
          </button>
        ) : (
          <button onClick={stop} className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#B3261E", color: "#fff" }}>
            ■ Stop
          </button>
        )}
        {r.url && <audio controls src={r.url} style={{ height: 28 }} />}
        {r.voice_seconds ? <span className="text-xs tnum" style={{ color: C.faint }}>{r.voice_seconds}s</span> : null}
      </div>
      <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginTop: 4 }}>
        Say what this role is really for. It is kept three ways — the recording, the words, and a summary — because tone
        carries what a typed paragraph loses, and nobody scrubs through audio to find one sentence.
      </div>
      {rec && <div className="text-xs mt-1" style={{ color: "#B3261E" }}>● recording… {live && <span style={{ color: C.dim }}>{live}</span>}</div>}
      {err && <div className="text-xs mt-1" style={{ color: C.red }}>{err}</div>}
      {r.summary && (
        <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC" }}>
          <div className="text-xs font-bold" style={{ color: C.dim }}>What it comes to</div>
          <div className="text-xs" style={{ color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.summary}</div>
          {r.transcript && (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer" style={{ color: C.faint }}>the words as spoken</summary>
              <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>{r.transcript}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
