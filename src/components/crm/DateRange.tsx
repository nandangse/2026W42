"use client";

/**
 * The date bar every analytical screen wears: Start – End, then MTD, QTD,
 * YTD (the default) and 12 Months. The quarters and the year run on the
 * financial year, April to March — this is an Indian manufacturer, and its
 * Q1 starts when the FY does.
 *
 * Picking a preset writes the dates; touching a date lets go of the preset.
 */

import { NAVY, MUTED, BORDER, ORANGE } from "./palette";

export type DateRange = { from: string; to: string; preset: string | null };

const day = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function fyStart(today: Date): Date {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(y, 3, 1);
}

export function presetRange(preset: string): DateRange {
  const now = new Date();
  const to = day(now);
  if (preset === "MTD") return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to, preset };
  if (preset === "QTD") {
    const fy = fyStart(now);
    const monthsIn = (now.getFullYear() - fy.getFullYear()) * 12 + now.getMonth() - 3;
    const q = Math.floor(((monthsIn % 12) + 12) % 12 / 3);
    return { from: day(new Date(fy.getFullYear(), 3 + q * 3, 1)), to, preset };
  }
  if (preset === "12M") {
    const d = new Date(now); d.setDate(d.getDate() - 365);
    return { from: day(d), to, preset };
  }
  return { from: day(fyStart(now)), to, preset: "YTD" };
}

export const DEFAULT_RANGE: DateRange = presetRange("YTD");

const PRESETS = [
  { key: "MTD", label: "MTD" },
  { key: "QTD", label: "QTD" },
  { key: "YTD", label: "YTD" },
  { key: "12M", label: "12 Months" },
];

export function DateRangeBar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <input
        type="date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value, preset: null })}
        className="px-2 py-1 rounded text-sm border"
        style={{ borderColor: BORDER, background: "#fff", width: 150 }}
      />
      <span className="text-xs" style={{ color: MUTED }}>to</span>
      <input
        type="date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value, preset: null })}
        className="px-2 py-1 rounded text-sm border"
        style={{ borderColor: BORDER, background: "#fff", width: 150 }}
      />
      <span style={{ width: 6 }} />
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(presetRange(p.key))}
          className="px-3 py-1 rounded-full text-xs font-bold border"
          style={
            value.preset === p.key
              ? { background: NAVY, borderColor: NAVY, color: "#fff" }
              : { background: "#fff", borderColor: BORDER, color: MUTED }
          }
        >
          {p.label}
        </button>
      ))}
      {value.preset === null && (
        <span className="text-xs font-semibold" style={{ color: ORANGE }}>custom range</span>
      )}
    </div>
  );
}
