"use client";
/**
 * SalesPerson Plan — targets per person per financial year, the numbers the
 * Dashboard measures every week against. Money is annual, activity is per
 * week, because that is how each is actually promised. Managers type;
 * everyone else reads their own row.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, GREEN } from "./palette";

interface Row { profile_id: string; name: string; initials: string | null; role: string; targets: Record<string, number> }

const COLS: { key: string; label: string; money?: boolean }[] = [
  { key: "booking", label: "Booking ₹/yr", money: true },
  { key: "billing", label: "Billing ₹/yr", money: true },
  { key: "collections", label: "Collections ₹/yr", money: true },
  { key: "quotation_value", label: "Quotations ₹/yr", money: true },
  { key: "quotation_nos", label: "Quotes nos/yr" },
  { key: "calls_wk", label: "Calls /wk" },
  { key: "visits_wk", label: "Visits /wk" },
  { key: "video_calls_wk", label: "Video /wk" },
  { key: "opps_wk", label: "Opps /wk" },
];

const fmtL = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : String(n));

export default function SalesPersonPlan() {
  const [fy, setFy] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [manage, setManage] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((f?: string) => {
    fetch(`/api/crm/salesplan${f ? `?fy=${encodeURIComponent(f)}` : ""}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setFy(j.fy); setRows(j.rows || []); setManage(!!j.manage); setNeeds(!!j.needsMigration);
      setEdit(Object.fromEntries((j.rows || []).map((row: Row) => [
        row.profile_id,
        Object.fromEntries(COLS.map((c) => [c.key, row.targets[c.key] ? String(row.targets[c.key]) : ""])),
      ])));
    }).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (profileId: string) => {
    setBusy(profileId); setErr("");
    try {
      const r = await fetch("/api/crm/salesplan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, fy, targets: edit[profileId] || {} }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      load(fy);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>◐ SalesPerson Plan</h2>
        <span className="rounded px-2 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12 }}>FY {fy || "…"}</span>
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "78ch", lineHeight: 1.6 }}>
        The numbers the Dashboard measures each week against. Money targets are for the YEAR; call, visit and
        opportunity targets are PER WEEK. {manage ? "Type and Save per row." : "Your own row, as agreed in review — the Sales Head sets it."}
      </p>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migration 0020 — the plan has nowhere to live yet.</div>}
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

      <div className="rounded-lg border" style={{ borderColor: BORDER, background: "#fff", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F4F6FA" }}>
              <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}`, minWidth: 160 }}>Salesperson</th>
              {COLS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right" style={{ borderBottom: `1px solid ${BORDER}`, fontSize: 10.5, whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
              {manage && <th style={{ borderBottom: `1px solid ${BORDER}` }} />}
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={COLS.length + 2} className="px-3 py-5 text-center" style={{ color: MUTED }}>loading…</td></tr>}
            {(rows || []).map((row) => (
              <tr key={row.profile_id} style={{ borderBottom: "1px solid #F2F4F8" }}>
                <td className="px-3 py-1.5">
                  <b style={{ color: INK }}>{row.name}</b>
                  <span style={{ fontSize: 10, color: MUTED }}> · {row.role}</span>
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 text-right">
                    {manage ? (
                      <input value={edit[row.profile_id]?.[c.key] ?? ""} inputMode="numeric"
                        onChange={(e) => setEdit((m) => ({ ...m, [row.profile_id]: { ...m[row.profile_id], [c.key]: e.target.value.replace(/[^0-9.]/g, "") } }))}
                        placeholder="—"
                        className="tnum rounded border px-1.5 py-0.5 text-right"
                        style={{ borderColor: BORDER, width: c.money ? 90 : 56, fontSize: 12 }}
                        title={c.money && edit[row.profile_id]?.[c.key] ? `₹${fmtL(Number(edit[row.profile_id][c.key]))}` : undefined} />
                    ) : (
                      <span className="tnum" style={{ color: row.targets[c.key] ? INK : "#C9CDD6", fontWeight: 700 }}>
                        {row.targets[c.key] ? (c.money ? `₹${fmtL(row.targets[c.key])}` : row.targets[c.key]) : "—"}
                      </span>
                    )}
                  </td>
                ))}
                {manage && (
                  <td className="px-2 py-1.5">
                    <button onClick={() => save(row.profile_id)} disabled={busy === row.profile_id}
                      className="rounded px-2.5 py-1 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 11 }}>
                      {busy === row.profile_id ? "…" : "Save"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
