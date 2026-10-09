import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveAccountsAccess } from "@/lib/accounts";
import { cfoReportHtml } from "@/lib/cfo-report";
import { cfoReportData, type CfoData } from "@/lib/cfo-report-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CFO Monthly Report" };

/**
 * /cfo-report/print?id=…        an archived report, exactly as it was kept
 * /cfo-report/print?month=YYYY-MM   one drawn from the books as they stand now
 *
 * A page of its own, like the board report's: what goes in front of the
 * Board must not carry a pixel of the tool that made it.
 */
export default async function CfoReportPrint({ searchParams }: { searchParams: { id?: string; month?: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>Sign in first.</h1></div>;
  }
  /* The same door as /api/cfo-report: the Kuber tick (audit S6, 9 Oct 2026). */
  if (user.lmsOnly || !(await resolveAccountsAccess(adminClient(), user.email, user.isOwner))) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>Not allowed.</h1><p>The CFO report is behind Kuber&apos;s door — the tick on Admin → module access.</p></div>;
  }
  let data: CfoData | null = null;
  let when = "";
  const id = String(searchParams.id || "").trim();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (id) {
    const { data: row } = await adminClient().from("cfo_report").select("snapshot, title, at, by").eq("id", id).maybeSingle();
    if (!row) {
      return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>That report is not in the archive.</h1><p><a href="/kuber#cfonote">Back to the CFO Note</a></p></div>;
    }
    data = row.snapshot as CfoData;
    when = `generated ${new Date(String(row.at)).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} by ${String(row.by || "").split("@")[0]}`;
  } else {
    const month = /^\d{4}-\d{2}$/.test(String(searchParams.month || "")) ? String(searchParams.month) : today.slice(0, 7);
    data = await cfoReportData(adminClient(), month, today);
    when = "drawn from the books as they stand now — not archived";
  }
  const html = cfoReportHtml(data);
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${css}
        .pg { margin: 0 auto 8px; box-shadow: 0 4px 16px rgba(22,35,47,.15); }
        .noprint { max-width:210mm; margin: 12px auto; font: 13px/1.6 system-ui, sans-serif; color:#46545F; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .noprint b { color:#16232F }
        @media print { .noprint { display:none } body { background:#fff } .pg { box-shadow:none; margin:0 } }
      ` }} />
      <div className="noprint">
        <b>Print at A4, portrait, no scaling.</b><span>Page numbers are on every page.</span>
        <span style={{ marginLeft: "auto", fontSize: 12 }}>{when}</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
