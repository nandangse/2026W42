/**
 * RFQs (Dr Raghu, 6 Oct 2026) — shared by Saamaan's desk and the Portal.
 */
import { ITEM_EDITORS, PURCHASE_HANDS } from "@/lib/saamaan-hands";

/** Who raises and sends RFQs: the purchase hands, the Item-master editors, the owner. Named. */
export const mayRfq = (email: string, isOwner: boolean) => {
  const e = String(email || "").toLowerCase();
  return isOwner || ITEM_EDITORS.has(e) || PURCHASE_HANDS.some((h) => h.email === e);
};

/**
 * THE MASTER'S DESCRIPTION, AS TEXT. The ERP keeps it as rich text — HTML,
 * often with two spaces where it means a line break. A supplier reads plain
 * words, so the tags go, the breaks stay, the entities are decoded.
 */
export function plainDescription(html: string | null | undefined, fallback = ""): string {
  const s = String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "’")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s || String(fallback || "").trim();
}
