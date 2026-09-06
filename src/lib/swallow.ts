/**
 * A caught error that the code chooses to ignore, but not silently
 * (6 Sep 2026: 199 empty catch blocks said nothing anywhere).
 *
 * On the server this is one warn line in the Vercel log naming where it
 * happened; in the browser it is a console.warn. Neither changes what the
 * caller does: the choice to carry on stays the caller's.
 */
export function swallow(where: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg) console.warn(`[swallowed] ${where}: ${msg}`);
}
