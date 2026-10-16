import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { authorizeUrl, perisclawStatus, perisclawTools, perisclawDisconnect, sendWhatsApp } from "@/lib/perisclaw";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const redirectOf = (req: Request) => `${new URL(req.url).origin.replace(/^http:\/\/localhost/, "http://localhost")}/api/perisclaw/callback`;

/** Genie ↔ Perisclaw: status; start the sign-in (owner); list tools; send a test; disconnect. */
export async function GET() {
  try { await requireUser(); return NextResponse.json(await perisclawStatus()); } catch (e) { return errJson(e); }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (!u.isOwner) throw new HttpError(403, "Genie's Perisclaw connection is Dr Raghu's to make.");
    const b = await readBody(req, { action: "string" });
    if (b.action === "start") return NextResponse.json({ url: await authorizeUrl(redirectOf(req)) });
    if (b.action === "tools") return NextResponse.json({ tools: await perisclawTools() });
    if (b.action === "send_test") { const to = String(b.to || "").trim(); if (!to) throw new HttpError(400, "To whom? A WhatsApp number with country code, e.g. 919820012345."); const r = await sendWhatsApp(to, String(b.text || `Hello from Genie · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`), u.email); return NextResponse.json({ ok: true, result: r }); }
    if (b.action === "disconnect") { await perisclawDisconnect(); return NextResponse.json({ ok: true }); }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
