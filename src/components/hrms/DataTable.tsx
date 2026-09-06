"use client";
/**
 * The HRMS table. Every table in HRMS is this one.
 *
 * Dr Raghu's three standing rules for tables (22 Aug 2026), and how each is met:
 *
 *   1. THE HEADER IS FROZEN. `position: sticky; top: 0` on the header cells,
 *      inside a scrolling container. Scroll a thousand rows and the column
 *      names are still there.
 *
 *   2. COLUMNS CAN BE CHOSEN TO BE FROZEN. Click the pin on a column and
 *      everything up to and including it sticks to the left while the rest
 *      scrolls under it — the spreadsheet's own "freeze up to here", because
 *      that is the model everybody already has. Click the pin again to
 *      unfreeze. This is why every column must declare a width: the left
 *      offset of a frozen column is the sum of the widths before it, and it
 *      has to be known before the browser has laid anything out.
 *
 *   3. CLICKING A HEADER SORTS. First click ascending, second descending,
 *      third back to the table's own order. Numbers sort as numbers, dates as
 *      dates, blanks always last whichever way round it is — a column sorted
 *      descending that puts every empty cell on top is a column nobody can read.
 *
 * It also prints. See printPane() — the frozen positioning is undone for
 * print, because a sticky column on paper is just a column in the wrong place.
 */
import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  /** Fixed, in pixels. Needed for the freeze offsets — see rule 2 above. */
  width: number;
  align?: "left" | "right" | "center";
  /** The sortable, exportable, printable value. Keep it primitive. */
  value: (row: T) => string | number | null;
  /** Optional richer cell. Falls back to value(). */
  render?: (row: T) => ReactNode;
  /** Sort numerically rather than by text. */
  numeric?: boolean;
  title?: string;
}

type Dir = "asc" | "desc" | null;

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  activeKey,
  empty = "Nothing to show yet.",
  minWidth,
  maxHeight = "calc(100vh - 300px)",
  initialFrozen = 0,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeKey?: string | null;
  empty?: ReactNode;
  minWidth?: number;
  maxHeight?: string;
  /** How many leading columns start frozen. 0 = none. */
  initialFrozen?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir }>({ key: "", dir: null });
  const [frozen, setFrozen] = useState(initialFrozen);

  // Cumulative left offsets for the frozen columns.
  const offsets = useMemo(() => {
    const o: number[] = [];
    let x = 0;
    for (const c of columns) { o.push(x); x += c.width; }
    return o;
  }, [columns]);

  const sorted = useMemo(() => {
    if (!sort.dir) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      // blanks last, both directions — see rule 3
      const ea = va === null || va === "";
      const eb = vb === null || vb === "";
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (col.numeric) return (Number(va) - Number(vb)) * sign;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * sign;
    });
  }, [rows, sort, columns]);

  const click = (key: string) =>
    setSort((s) =>
      s.key !== key ? { key, dir: "asc" } : { key, dir: s.dir === "asc" ? "desc" : s.dir === "desc" ? null : "asc" },
    );

  const stick = (i: number, isHeader: boolean): React.CSSProperties =>
    i < frozen
      ? {
          position: "sticky",
          left: offsets[i],
          zIndex: isHeader ? 3 : 1,
          background: isHeader ? "#F4F2EC" : "inherit",
          // the seam between frozen and scrolling, so the eye knows which is which
          boxShadow: i === frozen - 1 ? "2px 0 0 #E2E0DA" : undefined,
        }
      : {};

  return (
    <div
      className="bg-white rounded-lg border hrms-table-wrap"
      style={{ borderColor: "var(--line)", overflow: "auto", maxHeight }}
    >
      <table className="text-xs genie-table" style={{ minWidth: minWidth ?? columns.reduce((s, c) => s + c.width, 0), width: "100%" }}>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const on = sort.key === c.key && sort.dir;
              return (
                <th
                  key={c.key}
                  title={c.title}
                  style={{
                    width: c.width,
                    minWidth: c.width,
                    position: "sticky",
                    top: 0,
                    zIndex: i < frozen ? 3 : 2,
                    background: "#F4F2EC",
                    borderBottom: "1px solid #E2E0DA",
                    textAlign: c.align || "left",
                    padding: "6px 8px",
                    color: "var(--dim)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    ...stick(i, true),
                  }}
                >
                  <span className="flex items-center gap-1" style={{ justifyContent: c.align === "right" ? "flex-end" : undefined }}>
                    <button
                      onClick={() => click(c.key)}
                      className="flex items-center gap-1"
                      style={{ color: on ? "var(--accent)" : "var(--dim)", fontWeight: 700 }}
                      title="Click to sort — again to reverse, a third time to clear"
                    >
                      {c.label}
                      <span style={{ fontSize: 9, opacity: on ? 1 : 0.35 }}>
                        {sort.key === c.key && sort.dir === "asc" ? "▲" : sort.key === c.key && sort.dir === "desc" ? "▼" : "⇅"}
                      </span>
                    </button>
                    <button
                      onClick={() => setFrozen((f) => (f === i + 1 ? 0 : i + 1))}
                      className="no-print"
                      style={{ fontSize: 9, opacity: i < frozen ? 1 : 0.25, marginLeft: "auto" }}
                      title={i < frozen ? "Unfreeze" : `Freeze the first ${i + 1} column${i ? "s" : ""}`}
                    >
                      📌
                    </button>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6" style={{ color: "var(--muted)" }}>
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((r) => {
            const k = rowKey(r);
            const active = activeKey === k;
            return (
              <tr
                key={k}
                role="button" tabIndex={0} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
                style={{ borderTop: "1px solid #EEECE6", background: active ? "#FFF7F0" : "#fff" }}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    style={{
                      width: c.width,
                      minWidth: c.width,
                      padding: "5px 8px",
                      textAlign: c.align || "left",
                      background: active ? "#FFF7F0" : "#fff",
                      ...stick(i, false),
                    }}
                  >
                    {c.render ? c.render(r) : (c.value(r) ?? <span style={{ color: "#C9C6BD" }}>—</span>)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** CSV of exactly what is on screen, in the column order shown. */
export function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const out = [columns.map((c) => esc(c.label)).join(",")];
  for (const r of rows) out.push(columns.map((c) => esc(String(c.value(r) ?? ""))).join(","));
  return out.join("\n");
}
