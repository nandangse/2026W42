"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { gsExport } from "@/lib/sources";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";
import QuoteOfDay from "./QuoteOfDay";

interface StatusRow {
  key: string;
  nm: string;
  desc: string;
  erp: string;
  gs: string;
  loadedToday: boolean;
  at: string | null;
  rows: number | null;
}

/**
 * @param embedded true when rendered as a tab inside the Genie suite (admins) —
 *        skips this page's own masthead and quote popup, which the suite
 *        already provides. Standalone (Shweta's login) keeps both.
 */
export default function MorningUpload({ email, embedded = false }: { email: string; embedded?: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [date, setDate] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    try {
      const r = await api.uploadStatus();
      setRows(r.status);
      setDate(r.date);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onFile = async (key: string, f: File | null) => {
    if (!f) return;
    setBusyKey(key);
    setMsg("");
    try {
      const res = await api.upload(f);
      const s = res.summary;
      setMsg(`Loaded ✓ (${s.filename})\n${(s.lines || []).join("\n")}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const loadedCount = rows.filter((r) => r.loadedToday).length;

  return (
    <div className={embedded ? "" : "min-h-screen"} style={embedded ? {} : { background: "#F1EFE9" }}>
      {!embedded && <QuoteOfDay />}
      {!embedded && (
        <div
          className="px-4 py-2.5"
          style={{ background: "#16232F", borderBottom: "3px solid #E8600A" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="rounded bg-white px-2 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO} alt="Nandan GSE" style={{ height: 30 }} />
              </div>
              <div>
                <div className="text-xs tracking-widest font-bold" style={{ color: "#E8600A" }}>
                  GENIE
                </div>
                <h1 className="text-base font-bold text-white leading-tight">
                  🌅 Morning Update
                </h1>
              </div>
            </div>
            <span className="text-xs rounded px-2 py-1.5" style={{ background: "#0D161F", color: "#8FA1B3", border: "1px solid #22303C" }}>
              👤 {email}
              <button onClick={logout} className="ml-1 font-bold" style={{ color: "#E8600A" }}>
                Logout
              </button>
            </span>
          </div>
        </div>
      )}

      <div className="p-4 max-w-3xl mx-auto">
        <div className="mb-3 flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold" style={{ color: "#16232F" }}>
            Today&apos;s three files
          </h2>
          <span className="text-sm font-semibold" style={{ color: loadedCount === 3 ? "#0D7A3F" : "#8A94A0" }}>
            {loadedCount}/3 loaded {date && `· ${date}`}
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.key}
              className="bg-white rounded-lg p-3 border flex flex-col gap-2"
              style={{ borderColor: "#E2E0DA", borderLeft: `5px solid ${r.loadedToday ? "#0D7A3F" : "#E8600A"}` }}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-bold text-sm" style={{ color: "#16232F" }}>
                    {r.nm}
                  </div>
                  <div className="text-xs" style={{ color: "#8A94A0" }}>
                    {r.desc}
                  </div>
                </div>
                <div className="text-sm font-bold" style={{ color: r.loadedToday ? "#0D7A3F" : "#B3261E" }}>
                  {r.loadedToday
                    ? `✓ loaded today${r.at ? " at " + new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}`
                    : "○ not loaded yet"}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={r.erp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs rounded px-2 py-1.5 font-semibold"
                  style={{ background: "#0D161F", color: "#8FA1B3" }}
                >
                  ↗ Open in ERP
                </a>
                <a
                  href={gsExport(r.gs)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs rounded px-2 py-1.5 font-semibold"
                  style={{ background: "#DCE8F5", color: "#1B3A5C" }}
                >
                  ⬇ Download sheet
                </a>
                <input
                  ref={(el) => {
                    fileRefs.current[r.key] = el;
                  }}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => onFile(r.key, e.target.files?.[0] || null)}
                />
                <button
                  onClick={() => fileRefs.current[r.key]?.click()}
                  disabled={busyKey === r.key}
                  className="text-xs rounded px-3 py-1.5 font-bold"
                  style={{ background: "#E8600A", color: "#fff", opacity: busyKey === r.key ? 0.6 : 1 }}
                >
                  {busyKey === r.key ? "Uploading…" : "⬆ Upload"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {msg && (
          <pre
            className="mt-4 text-xs rounded p-3 whitespace-pre-wrap"
            style={{ background: "#fff", border: "1px solid #E2E0DA", color: "#22303C" }}
          >
            {msg}
          </pre>
        )}

        <p className="text-xs mt-4" style={{ color: "#8A94A0" }}>
          The full PRE workbook is also accepted here — it covers Jobs + Projects
          in one upload. The app never talks to the ERP; these links just open in
          your browser.
        </p>
      </div>
    </div>
  );
}
