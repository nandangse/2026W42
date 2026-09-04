import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { DOCS, fnfDocHtml, type DocKey, type FnfRow } from "@/lib/fnf";
import LetterPrint from "@/components/hrms/LetterPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/fnf/<id>/print?doc=<key> — one of the six settlement papers on its
 * own, laid out for paper. Same door as /hrms.
 */
export default async function FnfPrintPage({ params, searchParams }: { params: { id: string }; searchParams: { doc?: string } }) {
  const user = await currentUser();
  const allowed = !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>You are not authorized to view this Page - Login at the right page</h1>
      </div>
    );
  }
  const { data } = await adminClient().from("hrms_fnf").select("*").eq("id", params.id).maybeSingle();
  if (!data) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>No such settlement.</div>;
  const r = data as FnfRow;
  const doc = (DOCS.find((d) => d.key === searchParams.doc)?.key ?? "letter") as DocKey;
  const label = DOCS.find((d) => d.key === doc)!.label;
  const draft = r.status === "Open" || r.status === "Calculated";
  return <LetterPrint html={fnfDocHtml(r, doc, user!.displayName || user!.email)} kind={label} name={r.name} ref={r.fnf_no || ""} draft={draft && doc !== "resignation"} footer={`${label} · ${r.name} · Employee ID ${r.employee_id}`} />;
}
