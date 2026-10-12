// The Learning section — shapes, the completion rule, and the video-link
// arithmetic. Pure functions only, so the API and the UI agree on every one.
//
// The idea the whole module turns on: A TICK IS NOT LEARNING. Anybody can mark
// a lesson done. So a lesson is not complete until the person has written at
// least fifty words of their own about what they took from it, and it is that
// text — not the tick — that the IDP is built out of. Every rule below exists
// to keep that honest.

export type LessonStatus = "planned" | "in_progress" | "completed";

/** The floor, in words, for a lesson to count as finished. */
export const MIN_LEARNING_WORDS = 50;

export const STATUS_META: Record<LessonStatus, { label: string; color: string; bg: string }> = {
  planned: { label: "Planned", color: "#5A6672", bg: "#F4F2EC" },
  in_progress: { label: "In Progress", color: "#D97706", bg: "#FFF7E6" },
  completed: { label: "Completed", color: "#0D7A3F", bg: "#E6F4EA" },
};

export const STATUS_ORDER: LessonStatus[] = ["in_progress", "planned", "completed"];

/**
 * WHO A LIBRARY IS FOR (Dr Raghu, 27 Sep 2026).
 *
 * Five named groups, and an empty audience meaning every logged-in Genie
 * user. Said that way round a new library is open by default and is narrowed
 * on purpose — which is the safe direction here. The cost of an open training
 * library is that somebody reads a course meant for another team; the cost of
 * a closed one is training that nobody can see and so nobody does.
 */
export const LMS_GROUPS = ["Sales", "Operations", "Worker", "Consultant", "Lean", "Service", "Leaders Council"] as const;
/** Two groups the LMS works out for itself (12 Oct 2026): Service = on the HRMS roll in the Service department; Leaders Council = profiles.lc. */
export const DERIVED_GROUPS = ["Service", "Leaders Council"] as const;
export type LmsGroup = (typeof LMS_GROUPS)[number];

export const EVERYONE = "All logged-in Genie users";

/** What a library's audience should be called on screen. */
export function audienceLabel(audience?: string[] | null): string {
  const a = (audience || []).filter(Boolean);
  return a.length ? a.join(" · ") : EVERYONE;
}

/**
 * May this person see this library?
 *
 * An admin sees every library, because somebody has to be able to put a
 * lesson into one — but that is the ONLY way through: being an admin is not
 * a group, so an admin's own shelf shows what their groups say, and what
 * they see extra is visibly marked rather than silently mixed in.
 */
export function maySeeBook(
  book: { audience?: string[] | null },
  groups: string[] | null | undefined,
  isAdmin = false,
): boolean {
  const a = (book.audience || []).filter(Boolean);
  if (!a.length) return true;               // empty means everybody
  if (isAdmin) return true;
  const mine = new Set((groups || []).map((g) => g.toLowerCase()));
  return a.some((g) => mine.has(String(g).toLowerCase()));
}

export interface Book {
  id: string;
  name: string;
  blurb: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  /** Groups that may see it. Empty = everybody. Absent until migration 0170. */
  audience?: string[] | null;
  /** The book's URL name — genie.nandan.co.in/lms/<slug>. Two words max,
   *  dashed. Absent until migration 0101. */
  slug?: string | null;
}

export interface Section {
  id: string;
  book_id: string;
  name: string;
  sort_order: number;
}

export interface Lesson {
  id: string;
  title: string;
  content: string;
  description: string;
  pdf_url: string | null;
  video_url: string | null;
  minutes: number;
  /** The lesson's URL — genie.nandan.co.in/lms/<4-digit code>. Random,
   *  unique, stable once given. Absent until migration 0101. */
  code?: string | null;
  /** Which books it is shelved in, and where inside each. */
  shelves: { book_id: string; section_id: string | null; sort_order: number }[];
}

export interface Progress {
  lesson_id: string;
  status: LessonStatus;
  completed_on: string | null;
  learning: string;
  /** Scratch notes taken while watching. NEVER counts towards the fifty
   *  words — the floor means something only because it is written after,
   *  about what was taken. Absent until migration 0170. */
  notes?: string;
  minutes: number;
  planned_by: string | null;
  /** Queue position within a status — smaller floats up. Assigned trainings
   *  (The Goal movie, Kaizen days) take the low numbers; self-planned
   *  lessons default to 1000 and follow. Absent until migration 0100. */
  sort_order?: number | null;
}

export interface Extra {
  id: string;
  title: string;
  provider: string | null;
  on_date: string | null;
  minutes: number;
  learning: string;
}

export interface Plan {
  plan: string;
  rationale: string;
  generated_at: string | null;
  generated_by: string | null;
}

// ---------------------------------------------------------------------------
// The fifty words
// ---------------------------------------------------------------------------
/**
 * Words, counted the way a person would count them.
 *
 * Split on whitespace and drop anything with no letter or digit in it, so a
 * line of bullets, dashes or full stops cannot pad the count towards fifty.
 * The point of the floor is that somebody had to think; padding it defeats
 * the only thing this section is for.
 */
export function wordCount(s: string): number {
  return (s || "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export const meetsLearningFloor = (s: string): boolean => wordCount(s) >= MIN_LEARNING_WORDS;

/** What to tell someone who is not there yet. Never a bare number. */
export function learningShortfall(s: string): string | null {
  const n = wordCount(s);
  if (n >= MIN_LEARNING_WORDS) return null;
  const left = MIN_LEARNING_WORDS - n;
  return n === 0
    ? `Write what you took from this lesson — at least ${MIN_LEARNING_WORDS} words.`
    : `${left} more word${left === 1 ? "" : "s"} — ${n} of ${MIN_LEARNING_WORDS}.`;
}

// ---------------------------------------------------------------------------
// Totals — what the IDP reads
// ---------------------------------------------------------------------------
export interface LearningTotals {
  completed: number;
  inProgress: number;
  planned: number;
  /** Minutes banked against completed lessons only. Planned time is not time. */
  minutes: number;
  /** Minutes from training taken outside Genie. */
  extraMinutes: number;
  extraCount: number;
  /** Everything, in minutes. This is the IDP number. */
  totalMinutes: number;
  /** Words written across every completed lesson and extra. */
  words: number;
  lastCompleted: string | null;
}

/**
 * A person's whole learning record.
 *
 * Only COMPLETED lessons contribute time. A planned lesson is an intention,
 * and letting intentions accumulate into a total is how a training record ends
 * up flattering everybody in it.
 */
export function totalsOf(progress: Progress[], lessons: Map<string, Lesson>, extras: Extra[]): LearningTotals {
  let completed = 0, inProgress = 0, planned = 0, minutes = 0, words = 0;
  let lastCompleted: string | null = null;

  for (const p of progress) {
    if (p.status === "completed") {
      completed++;
      // what they actually spent, falling back to the lesson's estimate — a
      // completed lesson with no minutes recorded is not a zero-minute lesson
      minutes += p.minutes || lessons.get(p.lesson_id)?.minutes || 0;
      words += wordCount(p.learning);
      if (p.completed_on && (!lastCompleted || p.completed_on > lastCompleted)) lastCompleted = p.completed_on;
    } else if (p.status === "in_progress") inProgress++;
    else planned++;
  }

  const extraMinutes = extras.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
  for (const e of extras) words += wordCount(e.learning);
  for (const e of extras) if (e.on_date && (!lastCompleted || e.on_date > lastCompleted)) lastCompleted = e.on_date;

  return {
    completed, inProgress, planned, minutes,
    extraMinutes, extraCount: extras.length,
    totalMinutes: minutes + extraMinutes,
    words, lastCompleted,
  };
}

/** "4 h 30 m", "45 m", "—". Hours and minutes, never a decimal of an hour. */
export function hhmm(mins: number): string {
  const m = Math.max(0, Math.round(mins || 0));
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} m` : `${h} h`) : `${r} m`;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------
export type VideoKind = "youtube" | "drive" | "file" | "unknown";

export interface VideoRef {
  kind: VideoKind;
  /** YouTube video id, or the Drive file id. */
  id: string | null;
  /** What to put in an iframe/video src. */
  embed: string | null;
  original: string;
}

/**
 * Read a pasted link.
 *
 * YouTube is the case that matters: the embed is built with controls off so
 * the app can supply play, pause, forward and the clock and nothing else — no
 * suggested videos, no channel, no sharing, nothing that takes somebody off a
 * lesson and into the rest of YouTube.
 *
 * Drive cannot have its player rebuilt — /preview is the only embed Google
 * offers and its controls are its own. That is a limitation worth stating
 * rather than pretending away.
 */
export function parseVideo(url: string | null | undefined): VideoRef {
  const original = String(url || "").trim();
  if (!original) return { kind: "unknown", id: null, embed: null, original };

  // youtu.be/ID · youtube.com/watch?v=ID · /embed/ID · /shorts/ID · /live/ID
  const yt =
    original.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) {
    const id = yt[1];
    const q = new URLSearchParams({
      // the app draws the controls; YouTube draws none
      controls: "0",
      modestbranding: "1",
      rel: "0",            // no "up next" from the rest of YouTube
      iv_load_policy: "3", // no annotation cards
      disablekb: "1",      // keyboard shortcuts would reach the hidden controls
      playsinline: "1",
      enablejsapi: "1",    // so play/pause/seek can be driven from the page
    });
    return { kind: "youtube", id, embed: `https://www.youtube-nocookie.com/embed/${id}?${q}`, original };
  }

  // drive.google.com/file/d/ID/view · open?id=ID · uc?id=ID
  const gd = original.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i);
  if (gd) return { kind: "drive", id: gd[1], embed: `https://drive.google.com/file/d/${gd[1]}/preview`, original };

  if (/^https?:\/\/\S+\.(mp4|webm|ogg|m4v)(\?|$)/i.test(original))
    return { kind: "file", id: null, embed: original, original };

  return { kind: "unknown", id: null, embed: null, original };
}

/** A Drive PDF share link becomes an embeddable preview; anything else is used as-is. */
export function pdfEmbed(url: string | null | undefined): string | null {
  const u = String(url || "").trim();
  if (!u) return null;
  const gd = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  return /^https?:\/\//i.test(u) ? u : null;
}

/** mm:ss, for the player's clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
