import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

/**
 * THE FIRST PASSWORD FOR /idp (Dr Raghu, 7 Sep 2026).
 *
 * "NGSE in caps, then two alphabets of his first name, two alphabets of his
 * last name, and the last two digits are random two digits and an asterisk."
 *
 * So Vikash Ruhela becomes NGSEViRu47*. It is memorable, it is his own
 * shape, and the two random digits are what stop one person guessing
 * another's from the pattern. He asked NOT to force a change on first use.
 */
export function makePassword(fullName: string): string {
  // an honorific is not a name — Dr Raghunandan Jagdish is Ra, not Dr
  const HONORIFIC = /^(dr|mr|mrs|ms|miss|col|capt|maj|lt|shri|smt|sri|md)\.?$/i;
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean).filter((w, i, a) => !(HONORIFIC.test(w) && a.length > 1));
  const letters = (w: string) => (w || "").replace(/[^A-Za-z]/g, "");
  const two = (w: string, fallback: string) => {
    const l = letters(w);
    if (!l) return fallback;
    return (l[0].toUpperCase() + (l[1] || l[0]).toLowerCase());
  };
  const first = two(parts[0] || "", "Xx");
  // the LAST name, not the middle one — a man with three names is known by his last
  const last = two(parts.length > 1 ? parts[parts.length - 1] : "", "Yy");
  const digits = String(randomInt(10, 100));      // 10–99, always two
  return `NGSE${first}${last}${digits}*`;
}

/** salt + sha-256, hex. Enough for a temporary password on an internal page. */
export function hashPassword(pw: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${pw}`).digest("hex");
}
export const newSalt = () => randomBytes(16).toString("hex");

/** Constant-time, so a wrong password cannot be found a character at a time. */
export function passwordMatches(pw: string, salt: string, hash: string): boolean {
  const a = Buffer.from(hashPassword(pw, salt), "hex");
  const b = Buffer.from(String(hash || ""), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
