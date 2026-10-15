import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { maySeeQuerySolver, queryRows, liveClients } from "@/lib/query-solver";

export const dynamic = "force-dynamic";

/**
 * GET /api/query-solver            every query, by project — Dr Raghu, Tushar, Pankaj
 * GET /api/query-solver?clients=1  the customers with a portal door (Live Clients)
 * A project's own queries come with the project book (/api/project-tab).
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    if (!maySeeQuerySolver(u)) throw new HttpError(403, "The Query Solver is open to Dr Raghu, Tushar and Pankaj.");
    const admin = adminClient();
    const q = new URL(req.url).searchParams;
    if (q.get("clients")) return NextResponse.json({ clients: await liveClients(admin) });
    return NextResponse.json({ rows: await queryRows(admin) });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/query_solver|does not exist|schema cache/i.test(m)) return NextResponse.json({ installed: false, rows: [], clients: [] });
    return errJson(e);
  }
}
