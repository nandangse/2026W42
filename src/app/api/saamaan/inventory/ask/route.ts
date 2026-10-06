import Anthropic from "@anthropic-ai/sdk";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { assertAiOn } from "@/lib/ai-gate";
import { AI, anthropicClient } from "@/lib/ai";
import { mayConsultInventory } from "@/lib/saamaan-inventory";
import { INVENTORY_SYSTEM, runTool, TOOLS } from "@/lib/saamaan-inventory-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Msg = Anthropic.Beta.Messages.BetaMessageParam;

/**
 * ASK GENIE — the inventory, in conversation, in real time (Dr Raghu,
 * 6 Oct 2026: "for Rameez's account, make a scenario where he can consult
 * Genie and start talking to it in real time to get answers").
 *
 * GET              his conversations (titles only)
 * GET ?id=         one conversation's turns, as text
 * POST { id?, text } streams the answer as NDJSON lines:
 *   {"t":"chat","id":…}  {"t":"text","d":…}  {"t":"tool","name":…,"ok":…}
 *   {"t":"done","in":…,"out":…}  {"t":"error","error":…}
 *
 * The conversation is kept WHOLE in material_inv_chat — every block the
 * model sent, thinking included — and replayed exactly each turn. It is
 * only ever appended to: on the current Opus an edited history breaks its
 * reasoning, so nothing in it is rewritten or trimmed.
 *
 * Genie answers from tools that read the ERP and Genie live; it cannot
 * change anything. Each turn is capped at eight rounds of tool use.
 */
const textOf = (content: Msg["content"]): string =>
  typeof content === "string" ? content
    : content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");

export async function GET(req: Request) {
  try {
    const me = await requireSaamaan();
    if (!mayConsultInventory(me.email, me.isOwner)) throw new HttpError(403, "Ask Genie is Rameez's and Dr Raghu's for now.");
    const admin = adminClient();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data } = await admin.from("material_inv_chat").select("id, title, messages, updated_at").eq("id", id).eq("email", me.email.toLowerCase()).maybeSingle();
      if (!data) throw new HttpError(404, "No such conversation.");
      /* the screen shows the words; tool calls and results stay in the record */
      const turns = ((data.messages as Msg[]) || [])
        .map((m) => ({ role: m.role, text: textOf(m.content) }))
        .filter((m) => m.text.trim());
      return Response.json({ ok: true, id: data.id, title: data.title, turns });
    }
    const { data, error } = await admin.from("material_inv_chat").select("id, title, turns, updated_at").eq("email", me.email.toLowerCase()).order("updated_at", { ascending: false }).limit(50);
    if (error) {
      if (/material_inv_chat|does not exist|schema cache/i.test(error.message)) return Response.json({ ok: true, chats: [], installed: false });
      throw new Error(error.message);
    }
    return Response.json({ ok: true, chats: data ?? [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    await assertAiOn();
    const me = await requireSaamaan();
    if (!mayConsultInventory(me.email, me.isOwner)) throw new HttpError(403, "Ask Genie is Rameez's and Dr Raghu's for now.");
    const body = await readBody(req, {});
    const text = String(body.text || "").trim().slice(0, 4000);
    if (!text) throw new HttpError(400, "Ask something.");
    const admin = adminClient();
    const email = me.email.toLowerCase();

    let chatId = String(body.id || "");
    let history: Msg[] = [];
    if (chatId) {
      const { data } = await admin.from("material_inv_chat").select("messages").eq("id", chatId).eq("email", email).maybeSingle();
      if (!data) throw new HttpError(404, "No such conversation.");
      history = (data.messages as Msg[]) || [];
    } else {
      const { data, error } = await admin.from("material_inv_chat").insert({ email, title: text.slice(0, 80), messages: [] }).select("id").single();
      if (error) throw new HttpError(503, /does not exist|schema cache/i.test(error.message) ? "Run migration 0201 first." : error.message);
      chatId = data.id;
    }
    const messages: Msg[] = [...history, { role: "user", content: text }];
    const client = anthropicClient();
    const enc = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const send = (o: Record<string, unknown>) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        let inTok = 0, outTok = 0, jsonRetries = 0;
        send({ t: "chat", id: chatId });
        const save = async () => {
          const { data: cur } = await admin.from("material_inv_chat").select("turns, in_tokens, out_tokens").eq("id", chatId).maybeSingle();
          await admin.from("material_inv_chat").update({
            messages, turns: Number(cur?.turns || 0) + 1, in_tokens: Number(cur?.in_tokens || 0) + inTok, out_tokens: Number(cur?.out_tokens || 0) + outTok,
            updated_at: new Date().toISOString(),
          }).eq("id", chatId);
        };
        try {
          for (let round = 0; round < 8; round++) {
            const s = client.beta.messages.stream({
              model: AI.NEWEST,
              max_tokens: 16000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              thinking: { type: "adaptive" },
              output_config: { effort: "medium" },
              system: [{ type: "text", text: INVENTORY_SYSTEM, cache_control: { type: "ephemeral" } }],
              tools: TOOLS as unknown as Anthropic.Beta.Messages.BetaToolUnion[],
              messages,
            });
            s.on("text", (d) => send({ t: "text", d }));
            let msg: Anthropic.Beta.Messages.BetaMessage;
            try {
              msg = await s.finalMessage();
              jsonRetries = 0;
            } catch (err) {
              /* only an unparseable streamed tool input is retried; API errors go up */
              if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
              continue;
            }
            inTok += (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0);
            outTok += msg.usage.output_tokens || 0;
            messages.push({ role: "assistant", content: msg.content });
            const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
            /* A turn cut off by a refusal or the length cap must not run its
               tools — but the record must still answer every call it made, or
               the next question fails on a call with no result. */
            if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") {
              if (uses.length) messages.push({ role: "user", content: uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: "Not run: the turn was cut off." })) });
              send({ t: "text", d: msg.stop_reason === "refusal" ? "\n\n(Genie declined to answer that one.)" : "\n\n(The answer ran long and was cut — ask a narrower question.)" });
              break;
            }
            if (!uses.length || msg.stop_reason === "end_turn") break;
            const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
            for (const u of uses) {
              send({ t: "tool", name: u.name });
              const r = await runTool(admin, u.name, u.input);
              send({ t: "tool", name: u.name, ok: r.ok });
              results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.ok ? {} : { is_error: true }) });
            }
            messages.push({ role: "user", content: results });
          }
          await save();
          send({ t: "done", in: inTok, out: outTok });
        } catch (err) {
          const m = err instanceof Anthropic.RateLimitError ? "Genie is busy — try again in a minute."
            : err instanceof Anthropic.APIError ? `Genie could not answer (${err.status}).`
            : err instanceof Error ? err.message : String(err);
          send({ t: "error", error: m });
        } finally {
          ctrl.close();
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (e) { return errJson(e); }
}
