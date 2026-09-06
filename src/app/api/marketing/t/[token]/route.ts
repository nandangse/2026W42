import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** The open pixel on every campaign mail. Never errors at the reader. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const token = String(params.token || "").replace(/[^a-f0-9]/gi, "").slice(0, 40);
    if (token && crmConfigured()) {
      const db = crmDb();
      const { data } = await db.from("mk_send").select("id, opened_at, open_count, status").eq("token", token).maybeSingle();
      if (data) await db.from("mk_send").update({ opened_at: data.opened_at ?? new Date().toISOString(), open_count: (Number(data.open_count) || 0) + 1, status: data.status === "sent" ? "opened" : data.status }).eq("id", data.id);
    }
  } catch (e) { swallow("marketing/t", e); }
  return new NextResponse(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, private", "content-length": String(GIF.length) } });
}
