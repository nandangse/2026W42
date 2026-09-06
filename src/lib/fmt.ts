/**
 * The formatters every screen used to declare for itself (6 Sep 2026: the
 * rupee formatter was written 18 times, escaping 7, date-to-dmy 7). One
 * copy each, one voice: null is a dash, numbers are Indian-grouped, dates
 * are dd-mm-yyyy, and "today" is India's today wherever the server runs.
 */

/** 12,34,567 — rounded, Indian grouping; null/undefined/"" is `empty`. */
export const inr = (n: number | string | null | undefined, empty = "—"): string =>
  n == null || n === "" ? empty : Math.round(Number(n)).toLocaleString("en-IN");

/** ₹12,34,567 — with the sign; `dec` decimals kept. */
export const rupee = (n: unknown, empty = "—", dec = 0): string =>
  n == null || n === "" ? empty : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: dec })}`;

/** A count or quantity, Indian-grouped, up to `dec` decimals. */
export const numFmt = (n: unknown, empty = "·", dec = 0): string =>
  n == null || n === "" ? empty : Number(n).toLocaleString("en-IN", { maximumFractionDigits: dec });

/** Text safe inside HTML — the four characters that matter. */
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 2026-09-06 → 06-09-2026; anything else is a dash. */
export const dmy = (iso: unknown, empty = "—"): string => {
  const s = String(iso || "").slice(0, 10);
  return ISO.test(s) ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : empty;
};

/** 2026-09-06 → 06/09/2026. */
export const dmySlash = (iso: unknown, empty = "—"): string => {
  const s = String(iso || "").slice(0, 10);
  return ISO.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : empty;
};

/** A timestamp as 06/09/2026 08:15, Indian time. */
export const fmtAt = (s: string | null | undefined, empty = "·"): string =>
  s
    ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "")
    : empty;

/** Today's date in India as YYYY-MM-DD, wherever the process runs. */
export const istToday = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Calendar arithmetic on YYYY-MM-DD strings, no time zone in the way. */
export const addDays = (iso: string, n: number): string =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

/** 2026-09-06 → 2026-09. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/** 2026-09 → Sep 2026. */
export const monthLabel = (key: string): string =>
  new Date(key + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
