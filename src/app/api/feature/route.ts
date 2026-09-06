import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireReader, requireUser, requireOwner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "feature-files";
const LINK_TTL = 60 * 60 * 4;
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * The only HTML a request body may contain.
 *
 * The editor is a contenteditable, so what arrives is whatever the browser
 * produced — and whatever anybody chose to paste into it. Everything outside
 * this list is stripped rather than escaped: a request is read by other people
 * on the team, and a stored <script> would run for every one of them.
 */
const ALLOWED = /^(b|strong|i|em|u|br|p|div|ul|ol|li|h3|h4|a|code)$/i;

function clean(html: string): string {
  return String(html || "")
    // whole elements whose content is never wanted, not just their tags
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    // on* handlers and javascript: URLs, before the tag filter sees them
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag: string, attrs: string) => {
      if (!ALLOWED.test(tag)) return "";
      // only href survives, and only on a link
      if (/^a$/i.test(tag)) {
        const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || "";
        return /^https?:\/\//i.test(href)
          ? `<a href="${href}" target="_blank" rel="noreferrer">`
          : m.startsWith("</") ? "</a>" : "<a>";
      }
      return m.startsWith("</") ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`;
    })
    .slice(0, 20000);
}

/** GET — every request, newest first, with signed links to its attachments. */
export async function GET() {
  try {
    await requireReader();
    const admin = adminClient();
    const { data, error } = await admin
      .from("feature_request")
      .select("id, title, body, want, status, note, by, at, acted_by, acted_at")
      .order("at", { ascending: false })
      .limit(500);
    if (error) {
      if (/feature_request|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, items: [] });
      throw new Error(error.message);
    }

    const { data: files } = await admin
      .from("feature_file")
      .select("id, req_id, name, path, mime, bytes");
    const byReq = new Map<string, { id: string; name: string; mime: string | null; url: string | null }[]>();
    for (const f of files || []) {
      const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(f.path, LINK_TTL);
      byReq.set(f.req_id, [...(byReq.get(f.req_id) || []), { id: f.id, name: f.name, mime: f.mime, url: s?.signedUrl ?? null }]);
    }

    return NextResponse.json({
      installed: true,
      items: (data || []).map((r) => ({ ...r, files: byReq.get(r.id) || [] })),
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST (multipart) — title, body, want, file0..fileN. Anyone signed in. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const form = await req.formData();

    const title = String(form.get("title") || "").trim();
    if (title.length < 3) throw new HttpError(400, "Give it a title.");
    const want = String(form.get("want") || "good");
    if (!["must", "good", "future"].includes(want)) throw new HttpError(400, "Unknown priority");

    const { data: made, error } = await admin
      .from("feature_request")
      .insert({ title: title.slice(0, 200), body: clean(String(form.get("body") || "")), want, by: user.email })
      .select("id")
      .maybeSingle();
    if (error) {
      if (/feature_request|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0045 first — feature requests have nowhere to go yet.");
      throw new Error(error.message);
    }

    // Attachments are best-effort: the request is the thing, and losing the
    // words because a screenshot failed would be the wrong trade.
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of files.slice(0, 5)) {
      if (f.size > MAX_BYTES) continue;
      const safe = f.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-70);
      const path = `${made?.id}/${Date.now()}-${safe}`;
      const { error: ue } = await admin.storage.from(BUCKET).upload(path, await f.arrayBuffer(), { contentType: f.type || undefined });
      if (!ue) {
        await admin.from("feature_file").insert({
          req_id: made?.id, name: f.name, path, mime: f.type || null, bytes: f.size,
        });
      }
    }
    return NextResponse.json({ ok: true, id: made?.id ?? null, attached: files.length });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * PATCH — { id, status, note? } — owner only.
 *
 * Anybody may ASK; only the person who decides what gets built may say what
 * is happening to it. A backlog where everyone can mark their own request
 * "planned" is not a backlog.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireOwner();
    const body = await readBody(req, {});
    if (!body.id) throw new HttpError(400, "id required");
    if (!["open", "planned", "done", "declined"].includes(String(body.status)))
      throw new HttpError(400, "Unknown status");

    const { error } = await adminClient()
      .from("feature_request")
      .update({
        status: body.status,
        note: String(body.note || "").slice(0, 500),
        acted_by: user.email,
        acted_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
