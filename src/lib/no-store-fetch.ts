/**
 * A FETCH THAT NEVER SERVES YESTERDAY'S ANSWER.
 *
 * WHAT HAPPENED (14 Sep 2026, and it cost most of a day).
 *
 * The marketing cron reported "campaigns: 0" on six consecutive passes
 * while a campaign sat plainly at status = sending, and the identical query
 * with the identical service key returned that campaign from a laptop every
 * time. The heartbeat was made to say which database it was reading, and it
 * answered correctly: right host, campaign visible, no error — and still
 * nothing found. Two readings of one table, a millisecond apart in one
 * process, disagreeing.
 *
 * The proof came by accident. The campaign was finished by hand at 15:42
 * and its row set to `done`. At 15:50 the cron still reported
 * { draft: 1, sending: 1 } — a state that no longer existed anywhere in the
 * database. It was not reading the database at all. It was replaying an
 * answer from earlier.
 *
 * WHY. Next.js patches the global `fetch` and caches GET requests. supabase-js
 * makes its reads through that same global fetch, so a PostgREST GET becomes a
 * cacheable URL like any other. The drain's campaign query was cached as an
 * empty array the first time it ran — before the campaign existed — and every
 * pass since was served that empty array. `export const dynamic =
 * "force-dynamic"` does not help: it governs how the ROUTE is rendered, not
 * what the route's own outbound fetches do.
 *
 * WHAT IT LOOKED LIKE, and why it was so hard to see: no error, no warning,
 * a plausible answer, and a pass that finished in the same second it fired —
 * because a cache hit is instant. A silent nought and a silent failure
 * looking identical, which is the same lesson this module keeps teaching.
 *
 * THE RULE. A database read is never cacheable. Not for a second. Every
 * Supabase client in Genie is built with this fetch, so no read of any table
 * anywhere can be served from a cache.
 */
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
