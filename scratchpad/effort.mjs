// How much time has gone into Genie, measured rather than guessed.
//
// The only honest record is the commit history, so that is what this reads.
// For each day it takes the FIRST and LAST commit and calls the span between
// them the working window. That is deliberately a window and not a total:
//
//   - it OVER-counts, because a day with a commit at 09:00 and one at 18:00
//     counts nine hours whether or not the middle was spent on Genie;
//   - it UNDER-counts, because thinking, specifying and reviewing happen
//     before the first commit and after the last.
//
// The two errors do not cancel, and neither is small. Printed with the working
// so nobody quotes the number without it.
//
//   node scratchpad/effort.mjs
import { execSync } from "node:child_process";

const log = execSync('git log --pretty="%ad" --date=format:"%Y-%m-%d %H:%M"', { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

const day = new Map();
for (const line of log) {
  const [d, t] = line.split(" ");
  const [hh, mm] = t.split(":").map(Number);
  const m = hh * 60 + mm;
  const cur = day.get(d) || { min: m, max: m, n: 0 };
  cur.min = Math.min(cur.min, m);
  cur.max = Math.max(cur.max, m);
  cur.n += 1;
  day.set(d, cur);
}

const days = [...day.entries()].sort();
let hours = 0;
console.log("date         commits   window   from    to");
for (const [d, v] of days) {
  const h = (v.max - v.min) / 60;
  hours += h;
  const f = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  console.log(`${d}  ${String(v.n).padStart(6)}   ${h.toFixed(1).padStart(5)}h   ${f(v.min)}  ${f(v.max)}`);
}

// Dr Raghu's own share. He specifies and reviews; he is not at the keyboard
// for every minute of the window. A RANGE, because a single number here would
// be false precision dressed up as measurement.
const LOW = 0.4, HIGH = 0.6;
console.log(`
commits            ${log.length}
days worked        ${days.length}
working window     ${hours.toFixed(1)} h   (sum of first->last commit each day)
Dr Raghu's share   ${(hours * LOW).toFixed(0)}-${(hours * HIGH).toFixed(0)} h   (${LOW * 100}-${HIGH * 100}% of the window)

Paste into EFFORT in src/lib/changelog.ts:

export const EFFORT = {
  measuredTo: "${days[days.length - 1][0]}",
  commits: ${log.length},
  days: ${days.length},
  windowHours: ${hours.toFixed(1)},
  raghuLow: ${Math.round(hours * LOW)},
  raghuHigh: ${Math.round(hours * HIGH)},
};`);
