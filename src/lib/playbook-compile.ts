import type { SupabaseClient } from "@supabase/supabase-js";
import { AI } from "@/lib/ai";
import { HttpError } from "@/lib/auth";

/**
 * The categoriser (Dr Raghu, 28 Aug 2026): every piece of intelligence added
 * to a playbook is woven into ONE living wiki — organised by topic, not by
 * arrival — and the book's version steps the Genie way: same day bumps the
 * last digit, a new day bumps the middle, the first digit is Dr Raghu's.
 */

const MODEL = AI.BACKGROUND;

const bump = (v: string, lastAt: string | null): string => {
  const [a, b, c] = v.split(".").map((x) => Number(x) || 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const lastDay = lastAt ? new Date(lastAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null;
  if (!lastAt) return `${a}.${b}.${c}`; // the first compile keeps 1.0.0
  return lastDay === today ? `${a}.${b}.${c + 1}` : `${a}.${b + 1}.0`;
};

export async function compilePlaybook(
  admin: SupabaseClient, kind: string, byWhom: string,
): Promise<{ compiled: boolean; version?: string; reason?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, "ANTHROPIC_API_KEY is not set.");

  const { data: book } = await admin.from("playbook").select("*").eq("kind", kind).maybeSingle();
  if (!book) throw new HttpError(404, "No such playbook.");
  const { data: pending } = await admin.from("playbook_doc")
    .select("id, title, category, link, extract").eq("kind", kind).eq("status", "pending").order("at").limit(200);
  if (!pending || !pending.length) return { compiled: false, reason: "No new intelligence since the last compile." };

  // The new intelligence, bounded so one giant document cannot starve the rest.
  const material = pending.map((d, i) =>
    `--- DOCUMENT ${i + 1}: ${d.title}${d.category ? ` [${d.category}]` : ""}${d.link ? ` (source: ${d.link})` : ""} ---\n` +
    (String(d.extract || "").slice(0, 30_000) || "(no text taken — registered by title and source only)"),
  ).join("\n\n").slice(0, 400_000);

  const existing = String(book.content || "").slice(0, 150_000);

  const system =
    `You are the keeper of the ${book.title} at Nandan GSE, a maker of airport ground support equipment in India. ` +
    "You maintain ONE living wiki in markdown. House rules:\n" +
    "- ORGANISE BY TOPIC, never by document or date of arrival. You are the categoriser: place each fact under the right heading, create headings sparingly, merge duplicates.\n" +
    "- Keep everything already in the book unless new material genuinely supersedes it — then keep the newer fact and note the change.\n" +
    "- Work only from what is given. Never invent a fact, figure or rule. Where a document gave only a title and source, list it under 'Source library' with its link.\n" +
    "- Cite the source document's name in-line where a fact matters: (from: <doc title>).\n" +
    "- Structure: # for the book title is NOT yours to write; start at ## sections. End with a '## Source library' section listing every document and link.\n" +
    "- Plain, dense, usable by an engineer on the floor. Short sentences. Tables where the material is tabular.";

  const content = existing
    ? `THE BOOK AS IT STANDS (v ${book.version}):\n\n${existing}\n\n\nNEW INTELLIGENCE TO WEAVE IN:\n\n${material}\n\nReturn the WHOLE refreshed book.`
    : `The book is empty. Build its first edition from this material:\n\n${material}\n\nReturn the whole book.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 30_000, system, messages: [{ role: "user", content }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new HttpError(502, j?.error?.message || `Anthropic returned ${res.status}`);
  const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
  if (!text) throw new HttpError(502, "The compile came back empty — nothing was changed.");

  const version = bump(String(book.version), book.compiled_at ? String(book.compiled_at) : null);
  const now = new Date().toISOString();
  const { error: upErr } = await admin.from("playbook")
    .update({ content: text, version, compiled_at: now, by: byWhom }).eq("kind", kind);
  if (upErr) throw new Error(upErr.message);
  await admin.from("playbook_doc").update({ status: "compiled" }).in("id", pending.map((d) => d.id));
  return { compiled: true, version };
}
