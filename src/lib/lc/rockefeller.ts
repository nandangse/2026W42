/**
 * THE ROCKEFELLER HABITS CHECKLIST — as Nandan GSE printed it (Q2 2020-21),
 * ten habits, four ticks each. Forty ticks make the score; a habit's score
 * is its four.
 */
export interface Habit { n: number; title: string; items: string[] }

export const ROCKEFELLER: Habit[] = [
  { n: 1, title: "The executive team is healthy and aligned.", items: [
    "Team members understand each other's differences, priorities, and styles.",
    "The team meets frequently (weekly is best) for strategic thinking.",
    "The team participates in ongoing executive education (monthly recommended).",
    "The team is able to engage in constructive debates and all members feel comfortable participating.",
  ] },
  { n: 2, title: "Everyone is aligned with the #1 thing that needs to be accomplished this quarter to move the company forward.", items: [
    "The Critical Number is identified to move the company ahead this quarter.",
    "3-5 Priorities (Rocks) that support the Critical Number are identified and ranked for the quarter.",
    "A Quarterly Theme and Celebration/Reward are announced to all employees that bring the Critical Number to life.",
    "Quarterly Theme/Critical Number posted throughout the company and employees are aware of the progress each week.",
  ] },
  { n: 3, title: "Communication rhythm is established and information moves through the organization accurately and quickly.", items: [
    "All employees are in a daily huddle that lasts less than 15 minutes.",
    "All teams have a weekly meeting.",
    "The executive and middle managers meet for a day of learning, resolving big issues, and DNA transfer each month.",
    "Quarterly and annually, the executive and middle managers meet offsite to work on the 4 Decisions.",
  ] },
  { n: 4, title: "Every facet of the organization has a person assigned with accountability for ensuring goals are met.", items: [
    "The Function Accountability Chart (FACe) is completed (right people, doing the right things, right).",
    "Financial statements have a person assigned to each line item.",
    "Each of the 4-9 processes on the Process Accountability Chart (PACe) has someone that is accountable for them.",
    "Each 3-5 year Key Thrust/Capability has a corresponding expert on the Advisory Board if internal expertise doesn't exist.",
  ] },
  { n: 5, title: "Ongoing employee input is collected to identify obstacles and opportunities.", items: [
    "All executives (and middle managers) have a Start/Stop/Keep conversation with at least one employee weekly.",
    "The insights from employee conversations are shared at the weekly executive team meeting.",
    "Employee input about obstacles and opportunities is being collected weekly.",
    "A mid-management team is responsible for the process of closing the loop on all obstacles and opportunities.",
  ] },
  { n: 6, title: "Reporting and analysis of customer feedback data is as frequent and accurate as financial data.", items: [
    "All executives (and middle managers) have a 4Q conversation with at least one end user weekly.",
    "The insights from customer conversations are shared at the weekly executive team meeting.",
    "All employees are involved in collecting customer data.",
    "A mid-management team is responsible for the process of closing the loop on all customer feedback.",
  ] },
  { n: 7, title: "Core Values and Purpose are \"alive\" in the organization.", items: [
    "Core Values are discovered, Purpose is articulated, and both are known by all employees.",
    "All executives and middle managers refer back to the Core Values and Purpose when giving praise or reprimands.",
    "HR processes and activities align with the Core Values and Purpose (hiring, orientation, appraisal, recognition, etc.).",
    "Actions are identified and implemented each quarter to strengthen the Core Values and Purpose in the organization.",
  ] },
  { n: 8, title: "Employees can articulate the following key components of the company's strategy accurately.", items: [
    "Big Hairy Audacious Goal (BHAG) – progress is tracked and visible.",
    "Core Customer(s) – their profile in 25 words or less.",
    "3 Brand Promises – and the corresponding Brand Promise KPIs reported on weekly.",
    "Elevator Pitch – a compelling response to the question \"What does your company do?\"",
  ] },
  { n: 9, title: "All employees can answer quantitatively whether they had a good day or week (Column 7 of the One-Page Strategic Plan).", items: [
    "1 or 2 Key Performance Indicators (KPIs) are reported on weekly for each role/person.",
    "Each employee has 1 Critical Number that aligns with the company's Critical Number for the quarter (clear line of sight).",
    "Each individual/team has 3-5 Quarterly Priorities/Rocks that align with those of the company.",
    "All executives and middle managers have a coach (or peer coach) holding them accountable to behavior changes.",
  ] },
  { n: 10, title: "The company's plans and performance are visible to everyone.", items: [
    "A \"situation room\" is established for weekly meetings (physical or virtual).",
    "Core Values, Purpose and Priorities are posted throughout the company.",
    "Scoreboards are up everywhere displaying current progress on KPIs and Critical Numbers.",
    "There is a system in place for tracking and managing the cascading Priorities and KPIs.",
  ] },
];

export const TICKS = ROCKEFELLER.reduce((n, h) => n + h.items.length, 0); // 40

/** Fewer answers than this and a round shows no result — one answer is not anonymous. */
export const MIN_ANSWERS = 3;
