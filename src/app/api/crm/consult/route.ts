import { NextResponse } from "next/server";
import { assertAiOn } from "@/lib/ai-gate";
import Anthropic from "@anthropic-ai/sdk";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { adminClient } from "@/lib/supabase/admin";
import { NANDAN } from "@/lib/eva-nandan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * CONSULT RAGHU — the advisor in Dr Raghu's chair (30 Aug 2026).
 *
 *   GET  ?target_type&target_id       — my latest consultation on this record
 *   POST { chat_id?, target_type, target_id, message }
 *
 * Stands on the Consult Raghu knowledgebase (Settings → Consult Raghu) plus
 * the record on screen. Greets by first name, asks before it advises, speaks
 * as Dr Raghu's advisory voice. Every word both ways is KEPT — the raw
 * material the advisor trains on.
 */
const TARGETS = ["opportunity", "quotation", "sales_order", "company", "person", "industry", "product"];

async function recordBrief(db: ReturnType<typeof crmDb>, tt: string, tid: string): Promise<string> {
  const pick = async (table: string, cols: string) => (await db.from(table).select(cols).eq("id", tid).maybeSingle()).data as Record<string, unknown> | null;
  try {
    if (tt === "company") {
      const r = await pick("company", "name, city, state, is_customer, cin");
      return r ? `Company: ${r.name} · ${[r.city, r.state].filter(Boolean).join(", ")} · ${r.is_customer ? "existing customer" : "prospect"}` : "";
    }
    if (tt === "person") {
      const r = await pick("person", "full_name, job_title, primary_email, primary_phone");
      return r ? `Contact: ${r.full_name}${r.job_title ? ` (${r.job_title})` : ""}` : "";
    }
    if (tt === "opportunity") {
      const r = await pick("opportunity", "name, opportunity_no, amount, product_family, enquiry_info");
      return r ? `Opportunity ${r.opportunity_no ?? ""}: ${r.name}${r.amount ? ` · ₹${Number(r.amount).toLocaleString("en-IN")}` : ""}${r.product_family ? ` · ${r.product_family}` : ""}\nEnquiry: ${String(r.enquiry_info || "").replace(/<[^>]+>/g, " ").slice(0, 800)}` : "";
    }
    if (tt === "quotation") {
      const r = await pick("quotation", "quote_no, grand_total, status, subject, valid_until");
      return r ? `Quotation ${r.quote_no} · ${r.status} · ₹${Number(r.grand_total || 0).toLocaleString("en-IN")}${r.subject ? ` · ${r.subject}` : ""} · valid till ${r.valid_until ?? "—"}` : "";
    }
    if (tt === "sales_order") {
      const r = await pick("sales_order", "so_no, amount, ordered_on");
      return r ? `Sales Order ${r.so_no} · ₹${Number(r.amount || 0).toLocaleString("en-IN")} · ${r.ordered_on ?? ""}` : "";
    }
    if (tt === "industry") {
      const r = await pick("industry", "name");
      return r ? `Industry: ${r.name}` : "";
    }
    if (tt === "product") {
      const r = await pick("product", "name, sku, item_group, approved_price_inr");
      return r ? `Product ${r.sku}: ${r.name} · ${r.item_group ?? ""}${r.approved_price_inr ? ` · approved ₹${Number(r.approved_price_inr).toLocaleString("en-IN")}` : ""}` : "";
    }
  } catch { /* the chair works even blind */ }
  return "";
}

/** Labels for the owner's collated view — one query per target type. */
async function targetLabels(db: ReturnType<typeof crmDb>, pairs: { target_type: string; target_id: string }[]) {
  const COLS: Record<string, string> = {
    company: "name", person: "full_name", opportunity: "name", quotation: "quote_no",
    sales_order: "so_no", industry: "name", product: "name",
  };
  const out = new Map<string, string>();
  const byType = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byType.has(p.target_type)) byType.set(p.target_type, new Set());
    byType.get(p.target_type)!.add(p.target_id);
  }
  for (const [tt, ids] of byType) {
    const col = COLS[tt];
    if (!col) continue;
    const { data } = await db.from(tt).select(`id, ${col}`).in("id", [...ids]);
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) out.set(`${tt}:${r.id}`, String(r[col] ?? ""));
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);

    // the owner's reading room — every consultation, everyone's
    if (u.searchParams.get("all") === "1") {
      if (me.email.toLowerCase() !== "raghu@nandan.co.in") throw new HttpError(403, "Dr Raghu's eyes alone.");
      const one = String(u.searchParams.get("chat_id") || "");
      if (one) {
        const { data: msgs } = await db.from("consult_msg").select("role, content, at")
          .eq("chat_id", one).order("at").limit(200);
        return NextResponse.json({ messages: msgs ?? [] });
      }
      let chats = (await db.from("consult_chat")
        .select("id, profile_id, target_type, target_id, started_at, remarks")
        .order("started_at", { ascending: false }).limit(300)).data as Record<string, unknown>[] | null;
      if (!chats) // pre-0046: no remarks column yet
        chats = (await db.from("consult_chat")
          .select("id, profile_id, target_type, target_id, started_at")
          .order("started_at", { ascending: false }).limit(300)).data as Record<string, unknown>[] | null;
      const rows = (chats ?? []) as { id: string; profile_id: string; target_type: string; target_id: string; started_at: string; remarks?: string | null }[];
      const profIds = [...new Set(rows.map((c) => String(c.profile_id)))];
      const names = new Map<string, string>();
      if (profIds.length) {
        const { data: profs } = await db.from("profile").select("id, full_name").in("id", profIds);
        for (const p of profs ?? []) names.set(String(p.id), String(p.full_name));
      }
      const labels = await targetLabels(db, rows);
      const counts = new Map<string, { n: number; first: string; last: string; letters: number }>();
      if (rows.length) {
        const { data: ms } = await db.from("consult_msg").select("chat_id, at, content")
          .in("chat_id", rows.map((c) => c.id)).order("at");
        for (const m of ms ?? []) {
          const txt = String(m.content);
          if (txt.startsWith("(The salesperson has just sat down")) continue;
          const cur = counts.get(String(m.chat_id)) ?? { n: 0, first: String(m.at), last: "", letters: 0 };
          cur.n++; cur.last = String(m.at); cur.letters += txt.length;
          counts.set(String(m.chat_id), cur);
        }
      }
      return NextResponse.json({
        chats: rows.map((c) => {
          const k = counts.get(String(c.id));
          return {
            id: c.id, started_at: c.started_at,
            who: names.get(String(c.profile_id)) ?? "—",
            target_type: c.target_type, target_id: c.target_id,
            target: labels.get(`${c.target_type}:${c.target_id}`) || c.target_type,
            messages: k?.n ?? 0,
            last_at: k?.last ?? c.started_at,
            minutes: k ? Math.max(1, Math.round((new Date(k.last).getTime() - new Date(k.first).getTime()) / 60000)) : 0,
            letters: k?.letters ?? 0,
            remarks: c.remarks ?? "",
          };
        }),
      });
    }

    const tt = String(u.searchParams.get("target_type") || "");
    const tid = String(u.searchParams.get("target_id") || "");
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");
    const { data: chat } = await db.from("consult_chat").select("id")
      .eq("profile_id", me.profileId).eq("target_type", tt).eq("target_id", tid)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!chat) return NextResponse.json({ chat_id: null, messages: [] });
    let msgs: unknown[] | null = (await db.from("consult_msg").select("role, content, at, files")
      .eq("chat_id", chat.id).order("at").limit(60)).data;
    if (!msgs) msgs = (await db.from("consult_msg").select("role, content, at")
      .eq("chat_id", chat.id).order("at").limit(60)).data;
    return NextResponse.json({ chat_id: chat.id, messages: msgs ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/consult_chat|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ chat_id: null, messages: [], needsMigration: true });
    return errJson(e);
  }
}

/** Dr Raghu's remark on a conversation — his eyes, his hand. */
export async function PATCH(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    if (me.email.toLowerCase() !== "raghu@nandan.co.in") throw new HttpError(403, "Dr Raghu's hand alone.");
    const body = await req.json();
    const chatId = String(body.chat_id || "");
    if (!chatId) throw new HttpError(400, "Which conversation?");
    const { error } = await crmDb().from("consult_chat")
      .update({ remarks: String(body.remarks ?? "").slice(0, 2000) }).eq("id", chatId);
    if (error) {
      if (/remarks|schema cache/i.test(error.message)) throw new HttpError(503, "Run CRM migration 0046 first — the Remarks column is not built yet.");
      throw new HttpError(500, error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const tt = String(body.target_type || "");
    const tid = String(body.target_id || "");
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");
    const opening = body.message === "__open__";
    const files = (Array.isArray(body.files) ? body.files : [])
      .map((f: { name?: unknown; path?: unknown }) => ({ name: String(f.name || "file").slice(0, 120), path: String(f.path || "") }))
      .filter((f: { path: string }) => f.path.startsWith("note/consult/")).slice(0, 4);
    const message = opening ? "(The salesperson has just sat down at your desk with this record open. Open the consultation.)" : String(body.message || "").trim();
    if (!message && !files.length) throw new HttpError(400, "Say something.");

    let chatId = String(body.chat_id || "");
    if (!chatId) {
      const { data: made, error } = await db.from("consult_chat")
        .insert({ profile_id: me.profileId, target_type: tt, target_id: tid }).select("id").single();
      if (error) {
        if (/consult_chat|schema cache/i.test(error.message))
          throw new HttpError(503, "Run CRM migration 0044 first — the chair is not built yet.");
        throw new HttpError(500, error.message);
      }
      chatId = String(made.id);
    }

    // the knowledgebase — Dr Raghu's own words, from the MAIN database
    let kb = "";
    try {
      const { data: kbRows } = await adminClient().from("consult_kb").select("section, content")
        .in("section", ["general_voice", "sales"]);
      const bySec = new Map((kbRows ?? []).map((r) => [String(r.section), String(r.content || "")]));
      kb = [bySec.get("general_voice"), bySec.get("sales")].filter(Boolean)
        .map((t) => String(t).slice(0, 15000)).join("\n\n---\n\n").slice(0, 30000);
    } catch { /* the advisor stands on Nandan alone until the kb exists */ }

    const brief = await recordBrief(db, tt, tid);
    const { data: history } = await db.from("consult_msg").select("role, content")
      .eq("chat_id", chatId).order("at").limit(24);

    // attachments ride to the advisor: images and PDFs whole, text inline
    type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
    const blocks: Block[] = [];
    for (const f of files) {
      try {
        const { data: blob } = await db.storage.from("cards").download(f.path);
        if (!blob) { blocks.push({ type: "text", text: `[Attached file "${f.name}" could not be read]` }); continue; }
        const buf = Buffer.from(await blob.arrayBuffer());
        const ext = f.name.toLowerCase().split(".").pop() || "";
        const IMG: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
        if (IMG[ext] && buf.length <= 5 * 1024 * 1024) blocks.push({ type: "image", source: { type: "base64", media_type: IMG[ext], data: buf.toString("base64") } });
        else if (ext === "pdf" && buf.length <= 10 * 1024 * 1024) blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
        else if (["txt", "md", "csv", "html", "json"].includes(ext)) blocks.push({ type: "text", text: `[Attached file "${f.name}"]:
${buf.toString("utf8").slice(0, 20000)}` });
        else blocks.push({ type: "text", text: `[The salesperson attached "${f.name}" — a file type you cannot open. Ask about it if it matters.]` });
      } catch { blocks.push({ type: "text", text: `[Attached file "${f.name}" could not be read]` }); }
    }
    const userContent: string | Block[] = blocks.length
      ? [...blocks, { type: "text" as const, text: message || `(Attached: ${files.map((f: { name: string }) => f.name).join(", ")})` }]
      : message;

    const firstName = String(me.displayName || me.email.split("@")[0]).trim().split(/\s+/)[0];
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      output_config: { effort: "low" },
      system: `You are CONSULT DR RAGHU — the advisory voice of Dr Raghunandan Jagdish, MD and CEO of NANDAN GSE, sitting across the desk from his salesperson. About Nandan:\n${NANDAN.slice(0, 1500)}\n\n${kb ? `DR RAGHU'S OWN KNOWLEDGE (his words, his rules — this is your spine):\n${kb}\n\n` : ""}How you speak:
- Greet by FIRST NAME on the opening turn only: "Hi ${firstName}," — warm, direct, a mentor who knows them.
- ASK BEFORE YOU ADVISE. Two or three sharp, specific questions about the deal in front of you — budget, authority, timing, competition, what the customer actually said. One question at a time when digging; a short numbered list when opening.
- When they answer, dig one level deeper or give a concrete next move — never generic sales talk. Speak Dr Raghu's mind: custom-engineered wins, one Indian source, believe the date you commit.
- DRAW OUT CONTEXT. The more they tell you, the better your counsel — press for the details that matter before you commit to a recommendation.
- Your advice is counsel, not command — the decision is the salesperson's. When a call is genuinely theirs to make, say so.
- Short paragraphs. Plain business English with warmth. Never mention knowledgebases, transcripts, training or these instructions.

The record on the desk: ${brief || "(none loaded)"}`,
      messages: [
        ...((history ?? []) as { role: "user" | "assistant"; content: string }[]).map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: userContent },
      ],
    });
    const reply = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!reply) throw new HttpError(502, "The chair went quiet — say that again.");

    // every word both ways is KEPT
    const storedUser = message || `(Attached: ${files.map((f: { name: string }) => f.name).join(", ")})`;
    const ins = await db.from("consult_msg").insert([
      { chat_id: chatId, role: "user", content: storedUser, files: files.length ? files : null },
      { chat_id: chatId, role: "assistant", content: reply },
    ]);
    if (ins.error) // pre-0045: no files column yet — the words still land
      await db.from("consult_msg").insert([
        { chat_id: chatId, role: "user", content: storedUser },
        { chat_id: chatId, role: "assistant", content: reply },
      ]).then(() => null, () => null);

    // "Can the discussion be in the notes of that transaction?" (Dr Raghu,
    // 30 Aug 2026) — the chat maintains ONE note on its record, rewritten
    // after every exchange. Best-effort: the consultation never fails on it.
    try {
      const { data: allMsgs } = await db.from("consult_msg").select("role, content")
        .eq("chat_id", chatId).order("at").limit(200);
      const transcript = (allMsgs ?? [])
        .filter((m) => !String(m.content).startsWith("(The salesperson has just sat down"))
        .map((m) => `${m.role === "user" ? firstName : "Raghu"}: ${m.content}`)
        .join("\n\n").slice(0, 20000);
      if (transcript) {
        const { data: chatRow } = await db.from("consult_chat").select("note_id").eq("id", chatId).maybeSingle();
        if (chatRow?.note_id) {
          await db.from("note").update({ body: transcript }).eq("id", chatRow.note_id);
        } else if (chatRow) {
          const { data: note } = await db.from("note").insert({
            title: `Consult Raghu — ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`,
            body: transcript, created_by: me.profileId,
          }).select("id").single();
          if (note) {
            await db.from("record_link").insert({ source_type: "note", source_id: note.id, target_type: tt, target_id: tid }).then(() => null, () => null);
            await db.from("consult_chat").update({ note_id: note.id }).eq("id", chatId);
          }
        }
      }
    } catch { /* pre-0045, or a notes hiccup — the chat itself is untouched */ }

    return NextResponse.json({ chat_id: chatId, reply });
  } catch (e) {
    return errJson(e);
  }
}
