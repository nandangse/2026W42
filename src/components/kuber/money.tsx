"use client";

/**
 * Kuber's one money voice (Dr Raghu, 28 Aug 2026): ₹ / Lakhs / Crores chosen
 * ONCE at the top, and every dashboard and record in the module speaks it.
 * The choice is remembered on this browser and survives reloads.
 *
 * The management-review sheet mixed all three notations in adjacent cells —
 * this is the cure: one selector, one convention, everywhere at once.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";

export type MoneyUnit = "rs" | "lakh" | "cr";
const KEY = "kuber.moneyUnit";

const Ctx = createContext<{ unit: MoneyUnit; setUnit: (u: MoneyUnit) => void }>({ unit: "lakh", setUnit: () => {} });

export function MoneyProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<MoneyUnit>("lakh");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "rs" || v === "lakh" || v === "cr") setUnitState(v);
    } catch (e) { swallow("kuber/money", e); /* fine */ }
  }, []);
  const setUnit = (u: MoneyUnit) => {
    setUnitState(u);
    try { localStorage.setItem(KEY, u); } catch (e) { swallow("kuber/money", e); /* fine */ }
  };
  return <Ctx.Provider value={{ unit, setUnit }}>{children}</Ctx.Provider>;
}

/** fmt: the full money string. num: the bare scaled figure for dense grids. */
export function useMoneyFmt() {
  const { unit, setUnit } = useContext(Ctx);
  const fmt = (v: number | null | undefined) => {
    const n = Number(v) || 0;
    if (unit === "rs") return `₹${Math.round(n).toLocaleString("en-IN")}`;
    if (unit === "cr") return `₹${(n / 1e7).toFixed(2)} Cr`;
    return `₹${(n / 1e5).toFixed(1)} L`;
  };
  const num = (v: number | null | undefined) => {
    const n = Number(v) || 0;
    if (unit === "rs") return Math.round(n).toLocaleString("en-IN");
    if (unit === "cr") return (n / 1e7).toFixed(2);
    return (n / 1e5).toFixed(1);
  };
  const label = unit === "rs" ? "₹" : unit === "cr" ? "₹ crores" : "₹ lakhs";
  return { unit, setUnit, fmt, num, label };
}

/** The three chips worn on Kuber's header. */
export function UnitPicker() {
  const { unit, setUnit } = useMoneyFmt();
  const CHOICES: [MoneyUnit, string][] = [["rs", "₹"], ["lakh", "Lakhs"], ["cr", "Crores"]];
  return (
    <div className="flex gap-0.5 rounded p-0.5" style={{ background: "#0D161F", border: "1px solid #22303C" }}
      title="One voice for every number in Kuber — the choice is remembered">
      {CHOICES.map(([u, l]) => (
        <button key={u} onClick={() => setUnit(u)}
          className="rounded px-2 py-1 text-xs font-bold"
          style={unit === u ? { background: "var(--amber)", color: "var(--navy)" } : { color: "#8FA1B3" }}>
          {l}
        </button>
      ))}
    </div>
  );
}
