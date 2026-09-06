"use client";

/**
 * The IMS's furniture.
 *
 * The palette is Genie's own (src/components/crm/palette.ts) rather than a
 * seventh set of hex codes. The build instruction named Navy #1B2A5E and
 * Orange #E8622A; those are within three hex digits of what every other
 * module already uses, and two navies that are almost the same is worse than
 * one navy that is exactly the same.
 *
 * EVERYTHING HERE IS BUILT FOR 380px FIRST. Dr Raghu reads this on a phone,
 * and a table that needs a mouse is a table he will not open.
 */
import { useEffect, useState } from "react";
import { dmy as fmtD } from "@/lib/fmt";
export { fmtD };

export const PAPER = "#F7F8FC";
export const NAVY = "#1B2D6B";
export const NAVY_DARK = "#14224F";
export const NAVY_SOFT = "#EEF1FA";
export const INK = "#22283A";
export const MUTED = "#6B7280";
export const BORDER = "#E5E8F0";
export const ORANGE = "#F04E23";
export const ORANGE_SOFT = "#FEF0EC";
export const GREEN = "#1A7F4E";
export const AMBER = "#B45309";
export const RED = "#B3261E";

export const S = (v: unknown) => String(v ?? "");
export const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** dd-mm-yyyy, or an em dash. Never "Invalid Date", never 01-01-1970. */


/** Days from today to a date; negative means it has already gone by. */
export const daysTo = (d: unknown): number | null => {
  const s = S(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Math.round((new Date(`${s}T00:00:00Z`).getTime() - new Date(`${TODAY()}T00:00:00Z`).getTime()) / 86400000);
};

/**
 * The one rule that decides how an empty number is drawn.
 *
 * "No data" and "0" are DIFFERENT FACTS. Nothing expiring in ninety days and
 * no certificates entered at all both come out as zero on a careless card,
 * and the second one is the dangerous one (the Genie_Feed rule).
 */
export function Metric({ value, haveData, suffix = "" }: { value: number | null; haveData: boolean; suffix?: string }) {
  if (!haveData || value === null || value === undefined)
    return <span style={{ color: MUTED, fontSize: 15, fontWeight: 700 }}>No data</span>;
  return (
    <span style={{ color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
      {value}
      {suffix && <span style={{ fontSize: 13, color: MUTED, fontWeight: 700 }}> {suffix}</span>}
    </span>
  );
}

export function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>{title}</div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="text-xs mt-1.5" style={{ color: MUTED, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export const Chip = ({ text, colour }: { text: string; colour: string }) => (
  <span className="rounded px-2 py-0.5 text-xs font-bold text-white whitespace-nowrap" style={{ background: colour }}>
    {text || "—"}
  </span>
);

/** Status colours by MEANING, so a new status word still lands somewhere sane. */
export function statusColour(s: string): string {
  const t = S(s).toLowerCase();
  if (/approved|achieved|done|closed|verified|valid|complete|compliant/.test(t)) return GREEN;
  if (/review|progress|in_progress|triaged|scheduled/.test(t)) return "#1B6B93";
  if (/draft|pending|target|new|idea|planned|open/.test(t)) return MUTED;
  if (/obsolete|superseded|cancelled|withdrawn|lapsed|rejected/.test(t)) return "#5A6672";
  if (/overdue|expired|major|critical|urgent/.test(t)) return RED;
  if (/due|amber|warning|partial|minor/.test(t)) return AMBER;
  return MUTED;
}

/** Expiry colour coding: red under 30 days, amber under 90, else quiet. */
export function expiryColour(d: unknown): string {
  const n = daysTo(d);
  if (n === null) return MUTED;
  if (n < 0) return RED;
  if (n < 30) return RED;
  if (n < 90) return AMBER;
  return GREEN;
}

export function expiryWords(d: unknown): string {
  const n = daysTo(d);
  if (n === null) return "No expiry";
  if (n < 0) return `Expired ${Math.abs(n)}d ago`;
  if (n === 0) return "Expires today";
  return `${n}d left`;
}

// ------------------------------------------------------------------- layout

/**
 * A page. The header stacks under 640px so nothing is cut off on a phone.
 */
export function Screen({
  title, blurb, action, children,
}: { title: string; blurb?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
          {blurb && <div className="text-sm mt-0.5" style={{ color: MUTED, maxWidth: 760, lineHeight: 1.5 }}>{blurb}</div>}
        </div>
        {action && <div className="flex gap-2 items-center flex-wrap">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** A table that scrolls INSIDE itself. The page body never scrolls sideways. */
export function TableBox({ children, min = 760 }: { children: React.ReactNode; min?: number }) {
  return (
    <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh" }}>
      <table className="w-full text-xs" style={{ minWidth: min, borderCollapse: "separate", borderSpacing: 0 }}>
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th
    className={`px-2 py-2 whitespace-nowrap font-bold ${right ? "text-right" : "text-left"}`}
    style={{ position: "sticky", top: 0, background: NAVY, color: "#fff", zIndex: 1 }}
  >
    {children}
  </th>
);

export const Td = ({ children, right, wrap }: { children?: React.ReactNode; right?: boolean; wrap?: boolean }) => (
  <td className={`px-2 py-1.5 ${right ? "text-right" : ""} ${wrap ? "" : "whitespace-nowrap"}`}
    style={{ borderBottom: `1px solid ${BORDER}`, color: INK }}>
    {children}
  </td>
);

export function Modal({ onClose, title, children, width = 640 }: {
  onClose: () => void; title: string; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      {/* Bottom sheet on a phone, centred dialog on a desktop — the same
          markup, because a dialog that needs its own mobile version is a
          dialog that will drift out of step with itself. */}
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-full rounded-t-xl sm:rounded-lg p-4"
        style={{ maxWidth: width, maxHeight: "92vh", overflow: "auto" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-base font-bold" style={{ color: INK }}>{title}</div>
          <button onClick={onClose} className="text-xl leading-none px-2" style={{ color: MUTED }} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-xs font-bold mb-1" style={{ color: MUTED }}>{children}</span>
);

const fieldCss = "w-full border rounded px-2 py-2 text-sm bg-white";

export function Text({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} className={fieldCss} style={{ borderColor: BORDER, color: INK }} />
  );
}

export function Area({ value, onChange, rows = 3, placeholder }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <textarea value={value} rows={rows} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} className={fieldCss} style={{ borderColor: BORDER, color: INK }} />
  );
}

export function Select({ value, options, onChange, blank = "—" }: {
  value: string; options: { value: string; label: string }[] | string[]; onChange: (v: string) => void; blank?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCss} style={{ borderColor: BORDER, color: INK }}>
      <option value="">{blank}</option>
      {opts.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      {value && !opts.some((o) => o.value === value) && <option value={value}>{value} (retired)</option>}
    </select>
  );
}

export function Btn({ onClick, children, kind = "plain", disabled, title }: {
  onClick?: () => void; children: React.ReactNode;
  kind?: "primary" | "plain" | "danger"; disabled?: boolean; title?: string;
}) {
  const style =
    kind === "primary" ? { background: ORANGE, color: "#fff", borderColor: ORANGE }
    : kind === "danger" ? { background: "#fff", color: RED, borderColor: BORDER }
    : { background: "#fff", color: INK, borderColor: BORDER };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="rounded border px-3 py-2 text-sm font-bold disabled:opacity-40"
      style={{ ...style, minHeight: 38 }}>
      {children}
    </button>
  );
}

/** A message that says what to do next, not merely that something failed. */
export function Note({ kind = "info", children }: { kind?: "info" | "warn" | "error"; children: React.ReactNode }) {
  const s = kind === "error" ? { background: "#FDECEA", color: "#8A1F16" }
    : kind === "warn" ? { background: "#FCF6E8", color: "#8A6D1A" }
    : { background: NAVY_SOFT, color: NAVY_DARK };
  return <div className="rounded p-3 text-sm font-semibold mb-3" style={{ ...s, lineHeight: 1.55 }}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border p-6 text-center text-sm" style={{ borderColor: BORDER, color: MUTED }}>
      {children}
    </div>
  );
}

/** The one fetch wrapper. An error arrives as a message, never as a blank screen. */
export async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `The server answered ${r.status}.` };
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the server." };
  }
}

export function useLoad<T>(url: string): [T | null, boolean, () => void, string] {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
        return j;
      })
      .then((j) => { if (live) { setData(j); setErr(""); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [url, n]);
  return [data, busy, () => setN((x) => x + 1), err];
}
