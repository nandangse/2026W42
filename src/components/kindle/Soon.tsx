"use client";
import { Card, K, serif } from "./shared";

/** The sections still to come, each saying what it will hold — the plan, on the page it will fill. */
const PLAN: Record<string, { title: string; phase: number; lines: string[] }> = {
  checkins: { title: "Check-ins", phase: 2, lines: ["One page per member — every check-in since August 2025, readable across months.", "The check-in form itself, with your own goals as its sections, replacing the Google Form.", "The facilitator's screen view for meeting day."] },
  goals: { title: "Goals", phase: 2, lines: ["Three professional and three personal goals for 2026-27, and last year's beside them.", "Status and a monthly word on each, written inside the check-in.", "The six reflection answers kept with the year's set."] },
  one21: { title: "1-2-1s", phase: 3, lines: ["The year's pairing plan, month by month.", "Each pair marks the meeting done with a note from both sides.", "Who is still owed this month, on Home."] },
  issues: { title: "Burning issues", phase: 3, lines: ["The sounding-board entry with its five questions.", "The nine themes from the June 2026 analysis, and which members sit under each.", "What was discussed in the room, and the outcome."] },
  polls: { title: "Polls", phase: 4, lines: ["Ask the group anything; one vote per member; closes on a date.", "Results the moment it closes, anonymous when the asker says so."] },
  board: { title: "Message board", phase: 4, lines: ["A topic, a thread, mentions by name.", "Later, the AI reads it to prepare the agenda."] },
  finances: { title: "Finances", phase: 4, lines: ["Monthly collections, the fines ledger, budget against spend.", "The treasurer marks paid; the amounts come from the constitution's rules.", "Niraj's opening balance seeds it."] },
  exercises: { title: "Exercises", phase: 4, lines: ["A member writes an exercise — questions, a reading — and the others take it.", "Answers kept per person; the off-site pre-work becomes the first three."] },
  gallery: { title: "Gallery", phase: 4, lines: ["An album per meeting and off-site; upload from the phone.", "Seeded from the Google Drive folder."] },
  settings: { title: "Settings", phase: 1, lines: ["The facilitator's gear. Ask Jigar or Dr Raghu."] },
};

export default function Soon({ section }: { section: string }) {
  const p = PLAN[section] || { title: section, phase: 9, lines: ["Not here yet."] };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ ...serif, margin: 0, fontSize: 24 }}>{p.title}</h1>
        <span style={{ fontSize: 12, color: K.muted }}>arrives in phase {p.phase}</span>
      </div>
      <ul style={{ marginTop: 12, color: K.dim, lineHeight: 1.7 }}>{p.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p style={{ fontSize: 12, color: K.muted, marginTop: 8 }}>The tables behind this section already exist; the screen follows in the order of the action plan.</p>
    </Card>
  );
}
