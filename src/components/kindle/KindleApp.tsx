"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import KindleLogo, { KindleFlame } from "./KindleLogo";
import { api, Avatar, btn, K, serif, useBoot, type Boot } from "./shared";
import SetPassword from "./SetPassword";

const Home = dynamic(() => import("./Home"));
const Constitution = dynamic(() => import("./Constitution"));
const Directory = dynamic(() => import("./Directory"));
const Meetings = dynamic(() => import("./Meetings"));
const Profile = dynamic(() => import("./Profile"));
const Settings = dynamic(() => import("./Settings"));
const Soon = dynamic(() => import("./Soon"));
const Polls = dynamic(() => import("./Polls"));
const Checkins = dynamic(() => import("./Checkins"));
const Issues = dynamic(() => import("./Issues"));
const Board = dynamic(() => import("./Board"));
const Gallery = dynamic(() => import("./Gallery"));
const Goals = dynamic(() => import("./Goals"));
const One21 = dynamic(() => import("./One21"));

/**
 * THE KINDLE SHELL. Left navigation of thirteen sections, the flame on top,
 * the settings gear for the facilitator, the member's own avatar. The
 * section lives in the path (/kindle/directory) so a refresh lands on the
 * same screen and a link can be sent on WhatsApp.
 */
export const SECTIONS: { key: string; label: string; icon: string; phase: number; admin?: boolean }[] = [
  { key: "home", label: "Home", icon: "🔥", phase: 1 },
  { key: "constitution", label: "Constitution", icon: "📜", phase: 1 },
  { key: "directory", label: "Directory", icon: "👥", phase: 1 },
  { key: "checkins", label: "Check-ins", icon: "✅", phase: 1 },
  { key: "goals", label: "Goals", icon: "🎯", phase: 1 },
  { key: "meetings", label: "TG Meetings", icon: "📅", phase: 1 },
  { key: "one21", label: "1-2-1s", icon: "🤝", phase: 1 },
  { key: "issues", label: "Burning issues", icon: "🧯", phase: 1 },
  { key: "polls", label: "Polls", icon: "🗳", phase: 1 },
  { key: "board", label: "Message board", icon: "💬", phase: 1 },
  { key: "finances", label: "Finances", icon: "💰", phase: 4 },
  { key: "exercises", label: "Exercises", icon: "🧭", phase: 4 },
  { key: "gallery", label: "Gallery", icon: "📷", phase: 1 },
];

export default function KindleApp({ initialSection, initialArg }: { initialSection: string; initialArg: string | null }) {
  const { boot, error, reload, notInstalled } = useBoot();
  const [section, setSection] = useState(initialSection);
  const [arg, setArg] = useState<string | null>(initialArg);
  const [menu, setMenu] = useState(false);

  const go = (k: string, a: string | null = null) => {
    setSection(k); setArg(a); setMenu(false);
    history.replaceState(null, "", `/kindle/${k}${a ? `/${a}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => { const p = location.pathname.split("/").filter(Boolean); setSection(p[1] || "home"); setArg(p[2] || null); };
    window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop);
  }, []);

  const logout = async () => { await api("/api/kindle/auth", { action: "logout" }); window.location.href = "/kindle/login"; };

  if (error) return (
    <main style={{ minHeight: "100vh", background: K.paper, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <KindleFlame size={56} />
        <h1 style={{ ...serif, color: K.ink }}>{notInstalled ? "Kindle is almost ready" : "Could not open Kindle"}</h1>
        <p style={{ color: K.dim }}>{error}</p>
        {notInstalled && <p style={{ color: K.muted, fontSize: 13 }}>The site is deployed; its tables are not. Run migration 0187 in Supabase and reload.</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={reload} style={btn("primary")}>Try again</button>
          <button onClick={logout} style={btn("ghost")}>Sign out</button>
        </div>
      </div>
    </main>
  );
  if (!boot) return <main style={{ minHeight: "100vh", background: K.paper, display: "grid", placeItems: "center" }}><div style={{ textAlign: "center", color: K.muted }}><KindleFlame size={48} /><div style={{ marginTop: 8, fontSize: 13 }}>Kindling…</div></div></main>;

  /* first login: the password, then the profile form, then the site */
  if (boot.me.must_change) return <SetPassword email={boot.me.email} onDone={reload} />;
  if (!boot.me.onboarded && section !== "profile") return <Shell boot={boot} section="profile" go={go} menu={menu} setMenu={setMenu} logout={logout}><Profile boot={boot} reload={reload} onboarding onDone={() => go("home")} /></Shell>;

  const me = boot.me;
  const body = (() => {
    switch (section) {
      case "home": return <Home boot={boot} go={go} />;
      case "constitution": return <Constitution boot={boot} reload={reload} />;
      case "directory": return <Directory boot={boot} arg={arg} go={go} reload={reload} />;
      case "meetings": return <Meetings boot={boot} arg={arg} go={go} reload={reload} />;
      case "polls": return <Polls boot={boot} />;
      case "checkins": return <Checkins boot={boot} arg={arg} go={go} />;
      case "issues": return <Issues boot={boot} />;
      case "goals": return <Goals boot={boot} arg={arg} go={go} />;
      case "one21": return <One21 boot={boot} />;
      case "board": return <Board boot={boot} arg={arg} go={go} />;
      case "gallery": return <Gallery boot={boot} arg={arg} go={go} />;
      case "profile": return <Profile boot={boot} reload={reload} />;
      case "settings": return me.admin ? <Settings boot={boot} reload={reload} /> : <Soon section="settings" />;
      default: return <Soon section={section} />;
    }
  })();
  return <Shell boot={boot} section={section} go={go} menu={menu} setMenu={setMenu} logout={logout}>{body}</Shell>;
}

function Shell({ boot, section, go, menu, setMenu, logout, children }: { boot: Boot; section: string; go: (k: string, a?: string | null) => void; menu: boolean; setMenu: (b: boolean) => void; logout: () => void; children: React.ReactNode }) {
  const me = boot.me;
  const meRow = boot.members.find((m) => m.id === me.id) || { name: me.name, photo_path: me.photo_path };
  const [acct, setAcct] = useState(false);
  const nav = (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SECTIONS.map((s) => {
        const on = section === s.key;
        return (
          <button key={s.key} onClick={() => go(s.key)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 14, background: on ? K.charcoal : "transparent", color: on ? "#fff7ea" : K.ink, fontWeight: on ? 700 : 500 }}>
            <span style={{ width: 20, textAlign: "center" }}>{s.icon}</span>
            <span style={{ flex: 1 }}>{s.label}</span>
            {s.phase > 1 && <span style={{ fontSize: 10, color: on ? K.amber : K.muted, border: `1px solid ${on ? K.amber : K.line}`, borderRadius: 999, padding: "0 6px" }}>soon</span>}
          </button>
        );
      })}
    </nav>
  );
  return (
    <div style={{ minHeight: "100vh", background: K.paper, color: K.ink }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(250,246,239,.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${K.line}` }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setMenu(!menu)} className="md:hidden" style={{ ...btn("ghost", { padding: "6px 10px" }) }} aria-label="Menu">☰</button>
          <button onClick={() => go("home")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><KindleLogo size={30} slogan={false} /></button>
          <span style={{ fontSize: 12, color: K.muted, marginLeft: 2 }} className="hidden md:inline">Ascent Trust Group · Mumbai</span>
          <div style={{ flex: 1 }} />
          {me.admin && (
            <button onClick={() => go("settings")} title="Settings — the facilitator's gear" style={{ ...btn("ghost", { padding: "6px 10px", fontSize: 16 }), background: section === "settings" ? K.charcoal : "#fff", color: section === "settings" ? "#fff" : K.ink }}>⚙</button>
          )}
          <div style={{ position: "relative" }}>
            <button onClick={() => setAcct(!acct)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar m={meRow} size={34} />
            </button>
            {acct && (
              <div onMouseLeave={() => setAcct(false)} style={{ position: "absolute", right: 0, top: 42, background: "#fff", border: `1px solid ${K.line}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.12)", minWidth: 220, padding: 8, zIndex: 30 }}>
                <div style={{ padding: "6px 10px", fontSize: 13 }}><b>{me.name}</b><div style={{ color: K.muted, fontSize: 12 }}>{me.email}</div>{me.via === "genie" && <div style={{ color: K.muted, fontSize: 11 }}>via your Genie login</div>}</div>
                <button onClick={() => { setAcct(false); go("profile"); }} style={menuBtn}>My profile and family</button>
                <button onClick={() => { setAcct(false); go("profile", "password"); }} style={menuBtn}>Change password</button>
                <button onClick={logout} style={{ ...menuBtn, color: K.red }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: 16, display: "flex", gap: 20, alignItems: "flex-start" }}>
        <aside className="hidden md:block" style={{ width: 210, flex: "none", position: "sticky", top: 70 }}>{nav}</aside>
        {menu && <div className="md:hidden" onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 15 }}><div onClick={(e) => e.stopPropagation()} style={{ width: 250, height: "100%", background: K.paper, padding: 16, paddingTop: 70, overflow: "auto" }}>{nav}</div></div>}
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
const menuBtn: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 10px", fontSize: 13, cursor: "pointer", borderRadius: 8, color: K.ink };
