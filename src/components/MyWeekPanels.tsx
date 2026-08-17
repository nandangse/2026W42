"use client";
// The new panels on My Week: how the day is going, the image quote, the
// birthdays, and the one lesson to pick up.
//
// They live here rather than in PlanningSuite because each one talks to
// /api/my-week on its own and none of them belongs to the board.
//
// A rule that runs through all four: A PANEL WITH NOTHING IN IT SAYS SO AND
// TAKES ONE LINE. The first screen anybody sees in the morning must not be
// four empty boxes explaining themselves at length.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MOODS, moodMeta, youTubeThumb, inWords, type Mood } from "@/lib/my-week";
import { fmtFull } from "@/lib/schedule";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

export interface MyWeekData {
  today: string;
  mood: { today: { mood: string; note: string | null } | null; recent: { on_date: string; mood: string }[] };
  learning: { minutes: number; completed: number; extras: number; installed: boolean; next: null | { id: string; title: string; minutes: number; video_url: string | null; pdf_url: string | null; description: string; status: string } };
  participation: { days: number; of: number };
  birthdays: { id: string; name: string; dob: string; inDays: number; department: string | null }[];
  image: null | { id: string; url: string; caption: string | null; src: string | null; of: number };
}

/** One fetch for every panel on the page. */
export function useMyWeek(): [MyWeekData | null, () => void] {
  const [d, setD] = useState<MyWeekData | null>(null);
  const load = useCallback(() => {
    api.get("/api/my-week").then(setD).catch(() => setD(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  return [d, load];
}

// ===========================================================================
/**
 * How's my day.
 *
 * Five faces and nothing else on the way in — no scale, no required note, no
 * "are you sure". The answer is worth having only if it costs one click, and
 * the run of them along the bottom is the actual point: one bad Tuesday is
 * noise, five in a row is something a manager should already know about.
 */
export function HowsMyDay({ data, onSaved }: { data: MyWeekData | null; onSaved: () => void }) {
  const [busy, setBusy] = useState<Mood | null>(null);
  const [err, setErr] = useState("");
  const picked = data?.mood.today?.mood ?? null;

  const say = async (m: Mood) => {
    setBusy(m); setErr("");
    try { await api.post("/api/my-week", { action: "mood", mood: m }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const recent = (data?.mood.recent || []).slice(0, 14).reverse();

  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, borderTop: `3px solid ${C.violet}` }}>
      <div className="text-xs font-bold" style={{ color: C.mute }}>HOW&apos;S MY DAY</div>
      <div className="flex gap-1 mt-1 flex-wrap">
        {MOODS.map((m) => {
          const on = picked === m.key;
          return (
            <button key={m.key} onClick={() => say(m.key)} disabled={!!busy} title={m.label}
              className="rounded"
              style={{
                fontSize: 20, lineHeight: 1, padding: "3px 5px",
                background: on ? m.color : "transparent",
                border: `1px solid ${on ? m.color : C.line}`,
                filter: on || !picked ? "none" : "grayscale(1)",
                opacity: busy && busy !== m.key ? 0.4 : 1,
                cursor: "pointer",
              }}>
              {m.face}
            </button>
          );
        })}
      </div>
      <div className="text-xs mt-1" style={{ color: picked ? moodMeta(picked)!.color : C.faint }}>
        {picked ? moodMeta(picked)!.label : "One click. Nobody else sees today's answer but you and your manager."}
      </div>
      {recent.length > 1 && (
        <div className="flex gap-0.5 mt-1.5" title="Your last fortnight">
          {recent.map((r) => (
            <span key={r.on_date} title={`${fmtFull(r.on_date)} · ${moodMeta(r.mood)?.label ?? r.mood}`}
              style={{ width: 8, height: 8, borderRadius: 2, background: moodMeta(r.mood)?.color ?? C.line }} />
          ))}
        </div>
      )}
      {err && <div className="text-xs mt-1" style={{ color: C.red }}>{err}</div>}
    </div>
  );
}

// ===========================================================================
/** The image quote — one a day, the same one for everybody. */
export function ImageQuote({ data, isAdmin }: { data: MyWeekData | null; isAdmin: boolean }) {
  const [big, setBig] = useState(false);
  const img = data?.image;

  if (!img?.src)
    return (
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line, minHeight: 120 }}>
        <div className="text-xs font-bold mb-1" style={{ color: C.mute }}>IMAGE QUOTE</div>
        <div className="text-xs" style={{ color: C.faint, lineHeight: 1.5 }}>
          No images loaded yet.
          {isAdmin
            ? " Paste the Drive links in Admin → Settings → Image quotes — the folder itself can't be read, so the links live here."
            : " An admin adds these."}
        </div>
      </div>
    );

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: C.line }}>
        <button onClick={() => setBig(true)} style={{ display: "block", width: "100%", cursor: "zoom-in" }} title="Open it larger">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.caption || "Quote of the day"}
            style={{ width: "100%", display: "block", maxHeight: 260, objectFit: "cover" }} />
        </button>
        {img.caption && <div className="text-xs px-2 py-1" style={{ color: C.sub }}>{img.caption}</div>}
      </div>
      {big && (
        <div onClick={() => setBig(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.85)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.caption || "Quote of the day"} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 6 }} />
        </div>
      )}
    </>
  );
}

// ===========================================================================
/** Birthdays in the next seven days. */
export function Birthdays({ data }: { data: MyWeekData | null }) {
  const list = data?.birthdays || [];
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
      <div className="font-bold text-sm mb-1.5">🎂 Birthdays this week</div>
      {list.length === 0 ? (
        <div className="text-xs" style={{ color: C.faint }}>Nobody in the next seven days.</div>
      ) : (
        list.map((b) => (
          <div key={b.id} className="flex items-baseline gap-2 py-0.5 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: b.inDays === 0 ? C.accent : C.ink }}>{b.name}</span>
            {b.department && <span className="text-xs" style={{ color: C.faint }}>{b.department}</span>}
            <div className="flex-1" style={{ minWidth: 4 }} />
            <span className="text-xs font-bold" style={{ color: b.inDays === 0 ? C.accent : C.sub }}>
              {b.inDays === 0 ? "🎉 today" : inWords(b.inDays)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// ===========================================================================
/**
 * One lesson, with its thumbnail, opening in a lightbox.
 *
 * Whatever is already under way, else whatever is planned — never one they
 * have finished. A "carry on" card that offers something already done is worse
 * than no card.
 */
export function MyLearningCard({ data, onOpenLms }: { data: MyWeekData | null; onOpenLms: () => void }) {
  const [open, setOpen] = useState(false);
  const l = data?.learning.next;
  const thumb = l ? youTubeThumb(l.video_url) : null;

  return (
    <>
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="font-bold text-sm">📚 My learning</div>
          <button onClick={onOpenLms} className="text-xs font-bold" style={{ color: C.accent }}>Open LMS →</button>
        </div>
        {!l ? (
          <div className="text-xs" style={{ color: C.faint, lineHeight: 1.5 }}>
            {data?.learning.installed
              ? "Nothing on your plan yet. Ask Genie to write your learning plan in LMS."
              : "Learning isn't installed yet."}
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-left w-full" style={{ cursor: "pointer" }}>
            <div className="rounded overflow-hidden mb-1.5" style={{ background: C.panel, aspectRatio: "16 / 9", position: "relative" }}>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div className="flex items-center justify-center h-full" style={{ color: C.faint, fontSize: 30 }}>
                  {l.pdf_url ? "📄" : "📖"}
                </div>
              )}
              <span style={{ position: "absolute", left: 6, bottom: 6, background: "rgba(22,35,47,0.85)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3 }}>
                {l.status === "in_progress" ? "CARRY ON" : "START"}{l.minutes ? ` · ${l.minutes} min` : ""}
              </span>
            </div>
            <div className="font-semibold text-sm" style={{ color: C.navy, lineHeight: 1.3 }}>{l.title}</div>
          </button>
        )}
      </div>

      {open && l && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg"
            style={{ width: "min(760px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
            <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink, position: "sticky", top: 0 }}>
              <div style={{ flex: 1 }}>
                <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>LESSON</div>
                <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{l.title}</div>
              </div>
              <button onClick={() => setOpen(false)} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            <div className="p-4">
              {l.description && <div className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{l.description}</div>}
              {/* The lightbox is a preview, not the lesson: finishing one needs
                  the fifty-word box, and that lives in LMS where it belongs. */}
              <div className="rounded p-3 text-xs" style={{ background: C.panel, color: C.sub, lineHeight: 1.55 }}>
                Open it in <b>LMS</b> to watch it through and write up what you took from it — a lesson only counts once
                you have, and that write-up is what goes into your IDP.
              </div>
              <button onClick={onOpenLms} className="mt-3 rounded px-4 py-2 text-sm font-bold" style={{ background: C.accent, color: "#fff" }}>
                Open in LMS →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
