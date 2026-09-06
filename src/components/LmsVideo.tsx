"use client";
// The lesson player.
//
// YouTube is embedded with its own controls switched OFF and play, pause,
// forward and the clock drawn here instead. That is not decoration: the
// default player offers the channel, sharing, "watch on YouTube" and a grid of
// suggested videos the moment it pauses, and every one of those is a door out
// of the lesson. What is left is what somebody needs to actually watch a
// training video and nothing that takes them elsewhere.
//
// Drive is the honest exception. Google's /preview embed is the only one it
// offers and its controls cannot be replaced, so the panel says so rather than
// pretending the same rules apply.
import { useCallback, useEffect, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";
import { clock, type VideoRef } from "@/lib/lms";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Load YouTube's iframe API once for the whole page, whoever asks first. */
let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

const FORWARD_SECONDS = 10;

export default function LmsVideo({ video }: { video: VideoRef }) {
  if (!video.embed) {
    return video.original ? (
      <div className="rounded-lg p-3 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.5 }}>
        This lesson has a video link Genie does not recognise, so it cannot be embedded.{" "}
        <a href={video.original} target="_blank" rel="noreferrer" className="font-bold underline">Open it in a new tab</a>.
        YouTube and Google Drive links play here directly.
      </div>
    ) : null;
  }
  if (video.kind === "youtube") return <YouTubePlayer id={video.id!} />;
  return (
    <div>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#000" }}>
        {video.kind === "file" ? (
          <video src={video.embed} controls controlsList="nodownload" style={{ width: "100%", display: "block" }} />
        ) : (
          <iframe src={video.embed} allow="autoplay" allowFullScreen
            style={{ width: "100%", aspectRatio: "16 / 9", border: "none", display: "block" }} />
        )}
      </div>
      {video.kind === "drive" && (
        <div className="text-xs mt-1" style={{ color: C.faint, lineHeight: 1.45 }}>
          Google Drive supplies its own player, so its controls cannot be trimmed the way a YouTube lesson&apos;s are.
        </div>
      )}
    </div>
  );
}

const RATES = [1, 1.25, 1.5, 1.75, 2];

function YouTubePlayer({ id }: { id: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const player = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(0);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fs, setFs] = useState(false);

  // fullscreen follows the browser's own state, however it was left
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  useEffect(() => {
    let dead = false;
    let tick: ReturnType<typeof setInterval> | null = null;

    // the lesson resumes where it was left (Dr Raghu, 29 Aug 2026) — the
    // position is kept per device, cued before play so nothing autostarts
    let resumeAt = 0;
    try { resumeAt = Math.floor(Number(window.localStorage.getItem(`lms.pos.${id}`) || 0)); } catch (e) { swallow("LmsVideo", e); /* fine */ }
    if (resumeAt < 15) resumeAt = 0;

    loadYouTubeApi().then(() => {
      if (dead || !host.current || !window.YT?.Player) { if (!dead) setFailed(true); return; }
      player.current = new window.YT.Player(host.current, {
        videoId: id,
        playerVars: {
          controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3,
          disablekb: 1, playsinline: 1, fs: 0,
          ...(resumeAt ? { start: resumeAt } : {}),
        },
        events: {
          onReady: (e: any) => {
            if (dead) return;
            setReady(true);
            setLen(e.target.getDuration() || 0);
            // the lesson must be HEARD — whatever muted the embed (YouTube
            // remembers mute per-site) is undone the moment the player is ours
            // (Dr Raghu, 29 Aug 2026: "this goal movie is muted — check this")
            try { e.target.unMute?.(); e.target.setVolume?.(100); } catch (e) { swallow("LmsVideo", e); /* fine */ }
            setMuted(!!e.target.isMuted?.());
            if (resumeAt) setAt(resumeAt);
            // one clock for the whole player, cleared on unmount — it also
            // remembers the position, and forgets it near the end
            tick = setInterval(() => {
              if (!player.current?.getCurrentTime) return;
              const now = player.current.getCurrentTime() || 0;
              setAt(now);
              const d = player.current.getDuration?.() || 0;
              if (d) setLen(d);
              setMuted(!!player.current.isMuted?.());
              try {
                if (player.current.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
                  if (d && now > d - 60) window.localStorage.removeItem(`lms.pos.${id}`);
                  else if (now > 15) window.localStorage.setItem(`lms.pos.${id}`, String(Math.floor(now)));
                }
              } catch (e) { swallow("LmsVideo", e); /* private mode — the clock still runs */ }
            }, 500);
          },
          onStateChange: (e: any) => {
            if (dead) return;
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
          onError: () => { if (!dead) setFailed(true); },
        },
      });
    });

    return () => {
      dead = true;
      if (tick) clearInterval(tick);
      try { player.current?.destroy?.(); } catch (e) { swallow("LmsVideo", e); /* already gone */ }
      player.current = null;
    };
  }, [id]);

  const toggle = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (playing) p.pauseVideo?.();
    else p.playVideo?.();
  }, [playing]);

  const forward = useCallback(() => {
    const p = player.current;
    if (!p?.seekTo) return;
    const to = Math.min((p.getCurrentTime?.() || 0) + FORWARD_SECONDS, p.getDuration?.() || Number.MAX_SAFE_INTEGER);
    p.seekTo(to, true);
    setAt(to);
  }, []);

  // speed cycles through the honest ladder — 1× → 1.25× → 1.5× → 1.75× → 2×
  const cycleRate = useCallback(() => {
    const p = player.current;
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    p?.setPlaybackRate?.(next);
    setRate(next);
  }, [rate]);

  const toggleMute = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (p.isMuted?.()) { p.unMute?.(); p.setVolume?.(100); setMuted(false); }
    else { p.mute?.(); setMuted(true); }
  }, []);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  }, []);

  if (failed)
    return (
      <div className="rounded-lg p-3 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.5 }}>
        This video would not load — it may be private or restricted from embedding.{" "}
        <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer" className="font-bold underline">
          Open it on YouTube
        </a>.
      </div>
    );

  const pct = len > 0 ? Math.min(100, (at / len) * 100) : 0;

  return (
    <div ref={box} className="rounded-lg overflow-hidden"
      style={{ border: `1px solid ${C.line}`, ...(fs ? { display: "flex", flexDirection: "column", height: "100%", background: "#000", border: "none", borderRadius: 0 } : {}) }}>
      {/* The iframe is covered edge to edge: with controls off there is nothing
          on it to click, and a stray click on the video itself would toggle
          play in a way the buttons below could not stay in step with. */}
      <div style={{ position: "relative", background: "#000", ...(fs ? { flex: 1, minHeight: 0 } : {}) }}>
        <div style={fs ? { width: "100%", height: "100%" } : { aspectRatio: "16 / 9", width: "100%" }}>
          <div ref={host} style={{ width: "100%", height: "100%" }} />
        </div>
        <div onClick={toggle} style={{ position: "absolute", inset: 0, cursor: "pointer" }}
          title={playing ? "Pause" : "Play"} aria-hidden />
      </div>

      <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: C.ink }}>
        <button onClick={toggle} disabled={!ready} className="rounded font-bold"
          style={{ background: C.accent, color: "#fff", width: 34, height: 26, opacity: ready ? 1 : 0.5, fontSize: 13 }}
          title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <button onClick={forward} disabled={!ready} className="rounded font-bold"
          style={{ background: "#22303C", color: "#fff", height: 26, padding: "0 8px", opacity: ready ? 1 : 0.5, fontSize: 11 }}
          title={`Forward ${FORWARD_SECONDS} seconds`} aria-label={`Forward ${FORWARD_SECONDS} seconds`}>
          ⏩ {FORWARD_SECONDS}s
        </button>
        <button onClick={cycleRate} disabled={!ready} className="rounded font-bold tnum"
          style={{ background: rate !== 1 ? C.accent : "#22303C", color: "#fff", height: 26, padding: "0 8px", opacity: ready ? 1 : 0.5, fontSize: 11 }}
          title="Playback speed — click to cycle" aria-label="Playback speed">
          {rate}×
        </button>
        <button onClick={toggleMute} disabled={!ready} className="rounded font-bold"
          style={{ background: muted ? "#B3261E" : "#22303C", color: "#fff", height: 26, padding: "0 8px", opacity: ready ? 1 : 0.5, fontSize: 12 }}
          title={muted ? "Unmute" : "Mute"} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🔊"}
        </button>

        {/* Progress is shown, not scrubbed: there is no dragging back and
            forth to the end of a training video. */}
        <div style={{ flex: 1, height: 4, background: "#33414F", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: 4, background: C.accent }} />
        </div>

        <span className="tnum" style={{ fontSize: 11, color: "#8FA1B3", minWidth: 82, textAlign: "right" }}>
          {clock(at)} / {len ? clock(len) : "—"}
        </span>
        <button onClick={toggleFs} disabled={!ready} className="rounded font-bold"
          style={{ background: "#22303C", color: "#fff", height: 26, padding: "0 8px", opacity: ready ? 1 : 0.5, fontSize: 12 }}
          title={fs ? "Exit full screen" : "Full screen"} aria-label={fs ? "Exit full screen" : "Full screen"}>
          {fs ? "⤢ Exit" : "⛶"}
        </button>
      </div>
    </div>
  );
}
