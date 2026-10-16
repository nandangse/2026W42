import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import GenieShell from "@/components/GenieShell";
import Connect from "@/components/Connect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an agent · Genie" };

/** /connect — a person's keys to Genie's MCP door, and Genie's own connection to Perisclaw (16 Oct 2026). */
export default async function ConnectPage({ searchParams }: { searchParams?: { perisclaw?: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  return (
    <div style={{ minHeight: "100vh", background: "#F4F2EC" }}>
      <GenieShell module="main" title="Connect an agent" tagline="Genie's door for Perisclaw, Claude and any MCP client" user={{ email: user.email, displayName: user.displayName, initials: user.initials, role: user.role }} />
      <div className="mx-auto px-4 py-4" style={{ maxWidth: 980 }}>
        <Connect isOwner={user.isOwner} email={user.email} perisclawNote={searchParams?.perisclaw || null} />
      </div>
    </div>
  );
}
