import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { jobBoardBody, type BoardJob } from "@/lib/job-board";
import { APP_VERSION } from "@/lib/version";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Job Display Board · Nandan Genie" };

/**
 * /job/<4-digit number> — what the QR on the machine opens.
 *
 * Dr Raghu, 28 Sep 2026: "the QR should point to a page called
 * genie.nandan.co.in/job/<XXXX>. This will open up to whoever is logged in
 * to genie."
 *
 * THE SHORT NUMBER IS THE ONE PAINTED ON THE MACHINE. Genie's own id is
 * 2025262162 — the year and the number together — and nobody on the floor
 * knows it or should have to. The URL takes 2162, because that is what is
 * written on the job, on the drawing and on the board.
 *
 * IT IS THE SAME BOARD, ONLY TRUE. The paper is out of date the moment it is
 * pinned up; this page is the same layout read from the database now. That
 * is the entire reason the code is on the paper.
 */
export default async function JobBoardPage({ params }: { params: { no: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>Sign in to Genie to see this job.</h1>
        <p style={{ color: "#6B7280" }}>
          This board is for people who work here. <a href="/login" style={{ color: "#E4610F", fontWeight: 700 }}>Sign in</a>.
        </p>
      </div>
    );
  }

  const no = String(params.no || "").replace(/\D/g, "");
  if (!no) return <Missing what="That is not a job number." />;

  /* The number as painted on the machine, matched against the id's tail —
     ordered newest first, because a four-digit number can repeat across
     years and the one somebody is standing in front of is the recent one. */
  const { data } = await adminClient()
    .from("jobs")
    .select("id, tag, fam, tdd, otd, escalation, own, quality_owner, production_owner, kitting_owner, design_owner, active, pct, kit")
    .like("id", `%${no}`)
    .order("id", { ascending: false })
    .limit(1);
  const j = (data || [])[0];
  if (!j) return <Missing what={`No job ${no} on the board.`} />;

  const init = (v: unknown) => {
    const s = String(v || "").trim();
    if (!s) return null;
    if (s.includes("@")) return s.split("@")[0].slice(0, 4).toUpperCase();
    return s.length <= 4 ? s.toUpperCase() : s.split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase();
  };

  const job: BoardJob = {
    id: no,
    tag: String(j.tag || ""),
    fam: String(j.fam || ""),
    tdd: (j.tdd as string) || null,
    otd: (j.otd as string) || null,
    pm: init(j.own),
    kitting: init(j.kitting_owner),
    production: init(j.production_owner),
    design: init(j.design_owner),
    escalation: (j.escalation as string) || null,
    url: "",
  };
  const { css, html } = await jobBoardBody([job], today(), user.email.split("@")[0], APP_VERSION);

  /* What is actually on file for this job, counted rather than promised. */
  const full = String(j.id);
  const [photos, docs, tasks] = await Promise.all([
    adminClient().from("job_photo").select("id", { count: "exact", head: true }).eq("job_id", full),
    adminClient().from("project_doc").select("id", { count: "exact", head: true }).eq("job_id", full).then((r) => r, () => ({ count: null })),
    adminClient().from("erp_tasks").select("job_id", { count: "exact", head: true }).eq("job_id", full).eq("done", false),
  ]);
  const inProduction = Number(j.pct) > 0 || Number(j.kit) > 0;

  return (
    <div style={{ background: "#E9E7E0", minHeight: "100vh", padding: "16px 0" }}>
      <style dangerouslySetInnerHTML={{ __html: `${css}
        .pg { margin: 0 auto; background: #fff; box-shadow: 0 6px 24px rgba(22,35,47,.18); }
        @media (max-width: 230mm) { .pg { transform-origin: top left; } }
        .live { max-width: 210mm; margin: 0 auto 10px; font: 13px/1.5 system-ui, sans-serif; color: #46545F; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
        .acts { max-width: 210mm; margin: 14px auto 40px; font: 13px/1.4 system-ui, sans-serif; }
        .actshd { font-weight: 700; color: #16232F; margin-bottom: 8px; }
        .actgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
        .act { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #DCD8CC;
               border-radius: 8px; padding: 12px 10px; color: #16232F; text-decoration: none; font-weight: 600; }
        .act b { font-size: 16px; color: #E4610F; width: 20px; text-align: center; }
        .act.off { color: #B8B5AC; background: #F4F2EC; border-style: dashed; }
        .act.off b { color: #C9C6BD; }
        .act i { margin-left: auto; font-style: normal; font-size: 10px; letter-spacing: .04em; }
        .actnote { color: #8B8F87; font-size: 12px; margin-top: 10px; line-height: 1.5; }
        /* Scanned on a phone at the machine — the sheet scales to fit it. */
        @media (max-width: 800px) {
          .pg { width: 100%; height: auto; min-height: 0; }
          .jno { font-size: 88pt; }
          .tag { font-size: 14pt; }
        }
      ` }} />
      <div className="live">
        <b style={{ color: "#0D7A3F" }}>● Live</b>
        <span>Kitting <b>{Math.round(Number(j.kit) || 0)}%</b> · Production <b>{Math.round(Number(j.pct) || 0)}%</b> as Genie has it now.</span>
        <span style={{ flex: 1 }} />
        <a href={`/?job=${encodeURIComponent(String(j.id))}`} style={{ color: "#E4610F", fontWeight: 700 }}>Open the full job plan →</a>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />

      {/**
        * WHAT YOU CAN DO, STANDING AT THE MACHINE (Dr Raghu, 28 Sep 2026:
        * "once the QR page opens, if it's in production, then show buttons
        * for QC ToDo, Labour, Details of Job, Commercials, Kitting %,
        * Production %, Photo, Status, ToDo, Milestones, TDS, GAD, QAP, QC
        * Records etc").
        *
        * A TILE THAT IS NOT BUILT SAYS SO. Half of this list has no home in
        * Genie yet — there is no QC table at all, and the document shelf is
        * empty. Drawing them as live buttons that quietly go nowhere would
        * teach the floor that this page does not work, which is the one
        * thing a board on a machine cannot afford.
        */}
      <div className="acts">
        <div className="actshd">
          {inProduction ? "This job is in production" : "Not started on the floor yet"}
        </div>
        <div className="actgrid">
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="📋" label="Details of the job" />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="◆" label="Milestones" />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="%" label={`Kitting ${Math.round(Number(j.kit) || 0)}%`} />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="%" label={`Production ${Math.round(Number(j.pct) || 0)}%`} />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="✎" label="Status" />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="☑" label={`To-do${tasks.count ? ` · ${tasks.count}` : ""}`} />
          <Act href="/?tab=floor" icon="📷" label={`Photos${photos.count ? ` · ${photos.count}` : " · none yet"}`} />
          <Act href="/?tab=jobcomm" icon="₹" label="Commercials" />
          <Act href="/?tab=manpower" icon="👷" label="Labour" />
          <Act label="QC to-do" soon />
          <Act label="QC records" soon />
          <Act label={`TDS${docs.count ? ` · ${docs.count}` : ""}`} soon={!docs.count} href={docs.count ? `/?job=${encodeURIComponent(full)}` : undefined} />
          <Act label="GAD" soon />
          <Act label="QAP" soon />
        </div>
        <div className="actnote">
          Greyed tiles have nowhere to go yet — there is no QC record in Genie and the document shelf is empty.
          They are shown so you can say where they should live, not so the page can pretend.
        </div>
      </div>
    </div>
  );
}

function Act({ href, icon, label, soon }: { href?: string; icon?: string; label: string; soon?: boolean }) {
  if (soon || !href) {
    return <span className="act off"><b>{icon || "·"}</b>{label}<i>not built yet</i></span>;
  }
  return <a className="act" href={href}><b>{icon}</b>{label}</a>;
}

function Missing({ what }: { what: string }) {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>{what}</h1>
      <p style={{ color: "#6B7280" }}>
        The number on the board is the short one — 2162, not the long id.{" "}
        <a href="/" style={{ color: "#E4610F", fontWeight: 700 }}>Go to Genie</a>.
      </p>
    </div>
  );
}
