import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { AI, anthropicClient } from "@/lib/ai";
import { mayEdit, requireLeader } from "@/lib/lc/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Genie inside the council — three buttons, one route, Claude Opus (somebody
 * is waiting):
 *
 *   format_minutes { id }          — meeting minutes, formatted; the text is
 *                                    returned and saved on the meeting
 *   summarise_presentation { id }  — summary + topic from the notes, link
 *                                    and any PDF/text file; saved
 *   summarise_problem { id }       — every solution and the discussion
 *                                    summarised into the LC solution; saved
 *
 * Each runs as the author or the owner, because each writes back.
 */
const strip = (html: string) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function ask(system: string, user: string, max = 2500): Promise<string> {
  const r = await anthropicClient().messages.create({ model: AI.FRONT, max_tokens: max, system, messages: [{ role: "user", content: user }] });
  return r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
}

/** Claude is asked for tidy HTML; a fence or a preamble is not what goes in the record. */
const toHtml = (s: string) => s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();

export async function POST(req: Request) {
  try {
    const u = await requireLeader();
    const admin = adminClient();
    const b = await readBody(req, { action: "string", id: "uuid" });
    const HOUSE = "You write for the Leaders Council of Nandan GSE, an Indian manufacturer of ground support equipment. Plain English, Indian spelling, no preamble, no sign-off. Answer in clean HTML using only <h3>, <p>, <ul>, <ol>, <li>, <b>, <table>, <tr>, <th>, <td>. No markdown, no code fences.";

    if (b.action === "format_minutes") {
      const { data: m } = await admin.from("lc_meeting").select("*").eq("id", b.id).maybeSingle();
      if (!m) throw new HttpError(404, "No such meeting.");
      if (!mayEdit(u, m.created_by)) throw new HttpError(403, "The one who wrote these minutes, or Dr Raghu.");
      const raw = strip(m.minutes || "");
      if (raw.length < 20) throw new HttpError(400, "Write the minutes first — even rough notes — then ask Genie to format them.");
      const html = toHtml(await ask(
        HOUSE + " You are formatting the minutes of a Leaders Council meeting. Keep every fact, name, number and decision exactly as given; add nothing that is not in the notes. Structure: <h3>Decisions</h3> (numbered), <h3>Action points</h3> as a table with columns Action, Who, By when (write — where the notes do not say), <h3>Discussion</h3> (short paragraphs or bullets, in the order of the notes), <h3>Open questions</h3> if any. If the notes mention attendees who are not in the list, say so in one line at the end.",
        `Meeting on ${m.held_on}${m.location ? ` at ${m.location}` : ""}. Attendees: ${(m.attendees || []).join(", ") || "not listed"}.\n\nNotes:\n${raw}`,
      ));
      await admin.from("lc_meeting").update({ minutes: html, updated_at: new Date().toISOString() }).eq("id", b.id);
      return NextResponse.json({ ok: true, html });
    }

    if (b.action === "summarise_presentation") {
      const { data: p } = await admin.from("lc_presentation").select("*").eq("id", b.id).maybeSingle();
      if (!p) throw new HttpError(404, "No such presentation.");
      if (!mayEdit(u, p.added_by)) throw new HttpError(403, "The one who added it, or Dr Raghu.");
      /* what Genie can read: the notes, the link, and the text of a PDF in the bucket */
      let material = strip(p.notes || "");
      const { data: files } = await admin.from("lc_file").select("path,name,mime").eq("ref_kind", "presentation").eq("ref_id", b.id);
      let pdf: { data: string; name: string } | null = null;
      for (const f of files || []) {
        if (/pdf/i.test(f.mime || "") || /\.pdf$/i.test(f.name)) {
          const { data } = await admin.storage.from("lc").download(f.path);
          if (data && data.size < 30 * 1024 * 1024) { pdf = { data: Buffer.from(await data.arrayBuffer()).toString("base64"), name: f.name }; break; }
        } else if (/text|markdown/i.test(f.mime || "") || /\.(txt|md)$/i.test(f.name)) {
          const { data } = await admin.storage.from("lc").download(f.path);
          if (data) material += "\n\n" + (await data.text()).slice(0, 60000);
        }
      }
      if (!material && !pdf && !p.file_url) throw new HttpError(400, "Nothing to read yet — add notes, a PDF, or a link.");
      const system = HOUSE + " You are summarising a presentation given to the Leaders Council. Give first a one-line <p><b>Topic:</b> …</p> naming the topic in at most ten words, then <h3>In brief</h3> three to five sentences, then <h3>Key points</h3> as bullets, then <h3>Asked of the council</h3> if the material asks for a decision or help. Do not invent content; if only a link is given and nothing can be read, say so.";
      const text = `Presenter: ${p.presenter || "not named"}. Typed topic: ${p.topic || "none"}. Link: ${p.file_url || "none"}.\n\nNotes and text:\n${material || "(none)"}`;
      const r = await anthropicClient().messages.create({
        model: AI.FRONT, max_tokens: 2500, system,
        messages: [{ role: "user", content: pdf
          ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.data }, title: pdf.name }, { type: "text", text }]
          : text }],
      });
      const html = toHtml(r.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim());
      const topic = /<b>\s*Topic:\s*<\/b>\s*([^<]+)/i.exec(html)?.[1]?.trim() || null;
      const patch: Record<string, unknown> = { summary: html, updated_at: new Date().toISOString() };
      if (topic && !p.topic) patch.topic = topic.replace(/[.\s]+$/, "");
      await admin.from("lc_presentation").update(patch).eq("id", b.id);
      return NextResponse.json({ ok: true, html, topic: patch.topic || p.topic });
    }

    if (b.action === "summarise_problem") {
      const { data: p } = await admin.from("lc_problem").select("*").eq("id", b.id).maybeSingle();
      if (!p) throw new HttpError(404, "No such problem.");
      if (!mayEdit(u, p.added_by)) throw new HttpError(403, "The one who raised it, or Dr Raghu.");
      const [{ data: sols }, { data: cms }] = await Promise.all([
        admin.from("lc_solution").select("body,added_by,created_at").eq("problem_id", b.id).order("created_at"),
        admin.from("lc_comment").select("body,added_by,created_at").eq("ref_kind", "problem").eq("ref_id", b.id).order("created_at"),
      ]);
      if (!sols?.length && !cms?.length) throw new HttpError(400, "No solutions or discussion yet to summarise.");
      const who = (e: string) => e.split("@")[0];
      const html = toHtml(await ask(
        HOUSE + " You are writing the LC Solution for a problem on the Solution Board: a summary of every solution proposed and the discussion, as the council would adopt it. Structure: <h3>The problem, restated</h3> one or two sentences; <h3>Solutions proposed</h3> one bullet per distinct solution, each ending with who proposed it in brackets; <h3>Where the discussion settled</h3> short; <h3>Recommended next step</h3> one to three numbered actions, with an owner where the material names one. Keep every number and name. Do not invent.",
        `Problem: ${p.title}\nDescription: ${strip(p.description || "") || "(none)"}\nStatus: ${p.status}. Tentative date: ${p.tentative_on || "—"}.\n\nSolutions:\n${(sols || []).map((s, i) => `${i + 1}. [${who(s.added_by)}, ${s.created_at.slice(0, 10)}] ${strip(s.body)}`).join("\n") || "(none)"}\n\nDiscussion:\n${(cms || []).map((c) => `- [${who(c.added_by)}, ${c.created_at.slice(0, 10)}] ${c.body}`).join("\n") || "(none)"}`,
      ));
      await admin.from("lc_problem").update({ lc_summary: html, updated_at: new Date().toISOString() }).eq("id", b.id);
      return NextResponse.json({ ok: true, html });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
