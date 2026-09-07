/**
 * The amount in words, for the foot of the slip (Dr Raghu, 7 Sep 2026: "in
 * the bottom show also Net paid and also with the amount in words"). Indian
 * grouping — crore, lakh, thousand — because that is how the number is read
 * aloud here. Used only when the register did not already carry the words.
 */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const under100 = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
const under1000 = (n: number): string =>
  n < 100 ? under100(n) : `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${under100(n % 100)}` : ""}`;
export function wordsOf(v: number | null | undefined): string {
  let n = Math.round(Number(v) || 0);
  if (n <= 0) return "Zero";
  const parts: string[] = [];
  const take = (div: number, label: string) => {
    const q = Math.floor(n / div);
    if (q > 0) { parts.push(`${under1000(q)} ${label}`); n -= q * div; }
  };
  take(1e7, "Crore"); take(1e5, "Lakh"); take(1000, "Thousand");
  if (n > 0) parts.push(under1000(n));
  return parts.join(" ");
}
