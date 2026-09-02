import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseIms } from "@/ims/auth";
import ImsApp from "@/components/ims/ImsApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan IMS Genie" };

/**
 * genie.nandan.co.in/ims/<section> — every section at its own URL, so a link
 * to the register somebody is arguing about still means something tomorrow.
 */
const SECTIONS = [
  "dashboard", "certifications", "certificates", "documents",
  "registers", "standards", "tasks", "calendar",
];

/** Dr Raghu's spellings, and the plurals, all land somewhere sensible. */
const ALIAS: Record<string, string> = {
  cert: "certificates", certificate: "certificates", statutory: "certificates",
  certification: "certifications", journey: "certifications",
  document: "documents", docs: "documents", procedures: "documents", manual: "documents",
  register: "registers", risk: "registers", hira: "registers", soa: "registers",
  standard: "standards", clauses: "standards",
  task: "tasks", todo: "tasks", "my-tasks": "tasks",
  events: "calendar", audits: "calendar",
};

export default async function ImsSectionPage({ params }: { params: { section: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await mayUseIms())) redirect("/");

  const raw = params.section.toLowerCase();
  const section = SECTIONS.includes(raw) ? raw : ALIAS[raw];
  if (!section) redirect("/ims");

  return (
    <ImsApp
      section={section}
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
