"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LOGO } from "@/lib/logo";
import { api, btn, P, TABS, useBoot, type Boot } from "./shared";
import SetPassword from "./SetPassword";

const Home = dynamic(() => import("./Home"));
const Previous = dynamic(() => import("./Previous"));
const Queries = dynamic(() => import("./Queries"));
const Commercials = dynamic(() => import("./Commercials"));
const Issues = dynamic(() => import("./Issues"));
const Content = dynamic(() => import("./Content"));
const Settings = dynamic(() => import("./Settings"));

/**
 * THE PORTAL SHELL (Dr Raghu, 3 Oct 2026). The Nandan logo and the
 * organisation's name on top, the tabs down the left, the person's own
 * menu on the right. The door and the tab live in the path
 * (/portal/veda/previous) so a refresh lands on the same screen and a link
 * can be sent on. Nandan's own people get a switch between the doors.
 */
export default function PortalApp({ initialSlug, initialTab, initialArg }: { initialSlug: string; initialTab: string; initialArg: string | null }) {
  const [slug, setSlug] = useState(initialSlug);
  const [tab, setTab] = useState(initialTab);
  const [arg, setArg] = useState<string | null>(initialArg);
  const [menu, setMenu] = useState(false);
  const { boot, error, reload, notInstalled } = useBoot(slug);

  const go = (t: string, a: string | null = null, s: string = slug) => {
    setSlug(s); setTab(t); setArg(a); setMenu(false);
    history.replaceState(null, "", `/portal/${s}/${t}${a ? `/${a}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => { const p = location.pathname.split("/").filter(Boolean); setSlug(p[1] || "all"); setTab(p[2] || "home"); setArg(p[3] || null); };
    window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop);
  }, []);
  const logout = async () => { await api("/api/portal/auth", { action: "logout" }); window.location.href = "/portal/login"; };

  if (error) return (
    <main style={{ minHeight: "100vh", background: P.paper, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ color: P.navy }}>{notInstalled ? "The portal is almost ready" : "Could not open the portal"}</h1>
        <p style={{ color: P.dim }}>{error}</p>
        {notInstalled && <p style={{ color: P.muted, fontSize: 13 }}>The site is deployed; its tables are not. Run migration 0198 in Supabase and reload.</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={reload} style={btn("primary")}>Try again</button>
          {/^That is another|No such organisation/.test(error) && <button onClick={() => go("home", null, "all")} style={btn("ghost")}>All organisations</button>}
          <button onClick={logout} style={btn("ghost")}>Sign out</button>
        </div>
      </div>
    </main>
  );
  if (!boot) return <main style={{ minHeight: "100vh", background: P.paper, display: "grid", placeItems: "center", color: P.muted }}>Opening the portal…</main>;
  if (boot.me.must_change) return <SetPassword email={boot.me.email} onDone={reload} />;

  const tabs = TABS.filter((t) => boot.tabs.includes(t.key));
  const body = (() => {
    switch (tab) {
      case "home": return <Home boot={boot} go={go} arg={arg} />;
      case "previous": return <Previous boot={boot} go={go} />;
      case "queries": return <Queries boot={boot} arg={arg} go={go} />;
      case "commercials": return boot.me.commercials ? <Commercials boot={boot} /> : <NotYours />;
      case "issues": return <Issues boot={boot} />;
      case "faq": case "newsletter": case "advisory": return <Content boot={boot} kind={tab} arg={arg} go={go} />;
      case "settings": return boot.me.admin ? <Settings boot={boot} reload={reload} /> : <NotYours />;
      default: return <NotYours />;
    }
  })();

  return (
    <div className="portal" style={{ minHeight: "100vh", background: P.paper, color: P.ink }}>
      <header className="no-print" style={{ position: "sticky", top: 0, zIndex: 40, background: P.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: "8px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setMenu(!menu)} className="md:hidden" style={btn("ghost", { padding: "4px 9px", background: "transparent", color: "#fff", borderColor: "#34434f" })} aria-label="Menu">☰</button>
          <a href={`/portal/${slug}`} style={{ background: "#fff", borderRadius: 6, padding: "3px 7px", display: "flex", alignItems: "center" }} title="Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 22, display: "block" }} />
          </a>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{boot.org ? boot.org.name : "Nandan GSE Portal"}</div>
            <div className="hidden md:block" style={{ fontSize: 11, color: "#8FA1B3" }}>{boot.org ? `${boot.org.kind === "supplier" ? "Supplier" : "Customer"} portal · Nandan GSE` : boot.scope.kind === "locations" ? `Your locations: ${boot.scope.locations.join(", ") || "none yet"}` : "Every organisation"}</div>
          </div>
          <div style={{ flex: 1 }} />
          {boot.me.staff && boot.orgs.length > 0 && (
            <select value={slug} onChange={(e) => go("home", null, e.target.value)} style={{ background: P.navyDark, color: "#fff", border: "1px solid #34434f", borderRadius: 6, padding: "5px 8px", fontSize: 12, maxWidth: 220 }} title="Which organisation's page">
              {boot.me.all && <option value="all">All organisations</option>}
              {boot.orgs.filter((o) => o.active).map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          )}
          <Account boot={boot} logout={logout} reload={reload} />
        </div>
      </header>
      <div style={{ maxWidth: 1360, margin: "0 auto", display: "grid", gridTemplateColumns: "220px 1fr", gap: 18, padding: "16px 14px" }} className="portal-grid">
        <nav className={`no-print portal-nav ${menu ? "open" : ""}`} style={{ alignSelf: "start", position: "sticky", top: 62 }}>
          {tabs.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => go(t.key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", background: on ? P.navy : "transparent", color: on ? "#fff" : P.ink, fontWeight: on ? 700 : 500, fontSize: 13 }}>
                <span style={{ width: 20, textAlign: "center" }}>{t.icon}</span><span style={{ flex: 1 }}>{t.label}</span>
              </button>
            );
          })}
          {boot.me.staff && boot.me.via === "genie" && <a href="/" style={{ display: "block", marginTop: 14, fontSize: 12, color: P.muted, padding: "0 12px" }}>← Back to Genie</a>}
        </nav>
        <main style={{ minWidth: 0 }}>{body}</main>
      </div>
      <style>{`
        .portal-row:hover td { background: #fbf7f0; }
        .portal-table td.num, .portal-table th.num { font-variant-numeric: tabular-nums; }
        @media (max-width: 767px) {
          .portal-grid { grid-template-columns: 1fr !important; }
          .portal-nav { display: none; position: static !important; background: #fff; border: 1px solid ${P.line}; border-radius: 10px; padding: 6px; }
          .portal-nav.open { display: block; }
        }
        @media print { .no-print { display: none !important; } .portal-grid { grid-template-columns: 1fr !important; padding: 0 !important; } .portal { background: #fff !important; } .genie-scroll { max-height: none !important; overflow: visible !important; } }
      `}</style>
    </div>
  );
}

function NotYours() { return <div style={{ padding: 24, color: P.muted }}>That page is not open to this login.</div>; }

function Account({ boot, logout, reload }: { boot: Boot; logout: () => void; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const me = boot.me;
  const initials = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, background: P.navyDark, border: "1px solid #34434f", borderRadius: 8, padding: "3px 6px", cursor: "pointer" }} title={me.email}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: P.accent, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{initials || "?"}</span>
        <span style={{ color: "#8FA1B3", fontSize: 9 }}>▼</span>
      </button>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 58 }} />
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 250, background: "#fff", color: P.ink, border: `1px solid ${P.line}`, borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${P.line}` }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{me.name}</div>
            <div style={{ fontSize: 12, color: P.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{me.email}</div>
            <div style={{ fontSize: 11, color: P.dim, marginTop: 2 }}>{me.role.replace(/_/g, " ")}{me.via === "genie" ? " · via Genie" : ""}</div>
          </div>
          {me.via === "portal" && <button onClick={() => { setPw(true); setOpen(false); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${P.line}` }}>Change password</button>}
          <button onClick={() => window.location.reload()} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${P.line}` }}>⟳ Reload</button>
          <button onClick={logout} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 12px", fontSize: 13, cursor: "pointer", color: P.accent, fontWeight: 700 }}>⎋ Sign out</button>
        </div>
      </>)}
      {pw && (<>
        <div onClick={() => setPw(false)} style={{ position: "fixed", inset: 0, background: "rgba(13,22,31,.4)", zIndex: 70 }} />
        <div style={{ position: "fixed", top: "12vh", left: "50%", transform: "translateX(-50%)", zIndex: 71, color: P.ink }}><SetPassword email={me.email} inline onDone={() => { setPw(false); reload(); }} /></div>
      </>)}
    </span>
  );
}
