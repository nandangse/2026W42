import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { bump, compilePlaybook } from "@/lib/playbook-compile";
import { ITEM_EDITORS } from "@/lib/saamaan-hands";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The Playbooks (Dr Raghu, 28 Aug 2026): documents go in as intelligence,
 * Claude the categoriser compiles them into a living wiki, versioned like
 * Genie — "Nandan Design Playbook v 1.1.1". Five books, one per module;
 * the screens sit under each module's Tools.
 *
 *   GET  ?kind=design         — the book and its documents
 *   GET  ?config=1            — the Google client id for the Drive leg
 *   POST { action: "add_doc" | "delete_doc" | "set_folder" |
 *          "extract" | "compile", ... }
 *
 * Compiles run from the button (click-only, as everything since the pause)
 * and from the midnight cron — which only compiles books holding NEW
 * intelligence, so a quiet night costs nothing.
 */

/**
 * WHO WRITES A BOOK BY HAND. Every book compiles from intelligence; the
 * Material Playbook may also be edited directly by those who keep the Item
 * master (Dr Raghu, 6 Oct 2026: "Rameez should be able to edit this as well
 * as add on any document"). The owner may edit any book.
 */
const mayEditBook = (kind: string, email: string, isOwner: boolean) =>
  isOwner || (kind === "material" && ITEM_EDITORS.has(String(email || "").toLowerCase()));

async function requireUser() {
  const u = await currentUser();
  if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
  return u;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const me = await requireUser();
    if (url.searchParams.get("config")) {
      return NextResponse.json({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "" });
    }
    const kind = String(url.searchParams.get("kind") || "");
    const admin = adminClient();
    const { data: book, error } = await admin.from("playbook").select("*").eq("kind", kind).maybeSingle();
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ installed: false });
      throw new Error(error.message);
    }
    if (!book) throw new HttpError(404, "No such playbook.");
    const { data: docs } = await admin.from("playbook_doc")
      .select("id, title, category, link, status, by, at, extract")
      .eq("kind", kind).order("at", { ascending: false }).limit(1000);
    // extracts travel trimmed — the list needs their presence, not their bulk
    const slim = (docs || []).map((d) => ({ ...d, extract: d.extract ? `${String(d.extract).slice(0, 200)}…` : "", hasExtract: !!d.extract }));
    return NextResponse.json({ installed: true, book, docs: slim, canEdit: mayEditBook(kind, me.email, me.isOwner) });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const kind = String(body.kind || "");

    /* a hand edit spends nothing on AI, so the pause does not hold it */
    if (action === "save_content") {
      if (!mayEditBook(kind, user.email, user.isOwner)) throw new HttpError(403, "This book is edited by hand only by those who keep it.");
      const content = String(body.content || "");
      if (content.length > 600_000) throw new HttpError(413, "That is longer than a book should be — split it.");
      const { data: book } = await admin.from("playbook").select("version, compiled_at").eq("kind", kind).maybeSingle();
      if (!book) throw new HttpError(404, "No such playbook.");
      const now = new Date().toISOString();
      const version = bump(String(book.version), book.compiled_at ? String(book.compiled_at) : now);
      const { error } = await admin.from("playbook").update({ content, version, compiled_at: now, by: user.email }).eq("kind", kind);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, version });
    }

    await assertAiOn();

    if (action === "add_doc") {
      const title = String(body.title || "").trim();
      if (!kind || !title) throw new HttpError(400, "kind and title required");
      const { error } = await admin.from("playbook_doc").insert({
        kind, title,
        category: String(body.category || "").trim(),
        link: String(body.link || "").trim(),
        extract: String(body.extract || "").slice(0, 200_000),
        by: user.email,
      });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0086 first — the playbooks have nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_doc") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from("playbook_doc").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_folder") {
      const folder = String(body.folder_id || "").trim()
        // a whole Drive URL pasted is fine — the id is lifted out of it
        .replace(/^.*\/folders\//, "").replace(/[?#].*$/, "");
      const { error } = await admin.from("playbook").update({ folder_id: folder, by: user.email }).eq("kind", kind);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, folder_id: folder });
    }

    if (action === "extract") {
      // A PDF's text, read by Claude through the document door — the browser
      // sends base64 (≤3 MB file; bigger ones go to Drive and get a written
      // gist instead).
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set.");
      const data = String(body.data || "");
      if (!data) throw new HttpError(400, "no file data");
      if (data.length > 4_200_000) throw new HttpError(400, "That file is beyond this door (~3 MB) — upload it to Drive and write its gist instead.");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: AI.BACKGROUND, max_tokens: 3000,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
              { type: "text", text: "Extract this document's substance for a company playbook: the facts, rules, numbers, procedures and lessons it carries. Plain text, dense, no preamble. Keep exact figures and clause references. If it is a drawing or table, describe what it specifies." },
            ],
          }],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new HttpError(502, j?.error?.message || `Anthropic returned ${res.status}`);
      const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
      return NextResponse.json({ extract: text });
    }

    if (action === "compile") {
      if (!kind) throw new HttpError(400, "kind required");
      const out = await compilePlaybook(admin, kind, user.email);
      return NextResponse.json(out);
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
