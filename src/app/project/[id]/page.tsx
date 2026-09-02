import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ProjectPage from "@/components/ProjectPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project · Genie" };

/**
 * genie.nandan.co.in/project/1716 (Dr Raghu, 2 Sep 2026: "make it clickable
 * and open each project in its own page. Make the url as
 * genie.nandan.co.in/project/1716").
 *
 * The short number is the address on purpose — it is what people say out
 * loud and what they will type from memory. NGSE-PROJ-1716 reaches the same
 * page; the API forgives either spelling.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) redirect("/login");
  return (
    <ProjectPage
      id={params.id}
      email={user.email}
      displayName={user.displayName}
      initials={user.initials ?? null}
      role={user.role ?? "user"}
    />
  );
}
