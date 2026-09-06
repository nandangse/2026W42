"use client";

/**
 * THE standard Genie table (Dr Raghu, 28 Aug 2026: "make this the standard
 * genie table format", pointing at Kuber's Supplier Report Card). The rules
 * live in docs/GENIE-TABLE-STANDARD.md; this component IS the rules — dark
 * sticky header, zebra rows, right-aligned tnum numbers, click-to-sort,
 * top-right search, a quiet dot for nothing and one honest sentence when
 * the table is empty.
 */

import { useMemo, useState } from "react";

export type GenieColumn<R> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Present when the column sorts — returns the comparable value. */
  sort?: (r: R) => string | number;
  render: (r: R) => React.ReactNode;
  title?: string;
};

export default function GenieTable<R>({
  rows, columns, search, searchPlaceholder = "🔍 search", empty = "Nothing here yet.",
  maxHeight = "70vh", minWidth = 720, header,
}: {
  rows: R[] | null;
  columns: GenieColumn<R>[];
  /** Present when the table searches — answers whether a row matches. */
  search?: (r: R, q: string) => boolean;
  searchPlaceholder?: string;
  empty?: string;
  maxHeight?: string;
  minWidth?: number;
  /** Extra content on the toolbar row, left of the search box. */
  header?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [dir, setDir] = useState<1 | -1>(1);

  const shown = useMemo(() => {
    let out = rows ?? [];
    if (search && q.trim()) out = out.filter((r) => search(r, q.trim().toLowerCase()));
    const col = columns.find((c) => c.key === sortKey && c.sort);
    if (col?.sort) {
      const sv = col.sort;
      out = [...out].sort((a, b) => {
        const x = sv(a), y = sv(b);
        return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
      });
    }
    return out;
  }, [rows, columns, search, q, sortKey, dir]);

  const clickSort = (c: GenieColumn<R>) => {
    if (!c.sort) return;
    if (sortKey === c.key) { if (dir === 1) setDir(-1); else { setSortKey(""); setDir(1); } }
    else { setSortKey(c.key); setDir(1); }
  };

  return (
    <div>
      {(search || header) && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {header}
          {search && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="px-2 py-1 rounded border text-sm ml-auto" style={{ borderColor: "var(--line)", minWidth: 200 }} />
          )}
        </div>
      )}
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: "var(--line)", maxHeight }}>
        <table className="w-full text-xs" style={{ minWidth, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {columns.map((c) => (
                <th key={c.key}
                  className={`px-2 py-2 whitespace-nowrap text-${c.align ?? "left"}`}
                  style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: c.sort ? "pointer" : "default" }}
                  onClick={() => clickSort(c)}
                  title={c.title ?? (c.sort ? "Click to sort — again to flip, a third time to clear" : undefined)}>
                  {c.label}{sortKey === c.key ? (dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={columns.length} className="px-3 py-4" style={{ color: "var(--muted)" }}>Loading…</td></tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-5 text-center" style={{ color: "var(--muted)" }}>{empty}</td></tr>
            )}
            {shown.map((r, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 text-${c.align ?? "left"}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
