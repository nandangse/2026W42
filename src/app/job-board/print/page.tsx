import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { jobBoardHtml, type BoardJob } from "@/lib/job-board";
import { APP_VERSION } from "@/lib/version";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Job Display Board" };

/**
 * /job-board/print?jobs=2162,2601 — the boards, laid out for A5 paper.
 *
 * A PAGE OF ITS OWN, not a print stylesheet over the delivery board. The
 * thing that gets fixed to a machine must not carry a single pixel of the
 * tool that made it, and "print what you see" always ends up printing a tab
 * strip.
 */
export default async function JobBoardPrint({ searchParams }: { searchParams: { jobs?: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>Sign in first.</h1></div>;
  }
  const ids = String(searchParams.jobs || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
  if (!ids.length) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><h1 style={{ fontSize: 20 }}>Tick some jobs on the Delivery Board first.</h1></div>;
  }

  const { data } = await adminClient()
    .from("jobs")
    .select("id, tag, fam, tdd, otd, escalation, own, production_owner, kitting_owner, design_owner, is_vehicle, chassis_no, engine_no, vehicle_model")
    .in("id", ids);

  const init = (v: unknown) => {
    const s = String(v || "").trim();
    if (!s) return null;
    if (s.includes("@")) return s.split("@")[0].slice(0, 4).toUpperCase();
    return s.length <= 4 ? s.toUpperCase() : s.split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase();
  };
  /* Kept in the order they were ticked, so a stack of printouts comes out in
     the order somebody chose rather than in the database's. */
  const byId = new Map((data || []).map((j) => [String(j.id), j]));
  const jobs: BoardJob[] = ids.map((id) => byId.get(id)).filter(Boolean).map((j) => ({
    id: String(j!.id).replace(/\D/g, "").slice(-4),
    tag: String(j!.tag || ""),
    fam: String(j!.fam || ""),
    tdd: (j!.tdd as string) || null,
    otd: (j!.otd as string) || null,
    pm: init(j!.own),
    kitting: init(j!.kitting_owner),
    production: init(j!.production_owner),
    design: init(j!.design_owner),
    escalation: (j!.escalation as string) || null,
    /* Ticked, or answered by the fact that somebody has already recorded a
       number — recording one is itself saying it is a vehicle. */
    isVehicle: !!j!.is_vehicle || !!j!.chassis_no || !!j!.engine_no || !!j!.vehicle_model,
    chassisNo: (j!.chassis_no as string) || null,
    engineNo: (j!.engine_no as string) || null,
    vehicleModel: (j!.vehicle_model as string) || null,
  }));

  const html = await jobBoardHtml(jobs, today(), user.email.split("@")[0], APP_VERSION);
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${css}
        body { background:#E9E7E0; }
        .pg { margin: 0 auto 8px; background:#fff; box-shadow: 0 4px 16px rgba(22,35,47,.15); }
        .noprint { max-width:210mm; margin: 10px auto; font: 13px/1.5 system-ui, sans-serif; }
        @media print { .noprint { display:none } body { background:#fff } .pg { box-shadow:none; margin:0 } }
      ` }} />
      <div className="noprint">
        <b>{jobs.length} board{jobs.length === 1 ? "" : "s"}.</b>{" "}
        Print at <b>A5, landscape, no scaling</b>. Two copies — one for the machine, one for the file.
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
