import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/track/<token> — the tracking pixel (Dr Raghu, 28 Aug 2026).
 *
 * DELIBERATELY UNAUTHENTICATED: it is fetched by the recipient's mail client,
 * which holds no Genie session. The token is a 128-bit random name that
 * exists only inside one sent mail; guessing it buys an attacker a 1x1 gif.
 * It writes nothing but a timestamp and a counter on its own message row.
 */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const token = String(params.token || "").replace(/[^a-f0-9-]/gi, "").slice(0, 64);
    if (token && crmConfigured()) {
      const db = crmDb();
      const { data } = await db.from("message").select("id, opened_at, open_count").eq("track_token", token).maybeSingle();
      if (data) {
        await db.from("message").update({
          opened_at: data.opened_at ?? new Date().toISOString(),
          open_count: (Number(data.open_count) || 0) + 1,
        }).eq("id", data.id);
      }
    }
  } catch (e) { swallow("crm/track/[token]", e); /* the pixel never errors at the reader */ }
  return new NextResponse(GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "content-length": String(GIF.length),
    },
  });
}
