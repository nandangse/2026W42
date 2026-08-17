/**
 * Genie version + release log.
 *
 * VERSIONING RULE (set by Dr Raghu, 17 Aug 2026) — MAJOR.MINOR.BATCH.PATCH
 *
 *   2 . 6 . 1 . 1
 *   │   │   │   └── PATCH — bump for every change inside ONE module
 *   │   │   └────── BATCH — bump when several modules change together,
 *   │   │                   or on the first release of a new day
 *   │   └────────── MINOR — bump for major changes, or at the start of a
 *   │                       new week (2.6 → 2.7)
 *   └────────────── MAJOR — a new generation of the app
 *
 * When BATCH bumps, PATCH resets to 0. When MINOR bumps, both reset.
 *
 * ADD A NEW ENTRY AT THE TOP of UPDATES for every shipped change — the header
 * badge and Admin → Updates both read this list, so the log and the version
 * number can never drift apart.
 */

export interface UpdateEntry {
  /** Full version this release carries, e.g. "2.6.1.1". */
  v: string;
  /** ISO date the change shipped. */
  date: string;
  /** Which part of Genie changed — one module per entry keeps PATCH honest. */
  module: string;
  /** What actually changed, in the words of someone who has to use it. */
  items: string[];
}

/** Newest first. The top entry's version IS the app's version. */
export const UPDATES: UpdateEntry[] = [
  {
    v: "2.6.1.1",
    date: "2026-08-17",
    module: "Header · Account menu",
    items: [
      "The header now shows your initials only, in a round badge — name, email and role moved into the menu behind it.",
      "New account dropdown: Profile, Change Password, Logout.",
      "Profile shows your name, email, role, initials and ERP owner name, and says who can change them (an admin, in Admin → User management).",
      "Change Password is self-service: it asks for your current password first, so a session left open can't be used to lock you out.",
      "Version numbering now follows MAJOR.MINOR.BATCH.PATCH, and every release is logged in Admin → Updates.",
    ],
  },
];

/** The version shown in the header badge. */
export const APP_VERSION = UPDATES[0].v;
