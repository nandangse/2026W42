/**
 * READ A WHOLE TABLE, NOT THE FIRST THOUSAND ROWS OF IT.
 *
 * PostgREST answers at most 1,000 rows and says nothing about the rest.
 * `.limit(50000)` does not raise that ceiling — it is capped server-side, so
 * the call returns 1,000 rows, no error, no warning, and looks exactly like a
 * table that happens to hold 1,000 rows.
 *
 * WHAT THAT WAS ABOUT TO COST, measured on 15 Sep 2026:
 *
 *   · The suppression list is read once per drain pass. Past a thousand
 *     unsubscribes the rest become invisible and Genie starts mailing people
 *     who asked it not to. At 240,000 sends a month that is weeks away, and
 *     it is the one mistake in this module that cannot be apologised for.
 *
 *   · A campaign's audience is counted the same way. The aviation list holds
 *     10,137 people; the reach would have read 1,000, and a send to it would
 *     have quietly dropped 9,137 of them.
 *
 * So every whole-table read goes through here. It pages until a short page
 * arrives, and — this is the point — it THROWS on an error instead of
 * returning what it has, because a partial answer that looks complete is the
 * fault being fixed.
 */
const PAGE = 1000;

export async function pageAll<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what = "rows",
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(`reading ${what}: ${error.message}`);
    const page = data || [];
    out.push(...page);
    if (page.length < PAGE) return out;
    /* A runaway loop would be worse than a short read. Nothing in Genie is
       legitimately this large in one go. */
    if (out.length > 2_000_000) throw new Error(`reading ${what}: more than two million rows — refusing to go on`);
  }
}
