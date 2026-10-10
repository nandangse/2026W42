"use client";
/**
 * THE LEADERS COUNCIL (Dr Raghu, 10 Oct 2026) — one shell, a left navbar,
 * the room in the #hash so a reload comes back to the same screen.
 *
 * Rooms, in the order he gave them, the philosophy at the front:
 *   Philosophy · Principles · Meetings · Knowledge · Presentations ·
 *   Start Stop Continue · Solution Board · KPIs · Health Check
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import GenieShell from "@/components/GenieShell";
import { useBoot, NAVY, MUTED, LINE, Who } from "./shared";

const Pages = dynamic(() => import("./Pages"));
const Meetings = dynamic(() => import("./Meetings"));
const Knowledge = dynamic(() => import("./Knowledge"));
const Presentations = dynamic(() => import("./Presentations"));
const Ssc = dynamic(() => import("./Ssc"));
const Solutions = dynamic(() => import("./Solutions"));
const Kpis = dynamic(() => import("./Kpis"));
const Health = dynamic(() => import("./Health"));

export const ROOMS: { key: string; label: string; icon: string; blurb: string; ownerOnly?: boolean }[] = [
  { key: "philosophy", label: "Philosophy", icon: "🪔", blurb: "values, OPSP, quarterly reports" },
  { key: "principles", label: "Principles", icon: "⚖️", blurb: "what we do, what we do not" },
  { key: "meetings", label: "Meetings", icon: "🗓", blurb: "the council's minutes" },
  { key: "knowledge", label: "Knowledge", icon: "📚", blurb: "files and references, kept in Drive" },
  { key: "presentations", label: "Presentations", icon: "📽", blurb: "decks, with Genie's summary" },
  { key: "ssc", label: "Start · Stop · Continue", icon: "🟢", blurb: "the three-column board" },
  { key: "solutions", label: "Solution Board", icon: "🧩", blurb: "problems, crowdsourced answers" },
  { key: "kpis", label: "KPIs", icon: "📈", blurb: "company-wide, by month or quarter" },
  { key: "health", label: "Health Check", icon: "🩺", blurb: "the Rockefeller habits, anonymous" },
];

const readHash = () => { const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, ""); const [room, arg] = h.split("/"); return { room: ROOMS.some((r) => r.key === room) ? room : "philosophy", arg: arg || null }; };

export default function LeadersCouncil({ email, displayName, initials, role, isOwner }: { email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean }) {
  const [boot] = useBoot();
  const [{ room, arg }, setAt] = useState(readHash);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { const f = () => setAt(readHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (k: string, a?: string | null) => { window.location.hash = a ? `${k}/${a}` : k; setNavOpen(false); };
  const here = ROOMS.find((r) => r.key === room)!;

  return (
    <GenieShell module="lc" title="Nandan Leaders Council" tagline="the council's own room" user={{ email, displayName, initials, role }}
      leading={<button onClick={() => setNavOpen((o) => !o)} className="lc-burger rounded px-2 font-bold" style={{ height: 32, background: "#0D161F", color: "#fff", border: "1px solid var(--ink)", fontSize: 16 }} aria-label="Rooms">☰</button>}>
      <div className="lc-wrap flex" style={{ minHeight: "calc(100vh - 50px)" }}>
        <nav className={"lc-nav" + (navOpen ? " open" : "")} style={{ width: 232, flexShrink: 0, background: "#fff", borderRight: `1px solid ${LINE}` }}>
          <div className="px-3 pt-3 pb-2">
            <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 1 }}>THE COUNCIL</div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {boot?.members.map((m) => <Who key={m.email} boot={boot} email={m.email} withName={false} size={24} />)}
            </div>
          </div>
          {ROOMS.map((r) => (
            <button key={r.key} onClick={() => go(r.key)} className="w-full text-left px-3 py-2 flex items-center gap-2"
              style={{ background: r.key === room ? "var(--paper)" : "transparent", borderLeft: `4px solid ${r.key === room ? "var(--accent)" : "transparent"}`, color: NAVY, fontWeight: r.key === room ? 800 : 600, fontSize: 13.5 }}>
              <span style={{ width: 22, textAlign: "center" }}>{r.icon}</span>
              <span className="min-w-0"><div className="truncate">{r.label}</div><div className="truncate" style={{ fontSize: 10.5, color: MUTED, fontWeight: 500 }}>{r.blurb}</div></span>
            </button>
          ))}
          <div className="px-3 py-3 text-xs" style={{ color: MUTED, borderTop: `1px solid ${LINE}`, marginTop: 8 }}>
            Only those marked LC on Admin → Groups can open this room, on every page and every route.
          </div>
        </nav>
        {navOpen && <div className="lc-scrim fixed inset-0" style={{ zIndex: 40, background: "rgba(0,0,0,.3)" }} onClick={() => setNavOpen(false)} role="presentation" />}
        <main className="flex-1 min-w-0 p-3 md:p-4" style={{ maxWidth: 1240 }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 22 }}>{here.icon}</span>
            <h1 className="font-bold m-0" style={{ fontSize: 20, color: NAVY }}>{here.label}</h1>
            <span className="text-xs" style={{ color: MUTED }}>{here.blurb}</span>
          </div>
          {room === "philosophy" && <Pages kind="philosophy" boot={boot} isOwner={isOwner} />}
          {room === "principles" && <Pages kind="principles" boot={boot} isOwner={isOwner} />}
          {room === "meetings" && <Meetings boot={boot} arg={arg} go={go} />}
          {room === "knowledge" && <Knowledge boot={boot} isOwner={isOwner} />}
          {room === "presentations" && <Presentations boot={boot} arg={arg} go={go} />}
          {room === "ssc" && <Ssc boot={boot} isOwner={isOwner} />}
          {room === "solutions" && <Solutions boot={boot} arg={arg} go={go} />}
          {room === "kpis" && <Kpis boot={boot} />}
          {room === "health" && <Health boot={boot} isOwner={isOwner} />}
        </main>
      </div>
      <style>{`
        .lc-burger { display: none; }
        @media (max-width: 860px) {
          .lc-burger { display: inline-block; }
          .lc-nav { position: fixed; top: 50px; bottom: 0; left: -240px; z-index: 41; overflow-y: auto; transition: left .18s; box-shadow: 0 0 0 transparent; }
          .lc-nav.open { left: 0; box-shadow: 8px 0 24px rgba(0,0,0,.2); }
        }
        @media (min-width: 861px) { .lc-scrim { display: none; } }
      `}</style>
    </GenieShell>
  );
}
