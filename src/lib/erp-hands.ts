/**
 * WHO MAY TOUCH THE ERP — one list, named once.
 *
 * Dr Raghu, 16 Sep 2026: "make this available to pankaj, mukesh and me", of
 * the Synchronize to ERP door and the hourly refresh. Restated 26 Sep 2026
 * of Saamaan's ERP pull: "this pull from ERP should be available from Mukesh
 * and pankaj also."
 *
 * IT IS ONE LIST BECAUSE IT IS ONE DECISION. The hourly refresh already knew
 * these three; Saamaan's pull was still checking isOwner, so the same
 * question had two answers in two files and only one of them got updated
 * when he changed his mind. A permission written twice is a permission that
 * will disagree with itself.
 *
 * NAMED, NOT ROLED. It is three people and a fourth for the morning files,
 * not a tier — inventing a role nobody asked for would hide who can actually
 * do this behind a word.
 *
 * Nothing here writes to the ERP. Every door this list guards only READS
 * nandanerp into Genie's own mirror.
 */
export const ERP_HANDS = new Set([
  "raghu@nandan.co.in",
  "pankajs@nandan.co.in",   // Pankaj Sutar — Planning
  "mukesh@nandan.co.in",    // Mukesh Tiwari — Purchase and Stores
]);

/** The three above, plus Shweta, who brings the morning files in. */
export const ERP_HANDS_WITH_FILES = new Set([...ERP_HANDS, "shweta@nandan.co.in"]);

export const mayTouchErp = (email: string | null | undefined): boolean =>
  ERP_HANDS.has(String(email || "").trim().toLowerCase());

/** Said the same way wherever it is refused, so the answer is recognisable. */
export const ERP_HANDS_REFUSAL = "The ERP door is Raghu, Pankaj and Mukesh.";
