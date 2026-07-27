"use client";
// Quote of the day — shown once after login, fetched from the collection in the
// database (600+ quotes, extendable by an admin upload). Everyone sees the same
// quote on a given day. "Don't show again" is remembered per-browser until the
// date changes.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const KEY = "nps-quote-hide-until";

interface Quote {
  body: string;
  author: string;
  category: string;
  original: boolean;
}

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function QuoteOfDay() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [show, setShow] = useState(false);
  const today = todayISO();

  useEffect(() => {
    let hidden = false;
    try {
      hidden = localStorage.getItem(KEY) === today;
    } catch {
      /* private mode — treat as not hidden */
    }
    if (hidden) return;
    // only fetch when we actually intend to show it
    api
      .get("/api/quotes/today")
      .then((r) => {
        if (r?.quote) {
          setQuote(r.quote);
          setShow(true);
        }
      })
      .catch(() => {
        /* quotes are decorative — never block the app on them */
      });
  }, [today]);

  if (!show || !quote) return null;

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
        style={{ maxWidth: 460, borderTop: "5px solid #E8600A" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xs font-bold tracking-widest" style={{ color: "#E8600A" }}>
            ☀ QUOTE OF THE DAY
          </div>
          {quote.category && (
            <div className="text-xs font-semibold" style={{ color: "#8A94A0" }}>
              {quote.category}
            </div>
          )}
        </div>

        <div className="text-lg mt-3" style={{ color: "#16232F", lineHeight: 1.45 }}>
          &ldquo;{quote.body}&rdquo;
        </div>

        <div className="text-sm mt-2 font-semibold" style={{ color: "#8A94A0" }}>
          — {quote.author || "Unattributed"}
          {quote.original && (
            <span
              className="ml-2 rounded px-1.5 py-0.5 font-bold"
              style={{ background: "#F3EEFB", color: "#7C3AED", fontSize: 10 }}
              title="From the original Nandan collection"
            >
              ORIGINAL
            </span>
          )}
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
