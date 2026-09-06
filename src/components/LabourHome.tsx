"use client";
/**
 * Home for labour (Dr Raghu, 6 Sep 2026: "for all labour it will show IDP
 * and that will take him to the IDP page"). The common block everybody
 * gets — how am I feeling, the thought, birthdays, learning — and one big
 * card into their own sheet. Built for a phone first.
 */
import GenieShell from "@/components/GenieShell";
import { Greeting, DoorTiles, useHome } from "@/components/HomeDoors";
import { useMyWeek, HowsMyDay, ImageQuote, Birthdays, MyLearningCard } from "@/components/MyWeekPanels";
import { QuoteCard } from "@/components/QuoteOfDay";
import WhatsAppFab from "@/components/WhatsAppFab";

export default function LabourHome({ email, displayName, initials, role }: { email: string; displayName: string | null; initials: string | null; role: string }) {
  const d = useHome();
  const [week, refresh] = useMyWeek();
  return (
    <GenieShell module="main" title="Nandan Genie" tagline="Your sheet, your IDP, your day" user={{ email, displayName, initials, role }}>
      <div className="p-3 mx-auto" style={{ maxWidth: 720 }}>
        <Greeting d={d} />
        <a href="/idp" className="block rounded-lg p-4 mb-3" style={{ background: "var(--navy)", color: "#fff", textDecoration: "none", borderLeft: "5px solid #E8600A" }}>
          <div className="font-bold" style={{ fontSize: 18 }}>🪪 My sheet &amp; IDP →</div>
          <div className="text-sm mt-1" style={{ color: "#CBD5E1" }}>Your record, pay slips, leave and loan registers, your IDP, the handbook, and a word to HR.</div>
        </a>
        <DoorTiles d={d} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr" }}>
          <HowsMyDay data={week} onSaved={refresh} />
          <QuoteCard />
          <ImageQuote data={week} isAdmin={false} />
          <Birthdays data={week} />
          <MyLearningCard data={week} onOpenLms={() => { window.location.href = "/lms"; }} />
        </div>
      </div>
      <WhatsAppFab form="Genie Home" name={displayName || email.split("@")[0]} />
    </GenieShell>
  );
}
