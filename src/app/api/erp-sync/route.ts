import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";
import { erpConfig, erpSync } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE PROJECTS AND JOBS IMPORT (Dr Raghu, 1 Sep 2026: "can we now stop the
 * upload and instead do the API import from erpnext?").
 *
 *   POST { dry: true }   — read the ERP, report what would change, write
 *                          nothing. Run this first, always.
 *   POST {}              — do it.
 *   GET                  — the hourly cron, signed by Vercel.
 *
 * It replaces two of the morning upload's cards — "Job in progress - Jobs"
 * and "Order in Progress - projects". The upload still works and is left
 * alone; nothing here deletes it, so a bad hour can fall back to the sheet.
 */
async function run(dry: boolean) {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP keys live in the CRM's database, and it is not connected here.");
  const cfg = await erpConfig(crmDb());
  if ("error" in cfg) throw new HttpError(400, cfg.error);
  return await erpSync(adminClient(), cfg, { dry });
}

export async function POST(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.disabled) throw new HttpError(401, "Sign in first.");
    if (!u.isOwner) throw new HttpError(403, "The ERP import is Raghu's to run, for now.");
    const body = await req.json().catch(() => ({}));
    const out = await run(body.dry === true);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errJson(e);
  }
}

/** The hourly pull. Vercel signs it; a signed-in owner may also fire it. */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const header = req.headers.get("authorization") || "";
    const fromCron = !!secret && header === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled || !u.isOwner) throw new HttpError(401, "The hourly cron, or Raghu.");
    }
    const out = await run(false);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errJson(e);
  }
}
