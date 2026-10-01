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
