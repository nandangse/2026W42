"use client";
// Quote of the day — shown once after login, plus on demand via the header
// button. Quotes are bundled as static data (src/lib/quotes-data.ts), NOT
// stored in the database. Everyone sees the same quote on a given day, and the
// collection cycles fully before anything repeats.
import { useEffect, useState } from "react";
import { QUOTES } from "@/lib/quotes-data";

const KEY = "nps-quote-hide-until";
const DAY_MS = 86400000;

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Same quote for everyone on a given date; cycles the whole list. */
function quoteFor(iso: string) {
  const dayNo = Math.floor(Date.parse(iso + "T00:00:00Z") / DAY_MS);
  return QUOTES[((dayNo % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

/** The quote as a panel on My Week — always there, nothing to dismiss. */
export function QuoteCard() {
  const quote = quoteFor(todayISO());
  if (!quote) return null;
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA", borderTop: "3px solid #F5B32B" }}>
      <div className="text-xs font-bold mb-1" style={{ color: "#8A94A0", letterSpacing: 1.1 }}>QUOTE OF THE DAY</div>
      <div className="text-sm" style={{ color: "#22303C", lineHeight: 1.55 }}>{quote.q}</div>
      <div className="text-xs mt-1 flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold" style={{ color: "#8A94A0" }}>— {quote.by}</span>
        {quote.cat && <span style={{ color: "#B8B5AC" }}>{quote.cat}</span>}
      </div>
    </div>
  );
}

/**
 * @param trigger increment to force the quote open on demand (header button),
 *        bypassing the don't-show-again-today flag.
 */
export default function QuoteOfDay({ trigger = 0 }: { trigger?: number }) {
  const [show, setShow] = useState(false);
  const today = todayISO();
  const quote = quoteFor(today);

  // auto-show once per day
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== today) setShow(true);
    } catch {
      setShow(true); // private mode — still show it
    }
  }, [today]);

  // manual open — always shows, even after dismissing for the day
  useEffect(() => {
    if (trigger) setShow(true);
  }, [trigger]);

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
          {quote.cat && (
            <div className="text-xs font-semibold" style={{ color: "#8A94A0" }}>
              {quote.cat}
            </div>
          )}
        </div>

        <div className="text-lg mt-3" style={{ color: "#16232F", lineHeight: 1.45 }}>
          &ldquo;{quote.q}&rdquo;
        </div>

        <div className="text-sm mt-2 font-semibold" style={{ color: "#8A94A0" }}>
          — {quote.by || "Unattributed"}
          {quote.orig && (
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
