"use client";
/**
 * The page that is not there, and the page that broke (Dr Raghu, 6 Sep
 * 2026: "Error pages show a nice one which shows Nandan GSE and Genie icon
 * which says this is a wrong page").
 */
import { LOGO } from "@/lib/logo";

export default function WrongPage({ kind, detail, onRetry }: { kind: "missing" | "broken"; detail?: string; onRetry?: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#16232F", color: "#fff" }}>
      <div className="w-full text-center" style={{ maxWidth: 440 }}>
        <div className="inline-flex items-center gap-3 rounded bg-white px-3 py-2 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Genie" style={{ height: 34 }} />
        </div>
        <div style={{ fontSize: 56, lineHeight: 1 }}>🧞</div>
        <h1 className="font-bold mt-4" style={{ fontSize: 22 }}>
          {kind === "missing" ? "This is a wrong page." : "Something went wrong on this page."}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "#8FA1B3", lineHeight: 1.5 }}>
          {kind === "missing"
            ? "Genie has no page at this address. The link may be old, or a letter may be off."
            : "Genie hit an error drawing this screen. Reload usually puts it right; if it keeps happening, tell Dr Raghu what you were doing."}
        </p>
        {detail && <div className="mt-3 text-xs rounded px-3 py-2 text-left" style={{ background: "#0D161F", color: "#CBD5E1", fontFamily: "monospace", wordBreak: "break-word" }}>{detail}</div>}
        <div className="flex gap-2 justify-center mt-6 flex-wrap">
          {onRetry && <button onClick={onRetry} className="rounded px-4 py-2 font-bold text-sm" style={{ background: "#E8600A", color: "#fff" }}>⟳ Try again</button>}
          <a href="/" className="rounded px-4 py-2 font-bold text-sm" style={{ background: "#fff", color: "#16232F", textDecoration: "none" }}>🏠 Home</a>
          <a href="/login" className="rounded px-4 py-2 font-bold text-sm" style={{ background: "#22303C", color: "#fff", textDecoration: "none" }}>Sign in</a>
        </div>
        <div className="mt-8 text-xs" style={{ color: "#5F7183" }}>Nandan Genie · Nandan GSE</div>
      </div>
    </div>
  );
}
