"use client";
// Sales Genie — the Sales Regrow playbook, served byte-for-byte from
// /api/sales/html inside an iframe. The artifact HTML is deliberately never
// modified; everything Genie adds (access gate, backup import, watermark)
// lives out here in the wrapper.
import { useRef, useState } from "react";

export default function SalesGenie({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  const [nonce, setNonce] = useState(0); // bump to reload the iframe after an import
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

  return (
    <div className="relative" style={{ height: "calc(100vh - 170px)", minHeight: 480 }}>
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

      <iframe
        key={nonce}
        src="/api/sales/html"
        title="Sales Regrow — Nandan GSE Sales Strategy Playbook"
        style={{ width: "100%", height: isAdmin ? "calc(100% - 34px)" : "100%", border: "none", background: "#fff", display: "block" }}
      />

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
        {email} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </div>
    </div>
  );
}
