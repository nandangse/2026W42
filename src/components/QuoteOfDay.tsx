"use client";
// Quote of the day — shown once after login. "Don't show again today" is
// remembered per-browser (localStorage) until the date changes.
import { useEffect, useState } from "react";

const QUOTES: { q: string; by: string }[] = [
  { q: "Quality is never an accident; it is always the result of intelligent effort.", by: "John Ruskin" },
  { q: "The way to get started is to quit talking and begin doing.", by: "Walt Disney" },
  { q: "It is not the employer who pays the wages. He only handles the money. It is the customer who pays the wages.", by: "Henry Ford" },
  { q: "Plans are nothing; planning is everything.", by: "Dwight D. Eisenhower" },
  { q: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", by: "Abraham Lincoln" },
  { q: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", by: "Will Durant" },
  { q: "A goal without a plan is just a wish.", by: "Antoine de Saint-Exupéry" },
  { q: "Do the difficult things while they are easy and do the great things while they are small.", by: "Lao Tzu" },
  { q: "Quality means doing it right when no one is looking.", by: "Henry Ford" },
  { q: "Productivity is never an accident. It is always the result of a commitment to excellence, intelligent planning, and focused effort.", by: "Paul J. Meyer" },
  { q: "Whether you think you can, or you think you can't — you're right.", by: "Henry Ford" },
  { q: "The best way to predict the future is to create it.", by: "Peter Drucker" },
  { q: "Small daily improvements over time lead to stunning results.", by: "Robin Sharma" },
  { q: "Measure twice, cut once.", by: "Proverb" },
  { q: "Great things in business are never done by one person. They're done by a team of people.", by: "Steve Jobs" },
  { q: "Delay is the enemy of delivery — move the small things today.", by: "Shop-floor wisdom" },
];

const KEY = "nps-quote-hide-until";

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function QuoteOfDay() {
  const [show, setShow] = useState(false);
  const today = todayISO();

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== today) setShow(true);
    } catch {
      setShow(true);
    }
  }, [today]);

  if (!show) return null;

  // deterministic pick per date — everyone sees the same quote on a given day
  const idx = today.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % QUOTES.length;
  const { q, by } = QUOTES[idx];

  const hideToday = () => {
    try {
      localStorage.setItem(KEY, today);
    } catch {
      /* private mode — just close */
    }
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(13,22,31,0.7)", zIndex: 90 }}
      onClick={() => setShow(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-5 w-full"
        style={{ maxWidth: 440, borderTop: "5px solid #E8600A" }}
      >
        <div className="text-xs font-bold tracking-widest" style={{ color: "#E8600A" }}>
          ☀ QUOTE OF THE DAY
        </div>
        <div className="text-lg mt-3" style={{ color: "#16232F", lineHeight: 1.45 }}>
          &ldquo;{q}&rdquo;
        </div>
        <div className="text-sm mt-2 font-semibold" style={{ color: "#8A94A0" }}>
          — {by}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={hideToday}
            className="flex-1 py-2 rounded font-bold text-sm"
            style={{ background: "#22303C", color: "#fff" }}
          >
            Don&apos;t show again till tomorrow
          </button>
          <button
            onClick={() => setShow(false)}
            className="py-2 px-4 rounded font-bold text-sm border"
            style={{ borderColor: "#D9D6CD", color: "#5A6672" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
