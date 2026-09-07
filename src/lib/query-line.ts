/**
 * ONE SENTENCE PER QUERY (Dr Raghu, 7 Sep 2026: "in the HR queries make it a
 * one sentence of all the queries he has raised. The ones raised by Vinay are
 * also important.").
 *
 * A query is stored as the form dump — the question Genie asked, then the
 * ticks, then whatever the person actually typed. On a list that reads as
 * "HR query" over and over, and the one line that matters ("please give me
 * site allowance as I am staying in Dhamani village") is hidden behind a
 * chevron. This pulls that line out.
 *
 * The order of preference is the order of usefulness: what the person wrote
 * in their own words, then the reason on an application, then the boxes they
 * ticked, and only then the subject — which is where we started.
 */

/** Lines the form itself put there. Not the person speaking. */
const PROMPT =
  /(^questions about\b|^i have an issue\b|^i need help\b|^if there is any other issue|please mention it here\.?$|:$)/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function queryLine(question: string | null | undefined, subject?: string | null): string {
  const lines = String(question || "").split(/\r?\n/).map(tidy).filter(Boolean);

  const reason = lines.map((l) => /^reason\s*:\s*(.+)$/i.exec(l)?.[1]).find(Boolean);
  const bullets = lines.filter((l) => /^[•\-*]/.test(l)).map((l) => tidy(l.replace(/^[•\-*]\s*/, "")))
    .filter((l) => l && !/^other:?\s*other$/i.test(l));
  const own = lines.filter((l) => !PROMPT.test(l) && !/^[•\-*]/.test(l) && !/^(kind of leave|from|to|reason|amount|days|item|size|qty|what|why|recover)\s*:/i.test(l));

  const pick = own.length ? own.join(" ") : reason ? String(reason) : bullets.length ? bullets.join(", ") : "";
  const out = tidy(pick) || tidy(String(subject || ""));
  // one sentence: stop at the first full stop that ends a word, not a decimal
  const stop = out.search(/[.!?](\s|$)/);
  const one = stop > 24 ? out.slice(0, stop + 1) : out;
  return one.length > 160 ? `${one.slice(0, 157).trimEnd()}…` : one;
}

/** True when the stored subject says nothing — the generic ones HR raises. */
export const genericSubject = (s: string | null | undefined) =>
  !String(s || "").trim() || /^(hr query|query|application)$/i.test(String(s).trim());
