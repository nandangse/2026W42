"use client";
/**
 * THE YEAR-WISE ARCHIVE (Dr Raghu, 6 Sep 2026): "make a year wise upload
 * too. Year - XML Masters - XML Transactions - Audited Financials - GST
 * reports. For this year, keep adding month wise, so latest is to be
 * taken. Suresh and me can upload. 2025-26, 2024-25 etc upto 2005. This
 * will help to get more data as needed for review."
 *
 * A grid: one row per financial year from the running one back to 2005-06,
 * four columns. Each cell shows the latest file for that year and kind —
 * name, who, when, a Drive link — and, for the two who may, a button that
 * puts a new one in. The running year's cells take a month, so twelve
 * exports can sit side by side and the newest is what the grid shows.
 *
 * The file goes to Google Drive from the browser (the same leg the daily
 * XML upload uses), into a subfolder named for the year; only the register
 * row reaches Genie. Nothing here is read into the books — that is the
 * next step, and it is deliberate: past years' receipts and balances are
 * what the dashboard is missing, and they will be loaded from these files.
 */
import { useCallback, useEffect, useState } from "react";
import { driveToken, driveUpload, driveReady } from "@/components/kuber/drive-leg";
import { swallow } from "@/lib/swallow";

type YearFile = { id: string; fy: string; month: number | null; kind: string; name: string; bytes: number | null; drive_link: string | null; note: string | null; by_email: string; initials: string | null; at: string };

const KINDS: { key: string; label: string; accept: string; short: string }[] = [
  { key: "masters", label: "XML Masters", accept: ".xml,text/xml,application/xml", short: "Masters" },
  { key: "transactions", label: "XML Transactions", accept: ".xml,text/xml,application/xml", short: "Transactions" },
  { key: "audited", label: "Audited Financials", accept: ".pdf,.xlsx,.xls,.zip", short: "Audited" },
  { key: "gst", label: "GST reports", accept: ".pdf,.xlsx,.xls,.csv,.zip,.json", short: "GST" },
];
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const monthNo = (i: number) => ((i + 3) % 12) + 1; // Apr=4 … Mar=3

/** The running FY and every year back to 2005-06. */
function years(): string[] {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const startY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: string[] = [];
  for (let y = startY; y >= 2005; y--) out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}
const mb = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(n > 50 * 1024 * 1024 ? 0 : 1)} MB` : "");
const when = (s: string) => new Date(s).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit" });

export default function YearFiles({ email, googleClientId }: { email?: string; googleClientId: string | null }) {
  const [files, setFiles] = useState<YearFile[] | null>(null);
  /** vouchers actually parsed into the books, per year — filing is not loading */
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const [installed, setInstalled] = useState(true);
  const [mayUpload, setMayUpload] = useState(false);
  const [busy, setBusy] = useState<string>(""); // "fy|kind"
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [showAll, setShowAll] = useState(false);
  const [stage, setStage] = useState("");
  const [drive, setDrive] = useState(driveReady());
  // Connect on a plain click: the browser trusts the gesture, Google's window
  // opens, and every upload after it needs no window at all.
  const connect = async () => {
    setMsg("");
    try { if (!googleClientId) throw new Error("no Google client configured on the server"); await driveToken(googleClientId, email); setDrive(true); setMsg("Google Drive connected ✓ — upload away."); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const load = useCallback(() => {
    fetch("/api/kuber/years", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setFiles(j.files || []); setLoaded(j.loaded || {}); setInstalled(j.installed !== false); setMayUpload(!!j.mayUpload); })
      .catch((e) => { swallow("kuber/years", e); setFiles([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const YEARS = years();
  const current = YEARS[0];
  const latest = (fy: string, kind: string, m?: number | null) => {
    const xs = (files || []).filter((f) => f.fy === fy && f.kind === kind && (m === undefined ? true : (f.month ?? null) === (m ?? null)));
    return xs[0] ?? null; // newest first from the server
  };

  const put = async (fy: string, kind: string, file: File | null, m: number | null) => {
    if (!file || busy) return;
    const key = `${fy}|${kind}`;
    setBusy(key); setPct(0); setMsg(""); setStage("asking Google…");
    try {
      if (!googleClientId) throw new Error("no Google client configured on the server — the Drive leg cannot run");
      const tok = await driveToken(googleClientId, email);
      setDrive(true); setStage("uploading…");
      const label = KINDS.find((k) => k.key === kind)?.label || kind;
      const folder = `FY ${fy}`;
      const stamp = m ? ` (${MONTHS[(m + 8) % 12]} ${fy})` : "";
      const up = await driveUpload(tok, folder, file, `${label}${stamp}`, setPct);
      setStage("registering…");
      const r = await fetch("/api/kuber/years", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fy, kind, month: m ?? undefined, name: file.name, bytes: file.size, drive_id: up.id || undefined, drive_link: up.link || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "the register refused the file");
      setMsg(`${label} for ${fy}${stamp} filed ✓`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(""); setStage("");
    }
  };

  const Cell = ({ fy, kind, m }: { fy: string; kind: typeof KINDS[number]; m?: number | null }) => {
    const f = latest(fy, kind.key, m);
    const key = `${fy}|${kind.key}`;
    const running = busy === key;
    return (
      <td style={{ verticalAlign: "top", minWidth: 170 }}>
        {f ? (
          <div className="text-xs">
            <a href={f.drive_link || undefined} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: f.drive_link ? "var(--blue)" : "var(--ink)", textDecoration: f.drive_link ? "underline" : "none", wordBreak: "break-all" }} title={f.drive_link ? "Open on Drive" : "Registered without a Drive link"}>
              {f.name}
            </a>
            <div style={{ color: "var(--muted)" }}>{mb(f.bytes)}{f.bytes ? " · " : ""}{f.initials || f.by_email.split("@")[0]} · {when(f.at)}{fy === current && f.month ? ` · ${MONTHS[(f.month + 8) % 12]}` : ""}</div>
          </div>
        ) : (
          <div className="text-xs" style={{ color: "#B8B5AC" }}>·</div>
        )}
        {mayUpload && (
          <label className="inline-block mt-1 text-xs font-bold rounded px-2 py-0.5" style={{ background: running ? "#F4F2EC" : "var(--navy)", color: running ? "var(--dim)" : "#fff", cursor: busy ? "default" : "pointer", opacity: busy && !running ? 0.5 : 1 }}>
            {running ? (stage === "uploading…" ? `${Math.round(pct * 100)}%…` : stage) : f ? "⬆ replace" : "⬆ upload"}
            <input type="file" accept={kind.accept} className="hidden" disabled={!!busy} onChange={(e) => { put(fy, kind.key, e.target.files?.[0] ?? null, m ?? null); e.target.value = ""; }} />
          </label>
        )}
      </td>
    );
  };

  const rows = showAll ? YEARS : YEARS.slice(0, 6);

  return (
    <div className="bg-white rounded-lg border p-4 mt-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <div className="text-lg font-bold" style={{ color: "var(--ink)" }}>📚 Year-wise files</div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>Tally masters and transactions, the audited financials and the GST reports, one row a year back to 2005-06 — the data the review draws on.</div>
      </div>
      <div className="text-xs mb-3" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
        Files go straight to Google Drive under <b>FY &lt;year&gt;</b> in the Tally folder; only the register row reaches Genie.
        <b> Filing is not loading</b> — to put a year into the books, open <b>Upload</b>, set the financial year, and choose the file there. The running year takes a month per file, and the newest is what the grid shows.
        {mayUpload ? " You may upload." : " Dr Raghu and Suresh upload; everyone with Kuber reads."}
        {!installed && <span style={{ color: "var(--red)" }}> Run migration 0145 first — the register does not exist yet.</span>}
      </div>
      {mayUpload && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <button onClick={connect} className="rounded px-3 py-1.5 font-bold" style={{ background: drive ? "var(--green)" : "var(--navy)", color: "#fff" }}>{drive ? "✓ Google Drive connected" : "Connect Google Drive first"}</button>
          <span style={{ color: "var(--muted)" }}>{drive ? "Files go to Drive without another window." : "One click opens Google's window; after that every upload is silent. If nothing opens, allow pop-ups for genie.nandan.co.in."}</span>
        </div>
      )}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
      {mayUpload && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="font-bold" style={{ color: "var(--muted)" }}>MONTH FOR {current}</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border rounded px-2 py-1" style={{ borderColor: "var(--line)" }} title="The month this year's file is of">
            {MONTHS.map((mn, i) => <option key={mn} value={monthNo(i)}>{mn}</option>)}
          </select>
          <span style={{ color: "var(--muted)" }}>— applies to uploads on the {current} row</span>
        </div>
      )}
      <div className="genie-scroll" style={{ maxHeight: "none" }}>
        <table className="genie-table">
          <thead>
            <tr>
              <th>Year</th>
              {KINDS.map((k) => <th key={k.key}>{k.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((fy) => (
              <tr key={fy} style={{ background: fy === current ? "#FFF7E6" : undefined }}>
                <td className="font-bold tnum" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>
                  {fy}{fy === current && <div className="text-xs font-normal" style={{ color: "var(--muted)" }}>running · month-wise</div>}
                  {/* FILING IS NOT LOADING. This register puts the file on
                      Drive and writes a row; the books are only touched by
                      Kuber → Upload. A year that has one and not the other
                      should say so rather than be explained. */}
                  {loaded[fy] ? (
                    <div className="text-xs font-normal" style={{ color: "var(--green)" }}>
                      ✓ in the books · {loaded[fy].toLocaleString("en-IN")} vouchers
                    </div>
                  ) : files?.some((f) => f.fy === fy && (f.kind === "masters" || f.kind === "transactions")) ? (
                    <div className="text-xs font-normal" style={{ color: "var(--warn)", maxWidth: 190, lineHeight: 1.35 }}>
                      filed to Drive — <b>not in the books</b>. Load it from <b>Upload</b>, with the year set to {fy}.
                    </div>
                  ) : null}
                </td>
                {KINDS.map((k) => <Cell key={k.key} fy={fy} kind={k} m={fy === current ? month : undefined} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files && files.filter((f) => f.fy === current).length > 0 && (
        <div className="text-xs mt-2" style={{ color: "var(--dim)" }}>
          <b>{current} by month:</b>{" "}
          {MONTHS.map((mn, i) => { const n = files.filter((f) => f.fy === current && f.month === monthNo(i)).length; return n ? <span key={mn} className="mr-2">{mn} · {n}</span> : null; })}
        </div>
      )}
      <button onClick={() => setShowAll((v) => !v)} className="text-xs font-bold mt-2" style={{ color: "var(--blue)" }}>{showAll ? "▴ fewer years" : `▾ all years back to 2005-06 (${YEARS.length})`}</button>
    </div>
  );
}
