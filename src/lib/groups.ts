/**
 * LC, Stratcom and Management — which room somebody is in.
 *
 * These are NOT roles, and the distinction matters. `role` says what you may
 * DO: write a plan, upload a file, administer accounts. These say who you sit
 * with. Folding them into `role` would have meant inventing an "LC planner"
 * and an "LC admin" and every other combination, and a planner who joins the
 * LC would have had to be given a different job to join it.
 *
 * Two rules, both set by Dr Raghu:
 *
 *   1. EVERY STRATCOM MEMBER IS AN LC MEMBER. Enforced in the database as a
 *      trigger (migration 0034) as well as here, because a rule that lives
 *      only in a React form lapses the first time something writes around it.
 *
 *   2. ONLY THE OWNER MAY TICK THEM. Enforced in /api/admin/users, and again
 *      in the database for anything writing with a browser's own credentials.
 *
 * The owner is in all three implicitly and is not stored as a member of any of
 * them: the account cannot be edited through the admin page at all (it is
 * guarded against demotion), so a stored tick could never be un-ticked, and an
 * owner who could lock himself out of Delivered Jobs is a bug waiting to
 * happen.
 */

export interface GroupFlags {
  lc?: boolean | null;
  stratcom?: boolean | null;
  management?: boolean | null;
  /** True for raghu@nandan.co.in. Implies all three. */
  isOwner?: boolean | null;
  isRaghu?: boolean | null;
}

const owner = (p: GroupFlags | null | undefined) => !!(p?.isOwner || p?.isRaghu);

/** Leadership Circle. Gates the Delivered Jobs workspace. */
export const isLC = (p: GroupFlags | null | undefined): boolean =>
  owner(p) || !!p?.lc || !!p?.stratcom;   // stratcom implies lc, whatever is stored

/** Strategy Committee. Gates the forward-looking cards on the delivery board. */
export const isStratcom = (p: GroupFlags | null | undefined): boolean =>
  owner(p) || !!p?.stratcom;

/** Management. Independent of the other two. */
export const isManagement = (p: GroupFlags | null | undefined): boolean =>
  owner(p) || !!p?.management;

/**
 * Apply rule 1 to a pair of tick boxes on their way to the database.
 *
 * Ticking Stratcom ticks LC. Un-ticking LC un-ticks Stratcom — the alternative
 * is a row that says "not in the LC, but on the committee that sits inside
 * it", which is not a state anybody meant to create.
 */
export function normaliseGroups(next: { lc: boolean; stratcom: boolean; management: boolean }) {
  const stratcom = !!next.stratcom;
  const lc = stratcom || !!next.lc;
  return { lc, stratcom: lc ? stratcom : false, management: !!next.management };
}

/** The three, in the order they are shown, for rendering a row of tick boxes. */
export const GROUPS = [
  { key: "lc" as const, label: "LC", title: "Leadership Circle — can open Delivered Jobs" },
  { key: "stratcom" as const, label: "Stratcom", title: "Strategy Committee — also sees the forward-looking cards on the Job Delivery Board. Every Stratcom member is an LC member." },
  { key: "management" as const, label: "Management", title: "Management" },
];
