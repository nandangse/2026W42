/**
 * CLEAN DATABASE — the rules for deciding that two rows are one thing.
 *
 * Every one of these is a JUDGEMENT, not a fact, which is why nothing here
 * writes anything. It proposes, a person decides, and the ones that are
 * obviously wrong get dismissed for good.
 *
 * The measurement that shaped it (16 Sep 2026): among the 1,262 colliding
 * company names are "Kuldeep" four times and "Rahul Kumar" four times —
 * people's names used as a company, almost certainly four different people
 * at four different firms. A NAME ALONE IS NOT IDENTITY. So a group that
 * looks like a person's name is flagged as risky and sorted to the bottom,
 * and an address or a number — which identify far better than a name — are
 * treated as stronger evidence than a spelling.
 */

/** The company suffix, in every spelling seen in the data. */
const SUFFIX_RULES: { re: RegExp; write: string }[] = [
  { re: /\b(p\s*v\s*t|private)\.?\s*(l\s*t\s*d|limited)\.?\s*$/i, write: "Pvt Ltd" },
  { re: /\bp\.?\s*ltd\.?\s*$/i,                                    write: "Pvt Ltd" },
  { re: /\b(ltd|limited)\.?\s*$/i,                                 write: "Ltd" },
  { re: /\bl\.?\s*l\.?\s*p\.?\s*$/i,                               write: "LLP" },
  { re: /\bincorporated\.?\s*$/i,                                  write: "Inc" },
  { re: /\binc\.?\s*$/i,                                           write: "Inc" },
  { re: /\bcorporation\.?\s*$/i,                                   write: "Corp" },
  { re: /\b(co|company)\.?\s*$/i,                                  write: "Co" },
];

/**
 * The name as it should be written: spacing tidied, and the legal suffix in
 * one spelling. Nothing else is touched — the words before the suffix are
 * the company's own and are not ours to restyle.
 */
export function tidyCompanyName(raw: string): string {
  let n = String(raw || "").replace(/\s+/g, " ").replace(/\s*,\s*$/, "").trim();
  if (!n) return n;
  for (const r of SUFFIX_RULES) {
    if (r.re.test(n)) { n = n.replace(r.re, r.write); break; }
  }
  return n.replace(/\s+/g, " ").trim();
}

/** The key two spellings of one company collide on. */
export function companyKey(raw: string): string {
  return String(raw || "").toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(pvt|private)\s+(ltd|limited)\b/g, " pvtltd ")
    .replace(/\bp\s+ltd\b/g, " pvtltd ")
    .replace(/\b(ltd|limited)\b/g, " ltd ")
    .replace(/\bllp\b/g, " llp ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does this look like a person rather than a firm?
 *
 * Two or three capitalised words and no company word in sight. Merging these
 * is how four different Kuldeeps become one, so they are proposed last and
 * marked.
 */
const FIRMISH = /\b(pvt|ltd|limited|llp|inc|corp|co|company|industr|engineer|technolog|solution|service|system|trading|enterprise|international|export|import|group|works|agenc|associat|steel|electric|automation|machin|plastic|rubber|paint|transport|logistic|packag|energy|power|aviation|airport|airlines?|handling|cargo|hotel|travel|infra|construct|motors?|auto|tools?|equipment|global|india|overseas|impex|udyog)\b/i;
export function looksLikeAPerson(name: string): boolean {
  const n = String(name || "").trim();
  if (!n || FIRMISH.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3;
}

/**
 * A NUMBER AS WHATSAPP WANTS IT: +<country code><number>, nothing else in it.
 *
 * The default country is India because that is where all but a handful of
 * these numbers are, and a ten-digit Indian mobile carries no country code of
 * its own. Anything that cannot be read confidently is LEFT ALONE and said
 * so — a wrongly "corrected" number reaches a stranger, which is worse than
 * an ugly one that still reaches the right person.
 */
export function tidyPhone(raw: string, defaultCc = "91"): { to: string | null; why: string } {
  const s = String(raw || "").trim();
  if (!s) return { to: null, why: "empty" };
  if (/[a-z]/i.test(s.replace(/^\s*(tel|mob|ph|phone|mobile)[.: ]*/i, ""))) return { to: null, why: "has letters in it" };

  /* More than one number in the field is a decision, not a format. */
  const parts = s.split(/[,/;]|\s{2,}|\bor\b/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) return { to: null, why: "looks like more than one number" };

  let d = s.replace(/[^\d+]/g, "");
  const hadPlus = d.startsWith("+");
  d = d.replace(/\+/g, "");
  d = d.replace(/^00/, "");                       // 0091… is a written country code
  if (!d) return { to: null, why: "no digits" };

  if (hadPlus) {
    if (d.length < 8 || d.length > 15) return { to: null, why: "too short or too long to be a number" };
    return { to: `+${d}`, why: "already carried its country code" };
  }
  if (d.length === 10) return { to: `+${defaultCc}${d}`, why: `ten digits, so +${defaultCc}` };
  if (d.length === 11 && d.startsWith("0")) return { to: `+${defaultCc}${d.slice(1)}`, why: `a leading 0 dropped, so +${defaultCc}` };
  if (d.length === 12 && d.startsWith(defaultCc)) return { to: `+${d}`, why: "already an Indian number without its plus" };
  if (d.length >= 11 && d.length <= 15) return { to: `+${d}`, why: "read as a country code already in front" };
  return { to: null, why: `${d.length} digits — cannot be read confidently` };
}

/** The last ten digits, which is what two numbers actually collide on. */
export const phoneKey = (raw: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};
