import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { AI, anthropicClient } from "@/lib/ai";
import { mayEdit, requireLeader } from "@/lib/lc/auth";
import { MOM_TEMPLATE, templateHeadings } from "@/lib/lc/mom-template";

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
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const HOUSE = "You write for the Leaders Council of Nandan GSE, an Indian manufacturer of ground support equipment. Plain English, Indian spelling, no preamble, no sign-off. Answer in clean HTML using only <h3>, <p>, <ul>, <ol>, <li>, <b>, <table>, <tr>, <th>, <td>. No markdown, no code fences.";

    if (b.action === "format_minutes") {
      const { data: m } = await admin.from("lc_meeting").select("*").eq("id", b.id).maybeSingle();
      if (!m) throw new HttpError(404, "No such meeting.");
      if (!mayEdit(u, m.created_by)) throw new HttpError(403, "The one who wrote these minutes, or Dr Raghu.");
      const raw = strip(m.minutes || "").replace(/\s*(Agenda|Decisions|Action points|#\s*Action\s*Who\s*By when\s*Status|Discussion|Open questions|Next meeting|Date, place, what each one brings\.)\s*/g, " ").replace(/\b\d\s+Open\b/g, " ").trim();
      if (raw.length < 20) throw new HttpError(400, "Write the minutes first — even rough notes under the headings — then ask Genie to format them.");
      const { data: tpl } = await admin.from("lc_setting").select("value").eq("key", "mom_template").maybeSingle();
      const heads = templateHeadings(tpl?.value || MOM_TEMPLATE);
      const html = toHtml(await ask(
        HOUSE + ` You are formatting the minutes of a Leaders Council meeting into the company's standard Minutes of Meeting. Keep every fact, name, number and decision exactly as given; add nothing that is not in the notes. Use EXACTLY these headings, in this order, each as <h3>: ${heads.join(" · ")}. Under "Action points" write a table with the columns #, Action, Who, By when, Status (Status is Open unless the notes say done; write — where the notes do not say). Decisions numbered. Discussion in short paragraphs or bullets, in the order of the notes. A heading with nothing under it gets one line: "Nothing recorded." If the notes mention people who are neither attendees nor guests, say so in one line at the end.`,
        `Meeting on ${m.held_on}${m.location ? ` at ${m.location}` : ""}. Attendees (employees): ${(m.attendees || []).join(", ") || "not listed"}. Guests: ${(m.guests || []).join(", ") || "none"}.\nAgenda (for context, do not repeat it as a section): ${strip(m.agenda || "") || "none written"}\nPre-reading given: ${strip(m.reading || "") || "none"}\n\nNotes:\n${raw}`,
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
    /**
     * PRINCIPLES, WORKED INTO ONE LOGICAL SET (Dr Raghu, 10 Oct 2026: "in
     * principles make the genie work it in such a way that's logical. It has
     * to have all principles of the company and accountability etc").
     *
     * Reads every Principles section as written, and the Philosophy pages
     * for context, and PROPOSES a complete, ordered set — purpose, the values
     * as rules, how a decision is taken, accountability and consequences,
     * the domain principles, what we do not do, how the page is amended.
     * Returns the proposal; nothing is written until the owner applies it.
     * The owner alone, because the page is his.
     */
    if (b.action === "structure_principles") {
      if (!u.isOwner) throw new HttpError(403, "Only Dr Raghu works the Principles.");
      const [{ data: pr }, { data: ph }] = await Promise.all([
        admin.from("lc_section").select("title,body,sort").eq("kind", "principles").order("sort"),
        admin.from("lc_section").select("title,body,sort").eq("kind", "philosophy").order("sort"),
      ]);
      const text = (rows: { title: string; body: string | null }[] | null) => (rows || []).map((r) => `## ${r.title}\n${strip(r.body || "") || "(not written yet)"}`).join("\n\n");
      const raw = await ask(
        "You are drafting the Principles of Nandan GSE for its Leaders Council — the definitive page that says what the company does and does not do, and how a decision is taken by it. Nandan GSE is an Indian manufacturer of airport ground support equipment and material-handling machines, family-led, ISO 9001 and AS9100D, with a Leaders Council that meets regularly. Write in plain English, Indian spelling, second person plural where natural (\"we\"). Keep EVERYTHING already written in the material given — reword for clarity, never drop a rule or a name — and complete what is missing so the set is whole. "
        + "Return ONLY a JSON array, no prose, no code fence: [{\"title\": string, \"body\": string}] of 9 to 14 sections in this logical order: (1) Purpose of this page and how to use it in a decision; (2) Our values, each stated as a rule we act by; (3) How a decision is taken here — who decides what, the questions every decision must answer, speed, when it goes to the council; (4) Accountability — one owner per outcome, the scoreboard, how it is reviewed, what happens when a commitment is missed; (5) Customers and delivery; (6) Quality and safety; (7) Money and commitments — pricing, credit, spending, what we never promise; (8) People — hiring, growth, conduct, respect; (9) Communication and meetings — huddles, minutes, escalation; (10) Suppliers and partners; (11) What we do not do — a plain list; (12) How this page changes — who may amend it and how. Merge or add sections only where the material demands it. Each body is clean HTML using only <p>, <ul>, <ol>, <li>, <b>, <h4>; a body is 80–220 words; every rule is a short declarative sentence; accountability sections name a role (not a person) wherever the material allows. Where the material is silent, write the sound default for a company like this and mark that sentence with <i>(proposed)</i> so the owner can keep or strike it.",
        `PRINCIPLES AS WRITTEN TODAY:\n${text(pr) || "(nothing yet)"}\n\nPHILOSOPHY PAGES, FOR CONTEXT:\n${text(ph) || "(nothing yet)"}`,
        6000,
      );
      let sections: { title: string; body: string }[] = [];
      try {
        const m = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        const arr = JSON.parse(m.slice(m.indexOf("["), m.lastIndexOf("]") + 1));
        if (Array.isArray(arr)) sections = arr.filter((x) => x && typeof x.title === "string" && typeof x.body === "string").map((x) => ({ title: String(x.title).trim().slice(0, 140), body: String(x.body) }));
      } catch { /* fall through */ }
      if (sections.length < 3) throw new HttpError(502, "Genie did not return a usable set — try once more.");
      return NextResponse.json({ ok: true, sections });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
