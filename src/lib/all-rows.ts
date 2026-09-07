
/**
 * READ EVERY ROW, NOT THE FIRST THOUSAND (found 7 Sep 2026).
 *
 * PostgREST answers with at most 1,000 rows unless it is asked for more, and
 * it does not complain when it truncates. The employee overrides passed that
 * mark quietly — 1,757 rows against a 1,000-row ceiling — so 757 of them were
 * being dropped on every read. The symptom was a person's Roles column
 * sitting empty on the Employee Master while an identical colleague showed
 * theirs: nothing was wrong with either record, one simply fell past row
 * 1,000. Every other overridden field on those people was missing in the same
 * way, silently, including pay.
 *
 * Anything that reads a whole table must page. This does the paging.
 */
/** What a Supabase query looks like once `.range()` is all we need from it. */
interface Rangeable<T> { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> }

export async function allRows<T>(make: () => Rangeable<T>, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const got = (data || []) as T[];
    out.push(...got);
    if (got.length < page) return out;
    if (out.length > 200000) return out;   // a runaway guard, never reached in practice
  }
}
