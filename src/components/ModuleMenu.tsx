"use client";

/**
 * The module switcher — Genie's doors on one list, and the account menu
 * for the modules that had none.
 *
 * Dr Raghu, 28 Aug 2026: the account dropdown should carry Main Genie · CRM ·
 * HRMS · Accounts, gated per person by the ticks on the Admin page (granular
 * roles come later, as roles). Every module's menu shows the same list from
 * /api/modules, so what a person sees is exactly what opens for them.
 *
 * The Reload row is here too: it reloads the page in place, and because every
 * module keeps its position (the CRM in the path, HRMS in the hash, the main
 * app in localStorage) the same screen comes back — unlike the browser's own
 * refresh used to.
 */

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type ModuleKey = "main" | "crm" | "hrms" | "accounts" | "vishwakarma" | "seva" | "ims" | "saamaan";

const MODULES: { key: ModuleKey; label: string; icon: string; href: string }[] = [
  { key: "main", label: "Main Genie", icon: "🧞", href: "/" },
  { key: "crm", label: "CRM", icon: "🤝", href: "/crm" },
  { key: "hrms", label: "HRMS", icon: "👤", href: "/hrms" },
  { key: "accounts", label: "Kuber", icon: "💰", href: "/kuber" },
  { key: "vishwakarma", label: "Vishwakarma", icon: "🛠", href: "/vishwakarma" },
  { key: "seva", label: "Seva", icon: "🛎", href: "/seva" },
  { key: "ims", label: "IMS", icon: "📐", href: "/ims" },
  { key: "saamaan", label: "Saamaan", icon: "📦", href: "/saamaan" },
];

/** The rows alone — dropped into the main app's existing account dropdown. */
export function ModuleLinks({ current }: { current: ModuleKey }) {
  const [may, setMay] = useState<Record<ModuleKey, boolean> | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/modules", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setMay(j); })
      .catch(() => { /* the menu still works without the switcher */ });
    return () => { live = false; };
  }, []);

  const rows = MODULES.filter((m) => m.key === current || !!may?.[m.key]);
  if (rows.length <= 1) return null;

  return (
    <div style={{ borderBottom: "1px solid #EEECE6" }}>
      <div className="px-3 pt-2 pb-1 text-xs font-bold" style={{ color: "#8A94A0", letterSpacing: 1 }}>
        MODULES
      </div>
      {rows.map((m) =>
        m.key === current ? (
          <div key={m.key} className="px-3 py-1.5 text-sm font-bold flex items-center gap-2"
            style={{ color: "#16232F", background: "#F7F5EF" }}>
            <span>{m.icon}</span> {m.label}
            <span className="ml-auto text-xs font-semibold" style={{ color: "#0D7A3F" }}>you are here</span>
          </div>
        ) : (
          <a key={m.key} href={m.href}
            className="block px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 flex items-center gap-2"
            style={{ color: "#16232F", textDecoration: "none" }}>
            <span>{m.icon}</span> {m.label}
          </a>
        ),
      )}
    </div>
  );
}

/** The Reload row — same page, same place, fresh code. */
export function ReloadRow() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-gray-50"
      style={{ color: "#16232F", borderBottom: "1px solid #EEECE6" }}
      title="Reload the page — you come back to the same screen, not the front door"
    >
      ⟳ Reload
    </button>
  );
}

/**
 * The whole chip-and-dropdown, for the modules whose header had only a chip
 * (CRM, HRMS, Accounts): identity, the module list, Reload, Logout.
 */
export default function ModuleMenu({
  current, email, displayName, initials, role,
}: {
  current: ModuleKey;
  email: string;
  displayName: string | null;
  initials: string | null;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const who = displayName || email.split("@")[0];

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  };

  return (
    <span className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-1.5 py-1"
        style={{ background: "#0D161F", border: "1px solid #22303C" }}
        title={`${who} · ${role.replace("_", " ")}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="rounded-full font-bold flex items-center justify-center"
          style={{ width: 26, height: 26, fontSize: 11, letterSpacing: 0.3, background: initials ? "#E8600A" : "#B3261E", color: "#fff" }}>
          {initials || "??"}
        </span>
        <span style={{ color: "#8FA1B3", fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 58 }} role="button" tabIndex={0} onClick={() => setOpen(false)} />
          <div className="absolute rounded-lg border bg-white"
            style={{ top: "calc(100% + 6px)", right: 0, width: 232, borderColor: "#E2E0DA", boxShadow: "0 12px 30px rgba(0,0,0,.25)", zIndex: 59 }}>
            <div className="px-3 py-2.5" style={{ borderBottom: "1px solid #EEECE6" }}>
              <div className="text-sm font-bold truncate" style={{ color: "#16232F" }}>{who}</div>
              <div className="text-xs truncate" style={{ color: "#8A94A0" }}>{email}</div>
              <div className="text-xs mt-1 font-semibold" style={{ color: "#5A6672" }}>{role.replace("_", " ")}</div>
            </div>
            <ModuleLinks current={current} />
            <ReloadRow />
            <button onClick={logout}
              className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-gray-50"
              style={{ color: "#E8600A" }}>
              ⎋ Logout
            </button>
          </div>
        </>
      )}
    </span>
  );
}
