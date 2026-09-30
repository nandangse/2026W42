import type { Metadata, Viewport } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";
import { ownerRegister } from "@/lib/owner-register";
import JobLive, { JobTasks, type LiveTask, type PastUpdate } from "@/components/job/JobLive";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Job · Nandan Genie" };
/* Its own viewport: this page is opened by a camera pointed at a machine,
   so it must fit the phone rather than be pinched into shape. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * /job/<4-digit number> — what the QR on the machine opens.
 *
 * Dr Raghu, 29 Sep 2026: "the page should be mobile friendly!! Have the job
 * number on the top in small number and freeze it along with the OTD and
 * customer tag and product family. The QR doesn't need to be on the mobile
 * page."
 *
 * IT IS NOT THE PRINTED SHEET, SHRUNK. The A5 board is laid out to be read
 * from across a shop floor and written on with a marker; this is read at
 * arm's length by somebody standing at the machine with one hand free. The
 * same facts, a different shape — and no QR, because the person reading this
 * has already scanned it.
 *
 * THE HEADER IS FROZEN because the question being answered is always "on
 * THIS job" — and a page you can scroll until you have forgotten which job
 * you are looking at is a page that will eventually have somebody update the
 * wrong one.
 *
 * THE BOXES ON THE PAPER ARE EMPTY FOR A PEN. Here they are filled in,
 * because the screen knows.
 */
const dmy = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "—";
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export default async function JobBoardPage({ params }: { params: { no: string } }) {
  const user = await currentUser();
  if (!user || user.disabled) return <Plain title="Sign in to Genie to see this job." sub="This board is for people who work here." link="/login" linkText="Sign in" />;

  const no = String(params.no || "").replace(/\D/g, "");
  if (!no) return <Plain title="That is not a job number." sub="The number on the board is the short one — 2162." link="/" linkText="Go to Genie" />;

  const { data } = await adminClient()
    .from("jobs")
    .select("id, tag, fam, tdd, otd, escalation, note, stat, own, production_owner, kitting_owner, design_owner, pct, kit, delivered, delivered_on")
    .like("id", `%${no}`)
    .order("id", { ascending: false })
    .limit(1);
  const j = (data || [])[0];
  if (!j) return <Plain title={`No job ${no} on the board.`} sub="It may have been delivered and archived." link="/" linkText="Go to Genie" />;

  /* The four owners, named through the profiles register — the same
     mapping the printed board uses. */
  const who = await ownerRegister(adminClient());

  const full = String(j.id);
  const [photos, docs, erpTasks, manualTasks, noteLog, statRows] = await Promise.all([
    adminClient().from("job_photo").select("id", { count: "exact", head: true }).eq("job_id", full),
    adminClient().from("project_doc").select("id", { count: "exact", head: true }).eq("job_id", full).then((r) => r, () => ({ count: null })),
    adminClient().from("erp_tasks").select("id, title, who, due").eq("job_id", full).eq("done", false)
      .then((r) => r, () => ({ data: null })),
    adminClient().from("manual_tasks").select("id, title, who, due").eq("job_id", full).eq("done", false)
      .then((r) => r, () => ({ data: null })),
    /* PAST UPDATES (0176). Falls back to nothing rather than to an error, so
       the page still works on a database where the migration has not run. */
    adminClient().from("job_field_log").select("at, by_name, old_value, new_value")
      .eq("job_id", full).eq("field", "note").order("at", { ascending: false }).limit(25)
      .then((r) => r, () => ({ data: null })),
    /* THE STATUS CHOICES ARE THE BOARD'S OWN VOCABULARY, read from the data
       rather than typed here, so the list cannot drift from what the ERP
       sends and a new stage appears the day a job carries it. */
    adminClient().from("jobs").select("stat").not("stat", "is", null),
  ]);

  const liveTasks: LiveTask[] = [
    ...(((erpTasks as { data?: Record<string, unknown>[] }).data) || []).map((t) => ({
      id: String(t.id), kind: "erp" as const,
      title: String(t.title || "—"),
      who: t.who ? String(t.who) : null,
      due: (t.due as string) || null,
    })),
    ...(((manualTasks as { data?: Record<string, unknown>[] }).data) || []).map((t) => ({
      id: String(t.id), kind: "manual" as const,
      title: String(t.title || "—"),
      who: t.who ? String(t.who) : null,
      due: (t.due as string) || null,
    })),
  ].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

  const updates: PastUpdate[] = (((noteLog as { data?: Record<string, unknown>[] }).data) || []).map((r) => ({
    at: String(r.at), by: r.by_name ? String(r.by_name) : null,
    old: r.old_value ? String(r.old_value) : null,
    now: r.new_value ? String(r.new_value) : null,
  }));

  const statuses = [...new Set(((statRows.data || []) as { stat: string }[]).map((r) => String(r.stat).trim()).filter(Boolean))].sort();

  /* PLANNING AND ADMIN ONLY (his rule). The same three roles /api/job-field
     enforces — shown here so the page does not offer a pencil that the server
     will refuse, which is a worse experience than no pencil. */
  const mayEdit = ["admin", "planner", "project_owner"].includes(String(user.role || ""));

  const kit = Math.round(Number(j.kit) || 0);
  const pct = Math.round(Number(j.pct) || 0);
  const delivered = !!j.delivered;
  const on = today();
  /**
   * WHEN IT HAS GONE, THE DATE ON THE PAGE IS THE DATE IT WENT (his rule).
   * A delivered job still showing a target delivery is a page arguing about
   * a deadline that no longer has anything to do with anybody.
   */
  const late = !delivered && j.tdd && (j.tdd as string) < on ? daysBetween(j.tdd as string, on) : 0;

  return (
    <div style={{ background: "#F4F2EC", minHeight: "100vh", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#16232F" }}>
      {/* ---- the frozen head: which job, and when it is due ---- */}
      <header style={{ position: "sticky", top: 0, zIndex: 5, background: "#16232F", color: "#fff", padding: "10px 14px", boxShadow: "0 2px 10px rgba(22,35,47,.25)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 20, letterSpacing: "-.01em" }}>{no}</b>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, flex: 1, minWidth: 0 }}>{String(j.tag || "")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#8FA1B3" }}>{String(j.fam || "")}</span>
          <span style={{ flex: 1 }} />
          {delivered ? (
            <span style={{ fontSize: 11.5, color: "#7BC67E", fontWeight: 700 }}>
              ACTUAL DELIVERY {dmy(j.delivered_on as string)}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 11.5, color: "#8FA1B3" }}>
                OTD <b style={{ color: "#fff" }}>{dmy(j.otd as string)}</b>
              </span>
              <span style={{ fontSize: 11.5, color: late ? "#FF9A8A" : "#8FA1B3" }}>
                TDD <b style={{ color: late ? "#FF9A8A" : "#fff" }}>{dmy(j.tdd as string)}</b>
                {late ? ` · ${late}d late` : ""}
              </span>
            </>
          )}
        </div>
      </header>

      <div style={{ padding: 14, maxWidth: 680, margin: "0 auto" }}>
        {delivered && (
          <div style={{ background: "#E6F4EA", border: "1px solid #A9D6B8", borderRadius: 10, padding: 12, marginBottom: 12, color: "#0D5A2E" }}>
            <b>Delivered {dmy(j.delivered_on as string)}.</b> The target date no longer applies.
          </div>
        )}

        {!!j.escalation && (
          <div style={{ background: "#FBEAE8", border: "1px solid #F0C6C0", borderRadius: 10, padding: 12, marginBottom: 12, color: "#8A2B20", lineHeight: 1.45 }}>
            <b style={{ letterSpacing: .4, fontSize: 11 }}>ESCALATION</b>
            <div style={{ fontSize: 13.5, marginTop: 2 }}>{String(j.escalation)}</div>
          </div>
        )}

        {/* Everything that can be changed lives in one client island, so
            the page stays a server render and only the editable parts ship
            JavaScript to a phone on shop-floor 4G. */}
        <JobLive
          jobId={full}
          kit={kit}
          pct={pct}
          stat={String(j.stat || "")}
          note={String(j.note || "")}
          statuses={statuses}
          mayEdit={mayEdit}
          delivered={delivered}
          owners={[
            { label: "PROJECT", o: who(j.own) },
            { label: "KITTING", o: who(j.kitting_owner) },
            { label: "PRODUCTION", o: who(j.production_owner) },
            { label: "DESIGN", o: who(j.design_owner) },
          ]}
          tasks={liveTasks}
          updates={updates}
        />

        <div style={{ fontWeight: 700, margin: "18px 0 8px" }}>
          {pct > 0 || kit > 0 ? "This job is in production" : "Not started on the floor yet"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="📋" label="Details of the job" />
          <Act href={`/?job=${encodeURIComponent(full)}`} icon="◆" label="Milestones" />
          <Act href="/?tab=floor" icon="📷" label={`Photos${photos.count ? ` · ${photos.count}` : " · none yet"}`} />
          <Act href="/?tab=jobcomm" icon="₹" label="Commercials" />
          <Act href="/?tab=manpower" icon="👷" label="Labour" />
          <Act label="QC to-do" soon />
          <Act label="QC records" soon />
          <Act label={`TDS${docs.count ? ` · ${docs.count}` : ""}`} soon={!docs.count} href={docs.count ? `/?job=${encodeURIComponent(full)}` : undefined} />
          <Act label="GAD" soon />
          <Act label="QAP" soon />
        </div>

        {/* PENDING TASKS, BELOW THE TILES (his order). */}
        <JobTasks jobId={full} tasks={liveTasks} />

        <p style={{ color: "#8B8F87", fontSize: 12, lineHeight: 1.5, marginTop: 12 }}>
          Greyed tiles have nowhere to go yet — Genie holds no QC record and the document shelf is empty.
          They are shown so you can say where they should live, not so the page can pretend.
        </p>
        <p style={{ color: "#B8B5AC", fontSize: 11, marginTop: 18 }}>
          Nandan Genie · read {dmy(on)} · this page is live; the sheet on the machine is not.
        </p>
      </div>
    </div>
  );
}




function Act({ href, icon, label, soon }: { href?: string; icon?: string; label: string; soon?: boolean }) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, borderRadius: 8,
    padding: "13px 10px", fontWeight: 600, fontSize: 13, textDecoration: "none",
  };
  if (soon || !href) {
    return (
      <span style={{ ...base, background: "#EFEDE7", border: "1px dashed #D5D2C9", color: "#B0ADA4" }}>
        <b style={{ width: 20, textAlign: "center", color: "#C9C6BD" }}>{icon || "·"}</b>
        {label}
        <i style={{ marginLeft: "auto", fontStyle: "normal", fontSize: 10 }}>not built yet</i>
      </span>
    );
  }
  return (
    <a href={href} style={{ ...base, background: "#fff", border: "1px solid #DCD8CC", color: "#16232F" }}>
      <b style={{ width: 20, textAlign: "center", color: "#E4610F", fontSize: 15 }}>{icon}</b>{label}
    </a>
  );
}

function Plain({ title, sub, link, linkText }: { title: string; sub: string; link: string; linkText: string }) {
  return (
    <div style={{ padding: 28, fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
      <h1 style={{ fontSize: 19 }}>{title}</h1>
      <p style={{ color: "#6B7280", lineHeight: 1.5 }}>
        {sub} <a href={link} style={{ color: "#E4610F", fontWeight: 700 }}>{linkText}</a>.
      </p>
    </div>
  );
}
