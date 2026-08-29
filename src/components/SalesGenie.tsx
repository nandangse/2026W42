"use client";
// Sales Genie — the sales workspace, gated by the sales_access grant.
// Two panes, both served byte-for-byte from authed routes into iframes:
//   · My Sales Plan  (/api/sales/plan)  — the interactive companies/industries/
//     products/pipeline app; auto-saves and syncs live between the granted few
//   · Playbook       (/api/sales/html)  — the Sales Regrow strategy artifact,
//     deliberately never modified; import replaces it whole
// Everything Genie adds (access gate, sub-tabs, backup import, watermark)
// lives out here in the wrapper. Panes stay mounted once visited so switching
// back is instant and no state is lost.
import { useRef, useState } from "react";

type Pane = "plan" | "playbook";

export default function SalesGenie({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  const [pane, setPane] = useState<Pane>("plan");
  const [seen, setSeen] = useState<Record<Pane, boolean>>({ plan: true, playbook: false });
  const open = (p: Pane) => { setPane(p); setSeen((s) => ({ ...s, [p]: true })); };

  // Search lives here, in Genie's own header — the iframe's own search bar
  // is hidden and just receives keystrokes via postMessage, so My Sales Plan
  // and Playbook share one tab-and-search line instead of stacking three.
  const [search, setSearch] = useState("");
  const planFrameRef = useRef<HTMLIFrameElement | null>(null);
  const onSearch = (v: string) => {
    setSearch(v);
    planFrameRef.current?.contentWindow?.postMessage({ type: "genie:search", query: v }, window.location.origin);
  };

  const [nonce, setNonce] = useState(0); // bump to reload the playbook iframe after an import
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const importBackup = async (f: File | null) => {
    if (!f) return;
    if (!window.confirm(`Replace the Sales Genie playbook with "${f.name}"?\n\nThe current version is kept in history and can be restored, but everyone will see the new file immediately.`)) return;
    setBusy(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/sales/html", { method: "POST", body: fd });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Import failed");
      setMsg(`Imported ✓ ${r.filename} (${Math.round(r.bytes / 1024)} KB)`);
      setNonce((n) => n + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadCurrent = async () => {
    // pull the served document and hand it to the user as a backup file
    const res = await fetch("/api/sales/html");
    if (!res.ok) { setMsg("Could not fetch the current playbook"); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Sales_Regrow_backup_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tabBtn = (p: Pane, label: string) => (
    <button
      onClick={() => open(p)}
      className="text-xs font-bold rounded px-3 py-1.5"
      style={pane === p ? { background: "#16232F", color: "#fff" } : { color: "#5B6B7A" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ height: "calc(100vh - 170px)", minHeight: 480, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-1 px-3 py-1.5" style={{ background: "#EAE7DF", borderBottom: "1px solid #DCD9D1" }}>
        {tabBtn("plan", "📊 My Sales Plan")}
        {tabBtn("playbook", "📕 Playbook")}
        {pane === "plan" && (
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search companies, deals, people, locations…"
            className="text-xs rounded px-2.5 py-1.5 ml-auto"
            style={{ border: "1px solid #DCD9D1", background: "#fff", color: "#22303C", width: "100%", maxWidth: 360 }}
          />
        )}
        <span className="text-xs flex-shrink-0" style={{ color: "#8A94A0", marginLeft: pane === "plan" ? 8 : "auto" }}>
          {pane === "plan" ? "Auto-saves · live" : "Reference — never edited in place"}
        </span>
      </div>

      {/* ---- My Sales Plan ---- */}
      <div style={{ display: pane === "plan" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {seen.plan && (
          <iframe
            ref={planFrameRef}
            src="/api/sales/plan"
            title="My Sales Plan — Nandan GSE"
            allow="microphone"
            style={{ width: "100%", flex: 1, border: "none", background: "#fff", display: "block" }}
          />
        )}
      </div>

      {/* ---- Playbook ---- */}
      <div className="relative" style={{ display: pane === "playbook" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {isAdmin && (
          <div className="flex items-center gap-2 px-4 py-1.5 flex-wrap" style={{ background: "#F4F2EC", borderBottom: "1px solid #E2E0DA" }}>
            <span className="text-xs font-bold" style={{ color: "#8A94A0" }}>ADMIN</span>
            <button onClick={downloadCurrent} className="text-xs font-bold rounded px-2 py-1" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title="Download the playbook exactly as served — keep this as your backup">
              ⬇ Download backup
            </button>
            <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: "none" }} onChange={(e) => { importBackup(e.target.files?.[0] || null); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="text-xs font-bold rounded px-2 py-1" style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }} title="Restore the playbook from a backed-up HTML file — previous versions stay recoverable">
              {busy ? "Importing…" : "⬆ Import backup"}
            </button>
            {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "#0D7A3F" : "#B3261E" }}>{msg}</span>}
            <span className="text-xs ml-auto" style={{ color: "#B8B5AC" }}>The playbook itself is never edited here — import replaces it whole.</span>
          </div>
        )}

        {seen.playbook && (
          <iframe
            key={nonce}
            src="/api/sales/html"
            title="Sales Regrow — Nandan GSE Sales Strategy Playbook"
            style={{ width: "100%", flex: 1, border: "none", background: "#fff", display: "block" }}
          />
        )}

        {/* deterrence watermark — who is looking, and when. Not protection
            (nothing stops a phone camera); it makes the copy attributable. */}
        <div
          className="absolute tnum"
          style={{
            bottom: 10, right: 14, pointerEvents: "none", userSelect: "none",
            fontSize: 11, fontWeight: 700, color: "rgba(27,42,94,0.35)",
            background: "rgba(255,255,255,0.55)", padding: "2px 8px", borderRadius: 4,
          }}
        >
          {email} · {new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}
