import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { requireUser, errJson, HttpError, type AuthedUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * THE PROJECT'S OWN ROOM — its narratives and its lists.
 *
 * GET  ?id=NGSE-PROJ-1716          everything, in one read
 * POST { action: "doc",  ... }     write one narrative section
 * POST { action: "row",  ... }     add or amend one list row
 * POST { action: "drop", id }      remove one list row
 *
 * Two shapes serve ten tabs (see 0114_project_workspace.sql). The sections
 * are fixed here rather than taken from the caller: a free-text section name
 * would let one typo scatter a project's charter across "charter", "Charter"
 * and "chartre", and nothing would ever show it as missing.
 */
const DOC_SECTIONS = ["product", "tds", "charter", "risk", "pcd", "design", "aar"] as const;
const ROW_SECTIONS = ["rbom", "issue", "milestone", "checklist"] as const;

/** Who may write into a project's room at all. */
const mayEdit = (u: AuthedUser) =>
  u.isOwner || u.stratcom || ["admin", "planner", "project_owner"].includes(String(u.role));

const projectId = (raw: string) => {
  const s = decodeURIComponent(String(raw || "")).trim();
  if (!s) return "";
  return /^NGSE-PROJ-/i.test(s) ? s.toUpperCase() : `NGSE-PROJ-${s.replace(/^0+/, "")}`;
};

const missing = (msg: string) =>
  /project_doc|project_row|does not exist|schema cache/i.test(msg);

export async function GET(req: Request) {
  try {
    await requireUser();
    const id = projectId(new URL(req.url).searchParams.get("id") || "");
    if (!id) throw new HttpError(400, "Which project?");
    const admin = adminClient();
    const [{ data: docs, error: de }, { data: rows, error: re }] = await Promise.all([
      admin.from("project_doc").select("section, body, updated_by, updated_at").eq("project_id", id),
      admin.from("project_row").select("*").eq("project_id", id).order("section").order("seq"),
    ]);
    const err = de?.message || re?.message;
    if (err && missing(err)) return NextResponse.json({ installed: false, docs: [], rows: [] });
    if (err) throw new Error(err);
    return NextResponse.json({ installed: true, docs: docs ?? [], rows: rows ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (!mayEdit(u)) throw new HttpError(403, "The project's room is written by planning and the project owners.");
    const b = await readBody(req, {}).catch((): AnyBody => ({}));
    const id = projectId(String(b.project_id || ""));
    if (!id) throw new HttpError(400, "Which project?");
    const admin = adminClient();
    const now = new Date().toISOString();
    const who = u.initials || u.displayName || u.email;

    if (b.action === "doc") {
      const section = String(b.section || "");
      if (!(DOC_SECTIONS as readonly string[]).includes(section))
        throw new HttpError(400, `Not a section of a project: ${section}`);
      const { error } = await admin.from("project_doc").upsert(
        { project_id: id, section, body: String(b.body ?? ""), updated_by: who, updated_at: now },
        { onConflict: "project_id,section" },
      );
      if (error) throw new Error(missing(error.message) ? "Run migration 0114 first — the project's room has nowhere to live yet." : error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "row") {
      const section = String(b.section || "");
      if (!(ROW_SECTIONS as readonly string[]).includes(section))
        throw new HttpError(400, `Not a list on a project: ${section}`);
      const row = {
        project_id: id, section,
        seq: Number(b.seq) || 0,
        label: String(b.label ?? "").slice(0, 400),
        detail: String(b.detail ?? ""),
        // An empty box is NOT a zero and NOT the epoch: it is silence, and a
        // number invented for it is a number somebody will later plan against.
        qty: b.qty === "" || b.qty === null || b.qty === undefined ? null : Number(b.qty),
        uom: String(b.uom ?? "").slice(0, 40) || null,
        due: String(b.due ?? "").slice(0, 10) || null,
        owner: String(b.owner ?? "").slice(0, 120) || null,
        state: ["open", "doing", "done", "dropped"].includes(String(b.state)) ? String(b.state) : "open",
        updated_by: who, updated_at: now,
      };
      if (b.id) {
        const { error } = await admin.from("project_row").update(row).eq("id", String(b.id));
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin.from("project_row").insert({ ...row, created_by: who });
        if (error) throw new Error(missing(error.message) ? "Run migration 0114 first — the project's room has nowhere to live yet." : error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "drop") {
      if (!b.id) throw new HttpError(400, "Which row?");
      await admin.from("project_row").delete().eq("id", String(b.id));
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown action "${b.action}"`);
  } catch (e) {
    return errJson(e);
  }
}
