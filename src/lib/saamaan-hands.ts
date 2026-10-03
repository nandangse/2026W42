/**
 * WHO A SLIP CAN GO TO (Dr Raghu, 3 Oct 2026: "The Submit to Store kitting
 * should only have three people in the dropdown: Neeraj Yadav, Ulhas, Rameez.
 * In the requisition it has to go to: Mukesh, Pradeep, Akshay, Shailaja.
 * Right now, everybody is in.").
 *
 * Named, not roled, because it is seven people and not a tier — the same
 * reasoning as lib/erp-hands. One list here, read by the MRP run's two
 * dropdowns; the slip route still checks only that the address is a Genie
 * account, so an older slip addressed to anyone else still opens.
 */
export const STORE_HANDS: { email: string; name: string }[] = [
  { email: "neeraj@nandan.co.in", name: "Neeraj Yadav" },
  { email: "ulhas@nandan.co.in", name: "Ulhas" },
  { email: "rameez@nandan.co.in", name: "Rameez" },
];
export const PURCHASE_HANDS: { email: string; name: string }[] = [
  { email: "mukesh@nandan.co.in", name: "Mukesh" },
  { email: "pradipp@nandan.co.in", name: "Pradip" },
  { email: "akshayp@nandan.co.in", name: "Akshay" },
  { email: "shailaja@nandan.co.in", name: "Shailaja" },
];

/**
 * WHO MAY WRITE THE ITEM MASTER BACK TO THE ERP (Dr Raghu, 3 Oct 2026):
 * "Rameez or Mukesh can also edit the cells … and then it will be pushed
 * back to the ERP" — and the merge button "is only going to be with Rameez
 * and Mukesh, and nobody else, not even Anup and Raghu, should even see
 * this button". ("rameez it is" — confirmed the same day.)
 */
export const ITEM_EDITORS = new Set(["mukesh@nandan.co.in", "rameez@nandan.co.in"]);
/** The merge: the two of them, and NOT the owner. */
export const ITEM_MERGERS = ITEM_EDITORS;
export const mayEditItems = (email: string, isOwner: boolean) => isOwner || ITEM_EDITORS.has(String(email || "").toLowerCase());
export const mayMergeItems = (email: string) => ITEM_MERGERS.has(String(email || "").toLowerCase());
