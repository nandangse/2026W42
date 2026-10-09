/** A search box's text, made safe for a PostgREST `.or(...)` filter: the characters that would end one condition and start another are blanked (audit S15, 9 Oct 2026). */
export const safeQ = (q: unknown): string => String(q ?? "").replace(/[,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
