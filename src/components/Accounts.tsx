"use client";

/**
 * Kuber — the accounts module's shell (Dr Raghu, 28 Aug 2026). Kuber keeps
 * the wealth; this module keeps the books.
 *
 * The door, the header and the navbar go up first so the module has an address
 * and a grant (the tick on Admin → accounts_access) before it has a ledger.
 * The sections listed here are the intended shape; each pane says plainly that
 * the books arrive next. Granular roles inside Accounts come later, as roles.
 */

import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/changelog";
import ModuleMenu from "@/components/ModuleMenu";

/** Today in IST, for the upload screen's date default. */
const TODAY_IST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

interface KuberUpload {
  id: string; kind: "masters" | "transactions"; for_date: string; name: string;
  bytes: number | null; by: string | null; initials: string | null; at: string;
  drive_synced_at: string | null; url: string | null;
}

/**
 * The Tally XML uploads — Kuber's first working screen (Dr Raghu, 28 Aug
 * 2026). A date, two tiles (Masters / Transactions), and the ledger of every
 * upload beneath. Each file lands in Genie at once; the Drive sync then files
 * it on Google Drive under "date - initials", which is the audit he asked for.
 */
function UploadFiles() {
  const [forDate, setForDate] = useState(TODAY_IST);
  const [rows, setRows] = useState<KuberUpload[] | null>(null);
  const [busy, setBusy] = useState<"" | "masters" | "transactions">("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/kuber/upload", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setRows(j.uploads || []))
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const up = async (kind: "masters" | "transactions", f: File | null) => {
    if (!f) return;
    setBusy(kind); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", kind);
      fd.append("for_date", forDate);
      const r = await fetch("/api/kuber/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).error || "The upload failed");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const Tile = ({ kind, label }: { kind: "masters" | "transactions"; label: string }) => (
    <label className="rounded-lg border p-4 flex-1 cursor-pointer text-center"
      style={{ borderColor: "#E2E0DA", background: busy === kind ? "#F4F2EC" : "#fff", minWidth: 220 }}>
      <div className="text-2xl mb-1">⬆</div>
      <div className="text-sm font-bold" style={{ color: "#16232F" }}>{label}</div>
      <div className="text-xs mt-1" style={{ color: "#8A94A0" }}>
        {busy === kind ? "Uploading…" : "Click to choose the XML"}
      </div>
      <input type="file" accept=".xml,text/xml,application/xml" className="hidden" disabled={!!busy}
        onChange={(e) => { up(kind, e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </label>
  );

  return (
    <div>
      <div className="bg-white rounded-lg border p-4 mb-3" style={{ borderColor: "#E2E0DA", maxWidth: 720 }}>
        <div className="text-lg font-bold mb-1" style={{ color: "#16232F" }}>⬆ Upload Files</div>
        <div className="text-sm mb-3" style={{ color: "#5A6672", lineHeight: 1.6 }}>
          The two Tally exports, dated. Each upload is kept in Genie and filed on Google Drive under
          a <b>date – initials</b> folder, so who loaded what is always auditable.
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>DATE</span>
          <input type="date" value={forDate} onChange={(e) => setForDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: "#E2E0DA" }}
            title="The date the export is OF — not necessarily today" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <Tile kind="masters" label="Tally XML Masters" />
          <Tile kind="transactions" label="Tally XML Transactions" />
        </div>
        {msg && <div className="text-xs font-bold mt-2" style={{ color: "#B3261E" }}>{msg}</div>}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: "#E2E0DA", maxWidth: 900, maxHeight: "50vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 640, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {["Date", "Kind", "File", "By", "Uploaded", "On Drive"].map((h) => (
                <th key={h} className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && (<tr><td colSpan={6} className="px-3 py-4" style={{ color: "#8A94A0" }}>Loading…</td></tr>)}
            {rows?.length === 0 && (<tr><td colSpan={6} className="px-3 py-4" style={{ color: "#8A94A0" }}>Nothing uploaded yet — the first pair starts the ledger.</td></tr>)}
            {(rows || []).map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 tnum whitespace-nowrap">{r.for_date}</td>
                <td className="px-2 py-1.5 font-bold" style={{ color: r.kind === "masters" ? "#1B3A5C" : "#0D7A3F" }}>
                  {r.kind === "masters" ? "Masters" : "Transactions"}
                </td>
                <td className="px-2 py-1.5">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#1B3A5C", textDecoration: "underline" }}>{r.name}</a> : r.name}
                  {r.bytes != null && <span style={{ color: "#8A94A0" }}> · {(r.bytes / 1024 / 1024).toFixed(1)} MB</span>}
                </td>
                <td className="px-2 py-1.5 font-semibold">{r.initials || r.by || "—"}</td>
                <td className="px-2 py-1.5 tnum whitespace-nowrap" style={{ color: "#8A94A0" }}>
                  {new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-2 py-1.5">
                  {r.drive_synced_at
                    ? <span className="font-bold" style={{ color: "#0D7A3F" }}>✓ filed</span>
                    : <span style={{ color: "#8A94A0" }} title="scripts/drive-sync.mjs carries it over on its next run">pending sync</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SECTIONS: { key: string; label: string; icon: string; blurb: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧", blurb: "Cash today, receivables ageing, payables due — the morning glance." },
  { key: "upload", label: "Upload Files", icon: "⬆", blurb: "" },
  { key: "receivables", label: "Receivables", icon: "₹", blurb: "Who owes what, since when, and who is chasing it." },
  { key: "payables", label: "Payables", icon: "◔", blurb: "What we owe, by due date, so nothing surprises the bank balance." },
  { key: "bank", label: "Bank & Cash", icon: "🏦", blurb: "The balances and the day's movements, reconciled against the books." },
  { key: "ledgers", label: "Ledgers", icon: "▤", blurb: "The account books themselves — party, expense, and control ledgers." },
  { key: "gst", label: "GST & Statutory", icon: "▦", blurb: "Returns and challans, gated the HRMS way: frozen first, filed after." },
  { key: "reports", label: "Reports", icon: "▨", blurb: "P&L, balance sheet, cash flow — printed the Genie way, PDF on every page." },
];

export default function Accounts({
  email, displayName, initials, role,
}: {
  email: string; displayName: string | null; initials: string | null; role: string;
}) {
  const [openKey, setOpenKey] = useState("dashboard");
  const sec = SECTIONS.find((s) => s.key === openKey) ?? SECTIONS[0];

  return (
    <div className="min-h-screen" style={{ background: "#F1EFE9", color: "#22303C" }}>
      {/* ═══════════════════ header ═══════════════════ */}
      <div style={{ background: "#16232F", color: "#fff", position: "sticky", top: 0, zIndex: 40 }}>
        <div className="px-3 py-2 flex items-center gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest" style={{ fontSize: 11, color: "#F5B32B" }}>
                💰 NANDAN KUBER GENIE
              </span>
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#22303C", color: "#8FA1B3" }}>
                V {APP_VERSION}
              </span>
            </div>
            <div className="font-bold text-white leading-tight" style={{ fontSize: 13 }}>
              The books, the bank and the balances
            </div>
          </div>
          <span className="ml-auto" />
          <ModuleMenu current="accounts" email={email} displayName={displayName} initials={initials} role={role} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 46px)" }}>
        {/* ═══════════════════ left navbar ═══════════════════ */}
        <nav style={{ width: 236, flexShrink: 0, background: "#fff", borderRight: "1px solid #E2E0DA", padding: "10px 8px" }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setOpenKey(s.key)}
              className="w-full text-left rounded px-2.5 py-2 text-sm font-semibold flex items-center gap-2 mb-0.5"
              style={openKey === s.key
                ? { background: "#16232F", color: "#fff" }
                : { color: "#5A6672" }}>
              <span style={{ width: 18, textAlign: "center" }}>{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>

        {/* ═══════════════════ pane ═══════════════════ */}
        <main className="flex-1 p-6">
          {openKey === "upload" ? <UploadFiles /> : (
          <div className="bg-white rounded-lg border p-6" style={{ borderColor: "#E2E0DA", maxWidth: 720 }}>
            <div className="text-lg font-bold mb-1" style={{ color: "#16232F" }}>{sec.icon} {sec.label}</div>
            <div className="text-sm mb-4" style={{ color: "#5A6672", lineHeight: 1.6 }}>{sec.blurb}</div>
            <div className="rounded p-3 text-sm font-semibold" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
              The shell went up first — this screen is being built. Access is already real: only
              people ticked on Admin → module access can open this page.
            </div>
          </div>
          )}
        </main>
      </div>
    </div>
  );
}
