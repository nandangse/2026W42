/**
 * WHAT TO CALL SOMEBODY (Dr Raghu, 7 Sep 2026: "why Dr ?").
 *
 * His page opened "Dear Dr", because the greeting took the first word of the
 * name and the first word was an honorific. A man is not called by his title
 * — Dr Raghunandan Jagdish is Raghunandan, Col K R Acharya is Acharya, since
 * initials are not a name either.
 */
const HONORIFIC = /^(dr|mr|mrs|ms|miss|col|capt|maj|lt|shri|smt|sri|md|prof)\.?$/i;
const INITIAL = /^[A-Za-z]\.?$/;

/** The name to greet a person by. Never an honorific, never a bare initial. */
export function firstName(full: string | null | undefined): string {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  const real = parts.filter((w) => !HONORIFIC.test(w));
  const spoken = real.filter((w) => !INITIAL.test(w));
  // a name of nothing but initials keeps its last real word — K R Acharya
  return spoken[0] || real[real.length - 1] || parts[0] || "";
}
