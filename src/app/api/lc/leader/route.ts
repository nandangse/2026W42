import { NextResponse } from "next/server";
import { errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { lcMembers, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/lc/leader?email=… — one leader's participation across the
 * council (Dr Raghu, 10 Oct 2026: "make these clickable and open up each
 * leader's page showing his or her participation"): what they wrote, raised,
 * proposed, said, presented, entered and reacted to, and what is assigned
 * to them. The Health Check stays anonymous — only whether they answered a
 * round is shown, which is the fact lc_health_done already holds.
 */
export async function GET(req: Request) {
  try {
    await requireLeader();
    const admin = adminClient();
    const email = String(new URL(req.url).searchParams.get("email") || "").toLowerCase();
    const members = await lcMembers(admin, RAGHU_EMAIL);
    const leader = members.find((m) => m.email === email);
    if (!leader) throw new HttpError(404, "Not on the council.");
    const [
      { data: ssc }, { data: problems }, { data: solutions }, { data: comments }, { data: presentations },
      { data: meetings }, { data: sections }, { data: knowledge }, { data: kpis }, { data: values },
      { data: reactions }, { data: views }, { data: rounds }, { data: done }, { data: checkins },
    ] = await Promise.all([
      admin.from("lc_ssc").select("id,kind,title,created_at").eq("added_by", email).order("created_at", { ascending: false }),
      admin.from("lc_problem").select("id,title,status,created_at").eq("added_by", email).order("created_at", { ascending: false }),
      admin.from("lc_solution").select("id,problem_id,created_at").eq("added_by", email).order("created_at", { ascending: false }),
      admin.from("lc_comment").select("id,ref_kind,ref_id,body,created_at").eq("added_by", email).order("created_at", { ascending: false }),
      admin.from("lc_presentation").select("id,topic,presenter,presented_on,added_by,created_at").or(`added_by.eq.${email},presenter.ilike.%${leader.name.split(" ")[0]}%`).order("created_at", { ascending: false }),
      admin.from("lc_meeting").select("id,held_on,attendees,created_by").order("held_on", { ascending: false }),
      admin.from("lc_section").select("id,kind,title,approved_by,created_at").eq("created_by", email).order("created_at", { ascending: false }),
      admin.from("lc_knowledge").select("id,title,created_at").eq("created_by", email).order("created_at", { ascending: false }),
      admin.from("lc_kpi").select("id,name,group,visibility").eq("assigned_to", email).eq("active", true).order("sort"),
      admin.from("lc_kpi_value").select("kpi_id,month,updated_at").eq("entered_by", email),
      admin.from("lc_reaction").select("ref_kind,ref_id,value,created_at").eq("email", email),
      admin.from("lc_view").select("ref_kind,ref_id,first_at,opens").eq("email", email),
      admin.from("lc_health_round").select("id,label,opened_on,closed_on").order("opened_on", { ascending: false }),
      admin.from("lc_health_done").select("round_id").eq("email", email),
      admin.from("lc_checkin").select("id,meeting_id,on_date,t1,t2,b1,burning,burning_problem_id,goals,plan_99,learning").eq("email", email).order("on_date", { ascending: false }),
    ]);
    /* the problems their solutions and comments sit on, named */
    const pids = [...new Set([...(solutions || []).map((s) => s.problem_id), ...(comments || []).filter((c) => c.ref_kind === "problem").map((c) => c.ref_id)])];
    const { data: pnames } = pids.length ? await admin.from("lc_problem").select("id,title,status").in("id", pids) : { data: [] };
    const first = leader.name.split(" ")[0].toLowerCase();
    const attended = (meetings || []).filter((m) => (m.attendees || []).some((a: string) => a.toLowerCase().includes(first)) || m.created_by === email);
    const doneIds = new Set((done || []).map((d) => d.round_id));
    return NextResponse.json({
      leader,
      checkins: checkins || [],
      ssc: ssc || [], problems: problems || [], solutions: (solutions || []).map((s) => ({ ...s, problem: (pnames || []).find((p) => p.id === s.problem_id) || null })),
      comments: (comments || []).map((c) => ({ ...c, problem: c.ref_kind === "problem" ? (pnames || []).find((p) => p.id === c.ref_id) || null : null })),
      presentations: presentations || [],
      meetings: { attended: attended.map((m) => ({ id: m.id, held_on: m.held_on, wrote: m.created_by === email })), total: (meetings || []).length },
      sections: sections || [], knowledge: knowledge || [],
      kpis: (kpis || []).map((k) => ({ ...k, entered: (values || []).filter((v) => v.kpi_id === k.id).length })),
      valuesEntered: (values || []).length,
      reactions: { up: (reactions || []).filter((r) => r.value === "up").length, down: (reactions || []).filter((r) => r.value === "down").length, question: (reactions || []).filter((r) => r.value === "question").length },
      views: (views || []).length,
      health: (rounds || []).map((r) => ({ label: r.label, open: !r.closed_on, answered: doneIds.has(r.id) })),
    });
  } catch (e) { return errJson(e); }
}
