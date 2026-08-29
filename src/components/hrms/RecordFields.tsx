"use client";
/**
 * The pieces a record is drawn with, shared by the read-only lightbox and the
 * editable record page so the two can never drift apart.
 */
import { fmtFull } from "@/lib/schedule";
import type { FieldSpec, HrmsEmployee } from "@/lib/hrms";

export const C = {
  ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA",
  orange: "#E8600A", green: "#0D7A3F", red: "#B3261E",
};

export interface GenieUser { email: string; name: string | null; initials: string | null; role: string }

/** The value as it should read on screen — derived fields worked out here. */
export function display(f: FieldSpec, e: HrmsEmployee): string {
  if (f.derived) return f.derived(e.value) ?? "";
  const v = e.value[f.key];
  if (v == null || v === "") return "";
  if (f.kind === "bool") return v === "no" ? "no" : "yes";
  return String(v);
}

/** Read-only row. */
export function ReadField({ f, e }: { f: FieldSpec; e: HrmsEmployee }) {
  const v = display(f, e);
  const edited = f.key in e.edited;
  return (
    <div className="flex gap-3 px-3 py-1.5" style={{ borderTop: "1px solid #EEECE6" }}>
      <div className="text-xs font-semibold" style={{ color: C.faint, minWidth: 150, flexShrink: 0 }}>
        {f.label}
      </div>
      <div className="text-xs" style={{ wordBreak: "break-word", flex: 1 }}>
        {!v && <span style={{ color: "#C9C6BD" }}>—</span>}
        {v && f.kind === "url" && /^https?:\/\//i.test(v) ? (
          <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C", fontWeight: 600 }}>
            open ↗
          </a>
        ) : (
          v
        )}
        {edited && (
          <span title={`Edited by ${e.edited[f.key].by || "somebody"} on ${fmtFull(String(e.edited[f.key].at))}`}
            style={{ color: C.orange, marginLeft: 6 }}>•</span>
        )}
      </div>
    </div>
  );
}
