# The Genie Table Standard

Declared by Dr Raghu, 28 Aug 2026, pointing at Kuber's Supplier Report Card:
**"make this the standard genie table format."** Every new table in any Genie
module follows this; existing tables adopt it as they are next touched.

## The look

- **Header row**: background `#22303C`, white bold text, `position: sticky;
  top: 0` so it floats while rows scroll. The table lives inside a container
  with `overflow: auto` and a `maxHeight` (≈68–72vh).
- **Alignment**: first (identity) column left; every number right-aligned
  with the `tnum` class; dates right or center, never mixed per column.
- **Zebra rows**: alternate `#FAF9F5`; row separators `1px solid #EFEDE7`.
- **Money** speaks the module's one voice — Kuber's ₹/Lakhs/Crores picker,
  the main app's `V()` mask. Never a third notation in one screen.
- **Colour is meaning, not decoration**: red `#B3261E` = overdue/negative,
  amber `#D97706` = warning, green `#0D7A3F` = healthy, muted `#8A94A0` =
  secondary. Status/grade chips: rounded, bold, white text on the meaning's
  colour.
- **Empty cells** show a quiet `·`, not a zero — zero is a fact, blank is
  an absence.
- **Search** sits top-right of the table, filtering as you type.
- **Sortable** headers where ordering helps: click to sort, again to flip,
  a third time to clear (the Pending Material pattern); the resting order is
  the one you'd work down.
- **Empty state** is one honest sentence in the table body, not a blank.

## The code

`src/components/GenieTable.tsx` implements all of it. New screens use it:

```tsx
<GenieTable
  rows={rows}
  search={(r, q) => r.party.toLowerCase().includes(q)}
  columns={[
    { key: "party", label: "Party", align: "left", render: (r) => <b>{r.party}</b> },
    { key: "total", label: "Net", align: "right", sort: (r) => r.total,
      render: (r) => <span className="tnum">{fmt(r.total)}</span> },
  ]}
  empty="Nothing here — upload the Tally files first."
/>
```

Hand-rolled tables are allowed only when the screen genuinely cannot fit the
shape (kanbans, print pages, the 13-week grid) — and even then they keep the
colours, the sticky header and the zebra.
