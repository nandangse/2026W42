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

  return (
    <div style={{ background: "#E9E7E0", minHeight: "100vh", padding: "16px 0" }}>
      <style dangerouslySetInnerHTML={{ __html: `${css}
        .pg { margin: 0 auto; background: #fff; box-shadow: 0 6px 24px rgba(22,35,47,.18); }
        @media (max-width: 230mm) { .pg { transform-origin: top left; } }
        .live { max-width: 210mm; margin: 0 auto 10px; font: 13px/1.5 system-ui, sans-serif; color: #46545F; display: flex; gap: 10px; align-items: baseline; }
      ` }} />
      <div className="live">
        <b style={{ color: "#0D7A3F" }}>● Live</b>
        <span>Kitting <b>{Math.round(Number(j.kit) || 0)}%</b> · Production <b>{Math.round(Number(j.pct) || 0)}%</b> as Genie has it now.</span>
        <span style={{ flex: 1 }} />
        <a href={`/?job=${encodeURIComponent(String(j.id))}`} style={{ color: "#E4610F", fontWeight: 700 }}>Open the full job plan →</a>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
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
