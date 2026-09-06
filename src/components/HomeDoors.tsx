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
  { key: "main", label: "Planning", icon: "🧞", href: "/#floor", blurb: "On Floor, jobs, milestones, delivery", color: "#16232F" },
  { key: "crm", label: "CRM", icon: "🤝", href: "/crm", blurb: "Enquiries to orders", color: "#1B3A5C" },
  { key: "hrms", label: "HRMS", icon: "👤", href: "/hrms", blurb: "People, pay, appraisals", color: "#E8600A" },
  { key: "ims", label: "IMS", icon: "📐", href: "/ims", blurb: "Standards, audits, documents", color: "#1B2D6B" },
  { key: "lms", label: "LMS", icon: "📚", href: "/lms", blurb: "Learning", color: "#6D28D9" },
  { key: "accounts", label: "Kuber", icon: "💰", href: "/kuber", blurb: "Books, bank, balances", color: "#0D7A3F" },
  { key: "vishwakarma", label: "Vishwakarma", icon: "🛠", href: "/vishwakarma", blurb: "Design", color: "#7C3AED" },
  { key: "saamaan", label: "Saamaan", icon: "📦", href: "/saamaan", blurb: "Materials", color: "#B45309" },
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
      <div className="font-bold" style={{ fontSize: 22, color: "#16232F", lineHeight: 1.2 }}>{greeting()}, {name || "…"}</div>
      <div className="text-xs" style={{ color: "#8A94A0" }}>{sub}{sub ? " · " : ""}{today}</div>
    </div>
  );
}

/** The doors that open for this login, as tiles. Nothing shows for a door they do not hold. */
export function DoorTiles({ d, current, onGo }: { d: HomeData | null; current?: string; onGo?: (key: string) => boolean }) {
  if (!d) return null;
  const mine = DOORS.filter((x) => d.doors[x.key]);
  if (mine.length <= 1 && current === "main") return null;
  return (
    <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {mine.map((x) => (
        <a key={x.key} href={x.href}
          onClick={(e) => { if (onGo && onGo(x.key)) e.preventDefault(); }}
          className="rounded-lg p-3 flex flex-col gap-1"
          style={{ background: x.key === current ? "#F1EFE9" : "#fff", border: `1px solid ${x.key === current ? x.color : "#E2E0DA"}`, borderTop: `3px solid ${x.color}`, textDecoration: "none", color: "#16232F", minHeight: 78 }}>
          <div className="flex items-center gap-2 font-bold" style={{ fontSize: 15 }}><span>{x.icon}</span>{x.label}</div>
          <div className="text-xs" style={{ color: "#5A6672" }}>{x.blurb}</div>
          {x.key === current && <div className="text-xs font-semibold mt-auto" style={{ color: "#0D7A3F" }}>you are here</div>}
        </a>
      ))}
    </div>
  );
}
