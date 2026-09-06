import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { AI } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { requireOwner, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { driveConfig, uploadToFolder } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CONSULT RAGHU — the knowledgebase (Dr Raghu, 30 Aug 2026). Owner alone.
 *
 *   GET  ?section=planning|sales|kuber|vishwakarma — the living document
 *   POST multipart { section, file? } or JSON { section, text }
 *        — new knowledge goes in raw; Opus weaves it into the ONE large
 *          organized document (nothing lost, everything filed under the
 *          right heading), and a copy lands in Dr Raghu's Drive folder.
 *
 * This document is the intelligence layer the Consult Raghu chatbots will
 * stand on — one per module, each in his voice.
 */
const SECTIONS = ["planning", "sales", "kuber", "vishwakarma", "general_voice"] as const;
const SECTION_LABEL: Record<string, string> = { planning: "Planning", sales: "Sales", kuber: "Kuber", vishwakarma: "Vishwakarma", general_voice: "General Voice" };
const DRIVE_FOLDER = "1XDk_hL-9zqv16llhR1JZDGvmF9Cqjp3z";
const TEXT_EXT = ["md", "txt", "csv", "json", "html", "htm", "xml", "log", "text"];

export async function GET(req: Request) {
  try {
    await requireOwner();
    const section = String(new URL(req.url).searchParams.get("section") || "");
    if (!SECTIONS.includes(section as typeof SECTIONS[number])) throw new HttpError(400, "Which section?");
    const db = adminClient();
    const [{ data: row }, { data: ups }] = await Promise.all([
      db.from("consult_kb").select("*").eq("section", section).maybeSingle(),
      db.from("consult_kb_upload").select("filename, chars, note, uploaded_at").eq("section", section)
        .order("uploaded_at", { ascending: false }).limit(12),
    ]);
    return NextResponse.json({ row: row ?? { section, content: "", version: 0 }, uploads: ups ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/consult_kb|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ needsMigration: true, row: { content: "", version: 0 }, uploads: [] });
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireOwner();
    if (!process.env.ANTHROPIC_API_KEY)
      throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY.");
    const db = adminClient();

    let section = "", incoming = "", filename = "";
    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      section = String(form.get("section") || "");
      const pasted = String(form.get("text") || "");
      const file = form.get("file");
      if (file instanceof File) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!TEXT_EXT.includes(ext))
          throw new HttpError(415, `For now the knowledge comes as text — .${TEXT_EXT.join(" / .")}. A PDF or Word file: copy its text and paste it in (a proper converter comes next).`);
        if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "5 MB per drop — split a bigger dump.");
        filename = file.name;
        incoming = Buffer.from(await file.arrayBuffer()).toString("utf8");
      }
      if (pasted.trim()) incoming = incoming ? `${incoming}\n\n---\n\n${pasted}` : pasted;
    } else {
      const body = await readBody(req, {});
      section = String(body.section || "");
      incoming = String(body.text || "");
    }
    if (!SECTIONS.includes(section as typeof SECTIONS[number])) throw new HttpError(400, "Which section?");
    if (!incoming.trim()) throw new HttpError(400, "Nothing to add — paste text or attach a file.");
    if (incoming.length > 400000) throw new HttpError(413, "That drop is very large — split it into parts.");

    const { data: row } = await db.from("consult_kb").select("content, version").eq("section", section).maybeSingle();
    const current = String(row?.content || "");
    const version = (Number(row?.version) || 0) + 1;

    // OPUS, THE LIBRARIAN: weave the drop into the one large document.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = anthropic.messages.stream({
      model: AI.FRONT,
      max_tokens: 64000,
      system: `You are the librarian of Dr Raghunandan Jagdish's ${SECTION_LABEL[section]} knowledgebase at NANDAN GSE — the intelligence layer his Consult Raghu advisor will stand on. You maintain ONE large, beautifully organized Markdown document.

Your law:
- NOTHING is lost. Every fact, rule of thumb, number, story, name and preference in the current document and the new material survives into the output.
- Organize, never summarize away. File new material under the right headings; create headings when needed; merge duplicates into the stronger phrasing; keep Dr Raghu's own voice and phrasings where they carry his thinking.
- Structure: # title, ## themes, ### specifics; bullet lists for rules; tables where they clarify. Start with a short "How to use this document" note only once.
- As large as needed. Output the COMPLETE document, never a diff or an excerpt.

Respond with the full Markdown document only — no preamble, no commentary.`,
      messages: [{
        role: "user",
        content: `THE CURRENT DOCUMENT (version ${version - 1}):\n\n${current || "(empty — this drop founds the document)"}\n\n=== NEW MATERIAL TO WEAVE IN${filename ? ` (from ${filename})` : ""} ===\n\n${incoming}`,
      }],
    });
    const msg = await stream.finalMessage();
    const doc = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!doc) throw new HttpError(502, "Opus returned nothing — try the drop again.");

    await db.from("consult_kb").upsert({
      section, content: doc, version, updated_at: new Date().toISOString(), updated_by: me.email,
    }, { onConflict: "section" });
    await db.from("consult_kb_upload").insert({
      section, filename: filename || null, chars: incoming.length,
      note: `→ v${version}, ${doc.length.toLocaleString("en-IN")} chars`, uploaded_by: me.email,
    }).then(() => null, () => null);

    // the Drive copy — his folder, one subfolder per section
    let driveLink: string | null = null, driveNote = "";
    try {
      const cfg = driveConfig();
      if (cfg) {
        const ist = new Date(Date.now() + 330 * 60000).toISOString();
        const stamp = `${ist.slice(0, 10)} ${ist.slice(11, 16).replace(":", "")}`;
        const up = await uploadToFolder(cfg, DRIVE_FOLDER, SECTION_LABEL[section],
          new TextEncoder().encode(doc).buffer as ArrayBuffer,
          `${SECTION_LABEL[section]} Knowledgebase v${version} · ${stamp}.md`);
        driveLink = up.link;
      } else driveNote = "Drive keys not configured — the document lives in the database.";
    } catch (e) {
      driveNote = `Drive copy failed (${e instanceof Error ? e.message : e}) — share the folder with the service account as Editor. The document is safe in the database.`;
    }

    return NextResponse.json({ ok: true, version, chars: doc.length, driveLink, driveNote });
  } catch (e) {
    return errJson(e);
  }
}
