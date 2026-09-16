/**
 * THE FOLLOW-UP, WRITTEN THE WAY THE SENDER WOULD SAY IT.
 *
 * The rules here are Dr Raghu's "on the go email" skill, carried into Genie
 * so the same voice comes out of the app as comes out of a chat.
 *
 * THE PREMISE IS THE CONSTRAINT. The whole power of one of these messages is
 * that it could only have been written by somebody who was actually there,
 * typed on a phone in ninety seconds. Every rule below exists to protect
 * that, and most of them are about NOT doing something:
 *
 *   · Clever is worse than clear. Transfer what was said, do not compress
 *     it. A phrase that lands hard reads as something somebody sat down and
 *     crafted, which is the opposite of the claim the message is making.
 *
 *   · The em dash is not a style preference, it is a tell. It reads as
 *     machine written, and this message defeats itself the moment it looks
 *     generated. Same for the whole banned list.
 *
 *   · Nothing in it may be invented. The event is real, the conversation is
 *     real, and what is quoted was actually said. A warm message carrying a
 *     made-up detail is worse than no message, because now the sender is a
 *     stranger who made something up.
 *
 *   · An ask is not compulsory. "Keep warm" earns its place: without it,
 *     every friendly chat turns into a pitch, and a forced ask after a warm
 *     two-minute conversation is exactly what makes somebody not reply.
 *
 * WHAT IS DELIBERATELY NOT HERE: a template. Assembling these from stock
 * sentences sends the same message forty times, which is precisely what gets
 * a sender filtered. It is written fresh every time from the rules.
 */
import { anthropicClient, AI } from "@/lib/ai";

export type Reason = "supply" | "partnership" | "sourcing" | "referral" | "keep_warm" | "wrong_person";

export const REASONS: { key: Reason; label: string; ask: string }[] = [
  { key: "supply",        label: "Supply — I want them buying",        ask: "offer to send something, acceptable in one word" },
  { key: "partnership",   label: "Partnership — deeper than an order", ask: "suggest a proper conversation later" },
  { key: "sourcing",      label: "Sourcing — I want to buy from them", ask: "ask who handles that end" },
  { key: "referral",      label: "Referral — knows the buyer",         ask: "ask who looks after it" },
  { key: "keep_warm",     label: "Keep warm — nothing live",           ask: "NO ASK AT ALL. Leave a door open, do not push on it." },
  { key: "wrong_person",  label: "Wrong person, right company",        ask: "one question: is it them or somebody else" },
];

const BANNED = [
  "em dashes and en dashes (— –). Use a full stop or a comma.",
  "semicolons", "exclamation marks",
  "bullet points, bold, italics, any formatting at all",
  "links of any kind", "attachments of any kind",
  '"I hope this finds you well"',
  '"Great connecting" / "Great to connect"',
  '"reach out" / "circle back" / "touch base"',
  '"synergies" / "solutions" / "leverage" / "streamline"',
  '"Looking forward to hearing from you"',
  '"Please do not hesitate to"',
  "a Best regards block",
  "a signature block with title, address or logo",
];

export type Wrote = { subject: string; body: string };

export async function writeFollowUp(input: {
  channel: "email" | "whatsapp";
  name: string;
  company: string | null;
  jobTitle: string | null;
  context: string | null;
  event: string | null;
  reason: Reason;
  senderName: string;
  senderDoes: string | null;
  device: string | null;
  /** A few things this person has actually sent, for register only. */
  voice?: { subject: string | null; body: string }[];
}): Promise<Wrote> {
  const r = REASONS.find((x) => x.key === input.reason) ?? REASONS[4];
  const isMail = input.channel === "email";

  const system = [
    "You write one short follow-up message for somebody who has just met another person at an event.",
    "It is typed on a phone, in about ninety seconds, by the person who was standing there.",
    "",
    "THE ONE RULE THAT MATTERS MOST: clever is worse than clear.",
    "Transfer what was said. Do not compress it. Never sharpen a sentence to make it hit harder.",
    'Write "I am writing this just after our chat at your stand", not "Good talking just now".',
    'Write "You mentioned the delays on the last order are still causing you problems", not "You said the delays are what hurt".',
    "",
    "LENGTH: no word count. Write it the way they would say it out loud. Simple words only,",
    "nothing they would not use in speech. A sentence they could say in one breath.",
    "Four lines is normal, six is fine if it still sounds like talking.",
    "Complex words are the enemy, not length.",
    "",
    "NEVER USE ANY OF THESE:",
    ...BANNED.map((b) => "  - " + b),
    "Allowed punctuation: full stops, commas, question marks.",
    "",
    "EVERYTHING IN IT MUST BE TRUE. Use only what you are told below.",
    "Invent nothing: no claims about the sender, no details of the conversation that were not given,",
    "no numbers, no certifications. If you are given little, the message is simply shorter. That is fine.",
    "",
    `THE ENDING: ${r.ask}`,
    input.reason === "keep_warm"
      ? "There is NO question at the end. An email with no ask is allowed to exist and is not weaker."
      : "One question only, answerable with a single word. Never two asks.",
    "",
    isMail
      ? [
          "SUBJECT: lowercase, three or four words, carrying the connection, because the connection is why they open it.",
          "Never a capitalised headline. Never a description of an offer. The subject is a frame, not information.",
          "SIGN OFF: the sender's first name on its own line. No title, no company, no phone number.",
          input.device ? `Then one final line, exactly: ${input.device}` : "Nothing after the first name.",
        ].join("\n")
      : [
          "This is a WhatsApp message, not an email. No subject, no greeting block, no sign off.",
          "Shorter than an email would be: two or three sentences that read like one person typing to another.",
          "Start with their first name and a comma.",
        ].join("\n"),
    "",
    "Answer as JSON only: {\"subject\": \"...\", \"body\": \"...\"}.",
    isMail ? "" : 'For WhatsApp set "subject" to an empty string.',
  ].filter(Boolean).join("\n");

  /**
   * LEARNING THE VOICE FROM MAIL ACTUALLY SENT (Dr Raghu, 16 Sep 2026:
   * "have genie learn from my mails!").
   *
   * Real letters, from this person's own outbox, shown as EXAMPLES OF
   * REGISTER AND NOTHING ELSE. How long their sentences run, whether they
   * write "Dear" or "Hi", whether they sign off warmly or flatly.
   *
   * The danger is obvious and is guarded twice below: a model handed old
   * letters will lift facts out of them — a product, a price, a promise made
   * to somebody else entirely — and put them in a message to a stranger.
   * That is the one failure this whole app cannot survive, so the examples
   * are fenced hard: copy the manner, never the matter.
   */
  const voiceBlock = (input.voice || []).length
    ? [
        "",
        "HOW THIS PERSON ACTUALLY WRITES. Below are real messages they have sent.",
        "Use them for REGISTER ONLY: sentence length, how they greet, how they sign off, how formal they are.",
        "⛔ Do NOT take any fact, product, price, promise, name or company from them.",
        "⛔ Do NOT reuse their sentences. The message you write is about the person named above and nothing else.",
        "If these examples contradict the rules above, the rules above win.",
        "",
        ...(input.voice || []).slice(0, 4).map((v, i) =>
          `--- example ${i + 1} ---\n${v.subject ? `Subject: ${v.subject}\n` : ""}${v.body.slice(0, 700)}`),
      ].join("\n")
    : "";

  const facts = [
    `The person met: ${input.name}${input.jobTitle ? `, ${input.jobTitle}` : ""}${input.company ? `, at ${input.company}` : ""}.`,
    input.event ? `Where: ${input.event}.` : null,
    input.context ? `What happened, in the sender's own words: ${input.context}` : "No context was given, so say only that you met and ask the one question. Do not invent a conversation.",
    `The sender is ${input.senderName}.`,
    input.senderDoes ? `What the sender's company does: ${input.senderDoes}. Use AT MOST ONE fact from this, and only if it answers something the other person actually said. Otherwise leave it out entirely.` : "Nothing is known about the sender's company, so make no claim about it.",
  ].filter(Boolean).join("\n") + voiceBlock;

  const client = anthropicClient();
  const res = await client.messages.create({
    model: AI.FRONT,
    max_tokens: 900,
    system,
    messages: [{ role: "user", content: facts }],
  });

  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let out: Wrote;
  try { out = JSON.parse(json) as Wrote; }
  catch { throw new Error("The writer did not answer in the shape asked for. Try again."); }

  /**
   * THE BANNED CHARACTERS ARE ENFORCED, NOT REQUESTED.
   *
   * An em dash slipping through undoes the only thing the message has going
   * for it, and asking a model not to use one is not the same as it not
   * using one. This is the last gate before a human reads it.
   */
  const clean = (s: string) => String(s || "")
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/;/g, ",")
    .replace(/!/g, ".")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject: clean(out.subject).replace(/\.$/, ""), body: clean(out.body) };
}
