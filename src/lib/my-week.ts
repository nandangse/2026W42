// My Week — the pieces that are not already on the board.
//
// Pure functions, shared by the API and the page so a number never gets
// computed twice and disagreed with once.

export type Mood = "great" | "good" | "ok" | "low" | "rough";

/**
 * Five faces, in one order, everywhere.
 *
 * Five and not ten: a ten-point scale invites deliberation, and the honest
 * answer is the one given in the second before somebody thinks about it. The
 * wording is deliberately about the DAY, not the person — "rough day" is a
 * thing anybody will click, "I am unhappy" is not.
 */
export const MOODS: { key: Mood; face: string; label: string; color: string }[] = [
  { key: "great", face: "😄", label: "Great day", color: "#0D7A3F" },
  { key: "good", face: "🙂", label: "Good", color: "#5FA052" },
  { key: "ok", face: "😐", label: "Just OK", color: "#D97706" },
  { key: "low", face: "🙁", label: "Bit low", color: "#E8600A" },
  { key: "rough", face: "😞", label: "Rough day", color: "#B3261E" },
];

export const moodMeta = (m: string | null | undefined) => MOODS.find((x) => x.key === m) ?? null;

/** The window everything on this page counts back over. */
export const PARTICIPATION_DAYS = 30;
export const LEARNING_DAYS = 90;

/**
 * A Google Drive share link → something an <img> can actually load.
 *
 * Drive's /view page is HTML, so pasting it into an img tag shows nothing. The
 * thumbnail endpoint serves the image itself and takes a width, which is what
 * this page wants. Anything that is already a direct image URL is left alone.
 *
 * The file still has to be shared "anyone with the link" — this converts a
 * link, it cannot grant access to a private one.
 */
export function imageUrl(raw: string | null | undefined, width = 1000): string | null {
  const u = String(raw || "").trim();
  if (!u) return null;
  const gd = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=|thumbnail\?(?:.*&)?id=)([\w-]{10,})/i);
  if (gd) return `https://drive.google.com/thumbnail?id=${gd[1]}&sz=w${width}`;
  return /^https?:\/\//i.test(u) ? u : null;
}

/**
 * Which of N things today gets.
 *
 * Keyed off the date so everybody in the company sees the SAME image on the
 * same day — a shuffle per browser would mean nobody could mention it to
 * anybody. Rotates through the whole list before repeating.
 */
export function pickForDay(count: number, isoDate: string): number {
  if (count <= 0) return -1;
  const days = Math.floor(Date.parse(isoDate + "T00:00:00Z") / 86400000);
  return ((days % count) + count) % count;
}

/** A YouTube thumbnail for a lesson card, where the lesson has a video. */
export function youTubeThumb(videoUrl: string | null | undefined): string | null {
  const m = String(videoUrl || "").match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i,
  );
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export interface Birthday {
  id: string;
  name: string;
  dob: string;
  /** Days from today, 0 = today. */
  inDays: number;
  department: string | null;
}

/**
 * Birthdays in the next `days` days, ignoring the year.
 *
 * Wrapping the year end is the whole difficulty: on 28 December, 2 January is
 * five days away and a naive comparison of month-day strings puts it eleven
 * months in the past. So each birthday is projected onto this year AND next,
 * and the nearer one wins.
 *
 * 29 FEBRUARY lands on 1 March in the three years out of four that do not have
 * one — Date.UTC rolls it over, and that behaviour is kept deliberately rather
 * than guarded against. The alternative is that somebody born on a leap day is
 * never wished a happy birthday by this company again except in leap years,
 * which is not a rule anybody would choose if asked out loud.
 */
export function birthdaysWithin(
  people: { id: string; name: string; dob: string | null; department?: string | null }[],
  today: string,
  days: number,
): Birthday[] {
  const t = new Date(today + "T00:00:00Z");
  const out: Birthday[] = [];
  for (const p of people) {
    if (!p.dob) continue;
    const [, mm, dd] = p.dob.slice(0, 10).split("-");
    if (!mm || !dd) continue;
    let best: number | null = null;
    for (const year of [t.getUTCFullYear(), t.getUTCFullYear() + 1]) {
      const d = Date.UTC(year, Number(mm) - 1, Number(dd));
      const diff = Math.round((d - t.getTime()) / 86400000);
      if (diff >= 0 && (best == null || diff < best)) best = diff;
    }
    if (best != null && best <= days)
      out.push({ id: p.id, name: p.name, dob: p.dob.slice(0, 10), inDays: best, department: p.department ?? null });
  }
  return out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

/** "today", "tomorrow", "in 4 days" — never a bare number of days. */
export const inWords = (n: number): string => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// ---------------------------------------------------------------------------
// Reading a public Drive folder
// ---------------------------------------------------------------------------
/**
 * List the file ids in a PUBLIC Google Drive folder, without an API key.
 *
 * Drive's old embedded-folder view returns plain HTML with one
 * `id="entry-<FILE_ID>"` per file, and it works for any folder shared "anyone
 * with the link". The proper Drive API would need a key, an OAuth app and a
 * consent screen to read pictures that are already public to the world.
 *
 * It is a scrape, so it is treated as one: the result is CACHED into
 * image_quote, and a morning when Google changes this markup leaves yesterday's
 * pictures on screen rather than an empty panel. That is the whole reason the
 * cache table exists.
 */
export async function listDriveFolder(folderId: string): Promise<string[]> {
  const id = String(folderId || "").trim();
  if (!/^[\w-]{10,}$/.test(id)) return [];
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#grid`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Genie/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Drive returned ${res.status} — is the folder shared "anyone with the link"?`);
  const html = await res.text();
  const ids = [...html.matchAll(/id="entry-([\w-]{20,})"/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

/** A Drive folder id out of whatever was pasted — a link, or the id itself. */
export function folderIdOf(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/folders\/([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
