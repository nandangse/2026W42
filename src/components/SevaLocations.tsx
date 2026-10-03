"use client";

/**
 * LOCATIONS (Dr Raghu, 3 Oct 2026): India | Out of India. In India, the map
 * with a dot per place, its area proportionate to the customers there;
 * click a dot and the table narrows to that place. Under it, every customer
 * at every place over the dates — assets, issues, cost, contracts and their
 * value — sortable by any column. The dates default to this financial year.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { dmy as fmtD, rupee } from "@/lib/fmt";
import { INDIA_RINGS } from "@/lib/india-outline";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", RED = "var(--red)";
const BLUE = "#1F6FB2";
const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : rupee(n));

interface LocRow { customer: string; place: string; state: string; country: string; raw: string; assets: number; issues: number; open: number; cost: number; billed: number; amcs: number; amc_value: number; amc_live: number; amc_live_value: number }
interface Dot { place: string; state: string; country: string; lat: number; lon: number; customers: number; issues: number; cost: number; assets: number }
interface Data {
  from: string; to: string; today: string;
  india: { customers: number; places: number; issues: number; cost: number; assets: number };
  abroad: { customers: number; countries: number; issues: number; cost: number };
  places: Dot[]; rows: LocRow[]; unplaced: { location: string; n: number }[]; unplaced_total: number;
}
type SortKey = keyof LocRow;

/* a plate carrée scaled for India's latitude (cos 22°), so the country keeps its shape — lon 68…97.5, lat 6.5…37.5 */
const W = 440, SX = W / 29.5, SY = SX / Math.cos((22 * Math.PI) / 180), H = Math.round(31 * SY);
const px = (lon: number) => (lon - 68) * SX;
const py = (lat: number) => (37.5 - lat) * SY;
const INDIA_PATH = INDIA_RINGS.map((ring) => ring.map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(" ") + " Z").join(" ");

export default function SevaLocations() {
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [tab, setTab] = useState<"india" | "abroad">("india");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [place, setPlace] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: "issues", d: -1 });

  const load = useCallback(() => {
    setErr("");
    fetch(`/api/seva/locations?from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data?.rows ?? []).filter((r) => (tab === "india" ? r.country === "India" : r.country !== "India"))
      .filter((r) => !place || r.place === place)
      .filter((r) => !needle || `${r.customer} ${r.place} ${r.raw} ${r.state} ${r.country}`.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      const v = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return v * sort.d;
    });
  }, [data, tab, place, q, sort]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ assets: t.assets + r.assets, issues: t.issues + r.issues, cost: t.cost + r.cost, amcs: t.amcs + r.amcs, amc_value: t.amc_value + r.amc_value, customers: t.customers.add(r.customer) }), { assets: 0, issues: 0, cost: 0, amcs: 0, amc_value: 0, customers: new Set<string>() }), [rows]);
  const dots = (data?.places ?? []).filter((p) => p.country === "India" && p.lat);
  const maxCust = Math.max(1, ...dots.map((d) => d.customers));
  const sortBy = (k: SortKey) => setSort((s) => (s.k === k ? { k, d: s.d === 1 ? -1 : 1 } : { k, d: typeof (rows[0]?.[k] ?? 0) === "number" ? -1 : 1 }));
  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th onClick={() => sortBy(k)} className={`px-2 py-2 ${right ? "text-right" : "text-left"} whitespace-nowrap cursor-pointer select-none`} style={{ position: "sticky", top: 0, background: "var(--ink)" }} title="sort">
      {children}{sort.k === k ? (sort.d === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Locations</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 760, lineHeight: 1.5 }}>Where the customers are, and what support they took over the dates — assets, tickets, cost, contracts. A dot&apos;s size is the customers at that place; click it to see them.</div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-1.5 py-1 text-sm tnum" style={{ borderColor: BORDER }} />
          <span className="text-xs" style={{ color: MUTED }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-1.5 py-1 text-sm tnum" style={{ borderColor: BORDER }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 customer, place" className="border rounded px-2 py-1 text-sm" style={{ borderColor: q ? ORANGE : BORDER, width: 180 }} />
        </div>
      </div>

      <div className="flex gap-1 mb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {([["india", `India${data ? ` · ${data.india.customers} customers at ${data.india.places} places` : ""}`], ["abroad", `Out of India${data ? ` · ${data.abroad.customers} customers in ${data.abroad.countries} countr${data.abroad.countries === 1 ? "y" : "ies"}` : ""}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setPlace(""); }} className="px-3 py-2 text-sm font-bold" style={{ color: tab === k ? INK : MUTED, borderBottom: `3px solid ${tab === k ? ORANGE : "transparent"}`, marginBottom: -1 }}>{l}</button>
        ))}
      </div>
      {err && <div className="rounded border px-3 py-2 text-sm mb-3" style={{ borderColor: RED, color: RED, background: "#FBEAE8" }}>{err}</div>}
      {!data && !err && <div className="text-sm" style={{ color: MUTED }}>placing…</div>}

      {data && tab === "india" && (
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "minmax(300px, 460px) 1fr" }}>
          <div className="bg-white rounded-lg border p-2" style={{ borderColor: BORDER }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="customers across India">
              <path d={INDIA_PATH} fill="#F3F1EB" stroke="#9C9A92" strokeWidth={0.8} fillRule="evenodd" />
              {dots.map((d) => {
                const r = 4 + 18 * Math.sqrt(d.customers / maxCust);
                const on = place === d.place;
                return (
                  <g key={d.place} role="button" style={{ cursor: "pointer" }} onClick={() => setPlace(on ? "" : d.place)}>
                    <circle cx={px(d.lon)} cy={py(d.lat)} r={r} fill={on ? ORANGE : BLUE} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5}>
                      <title>{`${d.place}${d.state ? `, ${d.state}` : ""}: ${d.customers} customer${d.customers === 1 ? "" : "s"} · ${d.issues} tickets · ${lakh(d.cost)} spent · ${d.assets} assets`}</title>
                    </circle>
                    {/* one label, for the biggest dot — the rest read on hover and in the table beside, so Mumbai, Navi Mumbai and Thane do not write over one another */}
                    {d.customers === maxCust && <text x={px(d.lon) + r + 3} y={py(d.lat) + 3} fontSize={9} fill="#22283A" fontWeight={700}>{d.place} {d.customers}</text>}
                  </g>
                );
              })}
            </svg>
            <div className="text-xs px-1" style={{ color: MUTED }}>dot area = customers at the place over the dates · click a dot to narrow the table{place ? <> · <button onClick={() => setPlace("")} className="font-bold" style={{ color: ORANGE }}>showing {place} ×</button></> : ""}</div>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[["CUSTOMERS", String(data.india.customers), `at ${data.india.places} places`], ["TICKETS", data.india.issues.toLocaleString("en-IN"), `${fmtD(data.from)} – ${fmtD(data.to)}`], ["COST SPENT", lakh(data.india.cost), "the ERP's cost on those tickets"], ["ASSETS SEEN", String(data.india.assets), "distinct machines on tickets and contracts"]].map(([l, v, s]) => (
                <div key={l} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
                  <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{l}</div>
                  <div className="text-xl font-bold tnum" style={{ color: INK }}>{v}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{s}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: 300 }}>
              <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                  <th className="px-2 py-1.5 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Place</th><th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Customers</th><th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Tickets</th><th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Cost</th>
                </tr></thead>
                <tbody>
                  {dots.map((d, i) => (
                    <tr key={d.place} role="button" tabIndex={0} onClick={() => setPlace(place === d.place ? "" : d.place)} className="border-t cursor-pointer" style={{ borderColor: "var(--line-soft)", background: place === d.place ? "#FFF7F3" : i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1 font-semibold">{d.place}<span style={{ color: MUTED, fontWeight: 400 }}>{d.state && d.state !== d.place ? ` · ${d.state}` : ""}</span></td>
                      <td className="px-2 py-1 text-right tnum font-bold">{d.customers}</td>
                      <td className="px-2 py-1 text-right tnum">{d.issues}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: d.cost ? INK : MUTED }}>{d.cost ? lakh(d.cost) : "·"}</td>
                    </tr>
                  ))}
                  {!!data.unplaced_total && (
                    <tr className="border-t" style={{ borderColor: "var(--line-soft)" }}>
                      <td className="px-2 py-1" style={{ color: MUTED }} title={data.unplaced.map((u) => `${u.location} (${u.n})`).join("\n")}>(unplaced — {data.unplaced.length} spellings the map does not know)</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>·</td><td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{data.unplaced_total}</td><td className="px-2 py-1 text-right" style={{ color: MUTED }}>·</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && tab === "abroad" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[["CUSTOMERS", String(data.abroad.customers)], ["COUNTRIES", String(data.abroad.countries)], ["TICKETS", String(data.abroad.issues)], ["COST SPENT", lakh(data.abroad.cost)]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{l}</div>
              <div className="text-xl font-bold tnum" style={{ color: INK }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "60vh" }}>
          <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1000 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              <Th k="customer">Customer</Th><Th k="place">Location</Th>{tab === "abroad" && <Th k="country">Country</Th>}
              <Th k="assets" right>No of assets</Th><Th k="issues" right>No of issues</Th><Th k="cost" right>Cost spent</Th><Th k="amcs" right>AMCs</Th><Th k="amc_value" right>AMC value</Th>
            </tr>
            <tr style={{ background: "#F3F1EB" }}>
              <td className="px-2 py-1.5 font-bold" colSpan={tab === "abroad" ? 3 : 2} style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>TOTAL — {totals.customers.size} customers, {rows.length} rows</td>
              <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{totals.assets}</td>
              <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{totals.issues}</td>
              <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{lakh(totals.cost)}</td>
              <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{totals.amcs}</td>
              <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{lakh(totals.amc_value)}</td>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.customer}|${r.place}`} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1 font-semibold" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.customer}</td>
                  <td className="px-2 py-1" title={r.raw}>{r.place}<span style={{ color: MUTED }}>{r.raw && r.raw !== r.place ? ` · ${r.raw.slice(0, 40)}` : ""}</span></td>
                  {tab === "abroad" && <td className="px-2 py-1" style={{ color: MUTED }}>{r.country}</td>}
                  <td className="px-2 py-1 text-right tnum">{r.assets}</td>
                  <td className="px-2 py-1 text-right tnum font-bold">{r.issues}{r.open ? <span style={{ color: RED, fontWeight: 400 }}> · {r.open} open</span> : null}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.cost ? INK : MUTED }}>{r.cost ? rupee(r.cost) : "·"}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.amcs ? INK : MUTED }}>{r.amcs || "·"}{r.amc_live ? <span style={{ color: "var(--green)" }}> ({r.amc_live} live)</span> : null}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.amc_value ? INK : MUTED }}>{r.amc_value ? rupee(r.amc_value) : "·"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-3 py-4 text-center" style={{ color: MUTED }}>Nothing here for these dates.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
