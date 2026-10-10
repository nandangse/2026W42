"use client";
/**
 * THE PLAIN FRONT PAGE (Dr Raghu, 10 Oct 2026): "Make a plain vanilla
 * front page for them where, when they log in, they only see the message
 * regarding the birthdays, the thought for the day, but not regarding the
 * deliveries, etc."
 *
 * For a staff login without the Planning tick. The greeting, the doors
 * that DO open for them, how am I feeling, the thought, the picture quote,
 * birthdays and their learning — and nothing from the floor. Labour keeps
 * its own page with the IDP card on top; this is the same shape without it.
 */
import GenieShell from "@/components/GenieShell";
import { Greeting, DoorTiles, useHome } from "@/components/HomeDoors";
import { useMyWeek, HowsMyDay, ImageQuote, Birthdays, MyLearningCard } from "@/components/MyWeekPanels";
import { QuoteCard } from "@/components/QuoteOfDay";
import WhatsAppFab from "@/components/WhatsAppFab";

export default function StaffHome({ email, displayName, initials, role }: { email: string; displayName: string | null; initials: string | null; role: string }) {
  const d = useHome();
  const [week, refresh] = useMyWeek();
  return (
    <GenieShell module="main" title="Nandan Genie" tagline="Your day, your people, your doors" user={{ email, displayName, initials, role }}>
      <div className="p-3 mx-auto" style={{ maxWidth: 720 }}>
        <Greeting d={d} />
        <DoorTiles d={d} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr" }}>
          <HowsMyDay data={week} onSaved={refresh} />
          <QuoteCard />
          <ImageQuote data={week} isAdmin={false} />
          <Birthdays data={week} />
          <MyLearningCard data={week} onOpenLms={() => { window.location.href = "/lms"; }} />
          <a href="/idp" className="block rounded-lg p-3" style={{ background: "#fff", border: "1px solid var(--line)", color: "var(--navy)", textDecoration: "none" }}>
            <b>🪪 My sheet &amp; IDP →</b> <span className="text-sm" style={{ color: "var(--dim)" }}>your record, pay slips, leave, your IDP, the handbook.</span>
          </a>
        </div>
      </div>
      <WhatsAppFab form="Genie Home" name={displayName || email.split("@")[0]} />
    </GenieShell>
  );
}
