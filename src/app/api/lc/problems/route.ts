import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "under_process", "needs_deep_dive", "deployed", "cancelled"] as const;

/**
 * The Solution Board (Dr Raghu, 10 Oct 2026): "Problem, description of
 * problem, crowdsourced solution — each one can add a solution of their own
 * — LC discussion … Genie Summary … status New, Deployed, Under process,
 * Needs deep dive, Cancelled … tentative date … the edit button for Raghu
 * as well as the one who has written it. All the rest can only see the view,
 * but they can have an engagement of thumbs up, thumbs down, or a question
 * mark where clarity is required … problems blocked, problems solved, YTD,
 * QTD, MTD or the date range."
 *
 *   GET ?from&to     → the board with tallies, plus the counts for the range
 *   GET ?id=…        → one, with solutions, comments and reactions
 *   POST create { title, description, tentative_on }         — any leader
 *        edit { id, title, description, tentative_on }       — author or owner
 *        status { id, status }                               — author or owner
 *        remove { id }                                       — author or owner
 *        solution { id, body } · edit_solution { solution_id, body } · remove_solution { solution_id }
 *        comment { id, body } · uncomment { comment_id }
 *        react { id, value: up|down|question|none }
 */
const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function GET(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const q = new URL(req.url).searchParams;
    const me = u.email.toLowerCase();
    const id = q.get("id");
    if (id) {
      const { data: p, error } = await admin.from("lc_problem").select("*").eq("id", id).maybeSingle();
      if (error) throw error; if (!p) throw new HttpError(404, "No such problem.");
      const [{ data: solutions }, { data: comments }, { data: reactions }, { data: files }] = await Promise.all([
        admin.from("lc_solution").select("*").eq("problem_id", id).order("created_at"),
        admin.from("lc_comment").select("id,body,added_by,created_at").eq("ref_kind", "problem").eq("ref_id", id).order("created_at"),
        admin.from("lc_reaction").select("ref_kind,ref_id,email,value").in("ref_kind", ["problem", "solution"]),
        admin.from("lc_file").select("id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "problem").eq("ref_id", id).order("created_at"),
      ]);
      const tally = (kind: string, rid: string) => {
        const rs = (reactions || []).filter((r) => r.ref_kind === kind && r.ref_id === rid);
        return { up: rs.filter((r) => r.value === "up").map((r) => r.email), down: rs.filter((r) => r.value === "down").map((r) => r.email), question: rs.filter((r) => r.value === "question").map((r) => r.email), mine: rs.find((r) => r.email === me)?.value || null };
      };
      return NextResponse.json({
        problem: { ...p, ...tally("problem", id), mayEdit: mayEdit(u, p.added_by) },
        solutions: (solutions || []).map((s) => ({ ...s, ...tally("solution", s.id), mayEdit: mayEdit(u, s.added_by) })),
        comments: comments || [], files: files || [],
      });
    }
    const from = q.get("from") || "", to = q.get("to") || "";
    const [{ data: ps, error }, { data: reactions }, { data: solutions }, { data: comments }] = await Promise.all([
      admin.from("lc_problem").select("*").order("created_at", { ascending: false }),
      admin.from("lc_reaction").select("ref_id,email,value").eq("ref_kind", "problem"),
      admin.from("lc_solution").select("problem_id"),
      admin.from("lc_comment").select("ref_id").eq("ref_kind", "problem"),
    ]);
    if (error) throw error;
    const inRange = (d: string | null) => !!d && (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);
    const all = ps || [];
    const stats = {
      from, to,
      raised: all.filter((p) => inRange(p.created_at)).length,
      solved: all.filter((p) => p.status === "deployed" && inRange(p.closed_at)).length,
      blocked: all.filter((p) => p.status === "needs_deep_dive").length,
      open: all.filter((p) => !["deployed", "cancelled"].includes(p.status)).length,
      cancelled: all.filter((p) => p.status === "cancelled" && inRange(p.closed_at)).length,
    };
    return NextResponse.json({
      problems: all.map((p) => {
        const rs = (reactions || []).filter((r) => r.ref_id === p.id);
        return { ...p, up: rs.filter((r) => r.value === "up").length, down: rs.filter((r) => r.value === "down").length, question: rs.filter((r) => r.value === "question").length, mine: rs.find((r) => r.email === me)?.value || null, solutions: (solutions || []).filter((s) => s.problem_id === p.id).length, comments: (comments || []).filter((c) => c.ref_id === p.id).length, mayEdit: mayEdit(u, p.added_by) };
      }),
      stats, today: istToday(),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s || null; };
    const date = (v: unknown) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
    const own = async (id: string) => {
      const { data: p } = await admin.from("lc_problem").select("added_by").eq("id", id).maybeSingle();
      if (!p) throw new HttpError(404, "No such problem.");
      if (!mayEdit(u, p.added_by)) throw new HttpError(403, "The one who raised it, or Dr Raghu.");
    };
    if (b.action === "create") {
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "Name the problem.");
      const { data, error } = await admin.from("lc_problem").insert({ title, description: txt(b.description), tentative_on: date(b.tentative_on), added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || ""); await own(id);
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "Name the problem.");
      const { error } = await admin.from("lc_problem").update({ title, description: txt(b.description), tentative_on: date(b.tentative_on), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "status") {
      const id = String(b.id || ""); await own(id);
      const status = String(b.status || "");
      if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Not a status.");
      const closed = status === "deployed" || status === "cancelled";
      const { error } = await admin.from("lc_problem").update({ status, closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || ""); await own(id);
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "problem").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "problem").eq("ref_id", id);
      await admin.from("lc_comment").delete().eq("ref_kind", "problem").eq("ref_id", id);
      await admin.from("lc_reaction").delete().eq("ref_kind", "problem").eq("ref_id", id);
      const { error } = await admin.from("lc_problem").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "solution") {
      const id = String(b.id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Write the solution.");
      const { data, error } = await admin.from("lc_solution").insert({ problem_id: id, body, added_by: u.email }).select("id").single();
      if (error) throw error;
      await admin.from("lc_problem").update({ updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit_solution" || b.action === "remove_solution") {
      const sid = String(b.solution_id || "");
      const { data: s } = await admin.from("lc_solution").select("added_by").eq("id", sid).maybeSingle();
      if (!s || !mayEdit(u, s.added_by)) throw new HttpError(403, "Your own solution, or Dr Raghu.");
      if (b.action === "remove_solution") { await admin.from("lc_reaction").delete().eq("ref_kind", "solution").eq("ref_id", sid); await admin.from("lc_solution").delete().eq("id", sid); }
      else { const body = String(b.body || "").trim(); if (!body) throw new HttpError(400, "Write the solution."); await admin.from("lc_solution").update({ body, updated_at: new Date().toISOString() }).eq("id", sid); }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "comment") {
      const id = String(b.id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data, error } = await admin.from("lc_comment").insert({ ref_kind: "problem", ref_id: id, body, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "uncomment") {
      const { data: c } = await admin.from("lc_comment").select("added_by").eq("id", String(b.comment_id)).maybeSingle();
      if (!c || !mayEdit(u, c.added_by)) throw new HttpError(403, "Your own comment.");
      await admin.from("lc_comment").delete().eq("id", String(b.comment_id));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "react") {
      const id = String(b.id || ""); const value = String(b.value || "none");
      const kind = b.kind === "solution" ? "solution" : "problem";
      if (value === "none") await admin.from("lc_reaction").delete().eq("ref_kind", kind).eq("ref_id", id).eq("email", u.email);
      else {
        if (!["up", "down", "question"].includes(value)) throw new HttpError(400, "Up, down or a question.");
        const { error } = await admin.from("lc_reaction").upsert({ ref_kind: kind, ref_id: id, email: u.email, value }, { onConflict: "ref_kind,ref_id,email" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
