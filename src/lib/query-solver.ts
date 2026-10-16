import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedUser } from "@/lib/auth";

/**
 * THE QUERY SOLVER (Dr Raghu, 15 Oct 2026). A query is a task with the tick
 * on it. This reads every such task, hangs it on its project (the job's
 * project, else the project the task names) and its client, and numbers it
 * Q-0001. The same rows feed the project book's Query Solver tab, Nandan
 * Tasking's Query Solver view, and — the client-shared ones — the customer's
 * portal.
 *
 * WHO SEES THE TASKING VIEW: "let Tushar and Pankaj and me see it" — the
 * owner, tushar@ and pankajs@. Everyone with the project book sees the
 * project's own tab.
 */
export const QUERY_SOLVER_PEOPLE = ["raghu@nandan.co.in", "tushar@nandan.co.in", "pankajs@nandan.co.in"] as const;
export const maySeeQuerySolver = (u: Pick<AuthedUser, "email" | "isOwner">) => u.isOwner || (QUERY_SOLVER_PEOPLE as readonly string[]).includes(u.email.toLowerCase());

export type QueryRow = {
  id: string; kind: "erp" | "manual"; query_no: number | null; query_kind: "client" | "ours" | null; client_shared: boolean;
  project_id: string | null; project_name: string | null; client: string | null; job_id: string | null; job_tag: string | null;
  raised_on: string | null; title: string; detail: string; who: string; cat: string; esc: string; due: string | null; done: boolean; created_at: string | null;
};
const S = (v: unknown) => String(v ?? "").trim();
const qno = (n: number | null) => (n ? `Q-${String(n).padStart(4, "0")}` : "");
export const queryLabel = qno;

export async function queryRows(admin: SupabaseClient, opts: { projectId?: string; clientNames?: string[]; sharedOnly?: boolean } = {}): Promise<QueryRow[]> {
  /* erp_tasks has no created_at — the ERP's ToDos carry no Genie birth date (found 16 Oct 2026) */
  const pick = "id, job_id, title, detail, who, cat, esc, due, done, query_no, query_kind, client_shared, raised_on";
  const [m, e, jobs, projects] = await Promise.all([
    admin.from("manual_tasks").select(`${pick}, created_at, project`).eq("query_solver", true).limit(5000),
    admin.from("erp_tasks").select(pick).eq("query_solver", true).limit(5000),
    admin.from("jobs").select("id, tag, cust, proj").limit(10000),
    admin.from("projects").select("id, mgr").limit(5000),
  ]);
  if (m.error) throw new Error(m.error.message); if (e.error) throw new Error(e.error.message);
  const jobOf = new Map((jobs.data || []).map((j) => [S(j.id), j]));
  const names = (opts.clientNames || []).map((n) => n.toLowerCase());
  const rows: QueryRow[] = [];
  const push = (t: Record<string, unknown>, kind: "erp" | "manual") => {
    const j = t.job_id ? jobOf.get(S(t.job_id)) : null;
    const project_id = S(j?.proj) || S(t.project) || null;
    const client = S(j?.cust) || null;
    if (opts.projectId && project_id !== opts.projectId) return;
    if (names.length && !names.includes((client || "").toLowerCase())) return;
    if (opts.sharedOnly && !t.client_shared) return;
    rows.push({
      id: S(t.id), kind, query_no: t.query_no == null ? null : Number(t.query_no), query_kind: (t.query_kind as "client" | "ours" | null) || null, client_shared: !!t.client_shared,
      project_id, project_name: project_id ? (projects.data || []).find((p) => S(p.id) === project_id) ? project_id : project_id : null, client,
      job_id: S(t.job_id) || null, job_tag: S(j?.tag) || null,
      raised_on: S(t.raised_on) || S(t.created_at).slice(0, 10) || null, title: S(t.title), detail: S(t.detail), who: S(t.who) || "unassigned", cat: S(t.cat), esc: S(t.esc) || "None",
      due: S(t.due) || null, done: !!t.done, created_at: S(t.created_at) || null,
    });
  };
  for (const t of m.data || []) push(t as Record<string, unknown>, "manual");
  for (const t of e.data || []) push(t as Record<string, unknown>, "erp");
  return rows.sort((a, b) => Number(a.done) - Number(b.done) || (b.query_no || 0) - (a.query_no || 0));
}

/** The customers who have a portal door: active customer organisations, their people, and what is shared with them. */
export async function liveClients(admin: SupabaseClient) {
  const [{ data: orgs }, { data: users }] = await Promise.all([
    admin.from("portal_org").select("slug, name, kind, match_names, active, created_at").eq("kind", "customer").order("name"),
    admin.from("portal_user").select("org_slug, name, email, role, active, last_login_at").eq("active", true),
  ]);
  const shared = await queryRows(admin, { sharedOnly: true });
  return (orgs || []).map((o) => {
    const names = ((o.match_names as string[] | null) || []).map((n) => n.toLowerCase());
    const qs = shared.filter((q) => names.includes((q.client || "").toLowerCase()));
    const ppl = (users || []).filter((u) => u.org_slug === o.slug);
    return { slug: S(o.slug), name: S(o.name), active: o.active !== false, match_names: names, people: ppl.length, last_login: ppl.map((u) => S(u.last_login_at)).filter(Boolean).sort().pop() || null, open_queries: qs.filter((q) => !q.done).length, queries: qs.length, created_at: S(o.created_at) };
  });
}
