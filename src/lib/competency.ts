/**
 * What a competency level MEANS, out of 5.
 *
 * One ladder for every competency, so that a 4 in Welding and a 4 in
 * Negotiation are the same claim about somebody. Without a shared ladder,
 * "level 4" means whatever the person filling the form felt like that day,
 * and the numbers cannot be compared across two roles — which is the only
 * reason to have numbers at all.
 *
 * A role states the level IT needs. The person is rated separately, and the
 * gap between the two is what an IDP is for.
 */
export const LEVELS: Record<number, string> = {
  1: "Aware — knows what it is, needs somebody with them.",
  2: "Assisted — can do the simple part alone.",
  3: "Independent — does the normal work of the role alone and correctly.",
  4: "Advanced — handles the difficult cases, and can teach it.",
  5: "Expert — the person the company relies on for this.",
};

export const LEVEL_SHORT: Record<number, string> = {
  1: "Aware", 2: "Assisted", 3: "Independent", 4: "Advanced", 5: "Expert",
};
