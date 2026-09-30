import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { boardReportHtml } from "@/lib/board-report";
import { boardData, type BoardData } from "@/lib/board-report-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Management Report to the Board" };

/**
 * /board-report/print?id=… — an archived report, exactly as it was presented.
 * /board-report/print       — one drawn from the books as they stand now.
 *
 * A PAGE OF ITS OWN, like the job board's. The thing that goes in front of a
 * Board must not carry a pixel of the tool that made it, and "print what you
 * see" always ends up printing a tab strip.
 */
export default async function BoardReportPrint({ searchParams }: { searchParams: { id?: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>Sign in first.</h1></div>;
  }

  let data: BoardData | null = null;
  let when = "";
  const id = String(searchParams.id || "").trim();
  if (id) {
    const { data: row } = await adminClient()
      .from("board_report").select("snapshot, title, at, by").eq("id", id).maybeSingle();
    if (!row) {
      return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>That report is not in the archive.</h1>
        <p><a href="/accounts?open=cfonote">Back to the CFO Note</a></p>
      </div>;
    }
    data = row.snapshot as BoardData;
    when = `generated ${new Date(String(row.at)).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} by ${String(row.by || "").split("@")[0]}`;
  } else {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    data = await boardData(adminClient(), today);
    when = "drawn from the books as they stand now — not archived";
  }

  const html = boardReportHtml(data);
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${css}
        .pg { margin: 0 auto 8px; box-shadow: 0 4px 16px rgba(22,35,47,.15); }
        .noprint { max-width:210mm; margin: 12px auto; font: 13px/1.6 system-ui, sans-serif; color:#46545F;
                   display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .noprint b { color:#16232F }
        @media print { .noprint { display:none } body { background:#fff } .pg { box-shadow:none; margin:0 } }
      ` }} />
      <div className="noprint">
        <b>Print at A4, portrait, no scaling.</b>
        <span>Page numbers are on every page.</span>
        <span style={{ marginLeft: "auto", fontSize: 12 }}>{when}</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
