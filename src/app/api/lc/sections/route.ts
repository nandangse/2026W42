import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { mayEdit, requireCouncilOwner, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";

/**
 * Philosophy and Principles — the pages at the front of the council.
 *
 *   GET  ?kind=philosophy|principles   → the sections, in order, with files and comments
 *   POST create { kind, title, body }  — any leader writes
 *        edit { id, title?, body? } · remove { id }   — the author, or Dr Raghu
 *        approve { id } · unapprove { id } · move { ids } · replace { sections }   — Dr Raghu
 *        comment { id, body } · uncomment { comment_id }   — any leader; own comment to remove
 *
 * Philosophy (Dr Raghu, 10 Oct 2026): "values, OPSP, quarterly reports. Then
 * we can add whatever else we want." Principles: "the definitive one, which
 * will define what we do and what we don't do … this is how decision-making
 * is to be done." Then: "next to each show approved by and date. Inside each
 * have comments and the edit by raghu or the one who wrote."
 */
const kindOf = (v: unknown) => (v === "principles" ? "principles" : "philosophy");
/** Text pasted from a slide or a PDF can carry U+0000, which Postgres refuses with an
 *  error that reached the screen as "Internal error" (Dr Raghu, 10 Oct 2026, on
 *  Philosophy). Stripped here, and the database's own words are returned when it
 *  still says no. */
const clean = (v: unknown) => String(v ?? "").replace(/\u0000/g, "");
const said = (e: { message?: string } | null) => new HttpError(400, `Could not save: ${e?.message || "the database refused it"}.`);

export async function GET(req: Request) {
  try {
    await requireLeader();
    const kind = kindOf(new URL(req.url).searchParams.get("kind"));
    const admin = adminClient();
    const [{ data: sections, error }, { data: files }, { data: comments }] = await Promise.all([
      admin.from("lc_section").select("*").eq("kind", kind).order("sort").order("created_at"),
      admin.from("lc_file").select("id,ref_id,name,mime,bytes,path,drive_url,drive_status,uploaded_by,created_at").eq("ref_kind", "section").order("created_at"),
      admin.from("lc_comment").select("id,ref_id,body,added_by,created_at").eq("ref_kind", "section").order("created_at"),
    ]);
    if (error) throw error;
    return NextResponse.json({
      sections: (sections || []).map((s) => ({
        ...s,
        files: (files || []).filter((f) => f.ref_id === s.id),
        comments: (comments || []).filter((c) => c.ref_id === s.id),
      })),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string" });
    const kind = kindOf(b.kind);
    const own = async (id: string) => {
      const { data: s } = await admin.from("lc_section").select("created_by").eq("id", id).maybeSingle();
      if (!s) throw new HttpError(404, "No such section.");
      if (!mayEdit(u, s.created_by)) throw new HttpError(403, "The one who wrote it, or Dr Raghu.");
    };

    if (b.action === "create") {
      const title = String(b.title || "").trim(); if (!title) throw new HttpError(400, "A title.");
      const { data: last } = await admin.from("lc_section").select("sort").eq("kind", kind).order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await admin.from("lc_section").insert({ kind, title: clean(title), body: clean(b.body) || null, sort: Number(last?.sort || 0) + 1, created_by: u.email }).select("id").single();
      if (error) throw said(error);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "edit") {
      const id = String(b.id || ""); await own(id);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.title !== undefined) { const t = clean(b.title).trim(); if (!t) throw new HttpError(400, "A title."); patch.title = t; }
      if (b.body !== undefined) patch.body = clean(b.body) || null;
      /* an edit after approval asks for approval again — the approved text is what was read */
      patch.approved_by = null; patch.approved_at = null;
      const { error } = await admin.from("lc_section").update(patch).eq("id", id);
      if (error) throw said(error);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      const id = String(b.id || ""); await own(id);
      const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "section").eq("ref_id", id);
      if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
      await admin.from("lc_file").delete().eq("ref_kind", "section").eq("ref_id", id);
      await admin.from("lc_comment").delete().eq("ref_kind", "section").eq("ref_id", id);
      const { error } = await admin.from("lc_section").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "comment") {
      const id = String(b.id || ""); const body = String(b.body || "").trim();
      if (!body) throw new HttpError(400, "Say something.");
      const { data, error } = await admin.from("lc_comment").insert({ ref_kind: "section", ref_id: id, body, added_by: u.email }).select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "uncomment") {
      const { data: c } = await admin.from("lc_comment").select("added_by").eq("id", String(b.comment_id)).maybeSingle();
      if (!c || !mayEdit(u, c.added_by)) throw new HttpError(403, "Your own comment.");
      await admin.from("lc_comment").delete().eq("id", String(b.comment_id));
      return NextResponse.json({ ok: true });
    }

    /* ── the owner's actions ── */
    await requireCouncilOwner();
    if (b.action === "approve" || b.action === "unapprove") {
      const id = String(b.id || "");
      const { error } = await admin.from("lc_section").update(b.action === "approve" ? { approved_by: u.email, approved_at: new Date().toISOString() } : { approved_by: null, approved_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (b.action === "move") {
      const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
      await Promise.all(ids.map((id, i) => admin.from("lc_section").update({ sort: i + 1 }).eq("id", id)));
      return NextResponse.json({ ok: true });
    }
    /**
     * APPLY GENIE'S SET: sections are matched to the existing ones by title
     * (case-blind) so their files and comments stay; the rest are created;
     * existing sections not in the set are removed WITH their files and
     * comments — the confirm on the page says so. Approval is cleared on
     * anything whose text changed.
     */
    if (b.action === "replace") {
      const incoming = (Array.isArray(b.sections) ? b.sections : []).map((x: { title?: unknown; body?: unknown }) => ({ title: String(x?.title || "").trim().slice(0, 140), body: String(x?.body || "") })).filter((x: { title: string }) => x.title);
      if (incoming.length < 3) throw new HttpError(400, "At least three sections.");
      const { data: existing } = await admin.from("lc_section").select("id,title,body").eq("kind", kind);
      const keep = new Set<string>();
      let i = 0;
      for (const sct of incoming) {
        i++;
        const hit = (existing || []).find((e) => e.title.trim().toLowerCase() === sct.title.toLowerCase() && !keep.has(e.id));
        if (hit) {
          keep.add(hit.id);
          const changed = (hit.body || "") !== sct.body;
          await admin.from("lc_section").update({ title: sct.title, body: sct.body || null, sort: i, updated_at: new Date().toISOString(), ...(changed ? { approved_by: null, approved_at: null } : {}) }).eq("id", hit.id);
        } else await admin.from("lc_section").insert({ kind, title: sct.title, body: sct.body || null, sort: i, created_by: u.email });
      }
      const gone = (existing || []).filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (gone.length) {
        const { data: fs } = await admin.from("lc_file").select("path").eq("ref_kind", "section").in("ref_id", gone);
        if (fs?.length) await admin.storage.from("lc").remove(fs.map((f) => String(f.path)));
        await admin.from("lc_file").delete().eq("ref_kind", "section").in("ref_id", gone);
        await admin.from("lc_comment").delete().eq("ref_kind", "section").in("ref_id", gone);
        await admin.from("lc_section").delete().in("id", gone);
      }
      return NextResponse.json({ ok: true, written: incoming.length, removed: gone.length });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
