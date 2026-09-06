import { NextResponse } from "next/server";
import { crmDb, crmConfigured } from "@/crm/db";
import { drain } from "@/lib/marketing-send";
import { beat } from "@/lib/cron-beat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every ten minutes: one pass over every sending campaign, at its speed, within each channel's limits. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret) { await beat("marketing-drain", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set on Vercel" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) { await beat("marketing-drain", "failed", { error: "cron call did not carry the CRON_SECRET" }); return NextResponse.json({ error: "The cron, or nobody." }, { status: 401 }); }
  if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured" });
  await beat("marketing-drain", "fired");
  try {
    const r = await drain(crmDb());
    await beat("marketing-drain", "done", r);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("marketing-drain", "failed", { error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
