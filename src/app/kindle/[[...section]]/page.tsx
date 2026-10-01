import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentKindler } from "@/lib/kindle/auth";
import KindleApp from "@/components/kindle/KindleApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kindle", robots: { index: false, follow: false } };

/**
 * genie.nandan.co.in/kindle — the Ascent Kindle Trust Group's own site
 * (Dr Raghu, 1 Oct 2026). Its own login realm: a Kindle session cookie, or
 * a Genie login whose e-mail is one of the ten. Nobody else gets past this
 * line, and nothing of Nandan's is drawn behind it.
 */
export default async function KindlePage({ params }: { params: { section?: string[] } }) {
  const k = await currentKindler();
  if (!k) redirect("/kindle/login");
  return <KindleApp initialSection={params.section?.[0] || "home"} initialArg={params.section?.[1] || null} />;
}
