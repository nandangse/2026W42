/** a thirty-minute, HMAC-signed token naming one person's slip on one month — the WhatsApp helper fetches with it, no login (7 Oct 2026) */
import { sessionSecret } from "@/lib/session-secret";
import { createHmac, timingSafeEqual } from "node:crypto";
const SECRET = () => sessionSecret();
const sign = (s: string) => createHmac("sha256", SECRET()).update(s).digest("hex").slice(0, 32);
export function makeToken(sheet: string, emp: string, hours = 0.5) {
  const exp = Date.now() + hours * 3600 * 1000;
  const body = `${sheet}.${emp}.${exp}`;
  return `${body}.${sign(body)}`;
}
export function readToken(t: string): { sheet: string; emp: string } | { error: string } {
  const parts = String(t || "").split(".");
  if (parts.length !== 4) return { error: "Bad token." };
  const [sheet, emp, exp, sig] = parts;
  const want = sign(`${sheet}.${emp}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return { error: "Bad token." };
  if (Number(exp) < Date.now()) return { error: "The link has expired — open the person again from Genie." };
  return { sheet, emp };
}
