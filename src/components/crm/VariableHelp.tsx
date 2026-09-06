"use client";
/**
 * WHAT VARIABLES EXIST — shown wherever one might be typed.
 *
 * "please put these variables in the settings so that I know. Also in the
 * templates page showcase this" (Dr Raghu, 31 Aug 2026), having written
 * {{user_name}} into a WhatsApp — a name that does not exist and would have
 * gone out as braces.
 *
 * The list comes from the code that fills them, so the screen cannot promise
 * a variable the renderer has never heard of. WHAT EACH ONE NEEDS is given
 * equal weight: {{name}} on a message sent to a bare phone number renders
 * EMPTY, and a variable that silently disappears misleads exactly as much as
 * one that prints its own braces.
 */
import { VARIABLE_CATALOGUE } from "@/crm/variables";
import { NAVY, NAVY_SOFT, MUTED, BORDER } from "./palette";

export default function VariableHelp({ compact }: { compact?: boolean }) {
  const statics = "Plus every Message Variable you have saved below — {{belapur_address}}, {{khalapur_address}} and the rest — which need nothing and read the same everywhere.";
  return (
    <div className="rounded p-3" style={{ background: NAVY_SOFT, border: `1px solid ${BORDER}` }}>
      <div className="text-sm font-bold mb-1" style={{ color: NAVY }}>
        The variables you can type
      </div>
      <div className="text-xs mb-2" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
        Write them in double braces — <code>{"{{name}}"}</code>. Spaces inside are fine.
        A name that is <b>not</b> on this list is left exactly as typed, so a spelling mistake
        shows up on your screen rather than on a customer&apos;s phone.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: "2px 16px" }}>
        {VARIABLE_CATALOGUE.map((v) => (
          <div key={v.key} className="text-xs" style={{ lineHeight: 1.7 }}>
            <code style={{ color: NAVY, fontWeight: 700 }}>{`{{${v.key}}}`}</code>
            <span style={{ color: "var(--dim)" }}> — {v.what}</span>
            {v.needs !== "nothing" && (
              <span style={{ color: MUTED }}> · needs {v.needs}</span>
            )}
          </div>
        ))}
      </div>
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>{statics}</div>
      <div className="text-xs mt-1" style={{ color: "#8A6D1A", lineHeight: 1.6 }}>
        <b>Where it says &ldquo;needs a contact&rdquo;, it means it.</b> A WhatsApp sent to a phone number
        typed by hand has no person behind it, so {"{{name}}"} renders empty — pick the recipients from
        the CRM and it fills.
      </div>
    </div>
  );
}
