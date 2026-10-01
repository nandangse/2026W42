/**
 * KINDLE'S OWN VERSION (Dr Raghu, 1 Oct 2026: "this doesn't change the
 * version number. this has no connection to genie").
 *
 * Kindle lives in this codebase and this database for convenience only. It
 * is the trust group's site, not a Nandan module: it takes no Genie door, no
 * entry in Genie's release log, and no digit of Genie's version. Its own log
 * is here, newest first; the top entry is the version the footer shows.
 */
export const KINDLE_UPDATES: { v: string; date: string; items: string[] }[] = [
  {
    v: "1.3.1", date: "2026-10-01",
    items: [
      "Every goal carries its Number — the measure it is judged by — beside the title, and three action points under it; both on the Goals page and on the check-in form (migration 0191).",
    ],
  },
  {
    v: "1.3.0", date: "2026-10-01",
    items: [
      "Genie summarises a member's goals: the set, every month's word on each goal, and a short reading of where he stands — on request, kept with the set (migration 0190).",
      "Finances: the ledger month by month, fines due and paid (the treasurer marks paid and the collection books itself), waivers, the year's budget by head against spend. Placeholders until Niraj enters the opening balance.",
      "Exercises: a member writes the questions, the others answer in writing; answers per person, private if wanted; the author and facilitator read all.",
      "The daily job at 7 am IST: birthday mails for members and their legal spouses and children, check-in reminders four and three days before the meeting, 1-2-1 reminders on the 10th and 25th. Each send goes once.",
      "Every section of the action plan is now open; nothing says \"soon\" any more.",
    ],
  },
  {
    v: "1.2.0", date: "2026-10-01",
    items: [
      "Goals: each member's three professional and three personal goals for the year with the reflection answers, the status on each, and every month's word from the check-ins under it; set or edit your own.",
      "1-2-1s: the 2026 pairing plan from the sheet (45 pairs, February to October), who is owed this month, mark done with a note from each side, the year's tally per member.",
      "Burning issues: the sounding board with its five questions, the nine themes as filters, and the facilitator filing each under a theme, a meeting and an outcome; 140 entries since 2023 imported.",
      "Message board: topics, threaded replies, pins and closing by the facilitator.",
      "Gallery: albums per meeting or off-site, photos from the phone into the private bucket, a lightbox.",
      "Change attendance on the Directory matrix for the facilitator and scribe, with one Submit; the matrix headers read as months.",
      "Send welcome mails from raghu@nandan.co.in in Settings, to everyone who has not signed in or to one member; nothing goes out until pressed.",
      "Raghu and Jigar are both facilitators.",
      "TG Meetings is the section's name, and today's meeting sits on top of Home.",
      "Feedback on every meeting: a 1-10 rating, what went well, what to improve, a takeaway and a topic for next time; the facilitator sees who has not written.",
      "Polls: any member asks, one vote each, changeable until the poll closes, results as bars with names unless the poll is anonymous.",
      "I Accept on the constitution, recorded per member and version; the facilitator sees who has and who has not.",
      "Check-ins: this month one at a time with Previous and Next, a timer with its own ringer, every member's history scrolling sideways, and the check-in form itself with your goals as its sections.",
      "The check-in history imported: 225 check-ins from both Google Forms since January 2023, with goal updates, learnings and sounding-board entries attached (migration 0188 + the import).",
    ],
  },
  {
    v: "1.0.0", date: "2026-10-01",
    items: [
      "The site, under genie.nandan.co.in/kindle, with its own login for the ten members and a one-time invite link that forces a password on first use.",
      "Constitution 5.2 as a page, with the fines table and the year's roles.",
      "Directory of the ten, with attendance since January 2023 brought over from the sheet, lateness and fines computed from the constitution's slabs.",
      "Meetings since 2023 with attendance marking for the facilitator and scribe; agenda and minutes typed in the site from now on.",
      "First-login profile form: photo, company, phones, birthday, spouse and children with the legal tick.",
      "The facilitator's gear: members, roles, invite links, the WhatsApp link and the other small settings.",
      "Tables for every later phase — check-ins, goals, 1-2-1s, burning issues, polls, board, finances, exercises, gallery, mail log.",
    ],
  },
];
export const KINDLE_VERSION = KINDLE_UPDATES[0].v;
