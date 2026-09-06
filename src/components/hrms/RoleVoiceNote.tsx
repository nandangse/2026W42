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
import { swallow } from "@/lib/swallow";
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

  /** Rewrite the summary from the transcript already stored. */
  const resummarise = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/hrms/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resummarise", id: r.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not write the summary");
      onSaved?.();
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const stop = () => {
    // the recorder first: onend checks its state to decide whether dictation
    // stopped by itself or because somebody pressed Stop
    try { mediaRef.current?.stop(); } catch (e) { swallow("hrms/RoleVoiceNote", e); /* already stopped */ }
    if (srRef.current) srRef.current.onend = null;
    try { srRef.current?.stop(); } catch (e) { swallow("hrms/RoleVoiceNote", e); /* dictation may not be running */ }
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

      /**
       * DICTATION, AND THE TWO THINGS THAT USED TO LOSE THE END OF IT.
       *
       * 1. The browser's recogniser STOPS ON ITS OWN after a stretch of quiet,
       *    even with continuous set. On a ninety-second note that meant the
       *    tail simply never arrived. It is restarted here for as long as the
       *    recording is still running.
       *
       * 2. Every restart RESETS ev.results to an empty list. The old code
       *    rebuilt the whole transcript from that list each time, so the
       *    restart did not just stop adding — it erased what had been said
       *    before it. Finished phrases are now appended once, using
       *    ev.resultIndex to take only what is new, and kept across restarts.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const startSR = () => {
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
          sr.onend = () => {
            // still recording? then it stopped by itself — start it again
            if (mediaRef.current && mediaRef.current.state === "recording") {
              try { startSR(); } catch (e) { swallow("hrms/RoleVoiceNote", e); /* the recording still stands */ }
            }
          };
          sr.start();
          srRef.current = sr;
        };
        startSR();
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
            style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : r.summary ? "🎙 Record again" : "🎙 Record"}
          </button>
        ) : (
          <button onClick={stop} className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "var(--red)", color: "#fff" }}>
            ■ Stop
          </button>
        )}
        {r.url && <audio controls controlsList="nodownload" src={r.url} style={{ height: 28 }} />}
        {r.voice_seconds ? <span className="text-xs tnum" style={{ color: C.faint }}>{r.voice_seconds}s</span> : null}
      </div>
      <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginTop: 4 }}>
        Say what this role is really for. It is kept three ways — the recording, the words, and a summary — because tone
        carries what a typed paragraph loses, and nobody scrubs through audio to find one sentence.
      </div>
      {rec && <div className="text-xs mt-1" style={{ color: "var(--red)" }}>● recording… {live && <span style={{ color: C.dim }}>{live}</span>}</div>}
      {err && <div className="text-xs mt-1" style={{ color: C.red }}>{err}</div>}
      {r.summary && (
        <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC" }}>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold" style={{ color: C.dim }}>What it comes to</div>
            <button onClick={resummarise} disabled={busy}
              className="text-xs font-bold rounded px-2 py-0.5" style={{ background: "#DCE8F5", color: "var(--blue)" }}
              title="Write the summary again from the words above — nothing is re-recorded">
              ↻ Summarise again
            </button>
          </div>
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
