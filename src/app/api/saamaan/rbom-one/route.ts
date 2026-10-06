import { NextResponse } from "next/server";
import { syncRbomReleased } from "@/lib/rbom-sync";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";

/**
 * ONE RBOM, AS A DOCUMENT (Dr Raghu, 8 Sep 2026: "RBOM needs a link of its
 * own ... this link will make it useful").
 *
 * Everything the page's six tabs need, in one read: the Real BOM's lines, the
 * Ordering BOM it was built from, the project it belongs to, what has been
 * kitted against it, and the remarks people have left. Then the two things
 * that make it a document rather than a report — a conversation, and a
 * release.
 *
 * RELEASE IS AN EVENT. It stamps the header, moves every line that is not yet
 * Released, and names the people to tell. It refuses to do that twice by
 * accident: releasing an already-released RBOM needs `again`, because a
 * second notice goes out with it.
 */
const S = (v: unknown) => String(v ?? "").trim();
const ok = (x: unknown) => { const s = S(x); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s.toLowerCase() : ""; };

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const id = S(new URL(req.url).searchParams.get("id"));
    if (!id) throw new HttpError(400, "which RBOM?");

    const { data: head } = await admin.from("material_rbom").select("*").eq("rbom_id", id).maybeSingle();
    if (!head) throw new HttpError(404, "No such RBOM — build it first.");

    /* Draft lines the ERP has since submitted become Released before they are shown */
    try { await syncRbomReleased(admin, [id]); } catch (e) { swallow("rbom status sync", e); }
    const { data: items } = await admin.from("material_rbom_item").select("*").eq("rbom_id", id).order("idx");

    /* remarks may not exist until 0158 has run; an empty thread is not an error */
    let remarks: unknown[] = [];
    try {
      const { data } = await admin.from("material_rbom_remark").select("*").eq("rbom_id", id).order("at", { ascending: false }).limit(500);
      remarks = data ?? [];
    } catch (e) { swallow("rbom remarks", e); }

    /* the Ordering BOM is the base it was built from — the ERP's own */
    const base = S(head.base_bom);
    const [ordering, bomHead] = await Promise.all([
      base ? admin.from("material_bom_item").select("*").eq("bom_id", base).order("idx").then((r) => r.data ?? []) : Promise.resolve([]),
      base ? admin.from("material_bom").select("*").eq("bom_id", base).maybeSingle().then((r) => r.data ?? null) : Promise.resolve(null),
    ]);

    /* where it is used and what has been kitted — material_wip already
       carries job, warehouse, value and the kitted counts, keyed by rbom_no */
    const { data: wip } = await admin.from("material_wip")
      .select("job_no, warehouse, customer_tag, project_id, customer, product_family, bom_no_erp, rbom_no, value, nos_kitted, value_kitted, nos_pending, value_pending, tvc_pct")
      .eq("rbom_no", id);

    const { data: project } = await admin.from("material_project")
      .select("project_id, project_name, status, customer, product_family, approved_bom, design_stage")
      .eq("project_id", S(head.project_id)).maybeSingle();

    /**
     * WHO TO TELL, FROM THE PROJECT (Dr Raghu, 8 Sep 2026: "the rule will
     * come in projects"). Not guessed from the job's owners and not held on
     * the RBOM — set once per project, and every release against it reads
     * the same list. The screen still shows it and still lets it be edited
     * before anything goes out.
     */
    let notify: { emails: string[]; note: string | null } = { emails: [], note: null };
    try {
      const { data: n } = await admin.from("material_project_notify")
        .select("emails, note").eq("project_id", S(head.project_id)).maybeSingle();
      if (n) notify = { emails: Array.isArray(n.emails) ? (n.emails as string[]) : [], note: n.note ?? null };
    } catch (e) { swallow("rbom notify", e); }

    return NextResponse.json({
      head, items: items ?? [], remarks,
      ordering, orderingHead: bomHead,
      wip: wip ?? [], project: project ?? null, notify,
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const b = await readBody(req, { action: "string", id: "string" });
    const id = S(b.id), action = S(b.action);
    const email = S((me as { email?: string }).email);
    const now = new Date().toISOString();

    const { data: head } = await admin.from("material_rbom").select("*").eq("rbom_id", id).maybeSingle();
    if (!head) throw new HttpError(404, "No such RBOM.");

    /* ── a remark, appended. Never edited: a thread, not a field. ── */
    if (action === "remark") {
      const body = S(b.body);
      if (!body) throw new HttpError(400, "Nothing to say?");
      const { error } = await admin.from("material_rbom_remark").insert({
        rbom_id: id, item_code: S(b.item_code) || null, body: body.slice(0, 4000),
        by_email: email, by_name: S((me as { displayName?: string }).displayName) || email.split("@")[0],
      });
      if (error) {
        const gone = /does not exist|schema cache/i.test(error.message);
        throw new HttpError(gone ? 503 : 500, gone ? "Run migration 0158 first — remarks have nowhere to live yet." : error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /* ── one line's status, or every line at once ── */
    if (action === "status") {
      const to = S(b.to);
      if (!["Draft", "WIP", "Released"].includes(to)) throw new HttpError(400, "status must be Draft, WIP or Released");
      const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String).filter(Boolean) : [];
      let q = admin.from("material_rbom_item").update({ bom_status: to, updated_by: email, updated_at: now }).eq("rbom_id", id);
      if (ids.length) q = q.in("id", ids);
      else if (S(b.from)) q = q.eq("bom_status", S(b.from));      // every Draft → Released
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, changed: (data ?? []).length });
    }

    /* ── release: stamp it, move the lines, name who to tell ── */
    if (action === "release") {
      if (head.released_at && !b.again)
        throw new HttpError(409, `${id} was already released on ${String(head.released_at).slice(0, 10)}. Tick "release again" if the notice should go out a second time.`);

      /* the lines about to become orderable, gathered BEFORE the update —
         that is exactly the list the notice carries */
      const { data: moving } = await admin.from("material_rbom_item")
        .select("item_code, item_name, qty, uom, bom_remark, description")
        .eq("rbom_id", id).neq("bom_status", "Released").order("idx");

      const { error: uErr } = await admin.from("material_rbom_item")
        .update({ bom_status: "Released", updated_by: email, updated_at: now })
        .eq("rbom_id", id).neq("bom_status", "Released");
      if (uErr) throw new Error(uErr.message);

      const to = Array.isArray(b.to) ? (b.to as unknown[]).map((x) => ok(x)).filter(Boolean) : [];
      const { error: hErr } = await admin.from("material_rbom")
        .update({ status: "Released", released_at: now, released_by: email, released_to: to })
        .eq("rbom_id", id);
      if (hErr) swallow("rbom release header", hErr);

      return NextResponse.json({ ok: true, released: (moving ?? []).length, added: moving ?? [], to });
    }

    /* ── set the project's notify list, from the RBOM page ── */
    if (action === "notify") {
      const emails = Array.isArray(b.emails) ? (b.emails as unknown[]).map((x) => ok(x)).filter(Boolean) : [];
      const { error } = await admin.from("material_project_notify").upsert({
        project_id: S(head.project_id), emails, note: S(b.note) || null,
        updated_by: email, updated_at: now,
      }, { onConflict: "project_id" });
      if (error) {
        const gone = /does not exist|schema cache/i.test(error.message);
        throw new HttpError(gone ? 503 : 500, gone ? "Run migration 0159 first — the project has nowhere to keep its notify list." : error.message);
      }
      return NextResponse.json({ ok: true, emails });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
