"use client";
/**
 * THE ONE HEADER (Dr Raghu, 6 Sep 2026): "the header can carry a similar
 * top header — logo left, name of app right, notification, profile name
 * drop down, version no ... All the pages to have a common place in the
 * profile dropdown ... a button called modules and on click or mouseover
 * will show all modules so they can go ... version number for admins only."
 *
 * Every door renders this and nothing else above its own content: the
 * logo, the app's name and one line under it, whatever controls the app
 * needs on the right (`tools`), the bell, and the account menu — the
 * person's name, a Modules row that opens on hover or tap, Reload, Logout,
 * and the version for admins. Sticky. On a phone the tagline goes and the
 * name shrinks; nothing wraps into a second row.
 */
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOGO } from "@/lib/logo";
import { APP_VERSION } from "@/lib/version";
import { swallow } from "@/lib/swallow";

export type ShellModule = "main" | "crm" | "marketing" | "hrms" | "accounts" | "vishwakarma" | "seva" | "ims" | "saamaan" | "lms" | "idp";

export const MODULES: { key: ShellModule; label: string; icon: string; href: string; blurb: string }[] = [
  { key: "main", label: "Planning", icon: "🧞", href: "/", blurb: "jobs, milestones, the floor" },
  { key: "crm", label: "CRM", icon: "🤝", href: "/crm", blurb: "enquiries to orders" },
  { key: "marketing", label: "Marketing", icon: "📣", href: "/marketing", blurb: "leads, lists, campaigns" },
  { key: "hrms", label: "HRMS", icon: "👤", href: "/hrms", blurb: "people, pay, appraisals" },
  { key: "ims", label: "IMS", icon: "📐", href: "/ims", blurb: "standards, audits, documents" },
  { key: "lms", label: "LMS", icon: "📚", href: "/lms", blurb: "learning" },
  { key: "accounts", label: "Kuber", icon: "💰", href: "/kuber", blurb: "books, bank, balances" },
  { key: "vishwakarma", label: "Vishwakarma", icon: "🛠", href: "/vishwakarma", blurb: "design" },
  { key: "saamaan", label: "Saamaan", icon: "📦", href: "/saamaan", blurb: "materials" },
];

export interface ShellUser {
  email: string;
  displayName: string | null;
  initials: string | null;
  role: string;
}

type Notif = { id: string; title: string; body: string | null; read_at: string | null; created_at: string; ref_kind?: string | null; ref_id?: string | null };

const NAVY = "var(--navy)", NAVY_DARK = "#0D161F", LINE_DARK = "var(--ink)", ORANGE = "var(--accent)", MUTED = "#8FA1B3";

/**
 * The heartbeat behind the access log: once a minute while the tab is
 * visible, POST /api/usage with how many /api calls the browser made since
 * the last beat. Counting is done by wrapping window.fetch once.
 */
function useHeartbeat() {
  useEffect(() => {
    const w = window as unknown as { __genieBeat?: boolean; __genieReq?: number };
    if (w.__genieBeat) return;
    w.__genieBeat = true; w.__genieReq = 0;
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/") && !url.includes("/api/usage")) w.__genieReq = (w.__genieReq || 0) + 1;
      return orig(input, init);
    };
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      const requests = w.__genieReq || 0; w.__genieReq = 0;
      orig("/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests }), keepalive: true }).catch((e) => swallow("shell/beat", e));
    };
    const t = setInterval(beat, 60_000);
    beat();
    return () => clearInterval(t);
  }, []);
}

export default function GenieShell({
  module, title, tagline, user, tools, leading, onNotif, menu, children,
}: {
  module: ShellModule;
  /** The app's name, right of the logo: "Nandan HRMS". */
  title: string;
  /** One line under the name; hidden on a phone. */
  tagline?: string;
  user: ShellUser;
  /** The app's own controls, between the name and the bell. */
  tools?: React.ReactNode;
  /** A control before the logo — the HRMS hamburger. */
  leading?: React.ReactNode;
  /** The app's own way to open a notification; the default opens the task on Planning. */
  onNotif?: (n: Notif) => void;
  /** The app's own rows in the account menu, given a close() to call after a click. */
  menu?: (close: () => void) => React.ReactNode;
  children?: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";
  useHeartbeat();
  return (
    <div className="genie-shell">
      <header className="genie-hdr" style={{ background: NAVY, color: "#fff", position: "sticky", top: 0, zIndex: 45 }}>
        <div className="flex items-center gap-2 px-3" style={{ height: 50 }}>
          {leading}
          <a href="/" className="rounded bg-white flex items-center flex-shrink-0" style={{ padding: "3px 6px" }} title="Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Nandan GSE" style={{ height: 24, display: "block" }} />
          </a>
          <div className="min-w-0">
            <div className="font-bold text-white truncate" style={{ fontSize: 15, letterSpacing: 0.4, lineHeight: 1.15 }}>{title}</div>
            {tagline && <div className="genie-tagline truncate" style={{ fontSize: 11, color: MUTED }}>{tagline}</div>}
          </div>
          <span className="ml-auto" />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {tools}
            <Bell onOpen={onNotif} />
            <AccountMenu module={module} user={user} isAdmin={isAdmin} menu={menu} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/* ───────────────────────── the bell ───────────────────────── */

function Bell({ onOpen }: { onOpen?: (n: Notif) => void }) {
  const [state, setState] = useState<{ installed: boolean; items: Notif[]; unread: number } | null>(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch (e) { swallow("shell/bell", e); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, []);
  if (!state?.installed) return null;
  const markAll = async () => {
    try { await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read_all" }) }); } catch (e) { swallow("shell/bell", e); }
    load();
  };
  const openOne = async (n: Notif) => {
    if (!n.read_at) {
      try { await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", ids: [n.id] }) }); } catch (e) { swallow("shell/bell", e); }
    }
    setOpen(false);
    if (onOpen) onOpen(n);
    else window.location.href = n.ref_kind === "goal" ? "/#goals" : "/#tasking";
  };
  return (
    <span className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded px-2 font-bold" aria-label="Notifications" title="Notifications"
        style={{ height: 32, background: NAVY_DARK, color: state.unread ? "var(--amber)" : MUTED, border: `1px solid ${LINE_DARK}`, fontSize: 13 }}>
        🔔{state.unread > 0 && <span className="ml-1 rounded-full px-1.5 font-bold tnum" style={{ background: "var(--red)", color: "#fff", fontSize: 10 }}>{state.unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 58 }} role="button" tabIndex={0} onClick={() => setOpen(false)} />
          <div className="absolute rounded-lg border bg-white genie-pop" style={{ top: "calc(100% + 6px)", right: 0, width: 330, maxHeight: 420, overflowY: "auto", borderColor: "var(--line)", boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59 }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #EEECE6" }}>
              <span className="text-xs font-bold" style={{ color: NAVY }}>Notifications</span>
              {state.unread > 0 && <button onClick={markAll} className="text-xs font-bold" style={{ color: ORANGE }}>Mark all read</button>}
            </div>
            {state.items.length === 0 && <div className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>Nothing yet — you will hear when something is assigned to you.</div>}
            {state.items.map((n) => (
              <button key={n.id} onClick={() => openOne(n)} className="w-full text-left px-3 py-2" style={{ borderBottom: "1px solid #F4F2EC", background: n.read_at ? "#fff" : "#FFF7E6" }}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: ORANGE, marginTop: 5 }} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold" style={{ color: NAVY }}>{n.title}</div>
                    {n.body && <div className="text-xs truncate" style={{ color: "var(--dim)" }}>{n.body}</div>}
                    <div className="tnum" style={{ fontSize: 10, color: "var(--muted)" }}>{new Date(n.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/* ───────────────────────── the account menu ───────────────────────── */

function AccountMenu({ module, user, isAdmin, menu }: { module: ShellModule; user: ShellUser; isAdmin: boolean; menu?: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mods, setMods] = useState(false);
  const [may, setMay] = useState<Record<string, boolean> | null>(null);
  const who = user.displayName || user.email.split("@")[0];
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || may) return;
    fetch("/api/modules", { cache: "no-store" }).then((r) => r.json()).then(setMay).catch((e) => swallow("shell/modules", e));
  }, [open, may]);

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  };
  // every login has Planning (main), the LMS and the IDP; the rest are ticks
  const allowed = MODULES.filter((m) => m.key === module || m.key === "main" || m.key === "lms" || !!may?.[m.key]);

  const hoverIn = () => { if (closeT.current) clearTimeout(closeT.current); setMods(true); };
  const hoverOut = () => { closeT.current = setTimeout(() => setMods(false), 250); };

  return (
    <span className="relative flex-shrink-0">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded pl-1 pr-2" aria-haspopup="menu" aria-expanded={open}
        style={{ height: 32, background: NAVY_DARK, border: `1px solid ${LINE_DARK}` }} title={`${who} · ${user.role.replace("_", " ")}`}>
        <span className="rounded-full font-bold flex items-center justify-center" style={{ width: 24, height: 24, fontSize: 10.5, background: user.initials ? ORANGE : "var(--red)", color: "#fff" }}>
          {user.initials || "??"}
        </span>
        <span className="genie-who text-white font-semibold truncate" style={{ fontSize: 12, maxWidth: 140 }}>{who}</span>
        <span style={{ color: MUTED, fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 58 }} role="button" tabIndex={0} onClick={() => setOpen(false)} />
          <div className="absolute rounded-lg border bg-white genie-pop" role="menu" style={{ top: "calc(100% + 6px)", right: 0, width: 250, borderColor: "var(--line)", boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59 }}>
            <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #EEECE6" }}>
              <div className="text-sm font-bold truncate" style={{ color: NAVY }}>{who}</div>
              <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{user.email}</div>
              <div className="text-xs mt-0.5 font-semibold" style={{ color: "var(--dim)" }}>{user.role.replace("_", " ")}</div>
            </div>
            <div onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <button onClick={() => setMods((m) => !m)} className="w-full text-left px-3 py-2 text-sm font-bold flex items-center justify-between hover:bg-gray-50" style={{ color: NAVY, borderBottom: "1px solid #EEECE6" }}>
                <span>🧞 Modules</span><span style={{ color: MUTED, fontSize: 10 }}>{mods ? "▲" : "▼"}</span>
              </button>
              {mods && (
                <div style={{ background: "#FBFAF7", borderBottom: "1px solid #EEECE6" }}>
                  {allowed.map((m) => m.key === module ? (
                    <div key={m.key} className="px-3 py-1.5 text-sm font-bold flex items-center gap-2" style={{ color: NAVY, background: "var(--paper)" }}>
                      <span>{m.icon}</span> {m.label} <span className="ml-auto text-xs font-semibold" style={{ color: "var(--green)" }}>you are here</span>
                    </div>
                  ) : (
                    <a key={m.key} href={m.href} className="px-3 py-1.5 text-sm font-semibold flex items-center gap-2 hover:bg-white" style={{ color: NAVY, textDecoration: "none" }}>
                      <span>{m.icon}</span> {m.label} <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>{m.blurb}</span>
                    </a>
                  ))}
                  {may === null && <div className="px-3 py-1 text-xs" style={{ color: "var(--muted)" }}>checking your doors…</div>}
                </div>
              )}
            </div>
            <a href="/idp" className="block px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: NAVY, textDecoration: "none", borderBottom: "1px solid #EEECE6" }}>🪪 My sheet &amp; IDP</a>
            {menu && <div className="genie-menu-extra" style={{ borderBottom: "1px solid #EEECE6" }}>{menu(() => setOpen(false))}</div>}
            <button onClick={() => window.location.reload()} className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50" style={{ color: NAVY, borderBottom: "1px solid #EEECE6" }} title="Same screen, fresh code">⟳ Reload</button>
            <button onClick={logout} className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50" style={{ color: ORANGE }}>⎋ Logout</button>
            {isAdmin && (
              <div className="px-3 py-1.5 text-xs tnum" style={{ color: "var(--muted)", borderTop: "1px solid #EEECE6" }} title="Genie's version — Admin → Updates says what changed">
                Genie {APP_VERSION}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
