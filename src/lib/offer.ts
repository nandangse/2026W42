import { LOGO } from "./logo";
import { esc, dmySlash as dmy } from "@/lib/fmt";
/**
 * Offer letters — the vocabulary, the numbering, and the standard words.
 *
 * Kept out of the route so the parts that decide what a letter SAYS can be
 * read (and tested) without a database in the way.
 */

/** Where an offer has got to. Nothing is deleted; an offer that failed says so. */
export const OFFER_STATUS = ["Draft", "Sent", "Accepted", "Joined", "Declined", "Expired"] as const;
export type OfferStatus = (typeof OFFER_STATUS)[number];

export const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Draft:    { bg: "#F4F2EC", fg: "#8A94A0" },
  Sent:     { bg: "#DCE8F5", fg: "#1B3A5C" },
  Accepted: { bg: "#FFF3E8", fg: "#8A5B00" },
  Joined:   { bg: "#E6F4EA", fg: "#0D7A3F" },
  Declined: { bg: "#FBEAE8", fg: "#B3392E" },
  Expired:  { bg: "#F4F2EC", fg: "#B3392E" },
};

/**
 * The kinds of file that belong to a candidate. The kind matters because on
 * joining, these flow into that person's Drive folder — and which ones go,
 * and under what name, is decided by this label rather than by a human
 * reading each file again.
 */
export const DOC_KINDS = [
  "Resume", "Interview notes", "Offer letter", "Appointment letter",
  "Acceptance", "ID proof", "Certificate", "Other",
] as const;

/** The seven pages, in the order they are filled. */
export const OFFER_STEPS = [
  { key: "person", label: "The person", hint: "Their details, the role, and the dates." },
  { key: "role", label: "Role, KPI & competency", hint: "What the job is, as this offer states it." },
  { key: "salary", label: "Salary", hint: "The agreed gross, and the structure it produces." },
  { key: "terms", label: "Terms of engagement", hint: "From Masters. Editable for this offer." },
  { key: "notes", label: "Internal notes", hint: "Ours. Never part of the letter." },
  { key: "review", label: "Review & send", hint: "The letter, the mail, and who it goes to." },
  { key: "docs", label: "Documents", hint: "Everything on file for this person. Goes into their Drive folder on joining." },
] as const;

/** NGSE/HR/OL/2026-27/017 — the financial year, then a running number. */
export function financialYear(d = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth(); // April starts the year
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function offerNumber(seq: number, d = new Date()): string {
  return `NGSE/HR/OL/${financialYear(d)}/${String(seq).padStart(3, "0")}`;
}

/** Today + 7, as the joining date usually is. */
export function defaultJoining(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export const iso = (d = new Date()) => d.toISOString().slice(0, 10);

/** The covering note, with the candidate's name put in. */
export function coveringLetter(template: string, name: string): string {
  return String(template || "").replace(/<name>/gi, name || "");
}

/**
 * Names off a resume arrive as "VINAY MANDE", "pooja pandey" or "Nitu SHARAN".
 * They go on a letter, so they are put into title case — but carefully:
 * initials (JC, K.) stay upper, particles (de, van) stay lower unless they
 * lead, and O'Brien / D'Souza / Anne-Marie keep their capital after the mark.
 */
const LOWER_PARTICLES = new Set(["de", "da", "di", "van", "von", "der", "den", "bin", "binte", "al", "el", "of", "and"]);

export function titleCase(raw: string): string {
  const words = String(raw || "").trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((w, i) => {
      if (!w) return w;
      // an initial that was already capitals stays as it was: JC, K., BR
      if (w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && LOWER_PARTICLES.has(lower.replace(/\./g, ""))) return lower;
      // capitalise after a space, an apostrophe, a hyphen, or Mc
      return lower
        .replace(/(^|['’\-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
        .replace(/^Mc([a-z])/, (_m, ch) => "Mc" + ch.toUpperCase());
    })
    .join(" ");
}

/**
 * Indian numbers only for now, so the country code lives in its own box and
 * the number itself is stored bare — no +91, no 0, no spaces. A number that
 * is not ten digits is left alone rather than mangled into looking right.
 */
export function splitPhone(raw: string): { code: string; number: string } {
  let d = String(raw || "").replace(/[^0-9]/g, "");
  // strip the country code however it was written: 0091…, 091…, 91…, 0…
  if (d.length === 14 && d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return { code: "+91", number: d };
}

/** What a resume is asked to give up. Kept here so the prompt and the form agree. */
export interface ResumeRead {
  name: string | null;
  email: string | null;
  mobile: string | null;
  address: string | null;
  current_employer: string | null;
  notes: string | null;
}

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"], description: "The candidate's full name as written" },
    email: { type: ["string", "null"] },
    mobile: { type: ["string", "null"], description: "Digits as written, with country code if given" },
    address: { type: ["string", "null"], description: "Postal address, or the city and state if that is all there is" },
    current_employer: { type: ["string", "null"] },
    notes: { type: ["string", "null"], description: "One line on what they do today. Nothing invented." },
  },
  required: ["name", "email", "mobile", "address", "current_employer", "notes"],
  additionalProperties: false,
} as const;

export const RESUME_SYSTEM =
  "You read one resume and return only what it actually says. This fills an offer letter, so a " +
  "wrong detail becomes a wrong letter sent to a real person.\n\n" +
  "Rules:\n" +
  "1. Copy values verbatim. Do not tidy, expand, translate or reformat a name or an address.\n" +
  "2. If something is not in the document, return null for it. NEVER guess, and never infer an " +
  "email from a name or a city from an employer.\n" +
  "3. The address is the candidate's own, not an employer's or a college's.\n" +
  "4. 'notes' is one plain line about what they do now, drawn from the document only.";

/* ─────────────────────────────────────────────────────────────────────────
 * The letter as e-mail.
 *
 * This renders the letter a SECOND time, in a way the screen does not: mail
 * clients strip stylesheets and classes, so every rule has to be inline and
 * the markup has to be plain. That is the reason for a second renderer, and
 * the only one — the CONTENT below comes from the same offer row the screen
 * draws, so the two cannot say different things.
 * ───────────────────────────────────────────────────────────────────────── */



const rupees = (n: unknown) => (n == null || n === "" ? "—" : Math.round(Number(n)).toLocaleString("en-IN"));

/** "a Contractor", "an Intern" — the article picked off the word, not guessed. */
export const withArticle = (w: string) => `${/^[aeiou]/i.test(w.trim()) ? "an" : "a"} ${w.trim()}`;

/**
 * ROLES AND RESPONSIBILITY, AS A LIST (Dr Raghu, 26 Sep 2026: "the roles and
 * resoonsibility should hve bullers").
 *
 * The register keeps a job description as one long line with a middle dot
 * between duties, which is how it was typed and is unreadable on a letter:
 * forty responsibilities in a single grey paragraph is a paragraph nobody
 * reads, and this is the annexure a person is being asked to agree to.
 *
 * Split on the dot and each duty gets its own line. A description already
 * written as a list is left exactly as it is — it was already right.
 */
export function bulletsHtml(html?: string | null): string {
  const raw = String(html || "").trim();
  if (!raw) return "";
  if (/<(ul|ol|li)\b/i.test(raw)) return raw;
  const parts = raw
    .replace(/<\/?(p|div|br)[^>]*>/gi, "\n")
    .split(/[·•]|\n+/)
    .map((x) => x.replace(/^[\s.;,-]+|[\s;,]+$/g, "").trim())
    .filter((x) => x.length > 1);
  if (parts.length < 2) return raw;
  return `<ul style="margin:4px 0 0;padding-left:20px">${parts
    .map((x) => `<li style="margin:0 0 4px">${/[.?!]$/.test(x) ? x : `${x}.`}</li>`)
    .join("")}</ul>`;
}



/** Plain text (the covering note) into paragraphs a mail client will honour. */
export function textToHtml(t: string): string {
  return String(t || "")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface LetterOffer {
  offer_no?: string | null; name?: string | null; address?: string | null;
  email?: string | null; mobile?: string | null; country_code?: string | null;
  offer_date?: string | null; joining_date?: string | null; type?: string | null;
  designation?: string | null; reporting_to?: string | null; probation_months?: number | null;
  agreed_gross?: number | null;
  salary?: { rows: { label: string; monthly: number | null; yearly: number | null; kind: string }[]; ctcLakhs: string } | null;
  role_doc?: { role?: string; purpose?: string; job_description?: string; deliverable?: string; metric?: string } | null;
  competencies?: { name: string; level: number }[] | null;
  terms?: string | null;
}

export function offerLetterHtml(d: LetterOffer, draft = false, withLetterhead = true): string {
  const S = {
    body: "font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.7;color:#16232F;max-width:680px",
    h: "font-weight:bold;font-size:15px;margin:22px 0 6px",
    td: "border:1px solid #DCD8CC;padding:5px 7px",
    right: "border:1px solid #DCD8CC;padding:5px 7px;text-align:right",
  };
  const sal = d.salary;
  const rows = (sal?.rows || []).map((r) => {
    const bold = r.kind === "head" || r.kind === "total";
    const bg = bold ? "background:#FFF9C4;" : "";
    if (r.kind === "note") return `<tr><td colspan="3" style="${S.td};font-size:12px;color:#46545F">${esc(r.label)}</td></tr>`;
    return `<tr style="${bg}${bold ? "font-weight:bold" : ""}"><td style="${S.td}">${esc(r.label)}</td><td style="${S.right}">${rupees(r.monthly)}</td><td style="${S.right}">${rupees(r.yearly)}</td></tr>`;
  }).join("");

  const rd = d.role_doc || {};
  /* The two ways to reach them, on the letter itself — a letter that names no
     address is a letter nobody can answer. */
  const contact = [d.email, d.mobile ? `${d.country_code || "+91"} ${d.mobile}` : ""].filter(Boolean).join("  ·  ");
  const section = (title: string, html?: string) => (html ? `<div style="${S.h}">${esc(title)}</div>${html}` : "");
  /* Annexure 2 starts its own page: the compensation table is what a person
     reads first and what they come back to, and a page that begins halfway
     down under a table belongs to the table above it. */
  const PAGE_BREAK = `<div style="page-break-before:always;break-before:page"></div>`;

  return `<div style="${S.body}">
<table width="100%" style="margin-bottom:14px;border-bottom:2px solid #16232F;padding-bottom:8px"><tr>
  <td><img src="${LOGO}" alt="Nandan GSE" style="height:30px;display:block"></td>
  <td align="right" style="font-family:Georgia,serif;font-size:10.5px;color:#8B8F87;line-height:1.5">
    Nandan GSE Private Limited<br>Khalapur, Maharashtra &middot; CBD Belapur, Navi Mumbai
  </td>
</tr></table>
<table width="100%" style="font-size:12px;color:#46545F;margin-bottom:8px"><tr>
  <td>Ref: ${esc(d.offer_no)}</td><td align="right">Date: ${dmy(d.offer_date)}</td>
</tr></table>
<div style="text-align:center;font-weight:bold;font-size:18px;letter-spacing:.04em">${draft ? "DRAFT OFFER LETTER" : "OFFER OF EMPLOYMENT"}</div>
<div style="text-align:center;font-size:12px;color:#8B8F87;margin-bottom:18px">Private &amp; Confidential</div>

<div><b>${esc(d.name)}</b></div>
${d.address ? `<div style="color:#46545F;white-space:pre-wrap">${esc(d.address)}</div>` : ""}
${contact ? `<div style="color:#46545F">${esc(contact)}</div>` : ""}

<p style="margin:16px 0 0">Dear ${esc(String(d.name || "").split(" ")[0])},</p>
<p>We are happy to have you join us for the role of <b>${esc(d.designation || rd.role)}</b>${d.type ? ` as ${esc(withArticle(String(d.type)))}` : ""}.</p>
<p>The roles and responsibility are as documented in Annexure 2.</p>
<p>Your offered gross monthly salary shall be <b>Rs. ${rupees(d.agreed_gross)}/-</b> as detailed in Annexure 1.</p>
<p>You shall join on or around <b>${dmy(d.joining_date)}</b>, reporting to <b>${esc(d.reporting_to)}</b>. Your probation period shall be <b>${esc(d.probation_months || 3)} months</b>. The terms and conditions of employment are as attached. The finalised hard copy shall be given on joining along with your roles and responsibilities.</p>

<div style="${S.h}">Annexure 1 — Compensation</div>
${sal ? `<table width="100%" style="border-collapse:collapse;font-size:13px">
  <tr style="font-weight:bold"><td style="${S.td}">Components of Compensation</td><td style="${S.right}">Monthly (Rs.)</td><td style="${S.right}">Yearly (Rs.)</td></tr>
  ${rows}
</table><p style="margin-top:6px"><b>CTC ≈ Rs ${esc(sal.ctcLakhs)} Lakhs per annum</b></p>` : "<p>To be confirmed.</p>"}

${PAGE_BREAK}
<div style="${S.h}">Annexure 2 — Roles and Responsibility</div>
${section("Purpose of the role", rd.purpose)}
${section("Job description", bulletsHtml(rd.job_description))}
${section("Key responsibility areas", bulletsHtml(rd.deliverable))}
${section("KPI metrics", bulletsHtml(rd.metric))}
${(d.competencies || []).length ? `<div style="${S.h}">Competencies expected</div><p>${(d.competencies || []).map((c) => `${esc(c.name)} <b>${esc(c.level)}/5</b>`).join(" &nbsp;·&nbsp; ")}</p>` : ""}

${section("Terms of Employment", d.terms || "")}

<p style="margin-top:26px">For Nandan GSE Pvt. Ltd.</p>
<p style="margin-top:24px"><b>Dr. Raghunandan Jagdish</b><br>Founder, Managing Director &amp; CEO</p>
<div style="border-top:1px solid #DCD8CC;margin-top:20px;padding-top:12px">
  <b>Acceptance</b><div>I, ${esc(d.name)}, accept the offer of employment on the terms set out above.</div>
  <div style="margin-top:20px;color:#8B8F87">Signature: ______________________ &nbsp; Date: ____________</div>
</div>
</div>`;
}
