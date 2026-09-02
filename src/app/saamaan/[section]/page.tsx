import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSaamaanAccess } from "@/lib/saamaan";
import SaamaanApp from "@/components/saamaan/SaamaanApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Saamaan Genie" };

/**
 * genie.nandan.co.in/saamaan/<section> — every section at its own URL, so a
 * link to the item somebody is asking about still means something tomorrow.
 */
const SECTIONS = ["dashboard", "items", "projects", "bom", "pull"];

/** The plurals and the plain words all land somewhere sensible. */
const ALIAS: Record<string, string> = {
  item: "items", material: "items", materials: "items", master: "items", stock: "items", rm: "items",
  project: "projects",
  boms: "bom", lines: "bom", "bill-of-materials": "bom",
  erp: "pull", import: "pull", sync: "pull", settings: "pull",
};

export default async function SaamaanSectionPage({ params }: { params: { section: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await resolveSaamaanAccess(adminClient(), user.email, user.isOwner))) redirect("/");

  const raw = params.section.toLowerCase();
  const section = SECTIONS.includes(raw) ? raw : ALIAS[raw];
  if (!section) redirect("/saamaan");

  return (
    <SaamaanApp
      section={section}
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
      isOwner={user.isOwner}
    />
  );
}
