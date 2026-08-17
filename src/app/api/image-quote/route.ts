import { NextResponse } from "next/server";
import { requireUser, requireAdmin, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { imageUrl, listDriveFolder, folderIdOf } from "@/lib/my-week";

export const dynamic = "force-dynamic";

/** GET /api/image-quote — every image, for the Admin list. */
export async function GET() {
  try {
    await requireUser();
    const { data, error } = await adminClient()
      .from("image_quote")
      .select("id, url, caption, active, sort_order")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    const { data: st } = await adminClient().from("app_settings").select("quote_folder").eq("id", true).maybeSingle();
    return NextResponse.json({
      installed: true,
      folder: st?.quote_folder ?? null,
      images: (data || []).map((r) => ({ ...r, src: imageUrl(r.url, 400) })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/image_quote|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ installed: false, images: [] });
    return errJson(e);
  }
}

/**
 * POST /api/image-quote — admin only.
 *
 * `urls` takes a whole block pasted from Drive, one link per line, because
 * adding forty images one at a time is how a feature stops being used on the
 * third one. Anything that is not a link Genie can turn into an image is
 * REPORTED BACK rather than saved as a row that will render as a broken box.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "add");

    /**
     * Read the Drive folder and refresh the cache.
     *
     * Ids already held are LEFT ALONE — re-inserting them would churn the
     * sort order and change which picture "today" lands on for no reason.
     * Anything that has left the folder is deactivated rather than deleted,
     * so a folder briefly emptied by accident does not lose the collection.
     */
    if (action === "sync") {
      const folder = folderIdOf(body.folder) ||
        folderIdOf((await admin.from("app_settings").select("quote_folder").eq("id", true).maybeSingle()).data?.quote_folder);
      if (!folder) throw new HttpError(400, "No Drive folder is set");

      if (body.folder) await admin.from("app_settings").update({ quote_folder: folder }).eq("id", true);

      const ids = await listDriveFolder(folder);
      if (!ids.length)
        return NextResponse.json({
          ok: false,
          error: "Nothing readable in that folder. It must be shared \"anyone with the link\", and hold image files.",
        }, { status: 400 });

      const { data: existing } = await admin.from("image_quote").select("id, url");
      const have = new Map((existing || []).map((r) => [String(r.url), r.id]));
      const wanted = new Set(ids.map((i) => `https://drive.google.com/file/d/${i}/view`));

      const fresh = [...wanted].filter((u) => !have.has(u));
      if (fresh.length) {
        const { error } = await admin.from("image_quote").insert(
          fresh.map((url, i) => ({ url, added_by: user.id, sort_order: have.size + i })),
        );
        if (error) throw new Error(error.message);
      }
      const gone = [...have.entries()].filter(([u]) => !wanted.has(u)).map(([, id]) => id);
      if (gone.length) await admin.from("image_quote").update({ active: false }).in("id", gone);
      // anything that came back is live again
      const returned = [...have.entries()].filter(([u]) => wanted.has(u)).map(([, id]) => id);
      if (returned.length) await admin.from("image_quote").update({ active: true }).in("id", returned);

      return NextResponse.json({ ok: true, folder, found: ids.length, added: fresh.length, retired: gone.length });
    }

    if (action === "delete") {
      const { error } = await admin.from("image_quote").delete().eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "toggle") {
      const { error } = await admin.from("image_quote").update({ active: !!body.active }).eq("id", String(body.id || ""));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const lines = String(body.urls || "")
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) throw new HttpError(400, "Paste at least one link");

    const good: string[] = [];
    const bad: string[] = [];
    for (const l of lines) (imageUrl(l) ? good : bad).push(l);

    if (good.length) {
      const { error } = await admin.from("image_quote").insert(
        good.map((url, i) => ({ url, caption: null, added_by: user.id, sort_order: i })),
      );
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, added: good.length, rejected: bad });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/image_quote|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ error: "Run migration 0029 first." }, { status: 503 });
    return errJson(e);
  }
}
