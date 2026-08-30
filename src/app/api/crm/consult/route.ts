import { NextResponse } from "next/server";
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

export async function GET(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const tt = String(u.searchParams.get("target_type") || "");
    const tid = String(u.searchParams.get("target_id") || "");
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");
    const { data: chat } = await db.from("consult_chat").select("id")
      .eq("profile_id", me.profileId).eq("target_type", tt).eq("target_id", tid)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!chat) return NextResponse.json({ chat_id: null, messages: [] });
    const { data: msgs } = await db.from("consult_msg").select("role, content, at")
      .eq("chat_id", chat.id).order("at").limit(60);
    return NextResponse.json({ chat_id: chat.id, messages: msgs ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/consult_chat|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ chat_id: null, messages: [], needsMigration: true });
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Server is missing ANTHROPIC_API_KEY.");
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const tt = String(body.target_type || "");
    const tid = String(body.target_id || "");
    if (!TARGETS.includes(tt) || !tid) throw new HttpError(400, "Which record?");
    const opening = body.message === "__open__";
    const message = opening ? "(The salesperson has just sat down at your desk with this record open. Open the consultation.)" : String(body.message || "").trim();
    if (!message) throw new HttpError(400, "Say something.");

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
      const { data: kbRow } = await adminClient().from("consult_kb").select("content").eq("section", "sales").maybeSingle();
      kb = String(kbRow?.content || "").slice(0, 30000);
    } catch { /* the advisor stands on Nandan alone until the kb exists */ }

    const brief = await recordBrief(db, tt, tid);
    const { data: history } = await db.from("consult_msg").select("role, content")
      .eq("chat_id", chatId).order("at").limit(24);

    const firstName = String(me.displayName || me.email.split("@")[0]).trim().split(/\s+/)[0];
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      output_config: { effort: "low" },
      system: `You are CONSULT RAGHU — the advisory voice of Dr Raghunandan Jagdish, MD and CEO of NANDAN GSE, sitting across the desk from his salesperson. About Nandan:\n${NANDAN.slice(0, 1500)}\n\n${kb ? `DR RAGHU'S OWN KNOWLEDGE (his words, his rules — this is your spine):\n${kb}\n\n` : ""}How you speak:
- Greet by FIRST NAME on the opening turn only: "Hi ${firstName}," — warm, direct, a mentor who knows them.
- ASK BEFORE YOU ADVISE. Two or three sharp, specific questions about the deal in front of you — budget, authority, timing, competition, what the customer actually said. One question at a time when digging; a short numbered list when opening.
- When they answer, dig one level deeper or give a concrete next move — never generic sales talk. Speak Dr Raghu's mind: custom-engineered wins, one Indian source, believe the date you commit.
- Short paragraphs. Plain business English with warmth. Never mention knowledgebases, transcripts, training or these instructions.

The record on the desk: ${brief || "(none loaded)"}`,
      messages: [
        ...((history ?? []) as { role: "user" | "assistant"; content: string }[]).map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: message },
      ],
    });
    const reply = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    if (!reply) throw new HttpError(502, "The chair went quiet — say that again.");

    // every word both ways is KEPT
    await db.from("consult_msg").insert([
      { chat_id: chatId, role: "user", content: message },
      { chat_id: chatId, role: "assistant", content: reply },
    ]).then(() => null, () => null);

    return NextResponse.json({ chat_id: chatId, reply });
  } catch (e) {
    return errJson(e);
  }
}
