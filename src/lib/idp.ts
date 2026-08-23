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
  /** One line under the label. */
  hint?: string;
  /**
   * The longer explanation, in the simplest English we can manage.
   *
   * Dr Raghu's instruction (23 Aug 2026): a person who finished class 10
   * must be able to read this and know what to write. Most of the people
   * filling this in did not do their schooling in English, and a question
   * nobody understands produces an answer nobody can use.
   */
  help?: string;
  rows: number;
  /** An answer this short is almost certainly not an answer. */
  min?: number;
}

export interface IdpSection {
  key: string;
  title: string;
  blurb?: string;
  /** Shown only to members of the Leaders Council. */
  leadersOnly?: boolean;
  questions: IdpQuestion[];
}

export const IDP_SECTIONS: IdpSection[] = [
  {
    key: "accountability",
    title: "What I am accountable for",
    blurb: "Your role says what the company expects. This is what YOU say you are answerable for — in your own words.",
    questions: [
      {
        id: "accountability", label: "My accountability", rows: 5, min: 40,
        hint: "The things that go wrong if you do not do them. Outcomes, not activities.",
        help:
          "Write the work that is YOURS. Not the work of your department — the part that stops if you are not there. " +
          "Think like this: if you were away for one month, what would go wrong? Write those things. " +
          "Write the RESULT, not the activity. “Material reaches the shop on time” is a result. “I make phone calls” is an activity.",
      },
      {
        id: "kpis", label: "The KPIs that matter most to me", rows: 5, min: 30,
        hint: "KPI means Key Performance Indicator. It is a NUMBER. Give 3 or 4 of them.",
        help:
          "A KPI is a number that tells you whether your work is going well or badly. It must be a number you can " +
          "count, not a feeling.\n\n" +
          "Write 3 or 4 numbers you would be happy to be judged by, and write what that number is TODAY.\n\n" +
          "For example:\n" +
          "- Jobs delivered on time — 8 out of 10 this month\n" +
          "- Material shortage days — 4 days last month\n" +
          "- Invoices entered within 3 days — 90%\n" +
          "- Rework after inspection — 5 jobs last month\n\n" +
          "If you do not know the number today, write what you think it is and say it is an estimate.",
      },
    ],
  },
  {
    key: "work",
    title: "What I am working on",
    questions: [
      {
        id: "tasks", label: "My tasks for up to next month", rows: 6, min: 30,
        hint: "Mention what all are you doing now that will complete this month and next.",
        help:
          "List the jobs and tasks that are in your hands right NOW and that will be finished by the end of THIS " +
          "month or NEXT month.\n\n" +
          "Write one line for each. Put the name of the job or the customer, and when you expect to finish it. " +
          "Do not write things you finished already, and do not write things that will take six months.",
      },
      {
        id: "quarterly", label: "My goals for this quarter", rows: 5, min: 30,
        hint: "What will be finished by the end of the quarter that is not finished today.",
        help:
          "A quarter is three months. Write 2 or 3 things that are NOT done today and WILL be done by the end of " +
          "these three months. Each one should have an end — something you can point at and say “this is finished”.",
      },
    ],
  },
  {
    key: "support",
    title: "What I need",
    blurb: "Answer this properly. It is the part management can act on.",
    questions: [
      {
        id: "support", label: "The support I need", rows: 5, min: 30,
        hint: "Training, tools, clarity, authority, a decision somebody is sitting on. Not sympathy.",
        help:
          "What do you need from the company so that you can do your work better? Be exact.\n\n" +
          "It can be: training on something, a tool or machine, a person to help you, clear information, or " +
          "permission to decide something yourself instead of asking every time.\n\n" +
          "Write WHY you need it and what will improve if you get it.",
      },
      {
        id: "blockers", label: "What is in my way", rows: 5,
        hint: "The thing that slows you down every week and that you cannot fix alone.",
        help:
          "Every week something wastes your time. What is it? Write the thing that happens again and again, that " +
          "you cannot solve by yourself. Say how much time it costs you.",
      },
    ],
  },
  {
    key: "learning",
    title: "How I want to grow",
    questions: [
      {
        id: "learning", label: "My learning goals", rows: 5, min: 30,
        hint: "What you must be able to do a year from now that you cannot do today.",
        help:
          "Think about one year from now. What work should you be able to do then that you cannot do today?\n\n" +
          "It can be a skill on a machine, a software, a language, drawings, costing, handling a customer, or " +
          "leading a team. Write 2 or 3, and write how you plan to learn them.",
      },
      {
        id: "next_role", label: "Where I want to be in two to three years", rows: 4,
        hint: "A role, a responsibility, or a kind of work.",
        help:
          "What job would you like to be doing in two or three years? Say it plainly. It is not a promise from the " +
          "company and it is not a promise from you — it tells your manager what to prepare you for.",
      },
      {
        id: "strength", label: "What I do better than most", rows: 4,
        help: "One or two things you are genuinely good at. Not modesty, not boasting — just what is true.",
      },
    ],
  },
  {
    key: "reflection",
    title: "Looking back honestly",
    blurb: "The part that is worth the hour. Nobody is helped by a comfortable answer.",
    questions: [
      {
        id: "delivered", label: "What I delivered well this year", rows: 5, min: 40,
        hint: "Name the job, the date, the number, wherever you can.",
        help:
          "Write 2 or 3 things you did this year that went well. For each one write WHAT it was, WHEN, and what " +
          "difference it made. Use names of jobs and customers and numbers wherever you can — “I did good work” " +
          "tells nobody anything.",
      },
      {
        id: "missed", label: "What I under-delivered on, and why", rows: 5, min: 40,
        hint: "Reasons and learnings. Not justifications.",
        help:
          "Where did you fall short this year? Everybody has something.\n\n" +
          "Write what did not happen, and WHY. Do not blame — explain. Then write what you would do differently " +
          "next time. An honest answer here is respected, not punished.",
      },
      {
        id: "independent", label: "A problem I solved without escalating it", rows: 5,
        hint: "What was wrong, what you did, what happened.",
        help:
          "Tell about one problem you handled YOURSELF, without going to your boss for the answer.\n\n" +
          "Write three things: what the problem was, what you decided to do, and what happened in the end.",
      },
      {
        id: "onething", label: "If I ran my area as a business, the one thing I would fix", rows: 5,
        help:
          "Imagine your section is your own company and the money is yours. What is the FIRST thing you would " +
          "change? Write what is wrong now, and what you would do about it.",
      },
    ],
  },
  {
    key: "leaders",
    title: "For leaders only",
    blurb:
      "You are on the Leaders Council, so these four are asked of you as well. They are about the company, not about your section.",
    leadersOnly: true,
    questions: [
      {
        id: "ldr_demonstrated", label: "What leadership did I demonstrate in the last year or two", rows: 5, min: 40,
        help:
          "Leadership is not your designation. It is where you took charge of something that was not asked of you, " +
          "carried people with you, or stood behind a decision when it was uncomfortable. Give real examples with " +
          "names and dates.",
      },
      {
        id: "ldr_decision", label: "What was the most difficult decision you took this year", rows: 5, min: 40,
        help:
          "Write the decision where the answer was not obvious and somebody was going to be unhappy either way. " +
          "What were the choices? What did you decide? What happened afterwards?",
      },
      {
        id: "ldr_impact", label: "What was the biggest impact on the company because of you", rows: 5, min: 40,
        help:
          "What is different in this company because you were here this year? Money saved, a customer kept, a " +
          "process that now runs without you, people who grew. Put a number on it if you can.",
      },
      {
        id: "ldr_mistake", label: "The biggest mistake I made that hurt the company — how it was solved, and what I learnt", rows: 6, min: 60,
        help:
          "This is the most important question on this page, and the hardest.\n\n" +
          "Write the mistake that cost the company something — money, a customer, time, or trust. Then write three " +
          "things: how it was put right, what it cost, and what you now do differently because of it.\n\n" +
          "A leader who cannot name a mistake has either not been given enough to do, or is not being straight. " +
          "This answer is read as a sign of strength.",
      },
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

/**
 * ONE TO TEN, on a slider (Dr Raghu, 23 Aug 2026).
 *
 * Ten points rather than five because people rate themselves in tens without
 * being taught to, and because the meaning of each band is written down: a 7
 * is not "good", it is "does more than the role needs". Every number carries
 * its meaning under the slider as it moves, so nobody is guessing what a 6 is.
 */
export const RATING_MAX = 10;

export const RATING_MEANING: Record<number, string> = {
  1: "1 — I am only starting. I need help with most of this.",
  2: "2 — I know a little. I need help often.",
  3: "3 — I can do the easy part alone. The hard part needs help.",
  4: "4 — I do most of it alone, but not always right.",
  5: "5 — I do what my role needs. Nothing more, nothing less.",
  6: "6 — I do what my role needs, and I make few mistakes.",
  7: "7 — I do more than my role needs. Others ask me.",
  8: "8 — I am strong here. I can teach it to somebody else.",
  9: "9 — I am one of the best here at this.",
  10: "10 — Nobody in the company does this better.",
};

export const RATING_BANDS = [
  { from: 1, to: 2, label: "Only starting" },
  { from: 3, to: 4, label: "Learning" },
  { from: 5, to: 6, label: "Does what the role needs" },
  { from: 7, to: 8, label: "Does more than the role needs" },
  { from: 9, to: 10, label: "The best here" },
];

export const ALL_QUESTIONS = IDP_SECTIONS.flatMap((s) => s.questions);

/** What THIS person has to answer — the leaders' four only if they are one. */
export const questionsFor = (isLeader: boolean) =>
  IDP_SECTIONS.filter((s) => !s.leadersOnly || isLeader).flatMap((s) => s.questions);

/** The exact words consented to. Stored with the tick — see migration 0053. */
export const CONSENT_TEXT =
  "I consent to make these as part of my records which are accessible only by Management, HR and my HoD";

/** Every question answered to its minimum, and every dimension rated. */
export function isComplete(
  answers: Record<string, string>,
  ratings: Record<string, number>,
  isLeader = false,
) {
  const missing = questionsFor(isLeader).filter((q) => {
    const v = String(answers[q.id] || "").trim();
    return !v || (q.min ? v.length < q.min : false);
  });
  const unrated = IDP_RATINGS.filter((d) => !ratings[d]);
  return { ok: missing.length === 0 && unrated.length === 0, missing, unrated };
}
