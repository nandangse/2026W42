/**
 * IDP Discussion - Individual — the question set.
 *
 * TAKEN FROM NANDAN'S OWN IDP SHEET, not invented. The IDP tab of the 2026
 * Appraisal workbook already asks these of every person: what they are
 * accountable for, what they are working on, what support they need, which
 * KPIs matter to them, their quarterly goals and their learning goals. The
 * eleven rated dimensions below are that sheet's own list, in its own order.
 *
 * They are gathered here rather than written into the page so that changing
 * a question is changing one line, and so the same list can be read back by
 * HRIS when the answers are looked at.
 */

export interface IdpQuestion {
  id: string;
  label: string;
  /** The prompt under the label — what a good answer looks like. */
  hint?: string;
  rows: number;
  /** An answer this short is almost certainly not an answer. */
  min?: number;
}

export interface IdpSection {
  key: string;
  title: string;
  blurb?: string;
  questions: IdpQuestion[];
}

export const IDP_SECTIONS: IdpSection[] = [
  {
    key: "accountability",
    title: "What I am accountable for",
    blurb: "Your role says what the company expects. This is what YOU say you are answerable for — in your own words.",
    questions: [
      { id: "accountability", label: "My accountability", rows: 5, min: 40,
        hint: "The things that go wrong if you do not do them. Outcomes, not activities." },
      { id: "kpis", label: "The KPIs that matter most to me", rows: 4, min: 20,
        hint: "Two or three numbers you would be judged by, and what they read today." },
    ],
  },
  {
    key: "work",
    title: "What I am working on",
    questions: [
      { id: "tasks", label: "My tasks this month", rows: 5, min: 30,
        hint: "What is actually on your plate now." },
      { id: "quarterly", label: "My goals for this quarter", rows: 4, min: 30,
        hint: "What will be finished by the end of the quarter that is not finished today." },
    ],
  },
  {
    key: "support",
    title: "What I need",
    blurb: "Answer this properly. It is the part management can act on.",
    questions: [
      { id: "support", label: "The support I need", rows: 4, min: 30,
        hint: "Training, tools, clarity, authority, a decision somebody is sitting on. Not sympathy." },
      { id: "blockers", label: "What is in my way", rows: 4,
        hint: "The thing that slows you down every week and that you cannot fix alone." },
    ],
  },
  {
    key: "learning",
    title: "How I want to grow",
    questions: [
      { id: "learning", label: "My learning goals", rows: 4, min: 30,
        hint: "What you must be able to do a year from now that you cannot do today." },
      { id: "next_role", label: "Where I want to be in two to three years", rows: 3,
        hint: "A role, a responsibility, or a kind of work." },
      { id: "strength", label: "What I do better than most", rows: 3 },
    ],
  },
  {
    key: "reflection",
    title: "Looking back honestly",
    blurb: "The part that is worth the hour. Nobody is helped by a comfortable answer.",
    questions: [
      { id: "delivered", label: "What I delivered well this year", rows: 4, min: 40,
        hint: "Name the job, the date, the number, wherever you can." },
      { id: "missed", label: "What I under-delivered on, and why", rows: 4, min: 40,
        hint: "Reasons and learnings. Not justifications." },
      { id: "independent", label: "A problem I solved without escalating it", rows: 4,
        hint: "What was wrong, what you did, what happened." },
      { id: "onething", label: "If I ran my area as a business, the one thing I would fix", rows: 4 },
    ],
  },
];

/** The eleven dimensions the IDP sheet rates, in its own order. */
export const IDP_RATINGS = [
  "Job Knowledge",
  "Job Skills",
  "Quality of work",
  "Dependability",
  "Time Management",
  "Initiative and Creativity",
  "Communication Skills",
  "Listening Skills",
  "Teamwork",
  "Discipline and Attendance",
  "Ownership",
] as const;

export const RATING_SCALE = [
  { v: 1, label: "1 — well below what the role needs" },
  { v: 2, label: "2 — below what the role needs" },
  { v: 3, label: "3 — meets what the role needs" },
  { v: 4, label: "4 — above what the role needs" },
  { v: 5, label: "5 — far above what the role needs" },
];

export const ALL_QUESTIONS = IDP_SECTIONS.flatMap((s) => s.questions);

/** The exact words consented to. Stored with the tick — see migration 0053. */
export const CONSENT_TEXT =
  "I consent to make these as part of my records which are accessible only by Management, HR and my HoD";

/** Every question answered to its minimum, and every dimension rated. */
export function isComplete(answers: Record<string, string>, ratings: Record<string, number>) {
  const missing = ALL_QUESTIONS.filter((q) => {
    const v = String(answers[q.id] || "").trim();
    return !v || (q.min ? v.length < q.min : false);
  });
  const unrated = IDP_RATINGS.filter((d) => !ratings[d]);
  return { ok: missing.length === 0 && unrated.length === 0, missing, unrated };
}
