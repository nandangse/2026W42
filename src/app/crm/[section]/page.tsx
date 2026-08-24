import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mayUseCrm } from "@/crm/auth";
import { UPDATES } from "@/lib/changelog";
import CrmApp, { SPECIAL_SECTIONS } from "@/components/crm/CrmApp";
import { doctypeBySlug } from "@/crm/doctypes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan CRM Genie" };

/**
 * genie.nandan.co.in/crm/<section> — every section at its own URL, in
 * Dr Raghu's spellings. A doctype's own name always works too, so a link
 * copied from anywhere keeps meaning something.
 */
const SECTION_TO_SLUG: Record<string, string> = {
  lead: "lead",
  leads: "lead",
  company: "company",
  companies: "company",
  contact: "person",
  contacts: "person",
  person: "person",
  quotation: "quotation",
  quotations: "quotation",
  quoteline: "quotation_line",
  opportunity: "opportunity",
  opportunities: "opportunity",
  salesorder: "sales_order",
  salesorders: "sales_order",
  salesinvoice: "sales_invoice",
  salesinvoices: "sales_invoice",
  interactions: "interaction",
  interaction: "interaction",
  task: "task",
  tasks: "task",
  address: "address",
  phone: "person_phone",
  product: "product",
  products: "product",
  masters: "sector",
  sector: "sector",
  industry: "industry",
  stage: "stage",
  users: "profile",
  profile: "profile",
};

export default async function CrmSectionPage({ params }: { params: { section: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  if (!(await mayUseCrm())) redirect("/");

  const section = params.section.toLowerCase();

  // The sales plan already lives in Genie — the CRM url is a doorway to it.
  if (section === "salesplan") redirect("/sales-plan");

  const special = SPECIAL_SECTIONS.find((s) => s.name === section)?.name;
  const slug = special ?? SECTION_TO_SLUG[section] ?? doctypeBySlug(section)?.name;
  if (!slug) redirect("/crm");

  return (
    <CrmApp
      email={user.email}
      displayName={user.displayName}
      version={UPDATES[0].v}
      initialSlug={slug}
    />
  );
}
