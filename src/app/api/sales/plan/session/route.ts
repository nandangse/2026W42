import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveSalesAccess } from "@/lib/sales-access";

export const dynamic = "force-dynamic";

// GET /api/sales/plan/session — the bridge that lets the My Sales Plan iframe
// query Supabase as the signed-in Genie user WITHOUT owning a session of its
// own. Returns the caller's CURRENT access token (from the cookie session that
// the Genie parent keeps refreshed) plus the profile shape the app expects.
//
// Deliberately NO refresh token in the response: the parent is the only
// refresh authority. Two clients rotating one refresh-token family would
// invalidate each other's sessions — the iframe just re-calls this route
// every few minutes for a fresh access token instead.

// stable colour per person, drawn from the app's own palette
const COLOR_POOL = [
  "#1B2D6B", "#F04E23", "#0E7C7B", "#7A1E6C", "#B45309",
  "#2563EB", "#DC2626", "#059669", "#6D28D9", "#0891B2",
];
function colorFor(email: string): string {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COLOR_POOL[h % COLOR_POOL.length];
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = adminClient();
    if (!(await resolveSalesAccess(admin, user.id, user.isOwner)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    const {
      data: { session },
    } = await supabaseServer().auth.getSession();
    if (!session) throw new HttpError(401, "Not signed in");

    return NextResponse.json(
      {
        access_token: session.access_token,
        email: user.email,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        profile: {
          // the app's profile shape: name drives comments/owner pills,
          // role 'admin' unlocks company rename/delete + the init screen
          name: user.displayName || user.email.split("@")[0],
          role: user.role === "admin" ? "admin" : "sales",
          color: colorFor(user.email),
        },
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return errJson(e);
  }
}
