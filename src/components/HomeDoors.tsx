"use client";
/**
 * THE LANDING, SHAPED TO THE PERSON (Dr Raghu, 6 Sep 2026): "on logging in
 * to Genie have a page that's suitable to the person as per his role,
 * stature and position and what access he has. Then show the apps ... as
 * per the access. Else it won't show at all."
 *
 * The greeting names them from the HRMS record when there is one; the
 * tiles are only the doors that open for this login. The common block —
 * how am I feeling, the thought for the day, birthdays, learning — is My
 * Week's and sits under this on Planning; for labour it sits here with the
 * IDP card.
 */
import { useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";

export interface HomeData {
  kind: "labour" | "staff";
  employee: { name: string; designation: string | null; department: string | null; type: string | null; employee_id: string | null } | null;
  doors: Record<string, boolean>;
  goals: boolean;
  me: { email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean };
}

export const DOORS: { key: string; label: string; icon: string; href: string; blurb: string; color: string }[] = [
  { key: "main", label: "Planning", icon: "🧞", href: "/#floor", blurb: "On Floor, jobs, milestones, delivery", color: "var(--navy)" },
  { key: "crm", label: "CRM", icon: "🤝", href: "/crm", blurb: "Enquiries to orders", color: "var(--blue)" },
  { key: "hrms", label: "HRMS", icon: "👤", href: "/hrms", blurb: "People, pay, appraisals", color: "var(--accent)" },
  { key: "ims", label: "IMS", icon: "📐", href: "/ims", blurb: "Standards, audits, documents", color: "#1B2D6B" },
  { key: "lms", label: "LMS", icon: "📚", href: "/lms", blurb: "Learning", color: "#6D28D9" },
  { key: "accounts", label: "Kuber", icon: "💰", href: "/kuber", blurb: "Books, bank, balances", color: "var(--green)" },
  { key: "vishwakarma", label: "Vishwakarma", icon: "🛠", href: "/vishwakarma", blurb: "Design", color: "#7C3AED" },
  { key: "saamaan", label: "Saamaan", icon: "📦", href: "/saamaan", blurb: "Materials", color: "#B45309" },
  { key: "lc", label: "Leaders Council", icon: "🏛", href: "/lc", blurb: "The council's own room", color: "#0F766E" },
  { key: "ceo", label: "CEO", icon: "🧭", href: "/ceo", blurb: "The company on one page", color: "#1B2A41" },
];

export function useHome(): HomeData | null {
  const [d, setD] = useState<HomeData | null>(null);
  useEffect(() => {
    fetch("/api/home", { cache: "no-store" }).then((r) => r.json()).then(setD).catch((e) => swallow("home", e));
  }, []);
  return d;
}

const hour = () => Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
export const greeting = () => (hour() < 12 ? "Good morning" : hour() < 17 ? "Good afternoon" : "Good evening");

export function Greeting({ d }: { d: HomeData | null }) {
  const name = d?.employee?.name || d?.me.displayName || d?.me.email.split("@")[0] || "";
  const sub = [d?.employee?.designation, d?.employee?.department].filter(Boolean).join(" · ") || (d ? d.me.role.replace("_", " ") : "");
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="mb-3">
      <div className="font-bold" style={{ fontSize: 22, color: "var(--navy)", lineHeight: 1.2 }}>{greeting()}, {name || "…"}</div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}{sub ? " · " : ""}{today}</div>
    </div>
  );
}

/**
 * The doors that open for this login, as buttons (Dr Raghu, 6 Sep 2026:
 * "make the buttons better also! not like number cards — show the larger
 * icon and text. The description is not needed. It can be on mouseover").
 */
export function DoorTiles({ d, current, onGo }: { d: HomeData | null; current?: string; onGo?: (key: string) => boolean }) {
  if (!d) return null;
  const mine = DOORS.filter((x) => d.doors[x.key]);
  if (mine.length <= 1 && current === "main") return null;
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {mine.map((x) => {
        const here = x.key === current;
        return (
          <a key={x.key} href={x.href} title={`${x.label} — ${x.blurb}`}
            onClick={(e) => { if (onGo && onGo(x.key)) e.preventDefault(); }}
            className="flex items-center gap-2 rounded-lg font-bold"
            style={{
              padding: "10px 16px 10px 12px", fontSize: 16, textDecoration: "none",
              background: here ? x.color : "#fff", color: here ? "#fff" : x.color,
              border: `2px solid ${x.color}`, boxShadow: here ? "none" : "0 1px 2px rgba(0,0,0,.06)",
            }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{x.icon}</span>
            <span>{x.label}</span>
          </a>
        );
      })}
    </div>
  );
}
