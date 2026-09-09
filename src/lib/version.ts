/**
 * The running Genie version — the ONLY thing a browser needs from the
 * release log.
 *
 * Until 6 Sep 2026 every module's header badge imported APP_VERSION from
 * src/lib/changelog.ts, and because that constant was UPDATES[0].v the
 * whole log — 5,000 lines of prose — rode into a 536 KB chunk on every
 * page. The version now lives here on its own; the log stays server-side
 * behind GET /api/updates, and changelog.ts refuses to load if its top entry
 * disagrees with this string, so the two still cannot drift.
 */
export const APP_VERSION = "5.0.40.1";
