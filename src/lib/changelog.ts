/**
 * Genie version + release log.
 *
 * VERSIONING RULE (set by Dr Raghu, restated 17 Aug 2026) — MAJOR.MINOR.BATCH.PATCH
 *
 *   2 . 6 . 1 . 1
 *   │   │   │   └── LAST      — TODAY. Bump for every change shipped today.
 *   │   │   └────── 2nd LAST  — NEXT DAY. Bump on the first release of a
 *   │   │                       new day.
 *   │   └────────── 3rd LAST  — NEW WEEK, or A NEW MODULE IS ADDED.
 *   │                           A whole new workspace/section counts.
 *   └────────────── MAIN      — ONLY when Dr Raghu says so. Never inferred.
 *
 * When a digit bumps, everything to its right resets to 0.
 *
 * The trap: "a new module" is a MINOR bump, not a patch. Goals rebuilt →
 * 2.7.0.0; the Delivered Jobs workspace is a second new module → 2.8.0.0,
 * not 2.7.0.1. Changes *inside* an existing module the same day take the
 * last digit.
 *
 * ADD A NEW ENTRY AT THE TOP of UPDATES for every shipped change — the header
 * badge and Admin → Updates both read this list, so the log and the version
 * number can never drift apart.
 */

/**
 * How much time has gone into Genie.
 *
 * MEASURED, not estimated — from the commit history, by
 * `node scratchpad/effort.mjs`, which prints this block ready to paste back.
 *
 * `windowHours` is the sum, over every day worked, of the span between that
 * day's first and last commit. It is a WINDOW rather than a total, and it is
 * wrong in both directions: it over-counts, because a day with a commit at
 * nine and another at six counts nine hours whether or not the middle went on
 * Genie; and it under-counts, because the thinking, the specifying and the
 * reviewing happen before the first commit and after the last.
 *
 * Dr Raghu's own share is a RANGE for the same reason. He specifies and
 * reviews, so he is not at the keyboard for every minute of the window -- but
 * the window also UNDER-counts him, because the thinking, the deciding and the
 * reading of what came back all happen outside the span between a day's first
 * and last commit. The band was raised by a quarter on his own instruction,
 * which is the only evidence available for the part no clock sees.
 */
export const EFFORT = {
  measuredTo: "2026-08-20",
  commits: 127,
  days: 17,
  windowHours: 47.5,
  raghuLow: 24,
  raghuHigh: 36,
};

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
    v: "3.18.0.0",
    date: "2026-08-21",
    module: "Nandan CRM — genie.nandan.co.in/crm",
    items: [
      "NEW — NANDAN CRM, at /crm. A SEPARATE APPLICATION WITH ITS OWN DATABASE, sharing this deployment and this login and nothing else. It cannot read a Genie table and Genie cannot read one of its. Sales Genie is untouched — its sp_ tables, its routes and its grant are exactly as they were.",
      "One login. The session is Genie's, readable at /crm because it is the same origin, so nobody signs in twice and there is no second user list to fall out of step. Open to Dr Raghu alone today; the check is in one function, which is what makes widening it to the sales team a one-line change rather than a hunt.",
      "EVERY DOCTYPE CAN ADD RECORDS, and that holds by construction rather than by discipline. A doctype is declared once in a registry — its fields, their types, what links to what, what shows in the list — and the list screen, the Add form, the dropdowns and the server-side validation all read that one declaration. There is no per-doctype screen that could be built without an Add button, because there are no per-doctype screens.",
      "Eight to start: Deals · Customers, Contacts, Addresses, Phone numbers · Sectors, Industries, Stages, Users.",
      "The database does the work that should not be left to code. Deal numbers come from a sequence, because counting existing rows hands two people the same number the moment they both save at once. And every stage change writes its own history row from a trigger — so how long a deal sat in each stage is MEASURED, and nobody can forget to log it.",
      "Fourteen stages and seven sectors are seeded as ROWS, not as fixed lists. Reordering the funnel is a change to a number on screen. ENT and SER are still seeded as their own codes because nobody has said what they stand for, and a master seeded with a wrong expansion is the error nobody notices for a year.",
      "Its database is locked to the server. Row Level Security is on for every table with no policies at all, so the anon key sees nothing whatsoever; the only way in is the service key, used strictly after the session has been checked. The gate is in code that can be read rather than in a policy that would have to trust a signature from another project.",
      "Needs CRM_SUPABASE_URL and CRM_SUPABASE_SERVICE_KEY, and migration 0001 in supabase-crm. Without them /crm loads and says exactly which step is missing.",
    ],
  },
  {
    v: "3.17.0.0",
    date: "2026-08-21",
    module: "Admin — Software description",
    items: [
      "NEW TAB — SOFTWARE DESCRIPTION, in Admin. What Genie is, written down: the Spaces and who is admitted to each, the architecture and the path of a single request, the technology, where the thing physically runs, every table grouped by what it is for, the access model, the one door data comes in by, where a language model is used, what keeps it quick, and how a change reaches production.",
      "It is written for two readers who are not the same person — whoever picks Genie up next, and an auditor. The second one does not care how it works and cares enormously about who can reach what and where the data sits, so those two sections come before the architecture, not after it.",
      "THE MODULE REGISTER IS THE REPEATABLE PART. Twenty modules, each described in the SAME eight fields — space, purpose, who, server gate, screens, data, API, language model. A new module is a new entry rather than a new format, which is the only way a document like this survives its second year. The CRM will slot in beside the rest.",
      "AN ANNEX A MAP FOR ISO 27001, twenty controls, each saying what Genie actually does and where to go and look. It is not a certification claim and it does not read like one: eight of them are marked PARTIAL or GAP and are collected into their own list at the end. A description that only lists strengths is worth nothing to the person reading it.",
      "The first gap is worth reading now. The application is served from the Mumbai edge but EXECUTES in Vercel's US-East region — the default nobody chose — while every user and data subject is in India. That is a setting, not a defect, and it is on the page so the decision gets taken deliberately.",
      "The version, the release count and the time invested are read live from this log, so they cannot drift. Everything else is prose, and carries the date it was last revised.",
      "Printable — it saves as a PDF from the page, which is the form an auditor will ask for.",
      "No migration.",
    ],
  },
  {
    v: "3.16.0.1",
    date: "2026-08-21",
    module: "On Floor",
    items: [
      "SHOP UPDATES TODAY, as a card at the top of On Floor: how many were recorded today, and on how many of the jobs on the floor. The count that matters is not how many recordings exist — it is whether anybody spoke this morning. Two updates across nineteen jobs on the floor is itself the finding, and it is only visible if today is counted on its own.",
      "Each job's Shop Updates opens with the same thing: how many today, then the total and when the last one was. \"Nine on record\" says nothing about whether anybody has looked at the job this morning.",
      "Today means the local date, not the last 24 hours — to somebody on the shop floor today means since they came in, not since this time yesterday.",
    ],
  },
  {
    v: "3.16.0.0",
    date: "2026-08-21",
    module: "On Floor",
    items: [
      "FIVE OWNERS on a job: Planning (from the ERP), and Quality, Production, Kitting and Design set here. \"Who do I ring about this\" has a different answer depending on what has gone wrong, and until now the only way to find out was to ask.",
      "Each is its own field rather than four names in one box — two names in a box cannot be filtered, counted, notified or reassigned, and four is a note to self.",
      "The read on a job is all you see by default. The recordings and anything Genie heard to do are folded underneath, one click away. On a page listing every job on the floor, three players and two suggestions per row was a wall nobody scrolled past.",
      "A saved photo says ✓ SAVED, on the panel and on the photo itself. A picture appearing in a grid of pictures is not obviously YOUR picture having saved, particularly on a phone where the grid is below the fold. It clears itself after a few seconds — a confirmation that stays becomes furniture.",
      "Needs migration 0046.",
    ],
  },
  {
    v: "3.15.0.2",
    date: "2026-08-20",
    module: "On Floor",
    items: [
      "THE READ ON THIS JOB, replacing the summary that only paraphrased the notes. It now gets the JOB as well as the recordings — target date and how far past it, kitted against built, value, throughput, the escalation on record, the money needed, and every open task — so it reads the way somebody running the works would read it, not like a transcript with the verbs changed.",
      "Speakers are named. Each note goes in tagged with the initials, so the read can say \"MT says the fasteners are stuck on payment; PS has not confirmed the drawings\". Three unattributed accounts read as one confused voice; with initials on them, a disagreement between the shop and purchasing is visible AS a disagreement.",
      "It is told to say where the notes and the board disagree. A job 90% kitted and 10% built with nobody reporting a blocker is itself the finding, and the old version could never have said so because it had never been shown the board.",
      "Still told to invent nothing, and that a job with no target date is undated rather than overdue.",
      "The \"Data: n active jobs · kitting x%\" line is gone from the header. Both figures live on the boards that use them, in context and beside what they mean; repeating them at the top of every screen cost a line to say something nobody read there.",
      "The migration audit was checking 34 of 45 migrations and still reporting \"everything present\". It now probes the Sales Genie tables and calls the permission functions directly — the ones that create only a function had nothing a column probe could ever see.",
    ],
  },
  {
    v: "3.15.0.1",
    date: "2026-08-20",
    module: "Job photos",
    items: [
      "A photo now waits for SAVE. Choose one, see it, check the date, completion and caption, then press Save. It used to upload the instant you picked a file — so you could not see what you had chosen, and the fields you had typed were applied to whatever you picked next.",
      "PHOTOS is a tab on the job, beside Milestone Plan, Material Kitting and Shop Updates. Same gallery the On Floor row opens — one component behind both, so the two cannot disagree about what has been taken.",
      "Time invested has been raised by a quarter: 24–36 hours. The build window is measured from the commits and cannot see the thinking, the deciding or the reading of what came back, all of which happen outside the span between a day's first and last commit.",
    ],
  },
  {
    v: "3.15.0.0",
    date: "2026-08-20",
    module: "Feature Requests · On Floor",
    items: [
      "NEW — FEATURE REQUEST, in the account menu. Anyone signed in can ask for something in Genie, with a large rich text box (bold, italics, lists), attachments including screenshots, and how badly it is wanted: Must have, Good to have, or Future potential.",
      "How badly is a FIELD, stated by the person asking, not read off how forcefully they asked. Everything sounds urgent in the sentence it is written in; almost nothing is, and the person asking knows which.",
      "Everyone can read the whole list. A backlog only its owner can see is a list nobody else stops duplicating. Anyone may raise one; only Dr Raghu sets a status — a backlog where everyone can mark their own request \"planned\" is not a backlog.",
      "THANK YOU, after a shop-floor update. Record a note and it says thank you by name, and what the update just moved: the target delivery date, and whether that is days away or — in red — days overdue.",
      "Recording a note is somebody stopping work to tell the rest of the company something. Saying so is the cheapest thing in this application and probably what decides whether a second note ever gets recorded. The days figure is the point: \"thank you\" alone is manners; \"thank you, and this job is eleven days overdue\" is manners with a reason to have bothered.",
      "It shows a photograph of Dr Raghu, picked at random so it is not the same face every time. Drop them into public/coach as 1.jpg … 12.jpg; a missing number simply hides itself, so no list has to be kept in step with the folder.",
      "Needs migration 0045 for the requests. The thank-you needs nothing.",
    ],
  },
  {
    v: "3.14.0.0",
    date: "2026-08-20",
    module: "On Floor",
    items: [
      "Genie now hears what needs doing. Record a note and anything in it that somebody has to ACT on comes back as a suggested task — one action each, with the category and any date that was actually said.",
      "NOTHING IS CREATED UNTIL YOU PRESS ADD. A task list is only worth opening if everything on it was put there on purpose; things appearing that nobody asked for is how people stop reading the list within a fortnight. Genie proposes, a person accepts.",
      "Accepting puts it on the job's PLANNING OWNER, who reassigns if it belongs elsewhere — the owner is the person who knows who should have it, and a task assigned to nobody is a task nobody picks up. They get the usual notification.",
      "Once added it is an ordinary task, indistinguishable from a typed one. A task that behaves differently because of where it came from is a task people have to think about before trusting.",
      "\"Not a task\" keeps the rejection rather than deleting it. The same suggestion turned down twice for the same reason is a prompt worth changing, and that is only visible if the rejections are kept.",
      "Genie is told to return NOTHING when a note is only a report — which most are. A model made to find a task will invent one, and invented tasks are what teach people to ignore the whole feature.",
      "Needs migration 0044.",
    ],
  },
  {
    v: "3.13.0.0",
    date: "2026-08-20",
    module: "Job Plan",
    items: [
      "A band across the top of Job Plan that follows you down the page, in five parts: the job number with its ERP link; the customer tag with customer and product; value, throughput, kitting and what is built; the money; and the last shop update. The detail card below it scrolls away as normal.",
      "KITTED AND WIP ARE NOW WORKED OUT, not read. Material is value × (1 − throughput %) — the bought-in part. Kitted value is that × kitting %. WIP is kitted value PLUS throughput × production %.",
      "That last one is the formula worth arguing about. Material is money spent the day it arrives, so all of the kitted value is already sunk. Throughput is not — it is earned by converting that material, so it accrues with production. \"Value × production %\" would say a job with every plate on the floor and nothing built is worth nothing, which is exactly the job you most need to see.",
      "Advance received = value − pending payment on delivery. Where nobody has recorded the pending figure it says \"not known\" rather than showing the whole value as an advance — a job with no number is not a job that was paid in full.",
      "SHOP UPDATES, as a tab beside Milestone Plan and Material Kitting, and from the band. Genie's summary first, then every entry newest first: what was said, and the recording itself.",
      "All three are kept because they answer different questions. The summary is what you read, the transcript is what you search, and the recording is what you fall back to when the words on the page do not sound like what somebody meant.",
    ],
  },
  {
    v: "3.12.0.1",
    date: "2026-08-20",
    module: "On Floor",
    items: [
      "GENIE — WHERE THIS STANDS. Above the recordings, Genie reads the last three notes together and writes the current position in two or three sentences. Three separate accounts of one job is not a position; this is. The latest note wins where they disagree, and it says what changed rather than reporting both.",
      "It is written when a note is recorded, not when the page is opened — one call when something changes, instead of one per job per reader per visit.",
      "NOTHING IS DELETED ANY MORE. An earlier version dropped every recording past the newest three. That is wrong for a record of what was said about a customer's job: the reason for keeping audio at all is that somebody can go back to it. Every recording is kept, with who said it, the date, the time and the length — three are in front of you and the rest are one click away.",
      "The page is built for a phone, because that is where it will mostly be read. Below 720px every column takes the full width instead of being squeezed, the three counts sit side by side rather than becoming three screens of very little, and the player stretches to fit. Checked at 500px: nothing overflows sideways.",
      "Form fields are pinned to 16px on a phone — under that, tapping one makes the browser zoom the whole page in.",
      "Needs migration 0043 for the summary. The recordings work without it.",
    ],
  },
  {
    v: "3.12.0.0",
    date: "2026-08-20",
    module: "On Floor",
    items: [
      "The job number opens the job in a lightbox — the same one the Jobs in Progress scatter uses, so a correction made there queues for the ERP exactly as it does everywhere else. It used to jump you to the Job Plan tab and lose the page you were on.",
      "OPEN ON IT — a box on each row showing how many tasks are pending and how many are escalated. Click either and they are listed, with the job name at the top: by then the row you clicked is behind the box, and a list of tasks with no job on it belongs to nothing.",
      "The project number sits beside the delivery date and opens every job on that project — which is usually the real question when one of them slips.",
      "PHOTOS. A gallery per job: take one on a phone or choose a file, give it a date, a completion % and a line saying what it shows. Tap any photo to see it full size.",
      "The completion is stored AS IT WAS on the day the photo was taken and never moves afterwards. The number on a job changes; the photograph does not, and \"70% on 12 August\" is what makes the pair worth keeping in six weeks. Reading it live would silently rewrite the past every time production advanced.",
      "Photos are in object storage, not the database — they are the largest thing Genie will ever hold. Each row keeps a bucket and a path, so moving them to Google Drive later is a copy and one column, not a re-modelling.",
      "Needs migration 0042.",
    ],
  },
  {
    v: "3.11.2.1",
    date: "2026-08-20",
    module: "On Floor · Updates",
    items: [
      "FIXED: voice notes could never record. The app sent a header switching the microphone off for the whole site — a sensible default for a planning tool with no sensors, and wrong the moment On Floor shipped. The browser refused before it ever asked the person, and the screen blamed the device: \"No microphone, or permission was refused.\" The microphone is now allowed to this site and to nothing embedded in it.",
      "The message names the real cause too. A blocked prompt now says which padlock to click; no device says so; a device in use by something else says that instead of blaming permission.",
      "Admin → Updates shows TIME INVESTED — Dr Raghu's hours on Genie, the build window, the commits and the releases.",
      "It is measured from the commit history, not remembered, and it is shown with its working. The window over-counts where the middle of a day went elsewhere and under-counts the thinking before the first commit, so Dr Raghu's own time is a range rather than a figure that would look measured and would not be.",
    ],
  },
  {
    v: "3.11.2.0",
    date: "2026-08-20",
    module: "Principles",
    items: [
      "Documents can be attached to the principles — PDFs, slides, a sheet, up to 25 MB each, with a line saying what each one is. Some of the thinking already exists as a document; retyping it into the box would lose the formatting, the diagrams and the point.",
      "Only the owner uploads or removes. Everybody else opens and reads — the same rule as the principles themselves.",
      "The files are NOT in the database. They go to private object storage and are served through links signed at the moment you open the page; the table holds a name, a path and a size. A public bucket would put internal documents on a URL that works for anyone who has it, forever, including after somebody leaves.",
      "A failed upload cleans up after itself. If the file lands but its row does not, the file is removed rather than left in storage as something nothing lists.",
      "Needs migration 0041.",
    ],
  },
  {
    v: "3.11.1.1",
    date: "2026-08-20",
    module: "Pending Material",
    items: [
      "The pencil opens the material line itself — the same box the job page uses, with the qty, the receivable date, who is chasing it, the update, Raise a task and the comments. It used to open the job's board and leave you to find the line again.",
      "It is the SAME box, not a second one built for this page. Two edit forms over one row is two places for the rules about status, the task mirror and who is chasing it to drift apart.",
      "The job number is a link now — click it to open that job's board. It read like a label and behaved like one, which on a page listing sixty lines across forty jobs is the click people reached for first.",
    ],
  },
  {
    v: "3.11.1.0",
    date: "2026-08-20",
    module: "Job Plan",
    items: [
      "The whole job header follows you down the page now — JOB number and tag, WHERE IT STANDS, and the Genie hint with its AT RISK flag. Yesterday it was replaced by a slim strip carrying only the job number and the customer; the figures and the verdict are the half worth keeping on screen while you work down the milestones.",
      "The slim strip is gone rather than kept alongside. Two versions of the same header, one replacing the other on scroll, is a page that appears to change shape as you read it.",
      "Capped at 42% of the window height. On a narrow screen the three cards stack, and a header that grows to half a page is not a header — past that it scrolls inside itself and the page keeps its room.",
      "A shadow appears under it the moment it starts covering content, and not a pixel before: a 1px sentinel above the row is what reports that, because a sticky element never leaves the viewport and so can never detect its own pinning.",
    ],
  },
  {
    v: "3.11.0.0",
    date: "2026-08-19",
    module: "On Floor",
    items: [
      "NEW TAB — ON FLOOR, next to Job Plan. Every job ticked as being worked on, soonest delivery first: job number, customer tag, TDD and how many days late or still to go.",
      "Two owners per job, side by side. The Job Owner owns the DATE; the QUALITY OWNER is a different question and usually a different person, and until now the only way to know was to ask. It is a second field rather than two names in one box, because two names in a box cannot be filtered, counted or notified.",
      "VOICE NOTES. Somebody standing at a machine will say what is happening; they will not type it. Press record, talk, and the words appear as you speak — so you can see it heard you correctly before you stop.",
      "Both are kept: the recording, because tone carries what a transcript loses, and the text, because nobody scrubs through ninety seconds of audio to find out whether the part arrived. Each note gets a one-line summary you can read straight off the table, with \"what was said\" underneath for the full words.",
      "Three notes a job, oldest dropped. That is the point rather than a limit — an unbounded log of voice notes is a thing nobody listens to, and the last three are what is happening now. The audio goes with them, so the storage cannot quietly fill with files nothing references.",
      "Transcription happens in your browser, not on a server. No second API key, nothing charged per note, and where a browser has no dictation the recording is still saved — a note you can play beats no note.",
      "The audio is NOT in the database. It sits in object storage, billed separately; the table holds a path, a transcript and a summary, all text. Three notes on all 116 jobs is well under a hundred megabytes of objects and not one row heavier.",
      "Quality Owner is a Genie field and is deliberately not pushed to the ERP — there is no column on the other side to receive it.",
      "Needs migration 0040.",
    ],
  },
  {
    v: "3.10.0.1",
    date: "2026-08-19",
    module: "Principles",
    items: [
      "Principles rebuilt. The first version handed Dr Raghu an empty list and an \"Add a principle\" button, which is not a feature — it is homework.",
      "It works the way he actually works now: he types the thinking roughly, in whatever order it arrives, and Genie gives it a spine — themes, a principle per thought, and a drill-down under each. Click any principle and it opens: why it matters, what following it looks like on THIS shop floor, how it usually gets broken, and a question to ask yourself in the moment.",
      "Closed by default, one card at a time. A wall of open text is a page people scroll past; the one-liner is what gets read, and the detail is there for the day somebody wants to argue with it.",
      "Genie is told to use his words and add nothing he did not say — no inventing a third principle to round a group out. The team would know instantly if it stopped sounding like him.",
      "BOTH are kept: what he wrote and what Genie made of it. The structure is a rendering and can be regenerated with a better prompt or a change of mind; the thinking cannot be recovered from the rendering. His raw text comes back into the box next time, so he adds to it rather than starting again.",
      "Versioned, never overwritten — one live set, and what the principles used to say kept behind it.",
      "Needs migration 0039. It drops the empty table 0038 made: a table nothing reads is one somebody wires up by mistake in a year.",
    ],
  },
  {
    v: "3.10.0.0",
    date: "2026-08-19",
    module: "Consult Raghu · Principles",
    items: [
      "CONSULT RAGHU — ask anything about the work in front of you. Every question goes with today's live board: the jobs, what is late, what is kitted and not moving, what is on the floor and every open escalation. So the answer names jobs — \"chase 2114 and 2560\" — instead of offering advice you could have written yourself.",
      "It is told to say when the board does not answer the question rather than inventing a date. A confident invention about a delivery is worse than no answer, because it gets repeated to a customer.",
      "Nothing is kept. A consultation is about the board as it stands this morning; an answer saved for three weeks describes a board that no longer exists, and somebody would quote it.",
      "PRINCIPLES — how the company is run, in Dr Raghu's words, where everybody can read them. He writes and rewrites them from the screen; everyone else reads.",
      "Stored rather than written into the code, because a principle that needs a deploy to change never gets changed — and a list nobody has edited in a year is a list nobody is using.",
      "Retiring one hides it rather than deleting it. A principle that was in force last year is part of how decisions were made last year, and deleting it rewrites that.",
      "The page starts empty and says so. Seeding it with plausible management copy would have put words in his mouth that the whole company would read as his.",
      "Needs migration 0038.",
    ],
  },
  {
    v: "3.9.0.2",
    date: "2026-08-19",
    module: "On Floor",
    items: [
      "The On Floor card carries the value as well as the throughput — 19 jobs, ₹9.39 Cr of value, ₹3.50 Cr of throughput. Nineteen jobs on the floor is a different sentence depending on whether they invoice ₹9 Cr or ₹1 Cr, and what the company earns on them is a third number again.",
    ],
  },
  {
    v: "3.9.0.1",
    date: "2026-08-19",
    module: "Morning Update",
    items: [
      "Every uploaded file is now kept in Google Drive, in a folder you can open: FY2026-27 / 01 Jobmaster / 2026-08 / \"2026-08-19 1801 · Jobmaster - Planning Reporting (8).xlsx\". Financial year first because that is what the business closes on, kind next because that is what you are looking for, month last so no folder ever holds more than about thirty files.",
      "The timestamp leads the filename so Drive's own sort is chronological — and so uploading the same export twice in a day cannot overwrite the first one.",
      "NOTHING is stored in the database. Genie has never kept an uploaded file and still does not: the sheet is parsed, the rows are written, the bytes go to Drive and nowhere else. import_batches keeps only the filename, who loaded it and when — a few small rows a day.",
      "Filing a copy can never fail an upload. By the time it runs the rows are in and the boards have moved, so a failure is a line on the summary rather than an error — telling somebody their upload failed when it did not is how an upload gets repeated.",
      "Needs a Google service account and a shared folder. Until those exist nothing changes and nothing breaks; the archive simply does not run.",
    ],
  },
  {
    v: "3.9.0.0",
    date: "2026-08-19",
    module: "On Floor",
    items: [
      "ON FLOOR — a tick box beside every job number on the Priority List, and a card counting them beside the other totals. Nothing already on a job answered \"is anybody actually working on this right now\": kitting is what was bought, production is what was built, and a job sits at 40% built for six weeks with nobody touching it.",
      "Only Stratcom can tick it. Everyone else sees it, greyed. It is a claim about capacity, and a board where anyone can mark anything as being worked on stops meaning anything by the second week — enforced in the database as well as the screen.",
      "It survives the morning upload. The Jobmaster load names the columns it writes, so this is left alone — which it must be, because the ERP has no such field and never will. It is also not pushed to the ERP for the same reason.",
      "The card shows the throughput on the floor as well as the count — twelve jobs being worked on is a different sentence depending on whether they are worth ₹4 Cr or ₹40 L.",
      "The Projects upload now says whether it found the project NAME column, every time — \"project NAME read on 51 of 51\", or plainly that no such column was in the sheet. A column matched by meaning is right until it silently matches nothing, and that is the kind of blank somebody notices three weeks later.",
      "Needs migration 0037.",
    ],
  },
  {
    v: "3.8.0.2",
    date: "2026-08-19",
    module: "Job Delivery Board",
    items: [
      "Give PDF is a proper 13-page pack now, not a calendar with a blank first page. Page one is the logo, THE BRIEF, and the numbers: jobs pending, total value, total throughput, delivered so far (jobs, billed, throughput) and kitting %.",
      "The brief is composed from the figures rather than written, so it cannot describe a book it is not printed beside. Anything that would read as a nil — no overdue jobs, no undated ones — is left out rather than printed as a zero somebody has to interpret.",
      "Then every job by delivery date across five pages, the book by product family with a share-of-throughput bar, the kitting-against-production scatter with the kitted-not-moving band marked, and a month to a page.",
      "Page numbers on every page — \"Page 4 of 13\" — with the report's date beside them. Chrome ignores the CSS that would number pages, so the pack is cut into explicit pages here and each is stamped. That is also what stops a table row being sliced in half by a page break.",
      "A calendar day shows two jobs and then counts the rest — \"+15 more — see the job table\". A day with five jobs used to push its row straight through the footer.",
      "The whole pack is built by a pure function that can be rendered and looked at without a browser session. The blank first page shipped precisely because the previous version could not be checked; this one was read page by page before it went out.",
    ],
  },
  {
    v: "3.8.0.1",
    date: "2026-08-19",
    module: "Morning Update",
    items: [
      "One upload door, not two. Morning Update is now called UPLOAD FILES, and the separate Upload Data item is gone. They both loaded the same files into the same place — one through a page that shows you what landed and what is still missing, the other through a file dialog that told you the result in an alert box and then vanished. Keeping the better one.",
      "Upload Files is open to whoever could use Upload Data, which is one person more than could reach Morning Update before. Removing a door should not take somebody's way in with it.",
      "The old dialog and the code behind it are removed rather than left hidden. An upload path nothing can reach is worse than no path at all, because it still ships.",
    ],
  },
  {
    v: "3.8.0.0",
    date: "2026-08-19",
    module: "Pending Material · Escalations · Projects in Progress",
    items: [
      "NEW TAB — PENDING MATERIAL. Every kitting line still short, across every job, in one table: job, TDD, item, qty, receivable date, its linked task, the latest word from the supplier, and status. 56 lines are open today across the whole book, one of them QC Defective. The job page already showed a job's own material; this answers the other question — what is holding up the next month of deliveries — which nobody could ask without opening forty jobs one at a time.",
      "It opens on jobs delivering within 30 days, with 60, 90 and All in the dropdown. Received lines are not listed at all: this is what is still short. Receivable date, the update line and the status are editable straight from the table.",
      "NEW TAB — ESCALATIONS. All 31 open escalations in one place: level, job, TDD, task date, who it is on, the task, WHY it was escalated, how many times its date has moved and from when — and the two columns that matter, Genie Solution and Prevented by.",
      "Prevented by is the answer somebody actually gave when they closed an escalation. Read down that column and the same three causes appear over and over, which is the only way a pile of escalations turns into a decision. Tick \"include closed\" to read them.",
      "Ask Genie sits on each open row and answers for that job specifically — what would most likely clear it, and what would stop it recurring. On demand, not on load: thirty-one automatic calls every time the page opened would be slow and mostly unread.",
      "NEW — PROJECTS IN PROGRESS, under Jobs in Progress. Project number, name, customer, expected completion and the jobs on it — 41 live projects carrying 104 of the 116 jobs. Click any row to see its jobs. The ERP's expected-completion date is shown in red when it has already passed, which today is most of them; the last job TDD sits beside it, because those two disagreeing IS the finding.",
      "Everything but the project's own name and dates is worked out from the jobs, because projects.job_numbers has been empty on every row the ERP has ever sent — the link that actually works is the project stamped on each job.",
      "The delivery calendar shows what WENT OUT in green, for the last 30 days — 12 jobs — placed on the day it actually shipped rather than the day it was promised. A calendar showing only what is still owed never shows anything going right.",
      "The job picker on Job Plan freezes under the header when you scroll, and the job identity strip freezes under that. Changing job is the one thing you do from anywhere on that page and it used to mean scrolling to the top first.",
    ],
  },
  {
    v: "3.7.0.7",
    date: "2026-08-19",
    module: "Escalations",
    items: [
      "CLOSING AN ESCALATED TASK NOW COSTS A SENTENCE. Press Done on an L1, L2 or L3 and it asks what is being done so it does not happen again — not what was done to fix this one, what changes so the next job does not hit it. All three levels, as Dr Raghu asked: an escalation that is expensive to close is one people think twice about raising.",
      "It is compulsory in three places, not one. The form asks, the server refuses without it, and the table itself rejects anything under fifteen characters — because a required field in React is a suggestion the moment anything writes around it, and this is the field somebody wants to skip at six o'clock.",
      "Fifteen characters is deliberately low. It stops \"ok\" and \"done\" without turning a genuine short answer — \"added to the QC checklist\" — into a fight with the form.",
      "Re-opening a task asks nothing. Only the way in to Done costs anything, and closing, re-opening and closing again keeps the latest answer rather than failing the second time.",
      "The notes live in their own table, not on the task. ERP tasks are wiped and re-created by every ToDo upload, so a note stored on the row would vanish with it — and the level it was closed at is frozen alongside, since the task's own escalation can be edited afterwards.",
      "Needs migration 0036.",
    ],
  },
  {
    v: "3.7.0.6",
    date: "2026-08-19",
    module: "Job Delivery Board",
    items: [
      "The totals and the run rate stay open on the Priority List and fold away on every other tab. They are the header for the priority list — that view IS the whole book, and those are its totals. On the calendar or a product schedule they were half a screen of the same numbers pushing the thing you came to look at below the fold.",
      "Folded, they leave one line — jobs, value, throughput, kitting % — with a Show totals button on the right. Clicking anywhere on the line opens it too. A collapsed panel that hides its own figures entirely just gets opened again every time.",
      "Hide totals is offered on the Priority List as well. Somebody who already knows the numbers should be able to put them away.",
      "It follows the tab rather than being remembered per person: the right default is a property of the view, not of the reader. Open it anywhere you like and it stays open until you move tabs.",
    ],
  },
  {
    v: "3.7.0.5",
    date: "2026-08-19",
    module: "Job Delivery Board",
    items: [
      "Two cards at the top, Stratcom only. REQUIRED RUN RATE — what has to go out every month from here, sales and throughput, with the days left. And NEW SALES NEEDED — how much of the year's target has no order behind it yet: target minus what has been delivered minus every pending job dated before 31 March. Today that is ₹43.89 Cr of sales and ₹17.14 Cr of throughput still to be WON and delivered inside the year.",
      "The second card is the one production cannot fix. It is stated on its own rather than folded into the run rate because the run rate asks what has to be built, and this asks what has to be sold — and the book already on the floor cannot reach the target on its own.",
      "Both read the same endpoint as the Required Run Rate card lower down the page, so a target shown twice can never be two different numbers.",
      "Schedule by Product and Schedule by Customer show THROUGHPUT in every cell, under the job count and value, and as its own column. Value is what a job invoices; throughput is what the company actually earns on it — and the two rank the families differently, so a table with only one of them ranks the wrong things first.",
      "The delivery calendar gives each job two lines: the job number, then the description with room to be read. On a busy day every chip used to say \"Single Stage Scissor…\" and nothing else.",
      "New on the calendar: GIVE PDF. It opens a printable A4 landscape sheet, dated today, with every month laid out in full — not the fortnight that happened to be on screen. Months with no deliveries are shown empty rather than skipped, because a gap in the book is a finding and not a formatting problem.",
      "Task lightboxes clamp the task name to three lines. A pasted paragraph of a title used to push the escalation chip, the buttons and the comments off the bottom of the box.",
    ],
  },
  {
    v: "3.7.0.4",
    date: "2026-08-19",
    module: "Planning Suite",
    items: [
      "DELETING A TASK IS NOW ADMIN ONLY. It used to be anyone's own work, or anything at all for a planner — which made deleting the ordinary way to make an unwanted task go away. A deleted task takes its comments and its whole date history with it and leaves nothing saying it existed, so who was asked for what, and how often the date moved, went with it. Everyone else marks it Done, which keeps the trail. The bin is hidden rather than shown and refused, and the server refuses too.",
      "The job header follows you down the page. Once the header card scrolls away a slim strip pins under the top bar with the job number, the customer tag and the customer line — everything below it looks the same from job to job, and knowing which job you are editing should not need a scroll back up.",
      "The Priority List opens sorted by Target Delivery Date, soonest first. It used to open on whatever manual order had last been dragged, which is an order somebody set on a day that has since gone — so the top rows were not the next deliveries. Manual priority is not lost: clear the sort and it is exactly where it was.",
      "The account menu says Upload Data, not Upload Excel. The door takes CSV as well, and the Employee Master and ToDo list as well as the Jobmaster — naming it after one file format made it sound narrower than it is.",
    ],
  },
  {
    v: "3.7.0.3",
    date: "2026-08-19",
    module: "Morning Update",
    items: [
      "The account menu says Upload Data, not Upload Excel. The door takes CSV as well as Excel, and it takes the Employee Master and the ToDo list as well as the Jobmaster — naming it after one file format was telling people it was narrower than it is.",
      "Its tooltip says the same: a morning file, Excel or CSV, and it names the Employee Master among what it accepts.",
    ],
  },
  {
    v: "3.7.0.2",
    date: "2026-08-19",
    module: "Groups — LC, Stratcom, Management",
    items: [
      "Fixed, in migration 0035: un-ticking LC on somebody who is in Stratcom did nothing. The tick simply came back — not an error, not a half-saved row, the instruction was silently ignored, which is the worst of the three.",
      "The rule was written as a test on the row after the change. On a write that touches only LC, Stratcom is carried over unchanged, so the \"Stratcom means LC\" half fired and forced LC straight back on. The half written for exactly this case could never run. It now compares against the row before the change and acts on what actually moved.",
      "Through the screen it always behaved correctly — the page sends all three ticks together and had already dropped Stratcom before the database saw it. Only a direct write took the broken path, which is why this needed testing rather than trusting.",
      "audit-migrations.mjs now probes 0033, 0034 and 0035 too, so \"did that migration run?\" keeps having a one-command answer.",
    ],
  },
  {
    v: "3.7.0.1",
    date: "2026-08-19",
    module: "Notifications",
    items: [
      "The bell is clickable. Clicking a notification marks it read AND opens the task in the lightbox, in view mode — reading it and finding it are the same click now. Before, it could only be marked read, and you still had to go and hunt the task down, which is the moment most of them were ignored.",
      "Each notification shows the JOB NUMBER and the customer tag on their own line. The job is looked up through the task rather than copied onto the notification, so a job retagged after the notification was written still reads correctly.",
      "It opens in view mode on purpose. Someone arriving from the bell is finding out what they have been given, not editing it — Edit is one button away once they have read it.",
      "A notification for a goal opens Goals instead. A notification whose task has since been deleted, or closed in the ERP, says so plainly — it no longer just fails to do anything and looks broken.",
      "The task list is re-fetched before that message is shown. A task assigned two minutes ago is on the bell before it is on the board, and \"that task is no longer here\" for something created moments earlier would have been the worst possible answer.",
    ],
  },
  {
    v: "3.7.0.0",
    date: "2026-08-19",
    module: "Groups — LC, Stratcom, Management",
    items: [
      "Three tick boxes on the Users tab: LC, Stratcom and Management. Only raghu@nandan.co.in can tick them, and every Stratcom member is an LC member — ticking Stratcom ticks LC, and un-ticking LC drops Stratcom with it. The box says so before you click it rather than the other tick just disappearing.",
      "These are NOT roles. Your role says what you may do — write a plan, upload, administer. These say which room you are in. Keeping them apart is what avoids inventing an \"LC planner\" and an \"LC admin\" and every other combination.",
      "Delivered Jobs is now the LC's page. The tab is hidden for everyone else rather than shown and refused, and the API behind it refuses too — hiding a tab is not a gate when the URL still works.",
      "The owner is in all three implicitly, with nothing stored against the account. A tick on a row the admin page deliberately cannot edit could never be taken off again.",
      "Projects can now carry a name and a customer. The columns were always in the ERP export; the upload simply never read them. They are matched by meaning, so \"Project Name\", \"Project Title\" and a bare \"Name\" all bind — and an export without them no longer wipes the names an earlier one brought in.",
      "The Report tab's contents list lost its numbering.",
    ],
  },
  {
    v: "3.6.0.0",
    date: "2026-08-18",
    module: "Admin → Report",
    items: [
      "A Report tab in Admin, with a Download PDF button. Eight pages, 16:9, built from the boards the moment you press it — the year against target, what has actually gone out since 1 April, the order book and where it stops, the book by product, kitting against production, the jobs closest to going out, one product family looked at properly, and what is being escalated.",
      "Nothing on it is typed and nothing is cached, so the deck cannot drift from the boards it summarises. The first page carries Date of Report, written out in full, because a deck without a date on it gets presented six weeks later as though it were current.",
      "A closer look at Hi Lifts, on its own page: all 20 on the board job by job with the customer, kitted and built against each other, who is waiting, and the 16 that went out this financial year. Three of the twenty carry no order value yet — they are named as jobs with no value rather than added in as nothing.",
      "The PDF comes from your own browser's Save as PDF at a true 13.333 × 7.5in page. That is deliberate: a deck rendered one way on screen and another way on a server is a deck nobody can check before presenting it.",
      "The escalation figures on the last page count levels, not labels. The ERP writes the full heading in that column — \"L2 — Production Head\" — so the three levels are read off the front of it rather than listed as five separate headings.",
    ],
  },
  {
    v: "3.5.0.2",
    date: "2026-08-18",
    module: "Jobs in Progress",
    items: [
      "The chart legend has moved down against the lines it names. Across the panel header it was two feet from the chart, and a key you have to look up from the chart to read is a key nobody uses. The dashed Jobs line now shows as dashed in the legend too.",
      "Under the delivery table: the Required run rate — ₹x Cr per month in sales, with a throughput of ₹y Cr per month, and the days left of the year. The table says what is coming; this says what is required, and the two sitting on separate pages is how a good month of orders gets read as good news on its own.",
      "Total Anticipated is now on this page as well as Delivered Jobs. What this page shows IS the middle line of that box — the book still to come — so the total it feeds belongs in front of whoever is reading the book.",
    ],
  },
  {
    v: "3.5.0.1",
    date: "2026-08-18",
    module: "Delivered Jobs",
    items: [
      "The top of Delivered Jobs is three boxes on one line: what the page is, what the year comes to, and how much ledger sits behind it. It was a title, a floating dark card and a right-aligned paragraph, which collided with each other at most widths — three equal boxes in one grid cannot.",
      "The Total Anticipated box now fills its share of the line instead of sitting at its own width and overlapping its neighbours.",
    ],
  },
  {
    v: "3.5.0.0",
    date: "2026-08-18",
    module: "Delivered Jobs",
    items: [
      "New: TOTAL ANTICIPATED for the financial year, a large button at the top right of Delivered Jobs. Sales and Throughput, each being what has been delivered since 1 April PLUS everything on the board still due before 31 March.",
      "It answers a different question from the Required Run Rate below it. The run rate asks what we would have to bill from here; this asks what we already have on the books to do it with.",
      "Clicking it shows the working: delivered so far, still due, and overdue-but-not-delivered as three separate lines — then the total, the target and the gap. Overdue work is counted in the year (the job exists and will go out) but named, because a total that leans on late work should say so.",
      "What is NOT in the number is listed too: jobs dated past 31 March belong to next year, and jobs with no target date cannot be placed in a year at all. Left out of a total is not the same as not existing, and a figure this size gets quoted.",
      "It says plainly that it is an expectation, not a forecast: it assumes every pending job goes out on the date it carries today, and nothing here is weighted by how likely a job is to slip.",
    ],
  },
  {
    v: "3.4.0.7",
    date: "2026-08-18",
    module: "My Week",
    items: [
      "The quote and the picture now change on EVERY page load, not once a day. They were pinned to the date so the whole company saw the same one — right for something mentioned across a room, wrong for a page the same people open eight times between eight and six. A picture that never changes stops being looked at by Tuesday.",
      "All 168 images and the whole quote list are in play on every load.",
    ],
  },
  {
    v: "3.4.0.6",
    date: "2026-08-18",
    module: "My Week",
    items: [
      "Delivery expected in the next 7 days drops the year from the TDD. The table already says it is the next seven days; 18-08-2026 was saying so a second time and wrapping onto two lines to do it. The full date is still on hover.",
      "The Planning Owner column shows the person, not their login. It was printing pankajs@nandan.co.in where the name belongs — the address is what the Jobmaster carries, but the name is who anybody actually asks. The email is on hover.",
    ],
  },
  {
    v: "3.4.0.5",
    date: "2026-08-18",
    module: "Morning Update",
    items: [
      "Fixed: the Employee Master upload reported a failure it had not had. 364 employees — 362 with birthdays — were loaded every time; the upload then fell over writing its own audit line, because “employees” was never added to the list of upload kinds that line accepts. 0020 widened it for Delivered Jobs and 0024 added the HR sheet four migrations later without doing the same.",
      "Migration 0033 adds it, with a note on the constraint telling whoever adds the next upload card to widen it too.",
      "More importantly: a batch stamp that cannot be written is now a WARNING on the summary, not an exception. By that line every row is already in. Throwing told somebody their upload had failed while the data sat in the database — which is worse in every direction: the upload gets repeated, and nobody trusts the page afterwards. It now says the data is loaded and only the “last loaded” time is missing.",
      "Your birthdays are already there — My Week will show them as soon as somebody has one in the next seven days.",
    ],
  },
  {
    v: "3.4.0.4",
    date: "2026-08-18",
    module: "Nandan Tasking",
    items: [
      "New: 🖨 Make PDF on the calendar, beside Add Task and Today. It opens a clean printable month — A3 landscape, because a week is seven columns wide — and the browser’s Save as PDF does the rest. No library, a real PDF, on every machine this runs on.",
      "It prints a page of its own rather than the screen. Printing the live page would carry the header, the workspace bar and the filter row onto the paper, and a wall chart with a navigation menu across the top is not a wall chart.",
      "The print keeps the category colours, the red job number on anything overdue, the escalation mark and the customer tag — the same chip, on paper.",
    ],
  },
  {
    v: "3.4.0.3",
    date: "2026-08-18",
    module: "Morning Update",
    items: [
      "Fixed: Cash Flow Details was reading the wrong column. The sheet carries BOTH “Planned Input Cashflow Pattern” and “Cash flow Details”, a loose match hit both, and the pattern column happens to sit first — so first-header-wins picked it. Every job page has been showing the pattern where the details belong.",
      "Column matching now works strongest-pattern-first across the whole sheet, so an exact “Cash flow Details” is claimed before a loose “cash flow” can reach anything else. Specificity beats position — otherwise the answer depends on the order somebody arranged the columns in.",
      "“Planned Input Cashflow Pattern” is now explicitly refused. On a sheet carrying only that column, Cash Flow Details binds to NOTHING and the upload says so, because empty and honest beats full and wrong.",
      "The next Jobmaster upload will fill it correctly — read the summary line: it should say Cash flow details ← “Cash flow Details”.",
    ],
  },
  {
    v: "3.4.0.2",
    date: "2026-08-18",
    module: "Nandan Tasking",
    items: [
      "Calendar chips now read: job number · who · escalation · customer tag. The CATEGORY word is gone — the chip is already coloured by it and the legend names the colours, so writing “Material” on a material-coloured chip only ate the room the customer needed.",
      "Fixed: initials were showing as one letter. The helper took the first letter of each word, which is right for “Mukesh Tiwari” and wrong for everything else — it turned MT into M and anils into A. A one-letter tag identifies nobody in a company with two Anils. Now MT stays MT, anils reads ANI, and Mukesh Tiwari still reads MT.",
      "The Task box is two lines instead of one. Typing blind past the right-hand edge is how a task ends up named “Chassis spares parts list costing pend”. Ctrl/⌘+Enter still saves it.",
    ],
  },
  {
    v: "3.4.0.1",
    date: "2026-08-18",
    module: "Nandan Tasking",
    items: [
      "A task now remembers the date it was FIRST promised, and lateness is judged on that — never on the date currently showing. Dragging a task from the 11th onto today used to make it stop being late; nothing recorded that it had ever been late, or that anybody had moved it. Lateness had become something you could delete by dragging.",
      "So the job number stays red on a task whose original date has gone, however many times it has been pushed since. The chip also carries ↻ and the number of moves.",
      "Every move is logged — from, to, who and when — and shown in the task box ABOVE the comments, because a date that has moved four times IS the story of the task. Burying it in a field somebody has to compare from memory is how a task slips a month one week at a time.",
      "The overdue counts on My Week and on the calendar are counted the same way, so moving a task does not quietly clear the number.",
      "Goals have worked like this since they were rebuilt — “carried days and pushes are counted against the date first committed, not the one on screen”. Tasks now match.",
      "Everything already on the board is treated as promised on the date it currently carries. Inventing an earlier promise would mark tasks late that nobody ever agreed a date for.",
      "Migration 0032.",
    ],
  },
  {
    v: "3.4.0.0",
    date: "2026-08-18",
    module: "Jobs in Progress · Update to ERP",
    items: [
      "The job lightbox is now editable. A pencil on Production %, Kitting %, Target Delivery Date, Amount Needed next month, Current Project Escalation and the Current Update line — correct any of them without leaving the plot.",
      "Every correction does two things: it fixes the board now, AND it joins a queue for the ERP. Genie is downstream — tomorrow’s Jobmaster redraws everything — so a correction that never reaches the ERP undoes itself overnight. That is the whole point of the queue.",
      "ONLY WHAT CHANGED is queued. Re-typing 40 over 40 puts nothing in front of Pankaj.",
      "ONE LINE PER JOB AND FIELD. Editing the same field three times before an export leaves one line carrying the latest value, not three to apply in order — and it keeps the ORIGINAL old value, because what matters is what the ERP still holds, not what the intermediate edits were.",
      "Update to ERP is rebuilt around that queue and now SURVIVES THE BROWSER TAB. It was a JavaScript array before, so a day’s corrections died when the tab closed.",
      "The Job ID leads every line, so a row can be found and overwritten in the ERP without matching on anything softer. Download CSV gives Pankaj the lot in one file — Job ID, Field, New value, Was, Changed by, When — with the field named as the ERP names it, so nobody has to translate “tdd” into “Target Delivery Date Current” at eight in the morning.",
      "Mark all applied clears the list without deleting anything: the record of what was corrected, by whom, is the only trace that Genie and the ERP ever disagreed.",
      "Migration 0031.",
    ],
  },
  {
    v: "3.3.0.1",
    date: "2026-08-18",
    module: "Nandan Tasking · Calendar",
    items: [
      "Drag a task chip onto another day and its due date moves. No confirmation box: a drag is already a deliberate act, and a dialog after each one would make re-planning a week slower than typing the dates in — which is the thing this replaces. Getting it wrong costs one drag back.",
      "Every chip now shows two lines: the job number, initials and category on the first, the task itself wrapped onto two lines rather than cut off mid-word on the second.",
      "Chips are colour-coded by task category, in PASTEL. A month of the calendar is made of these chips, and eight saturated blocks a day is a stained-glass window nobody can read a job number off.",
      "Lateness is said separately: when the date has gone the JOB NUMBER goes red, and the chip keeps its category colour. A late Quality task still reads as quality work instead of becoming one more identical red box — which is what the calendar looked like before.",
      "New + Add Task button at the top of the calendar. It opens the full task box with a job picker, since here you are sitting on a month rather than inside a job.",
      "Save & add another keeps the job, the person, the date and the category, and clears only the words. Tasks get raised in runs, and re-picking the same job six times is how somebody stops using the button and goes back to a notebook.",
      "A legend under the calendar names every category colour.",
    ],
  },
  {
    v: "3.3.0.0",
    date: "2026-08-18",
    module: "Material Kitting",
    items: [
      "Materials is now MATERIAL KITTING, and a line is a real record rather than a tick-box. Columns: Material / kit item · Qty · Receivable date · Update · Status.",
      "Three statuses, not two: Yet to receive, Received, and QC Defective. QC Defective is NOT a kind of received — the item is on site and cannot be used, which for the job is the same position as not having it, so it counts as outstanding everywhere.",
      "A pencil on every line opens it: item, quantity, receivable date, who is chasing it, a running Update line, and comments — where a delay gets explained next to the thing it is delaying.",
      "ANSWERING DR RAGHU’S QUESTION — can a kitting line be a task, since it already has a date? Yes, and the answer is a link rather than a copy. The material row stays the record; “Raise a task for this” puts it on somebody’s list in Tasking with the receivable date as its due date, under the Material category, tied back to the line.",
      "Once linked the two are held in step BOTH WAYS: receiving the material closes the task, and closing the task receives the material. Two records that look alike are not the problem — two that drift are, and this is what stops it. Editing the date or the owner moves the task too.",
      "QC Defective deliberately re-opens the task. The item is here and useless, so the chasing is not finished; and marking a task done never overwrites a QC call.",
      "Not every line becomes a task. Eight lines on a hundred and five jobs would be eight hundred and forty tasks and Tasking would become a bill of materials nobody reads — so a line is promoted only when somebody actually has to chase it.",
      "Migration 0030. Existing “Pending” lines become “Yet to receive” — the same state, said the way the shop floor says it.",
    ],
  },
  {
    v: "3.2.0.4",
    date: "2026-08-18",
    module: "Genie Hint",
    items: [
      "The sign-off under a job brief now reads “Written by Genie based on coaching by Raghu · Work on the plan, and escalate as needed — to the right person, at the right time.”",
      "It replaces “Written by Claude … check the plan below before acting on it”, which told somebody to distrust the panel and stop. The line is an instruction, not a disclaimer: the brief exists to move a plan and get the right person told, and the last thing on it should say so.",
    ],
  },
  {
    v: "3.2.0.3",
    date: "2026-08-18",
    module: "My Week",
    items: [
      "The top of My Week is one five-column band. Open Tasks, Deliveries, Learning and Participation across the top, with birthdays holding the fifth column down both rows — a list of names is the one card up there that grows, so it gets the height.",
      "The Quote of the Day now runs the full width of the first three columns. A line of prose set in a narrow card is a line nobody reads.",
      "How’s My Day sits directly under My Participation, which is the number it belongs with, and its five faces now fit on one line instead of wrapping onto two.",
      "The image quote moves down into the right-hand column, where it has the width to be looked at rather than glanced past.",
    ],
  },
  {
    v: "3.2.0.2",
    date: "2026-08-18",
    module: "Morning Update · Job Plan · Genie Hint",
    items: [
      "FIXED, and this was the real one: the Planning Owner was blank on all 105 jobs. The jobs parser only ever looked for a column literally called “Project Owner”, and the export calls it PLANNING OWNER. The delivered-jobs parser has understood both names since it was written; the jobs branch never used that list. That single missing header is why the Owner column read “—”, why the owner filter had nobody in it, why the kanban had one Unassigned column, and why My Week showed no jobs of yours.",
      "Job Status and Target Delivery Date are now matched the same way, so the two exports’ different spellings both work.",
      "The five new fields — Current Project Escalation, Client Update Latest, Cash Flow Details, Amount Needed next month, Pending Payment on Delivery — are empty because NO JOBMASTER FILE HAS BEEN UPLOADED since Genie learned to read them. The last jobs upload was 17 August. The job page now says exactly that instead of showing five dashes, and names the file to load.",
      "Genie Hint writes dates as 31-Aug-2026, never 2026-08-31. Both halves were needed: the model was told the rule AND the facts it is handed are now written that way, because it copies back whatever shape it is given.",
      "The upload summary now names the column it read Planning Owner, Job Status and Target Delivery Date from — and prints the sheet’s whole header list whenever one of those three fails to match. The money fields have named their columns since the day they were added, which is how the ERP’s “Currrent Project Escalation” typo was confirmed at a glance; Planning Owner failed silently for months because nothing ever said which header it had bound to, or that it had bound to none.",
    ],
  },
  {
    v: "3.2.0.1",
    date: "2026-08-18",
    module: "Jobs in Progress",
    items: [
      "Planned deliveries is now half chart, half table, side by side, and shows at most six months — trimmed to where the book actually ends. It was drawing twelve, eight of them empty: a line lying flat along zero for two thirds of its width reads as a collapse in orders rather than as the end of the data. It now says “nothing planned past November” in words instead.",
      "The table leads with a TOTAL row, and that total is the whole book — every month shown plus overdue, later and undated — so the rows beneath can never add up to more than the line above them.",
      "Every total is now clickable. A month, the total, or a product family opens the jobs behind it: job number, customer, tag, target date, value and throughput. A chart that says a month is worth ₹8.38 Cr but cannot tell you which eight jobs is a chart you have to leave in order to act on, and leaving means losing the chart.",
      "Clicking a job in that list opens the job itself, still without leaving the page.",
      "On the Type of Jobs list, clicking a family now opens its jobs; the small ◧ button filters the plot instead. Those were the same click before, and only one of them can be the obvious one.",
      "The kitting-versus-production plot is smaller and squarer, capped so it fits on one screen. A plot you have to scroll to see the top of is two half-plots, and its whole value is seeing all four corners at once.",
    ],
  },
  {
    v: "3.2.0.0",
    date: "2026-08-18",
    module: "My Week rebuilt · Jobs in Progress",
    items: [
      "My Week is rebuilt. The top is two columns: your numbers on the left — My Open Tasks, Deliveries This Week, My Learning over 90 days, My Participation, and How’s My Day — and on the right the two things that are not about work, the Quote of the Day and an image quote.",
      "How’s My Day is five faces and one click. No scale, no required note: the honest answer is the one given in the second before somebody thinks about it. Answering again the same day changes the answer rather than adding one, and the last fortnight shows as a row of dots underneath — one bad Tuesday is noise, five in a row is something a manager should already know.",
      "My Participation counts DAYS ENGAGED out of the last 30 — days you logged how it was going, finished a lesson, or wrote a comment. Not a count of clicks: a number that goes up when somebody is busy rather than when somebody takes part would measure the wrong thing.",
      "The image quote reads your Drive folder directly — all 168 of them — now that it is shared. One a day, the same one for everybody, cycling the whole folder before repeating. Genie caches what it finds, so a bad day at Google leaves yesterday’s pictures working rather than an empty panel. Admin → Settings → Image quotes has the folder and a Sync button.",
      "Below that, three columns: My Tasks on the left; deliveries in the next 7 days and My Goals in the centre; birthdays, My Learning, milestones and my jobs on the right.",
      "Birthdays for the next seven days, from the employee master. A 29 February birthday lands on 1 March in the years without one — the alternative is never wishing that person a happy birthday again except in leap years.",
      "My Learning shows one lesson with its thumbnail — whatever is under way, else whatever is planned, never one already finished — and opens it in a lightbox.",
      "Jobs in Progress is now built. A table AND a line chart of planned deliveries over the next 12 months: jobs, value and throughput. Value and throughput share the rupee axis because the gap between them IS the material cost; the job count gets its own axis, since forcing a count of 9 onto a rupee scale draws it flat along the bottom.",
      "Overdue leads that table and is deliberately kept OFF the line: a job whose date has gone is not a future month, and drawing it as one would flatter every month after it.",
      "The book split by product family, click any family to filter.",
      "And every job plotted: production % across, kitting % up, dot AREA proportional to throughput, colour by product family. Radius-proportional bubbles overstate the big ones by the square — the eye reads area. Hover for the job, click for a lightbox with its dates, money and escalation; click outside and the plot is exactly where you left it, because exploring a scatter means opening six jobs in a row.",
      "Migration 0029.",
    ],
  },
  {
    v: "3.1.0.2",
    date: "2026-08-18",
    module: "Job Plan · Admin · Goals · Planning Suite",
    items: [
      "Planning Owner now resolves. The Jobmaster writes it as an email — pankajs@nandan.co.in — while accounts are matched on initials, name or ERP user. Both sides are now reduced to the same thing before comparing: lower-cased, with anything after the @ dropped. That is why the Owner column read “—” on nearly every job and the owner filter had almost nobody in it.",
      "New on the job page: Current Project Escalation, shown FIRST and in red. What is holding a job up outranks what it is worth. Client Update Latest, Cash Flow Details and Pending Payment on Delivery now carry their full names, and Amount Needed reads “next month”, which is what the ERP column actually means.",
      "New tab: Jobs in Progress, first in the Planning Suite and deliberately blank until you say what belongs on it — rather than a second copy of the Job Delivery Board that would have to be un-learned.",
      "LMS has moved to the end of the header, after Sales Genie.",
      "Every goal, sub-goal and initiative can now carry a Goal Category — the same swimlanes list Admin already manages, so what a board groups by later and what a goal carries now are one list rather than two that drift. A free-text category would have been fifteen spellings of “Operations” inside a month.",
      "Admin is now actually separated. The tabs did nothing: every section rendered on all of them, which is why App identity and Targets appeared under Milestones. Users, Org Chart, Milestones, Settings and Updates each show only their own.",
      "Targets now lead with the financial year, in its own block. A target with no year on it is the one that gets carried forward by accident.",
      "Goals access is folded away behind a toggle on the Users tab. Hidden, not removed — it is the only place a grant can be revoked, and a page nobody can reach is a permission nobody can take back.",
      "New: an Org Chart tab beside Users, drawn from “Reports to” and departments. Nobody maintains it — it IS the reporting column, so it cannot disagree with the boards, Tasking or Team Goals. It counts direct and total reports, highlights a department, names anyone with nobody above and nobody below, and draws each person once so a reporting cycle stops rather than spins.",
      "Migration 0028.",
    ],
  },
  {
    v: "3.1.0.1",
    date: "2026-08-18",
    module: "LMS",
    items: [
      "Added: a sixteenth book. The Library tab now has a THE BOOKS panel — add a book, rename one, change its badge, colour, order or one-line description. The API could always do it; there was no button, which made the fifteen seeded books look like the only fifteen there could ever be.",
      "A book is never deleted, only made inactive: lessons are shelved against its id, and removing the shelf a lesson stands on loses where it belonged.",
      "Renaming a book keeps its id, so nothing shelved under it is orphaned. A new book gets its id slugged from its name — nobody has to invent one.",
      "The panel is collapsed by default. Books are set up once; lessons are the daily work.",
    ],
  },
  {
    v: "3.1.0.0",
    date: "2026-08-18",
    module: "LMS — a new section",
    items: [
      "New section: 📚 LMS, first in the header, ahead of the work. That placement is the point.",
      "Learning Goals is the first tab: your learning plan, then the fifteen books — Employee Handbook, WCM and Kaizen, Production, Design, Digital Tools, Safety, Quality, ISO, Accounting, ToC, Leadership, Worker Skill, Meditation, Mind Practice and Emergency. Each shows how far through it you are.",
      "A lesson carries a title, a body, a description, a video, a PDF and a length. It is authored ONCE and shelved into as many books as it belongs in — the same CAD lesson can sit in Design and in Digital Tools without becoming two lessons that drift apart. Books have sections, and a lesson can be moved between them per book.",
      "YouTube lessons play with YouTube's own controls switched off and play, pause, forward-10s and the clock drawn by Genie instead. No suggested videos, no channel, no “watch on YouTube” — every one of those is a door out of the lesson. Drive files keep Google's player, and the panel says so rather than pretending otherwise.",
      "A LESSON CANNOT BE TICKED. It is complete only when the person has written at least fifty words in their own words about what they took from it — enforced on the server, not just in the browser, with a live word count and a message saying how far short you are. A tick records attendance; fifty words record learning.",
      "Planned time is not time. Only completed lessons add to a total, because letting intentions accumulate is how a training record ends up flattering everybody in it.",
      "Training taken elsewhere counts too — a course, a seminar, a site visit, added by hand with its own note, into the same total.",
      "Genie writes your Learning Plan: it reads your designation, department, key result areas and what you have already finished, writes what you should be building towards, and puts the lessons it picks onto your plan as Planned. It can only choose lessons that actually exist — every id it returns is checked against the library, and anything invented is dropped and reported.",
      "My Team shows what everyone below you has been learning, walked down the whole line — their totals, their plan, and what they actually wrote.",
      "The Library tab is where an author writes lessons, ticks the books each belongs in, and sees at a glance which lessons are in no book at all and therefore findable by nobody. Retiring a lesson never deletes anybody's completion or their words.",
      "Lesson bodies are Markdown rendered to elements, never raw HTML, and only http/https/mailto links survive. Lessons are written by interns and read by the whole company; that is untrusted text on its way to every screen in the works.",
      "My IDP in Goals now shows the built half of a development record — lessons completed, time learned, words written, and the learning plan — read from LMS. That was always the reason for building this.",
      "Migration 0027 creates it all and seeds the fifteen books.",
    ],
  },
  {
    v: "3.0.1.11",
    date: "2026-08-18",
    module: "Job Delivery Board · Job Plan · Genie Hint",
    items: [
      "New: the PENDING JOBS card opens. Click it for the Delivery Outlook — every pending job stacked on the month its target date falls in, switchable between jobs, sales billing and throughput, with an OVERDUE bar of its own at the front. A job whose date has already gone is the most useful bar on the chart and must never be folded into “this month”.",
      "The required run rate is drawn across it as a dotted line, from the same figures as the run-rate card, so the two can never disagree. A bar chart of what is coming says nothing until you can see the level it has to clear.",
      "New: a Kitting % × Production % grid, shaded by throughput expected value rather than by job count — four small jobs and one large one in the same square are not the same decision. Click any square for the jobs in it. Two corners are called out: READY TO FINISH (60%+ kitted, 60%+ built — money nearly earned) and KITTED, NOT MOVING (bought and sitting still).",
      "The outlook reads the same filtered list as the board, so the Planning Owner filter and the search box carry into it.",
      "New on the job page: Where It Stands — Current Status, Client update and Cash flow, beside Invested, Amount needed and Pay on delivery.",
      "New job columns from the Jobmaster export: Client update, Cash flow details, Amount needed and Pending payment on delivery. They are matched by MEANING, not by an exact header, and the upload summary names the column each one was read from and how many rows carry a value — so a match is confirmed rather than assumed, and a column renamed in the ERP shows up the morning it happens instead of silently reading zero.",
      "Pending payment on delivery is now a sortable column on the job list, so the board can be ordered by what finishing a job collects. Not recorded shows as a dash and sorts below zero — a gap in the export is not a job with nothing behind it.",
      "New Invested column: (1 − T%) × Kitting % × Value — the material already drawn against a job, which is what finishing it releases.",
      "Job Status has come off the job list. It was a 32-value dropdown taking 190px on every row to say what Prod % says in three characters; it is still editable on the Job Plan page and still on the kanban card. Prod % and Kit % now sit side by side.",
      "Owner is now Planning Owner everywhere — the boards, the filters, the role list and the kanban. The Jobmaster calls the same person the Project Owner.",
      "Fixed: the Genie Hint had to be generated again for every single person. It was cached in memory inside one server instance, so the second person to open a job landed somewhere else and paid for a whole fresh read, and any restart threw the lot away. It is now one shared row per job (migration 0026): whoever reads a job first, everybody after them gets it free and instantly.",
      "The hint now fills itself in when a job is opened — no button — and goes stale when the JOB changes rather than when a timer runs out. For the owner and those reporting directly to him it is also BUILT automatically when there isn’t one.",
      "Why it was failing: the server has no ANTHROPIC_API_KEY. Nothing in the code was broken — the key was never added to the Vercel project’s Environment Variables. The message now says exactly that, and that nothing else about the job is affected.",
      "My Week has come off the Planning Suite tab bar — the 🏠 button beside it is that same page. Planning Suite now opens on the Job Delivery Board, and the “Restricted — authorised planning users” line is gone: it was true, told nobody anything they could act on, and cost a line of a header that is on screen all day.",
    ],
  },
  {
    v: "3.0.1.10",
    date: "2026-08-18",
    module: "Morning Update · Goals",
    items: [
      "Fixed: the Employee Master upload failed outright with “time zone displacement out of range: +017722–01”. A date of birth in 1948 is held by Excel as the number 17722, and the date reader only recognised numbers between 40000 and 60000 — which is every date a JOB can carry and not one a person can be born on. 17722 fell through and was read as the YEAR 17722.",
      "The date reader now covers the whole human span, and no reading of any cell can reach the database as a five-digit year again — a date outside 1900–2100 is refused rather than written.",
      "Two-digit years now work, pivoted at 30: “15/05/80” is 1980 and “15/05/05” is 2005.",
      "A cell holding only a year is refused rather than turned into the 1st of January. A year is not a birthday anybody can be wished, and inventing one would have filled the birthday list with people who were not having one. The upload summary’s date-of-birth count is what shows the gap.",
      "CSV files are now accepted anywhere a spreadsheet is — including a file renamed to .xlsx that is really a CSV. The byte-order mark Excel writes on “CSV UTF-8” export is stripped, so the first column no longer silently stops matching.",
      "Dates in a CSV are read DAY FIRST, as everywhere else in Genie. Left alone the CSV reader converts them itself in American month-first order, which turned 08/07/1948 into 7 August and 01/04/1990 into 4 January.",
      "New: a My IDP tab in Goals, with the person picker working — your own plan plus everyone cascaded below you. It is deliberately empty: what a single IDP line actually is has not been decided yet, and the page says what it is waiting for rather than guessing at a table it would have to be migrated off.",
    ],
  },
  {
    v: "3.0.1.9",
    date: "2026-08-18",
    module: "Goals · Tasking",
    items: [
      "New: Team Goals and Team KPIs, for anyone with people under them. Both tabs are hidden entirely for anyone who has nobody reporting to them — an empty tab reads as a fault rather than as an answer.",
      "Team means EVERYONE below you, walked down the whole line, not just your direct reports. A head of production now sees their supervisors' teams too, with a Direct / +2 / All switch and a chip showing who somebody sits under when they are not yours directly.",
      "Team Goals prints a block per person — INCLUDING the people holding nothing. That is the point of the tab: a team average of 64% looks healthy right up until you notice three of the eleven carry no goal at all, and an average is exactly where that hides.",
      "Team KPIs shows every key result area beneath you with what the goals filed under each one read, and every KPI somebody under you owns. It also counts how many of your people have no KRAs set at all.",
      "The My Key Result Areas dropdown now works for managers, not only admins: your own, plus everyone cascaded below you.",
      "A deliberate change to who can see what: managing somebody now lets you see what they are accountable for, even where a goal is marked Management or Stratcom. It does NOT let you edit it — their goals stay theirs to move. Without this the Team tabs would have shown a manager less than their team actually holds while looking complete, and quietly showing less is the one thing this section cannot do.",
      "Tasking: an All tasks button beside the three Show tick-boxes. Clearing all three has always meant \"show me everything\" — nobody could be expected to guess that, and \"nothing ticked\" looks like \"nothing shown\". Same state, with a name on it, and pressing it again puts the three back.",
    ],
  },
  {
    v: "3.0.1.8",
    date: "2026-08-18",
    module: "Job Delivery Board · Delivered Jobs · Admin",
    items: [
      "New: Required Run Rate, on both the Job Delivery Board and Delivered Jobs. It says what is left to bill, in how many days, and at what rate per month — for Sales Billing and for Throughput.",
      "It answers the question a running total cannot. ₹62 Cr billed against ₹100 Cr is extraordinary in April and a miss in March, so every figure is shown beside the pace the calendar says we should have kept by today: what should have been billed, and how far ahead or behind that leaves us.",
      "The bar carries both — the fill is where we are, the tick is where the pace says we should be. A fill short of the tick is the whole message.",
      "Ahead/behind is coloured against the PACE, not against the target. 40% of a year's target in month five is on track; colouring it red would make the card cry wolf from April.",
      "Targets are whole-year, set in Admin → Targets, and only raghu@nandan.co.in can change them. Every other admin sees them, sees who set them, and cannot edit. FY2026-27 starts at ₹100 Cr sales and ₹40 Cr throughput (migration 0025).",
      "Billed means delivered — a job counts on the day it went out of the door, not the day it was promised, so jobs still on the board are not in these numbers.",
      "Deliveries banked without a delivery date cannot be placed in a financial year. They are counted and named under the card rather than folded into the totals, so a percentage that is short says why it is short.",
      "On 1 April the year rolls over on its own. With no target set for the new year the card says exactly that, rather than carrying the old number forward.",
    ],
  },
  {
    v: "3.0.1.7",
    date: "2026-08-18",
    module: "Tasking · Morning Update",
    items: [
      "Fixed: renaming L2 to Leaders did not touch tasks already raised. The level is stored as the label itself, so every older task still read “L2 — Production Head” and By Escalations showed it as a separate lane. Migration 0024 rewrites them.",
      "New RJ Uploads section on Morning Update, visible only to the owner account. First card: Employee Master, from the HR sheet.",
      "The employee master is read by meaning rather than by exact column names — name, date of birth, joining date, department, designation, location — and everything else the sheet carries is kept as-is, so HR adding a column never needs a code change. The upload says how many carry a date of birth, and lists every column if it cannot find one.",
      "This is what the birthday list will read.",
    ],
  },
  {
    v: "3.0.1.5",
    date: "2026-08-18",
    module: "Sales Genie · Salespeople",
    items: [
      "A salesperson is now a Genie account, not a spelling. Every duplicate is merged: Santosh + Santosh Patra → Santosh, Nitu + Nitu Sharan → Nitu, Raghu + Raghunandan Jagdish → Raghu, Acharya → Acharya, each tied to their nandan.co.in login.",
      "The merge rewrites every deal, company, ToDo, support item, monthly stat and plan line that carried the old spelling — so nobody’s numbers are stranded under a name that no longer appears.",
      "The cause: the app added your display name to the team list whenever it did not match an existing entry. So “Raghu” was seeded, and “Raghunandan Jagdish” appeared the first time he signed in. It now recognises you by email instead, so it cannot happen again.",
      "Adding a salesperson asks which Genie account it is, and refuses a name with no account behind it — or an account already in the list under another name.",
      "A salesperson you added who is not on this list is left exactly as they are.",
    ],
  },
  {
    v: "3.0.1.4",
    date: "2026-08-18",
    module: "Delivered Jobs · OTD",
    items: [
      "OTD % on the card was the wrong definition — it counted how many jobs arrived on time. It now uses Dr Raghu’s formula, averaged over the period: (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100.",
      "The difference matters. A count says two jobs a day late and two a year late are the same result. This says how far off we ran, which is the part that can be improved.",
      "The median is shown next to the mean, because one job 592 days late moves the average several points on its own. Also shown: how many were on time or early, and the worst score in the period.",
      "Hover the ⓘ for the whole formula.",
    ],
  },
  {
    v: "3.0.1.3",
    date: "2026-08-18",
    module: "Tasking · Escalation",
    items: [
      "Escalate a task and it now asks Why escalated? — and will not let the task be raised without it. An escalation without a reason costs the person it lands on a phone call before they can do anything about it.",
      "Who is now typeable as well as pickable. Type a name or initials and the list narrows; the full list of accounts is still one click away. Scrolling a dropdown for a name you already know was the slowest part of raising a task.",
      "Needs migration 0023.",
    ],
  },
  {
    v: "3.0.1.2",
    date: "2026-08-18",
    module: "Admin · Users",
    items: [
      "Admin is now four tabs: Users, Milestones, Settings and Updates.",
      "Initials may be two OR three letters, still unique across everyone. Two had run out, and initials are not decoration — they are the key tasks are assigned by, so a collision is two people sharing a to-do list. Needs migration 0022.",
      "Department and Designation are set per person in Admin → Users. Goals reads both.",
      "“ERP owner name” is now “ERP User” — it is the Planning Owner in Jobmaster, which is the same person as the Project Owner.",
      "Goals access has moved into the Users table as a column. One row per person instead of the same people listed twice in two places.",
      "Last seen shows when each account last signed in, so a login nobody uses is visible.",
      "The Name column stays put while the rest of the table scrolls sideways.",
      "Send a password-reset email to anyone from Admin. The link goes to their own inbox, so nobody has to hand a password to anybody.",
    ],
  },
  {
    v: "3.0.1.1",
    date: "2026-08-18",
    module: "Header · Admin · Goals · Morning Update",
    items: [
      "Dates read dd-mm-yyyy everywhere. One format across the app, the ERP and anything printed, so 03-04-2026 is 3 April wherever you see it.",
      "An impossible date in an upload is corrected rather than dropped or crashed on. 31/11/2024 becomes 30/11/2024 — the last real day of that month — and the upload summary lists every one it moved. Before this, such a date reached the database as “2024-11-31” and would have failed the whole upload on one bad cell.",
      "Departments corrected: Supply Chain is Purchase, Finance is Accounts. Needs migration 0021.",
      "A goal or sub-goal assigned to a department now appears under Departmental Goals whatever tab it was created on — a company goal handed to Production was invisible to Production.",
      "Escalation L2 is now Leaders (was Production Head).",
      "The header shows Last Updated — when the Jobmaster export last landed — instead of a morning-file counter.",
      "Admin, Morning Update and Update to ERP have moved out of the tab bar and into the menu behind your initials, top right. Each is shown only to those entitled to it, so the tab bar is now the same four boards for everyone.",
      "Morning Update counts the files that are actually there, and its daily counter says so explicitly.",
      "Delivered Jobs: the job number is now a column of its own, beside the tag.",
    ],
  },
  {
    v: "3.0.1.0",
    date: "2026-08-18",
    module: "Delivered Jobs",
    items: [
      "Fixed: “12 Months” was showing 13. Counting twelve months back from today lands mid-month, so the window touched thirteen. It now means the last twelve calendar months, ending with this one.",
      "The chosen period says how many days of data it covers, next to the dates.",
      "Months run newest first.",
      "Nos, Value and Throughput each have their own bar in the breakdown table, and each bar carries a median mark — so a month reads as above or below a normal one, not just bigger or smaller than the biggest. Empty months are left out of the median: a month with no deliveries is not a low month.",
      "Two new columns on the jobs table. Delay Days = Actual Delivery Date − OTD Date, negative for early. OTD % = (1 − Delay Days ÷ (OTD Date − Actual Start Date)) × 100, so a slip is charged against the lead time that was undertaken — 30 days late on a 60-day job scores far worse than 30 days late on a 600-day job. Hover either heading for the formula.",
      "OTD % is left negative rather than floored at zero: a job that overran its whole promised lead time should read −100%, not 0%, or every disaster looks the same.",
      "All table figures are now 12px. They were 10px in places, which does not survive being shown on a screen across a room.",
    ],
  },
  {
    v: "3.0.0.3",
    date: "2026-08-17",
    module: "Delivered Jobs",
    items: [
      "Fixed: the page was reading only 1,000 of the 2,728 delivered jobs. Supabase caps any single request at 1,000 rows and ignores a larger limit, so the ledger was silently cut short — and it looked complete, which is worse. It now pages through the lot.",
      "Throughput reads whichever column the file carries. This export has no “Throughput Expected Value (Auto)”; it has a plain Throughput column worth about 160 Cr across 705 jobs, and that was showing as zero.",
      "New OTD % for the chosen period: jobs delivered on or before the OTD Date promised to the customer, over the jobs delivered in that period that carry a promised date. Hover the ⓘ for the formula in full.",
      "A job with no promised date is not counted as late. It is excluded and reported separately, because a missing date is a record-keeping gap rather than a delivery failure — and only 305 of 2,728 rows carry an OTD Date.",
      "OTD % also says how badly, not just how often: the average days over for the ones that ran late.",
      "The monthly table now runs newest first.",
    ],
  },
  {
    v: "3.0.0.2",
    date: "2026-08-17",
    module: "Morning Update · Delivered Jobs",
    items: [
      "Read the real Delivered Jobs export and fixed what it showed. It is recognised on its own now, without needing the right card — though the card still decides.",
      "It was never detected because it has no “Job Status” column at all: its status lives in a plain “Status” column reading Delivered / Installation Stage. 2,711 of 2,728 rows say Delivered, which would have identified the file instantly. The second test missed it by under five points — “Actual Delivery Date” is filled on 45.3% of rows against a 50% bar, because the history reaches back to 2014 and much of it predates the column.",
      "Four fields were being read from columns this file does not have, and were silently empty: status, owner, target date, and throughput. Status now reads Delivered on 2,711 rows, Planning Owner on 817, and a target date on 1,090.",
      "Throughput would have read zero for every delivery ever made. This export has no “Throughput Expected Value (Auto)” column — it carries a plain “Throughput” column instead, worth about 160 Cr across 705 jobs. Both are now read, whichever the file has.",
      "Planning Owner is the Project Owner under another name, and is now read as the owner.",
      "Delivery history spans 2014 to 2026, so the 12-month averages have real data behind them rather than reading “insufficient history”.",
      "New safety net in the other direction: a delivered upload is refused when most of its rows are jobs currently live on the board. That is the wrong-card mistake that would have made no noise — it would have marked live jobs delivered and turned their plans read-only.",
    ],
  },
  {
    v: "3.0.0.1",
    date: "2026-08-17",
    module: "Morning Update · Upload",
    items: [
      "The card you upload on now decides what the file is. Until now the app threw that away and guessed from the contents alone.",
      "That guess failed on the first real Delivered Jobs upload: 2,728 delivered jobs read as a jobs upload, and only the mass-archive guard stopped it retiring all 105 live jobs. The guard held, nothing was changed — but it was the last line of defence, not the first.",
      "Upload on the wrong card and it now refuses and says so, instead of doing the wrong merge quietly. Dropping the live jobs export on the Delivered card would have banked 105 live jobs as delivered and locked every one of their plans read-only.",
      "A mis-clicked card still cannot force the wrong shape through: the file must look like a Jobmaster export before it can be treated as one, so a ToDo or Projects file dropped on the Delivered card is still rejected.",
      "Content detection is unchanged and still guards the generic upload path — it is now the second opinion rather than the only one.",
    ],
  },
  {
    v: "3.0.0.0",
    date: "2026-08-17",
    module: "Genie 3 — everything on one line",
    items: [
      "Genie 3. Called by Dr Raghu, and the only reason the first digit ever moves.",
      "Everything built today is now on main, in one line, with no side branches left to reconcile: the rebuilt Goals section, the Delivered Jobs feed and its analysis workspace, and the migration fixes.",
      "🎯 Goals — six tabs: Company Goals, Quarterly Rocks, Departmental Goals, My Goals, My Key Result Areas and KPIs Relevant to me. Company goals are set by an admin alone; the person a goal lands on can move its current metric and status, and nothing else. Sub goals and initiatives cascade as a tree to any depth. % completion is computed from the start, current and goal metrics and cannot be typed over. Management / Stratcom / LC / All decides who sees what.",
      "✅ Delivered Jobs — Genie had never recorded a single delivery, because a delivered job simply stopped appearing in the morning export. It now has its own ledger, fed by a fourth report, and an analysis workspace over it: MTD / QTD / YTD / 12 Months / custom, Nos · Value · Throughput, monthly averages, and cuts by month, product family and customer.",
      "That workspace refuses to flatter itself. An average is withheld where the data does not span the window — four weeks of history will not be divided by twelve — and a delivery banked without a date is shown separately rather than folded into a period it may not belong to.",
      "Delivered Jobs now sits third on Morning Update, and stays marked “when it changes” rather than being chased daily.",
      "Fixed: re-running the migrations died on profiles_role_check, because migration 0008 re-applied a role list written before the sales role existed. Pasting the whole chain works again.",
      "Needs migrations 0019 and 0020, both already applied.",
    ],
  },
  {
    v: "2.8.0.1",
    date: "2026-08-17",
    module: "Morning Update",
    items: [
      "Delivered Jobs now sits third on Morning Update, above To Do Dashboard All — beside the jobs files it belongs with, rather than last.",
      "It stays marked “when it changes”, so the header still counts 3/3 for the three daily files and this card shows when it last landed instead of turning red for not being loaded today.",
    ],
  },
  {
    v: "2.8.0.0",
    date: "2026-08-17",
    module: "Delivered Jobs",
    items: [
      "The Delivered Jobs tab is no longer a placeholder. It reads the delivery ledger the fourth morning report feeds, and answers the question Genie could never answer: what actually went out of the door, and when.",
      "Pick a period with MTD, QTD, YTD, 12 Months or All, or set any From/To by hand. Quarters are the financial ones — Q1 is April to June, not January to March.",
      "Three headline numbers for the chosen period: Nos, Value and Throughput. Throughput reads Throughput Expected Value (Auto); the plain Throughput column is zero on every job in the database and is not used.",
      "Two monthly averages beside them — since 1 April, and over the last 12 months.",
      "An average is withheld rather than guessed. Delivery data has only existed since 23 July 2026, so a 12-month average would divide four weeks of work by twelve and read as a collapse in output. Where the data does not span the window, the card says “insufficient history”, names how many months it actually holds, and offers the average over those months instead.",
      "Deliveries banked without a date are counted and valued in their own amber panel, never folded into a period they might not belong to. That happens when the report’s date column is renamed, or the job was delivered before the column existed.",
      "Break the period down by month, product family or customer. Months with no deliveries are shown as empty rather than skipped — a gap in output is a fact worth seeing.",
      "On-time delivery is measured against the target date each job carried at the end, and always states how many jobs could actually be judged. Where none carry a target date it reads “—”, not 0%.",
      "The job table lists every delivery in the period with how many days early or late it ran against its target.",
      "Needs migration 0020_delivered_jobs.sql, and one upload of the Delivered Jobs report — that upload names the column the delivery date was read from.",
    ],
  },
  {
    v: "2.7.0.0",
    date: "2026-08-17",
    module: "Goals — rebuilt",
    items: [
      "The Goals section has been rebuilt from scratch. It now opens on six tabs: Company Goals, Quarterly Rocks, Departmental Goals, My Goals, My Key Result Areas and KPIs Relevant to me.",
      "Company Goals are set by an admin and by nobody else. Everyone else reads them — and works whatever sits under them with their name on.",
      "Quarterly Rocks are named projects for the quarter. A rock has no number of its own: it reads whatever the goals hung under it read.",
      "Every goal carries who it is assigned to — a person OR a department, picked on a radio button — a due date, and three numbers: start metric, current metric, goal metric.",
      "Sub goals and initiatives cascade below a goal as a tree, to any depth, with Expand all and Collapse all across the whole tab.",
      "% completion is decided by the metrics: (current − start) ÷ (goal − start). Nobody can type it. The same formula reads a reduction goal correctly — cutting rework from 100 to 50 and sitting at 75 is 50% done — so there is no direction to set wrongly.",
      "Where a goal has both its own numbers and items below it, the number wins and the items' average is marked on the bar beside it. A wide gap between the two is the thing worth talking about in a review.",
      "The editor's Completion panel shows the arithmetic as you type, with a what-if slider that scores a reading before you commit to it.",
      "Every goal, rock and KPI is marked Management, Stratcom, LC or All — any combination. Anything not marked All is hidden from everyone outside those bands, except the person it is assigned to, and admins. Hiding a goal hides everything under it.",
      "Key Result Areas are the standing areas a role is answerable for, assigned by an admin. Goals get filed under one, and the area then reads what they read.",
      "KPIs reach you for a stated reason — you own it, it is your department's, you were added as a watcher, or it measures a goal of yours. A KPI can also read its number straight from the live planning data, in which case nobody types it.",
      "Admin → ⚙ Setup inside Goals sets each person's department and bands, and names a head for each department who can then edit that department's goals.",
      "Needs migration 0019_goals_v2.sql. It is purely additive — the old goal tree is untouched and simply stops being read.",
    ],
  },
  {
    v: "2.6.2.2",
    date: "2026-08-17",
    module: "Morning Update · Upload",
    items: [
      "Fourth report on Morning Update: Delivered Jobs, straight from the Jobmaster “Delivered Jobs for Analysis” report. Until now Genie only ever saw jobs in progress — a delivered job simply vanished from the export, so the app never knew a single job had been delivered, or when.",
      "It is marked “when it changes”, not chased every morning: the header still counts 3/3 for the daily files, and this card shows the date it last landed instead of turning red.",
      "Delivered jobs are banked, never archived. Each upload adds to the history already held, so loading the file late or occasionally loses nothing.",
      "The upload tells you which column it read the delivery date from, and names every column in the file if it cannot find one — so a renamed column shows up immediately instead of quietly skewing the analysis.",
      "Safety: an upload that would archive more than 40% of the live board is now refused outright. The Delivered Jobs report carries the same columns as the in-progress file, and without this the wrong file in the wrong slot would have retired the entire board.",
    ],
  },
  {
    v: "2.6.2.1",
    date: "2026-08-17",
    module: "Tasking · By Projects",
    items: [
      "Every project row now has its own + Add task.",
      "The job is pre-picked as the last one in that project to deliver — a task raised on a project is nearly always about the work still ahead. Every other job in the project is one click away in the dropdown, each showing its target delivery date.",
      "With “include jobs without tasks” ticked, a project with no tasks yet still gets a row, so its first task can be added from here.",
    ],
  },
  {
    v: "2.6.2.0",
    date: "2026-08-17",
    module: "Tasking · Job Plan · Header · Admin",
    items: [
      "Nandan Tasking now has six views: By Jobs, By Projects, By Department, By Goals, By Escalations and Brain Dump.",
      "Three tick-boxes decide whose tasks you see — my tasks, tasks I assigned, and tasks of people reporting to me. All three are on when you open the page.",
      "Brain Dump is a private capture pad: type the task, add assignee, due date, category, escalation, project, job, goal and the details, and it drops below the line under its category. Each line is then ticked Done or pushed onto the board as a real task.",
      "“Reports to” is now set per person in Admin → User management — that is what feeds the reporting-line tick-box.",
      "Every Job Plan now carries a Genie Hint on the right of the header: a written read of how the job has been handled, what would actually move the delivery date, and everyone on it from the job owner down to each task assignee.",
      "Each milestone has a spanner beside its name — click it for the full detail (dates, crew, man-days, what it waits on, what it unblocks, and how it sits against Target Delivery). After the first click a hover is enough.",
      "Upload Excel moved out of the header and into the account menu, and is now limited to admins and Shweta.",
      "New Delivered Jobs tab next to Planning Suite — reserved, nothing in it yet.",
    ],
  },
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
