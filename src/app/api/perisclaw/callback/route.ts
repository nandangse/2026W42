import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { finishAuth } from "@/lib/perisclaw";

export const dynamic = "force-dynamic";

/** Perisclaw sends the browser back here with ?code=&state= after Dr Raghu allows access. */
export async function GET(req: Request) {
  const u = new URL(req.url); const code = u.searchParams.get("code") || ""; const state = u.searchParams.get("state") || "";
  const who = await currentUser().catch(() => null);
  try {
    if (u.searchParams.get("error")) throw new Error(`${u.searchParams.get("error")}: ${u.searchParams.get("error_description") || ""}`);
    if (!code) throw new Error("No code came back.");
    await finishAuth(code, state, `${u.origin}/api/perisclaw/callback`, who?.email || "raghu@nandan.co.in");
    return NextResponse.redirect(`${u.origin}/connect?perisclaw=connected`);
  } catch (e) {
    return NextResponse.redirect(`${u.origin}/connect?perisclaw=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}
