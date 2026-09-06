/**
 * Which Claude answers which kind of work (Dr Raghu, 6 Sep 2026: "optimize
 * my token usage also. Background work can be done by cron jobs. Click and
 * front end jobs can be with opus").
 *
 * Two tiers, named for the WORK rather than the model, so a change of model
 * is one line here and not fourteen edits:
 *
 *   FRONT      — somebody pressed a button and is waiting. Claude Opus 5.
 *   BACKGROUND — a cron or an upload nobody is watching: playbook compiles,
 *                voice-note transcripts. Claude Sonnet 5, a fifth of the
 *                price per token.
 *
 * Model ids are the bare current ones — never date-suffixed.
 */
import Anthropic from "@anthropic-ai/sdk";

export const AI = {
  FRONT: "claude-opus-5",
  BACKGROUND: "claude-sonnet-5",
} as const;

/** The API version header for the raw-fetch call sites that predate the SDK here. */
export const ANTHROPIC_VERSION = "2023-06-01";

let cached: Anthropic | null = null;
/** One client for the process; the key comes from the environment. */
export function anthropicClient(): Anthropic {
  if (cached) return cached;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  cached = new Anthropic();
  return cached;
}
