/**
 * The furniture every IMS route uses.
 *
 * Kept in one file so that "did this route check the role?" is answered by
 * looking at its first two lines rather than by reading it through.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { imsDb, notInstalled } from "./db";
import type { ImsUser } from "./auth";

/** The one answer a screen gets when its tables aren't there yet. */
export const NOT_INSTALLED = {
  installed: false as const,
  note: "Run supabase-ims/migrations/0001_core.sql and 0002_seed.sql on the IMS project first.",
};

/**
 * Run a read, and answer `installed: false` rather than 500 when the tables
 * do not exist yet. Anything else is a real error and travels as one.
 */
export async function readOr<T>(
  fn: (db: SupabaseClient) => Promise<{ data: T | null; error: { message: string } | null }>,
): Promise<{ installed: boolean; rows: T }> {
  const { data, error } = await fn(imsDb());
  if (error) {
    if (notInstalled(error.message)) return { installed: false, rows: [] as unknown as T };
    throw new Error(error.message);
  }
  return { installed: true, rows: (data ?? ([] as unknown)) as T };
}

/** Every write is logged. Auditors ask who changed what, and when. */
export async function log(
  user: ImsUser,
  entity: string,
  entityId: string | null,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await imsDb().from("ims_audit_log").insert({
      entity,
      entity_id: entityId,
      action,
      by_email: user.email,
      detail: detail ?? null,
    });
  } catch {
    /* the log must never break the write it was recording */
  }
}

/** Body helpers — an empty string on a date column means "no date", not 1970. */
export const nullIfBlank = (v: unknown) => (v === "" || v === undefined ? null : v);
export const str = (v: unknown) => String(v ?? "").trim();
export const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

/** Pull only the named fields off a body — never spread a client object. */
export function pick(
  src: Record<string, unknown>,
  fields: string[],
  nullable: RegExp = /_(date|at)$|^(due|expiry|target|achieved|review)/,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    if (src && f in src) {
      const v = src[f];
      row[f] = v === "" && nullable.test(f) ? null : v;
    }
  }
  return row;
}

export const ok = (body: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...body });

export function need(cond: unknown, message: string): void {
  if (!cond) throw new HttpError(400, message);
}
