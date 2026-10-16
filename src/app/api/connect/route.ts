import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, mintToken, resolveCaller } from "@/lib/mcp/auth";
import { DOOR_LABEL } from "@/lib/mcp/registry";

export const dynamic = "force-dynamic";

/**
 * /api/connect — a person's keys to Genie's MCP door (16 Oct 2026).
 *   GET                         my keys (the owner: everyone's), and the doors my login opens
 *   POST { action: "mint", label }     a new key — shown ONCE in the answer
 *   POST { action: "revoke", id }      mine, or anyone's for the owner
 */
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const admin = adminClient();
    let q = admin.from("genie_api_token").select("id, email, label, prefix, created_at, last_used_at, last_tool, calls, revoked_at").order("created_at", { ascending: false });
    if (!u.isOwner) q = q.eq("email", u.email.toLowerCase());
    const { data, error } = await q;
    if (error && /genie_api_token|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, keys: [], doors: [] });
    if (error) throw new Error(error.message);
    /* the doors, judged exactly as the MCP route judges them — by pretending this login presented a key */
    const fake = new Request(req.url, { headers: { authorization: `Bearer ${process.env.GENIE_MCP_TOKEN || "x"}` } });
    const c = u.isOwner && process.env.GENIE_MCP_TOKEN ? await resolveCaller(admin, fake) : null;
    return NextResponse.json({ installed: true, me: u.email, isOwner: u.isOwner, keys: data || [], doors: c ? Object.entries(c.doors).filter(([, v]) => v).map(([k]) => DOOR_LABEL[k] || k) : null, door_labels: DOOR_LABEL });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const b = await readBody(req, { action: "string" });
    const admin = adminClient();
    if (b.action === "mint") {
      const label = String(b.label || "My agent").trim().slice(0, 80) || "My agent";
      const token = mintToken();
      const { data, error } = await admin.from("genie_api_token").insert({ email: u.email.toLowerCase(), label, token_hash: hashToken(token), prefix: token.slice(0, 12) }).select("id").single();
      if (error) throw new Error(/genie_api_token|schema cache/i.test(error.message) ? "Run migration 0239 first — keys have nowhere to live yet." : error.message);
      return NextResponse.json({ ok: true, id: data.id, token });
    }
    if (b.action === "revoke") {
      const { data: k } = await admin.from("genie_api_token").select("id, email").eq("id", String(b.id || "")).maybeSingle();
      if (!k) throw new HttpError(404, "No such key.");
      if (!u.isOwner && String(k.email).toLowerCase() !== u.email.toLowerCase()) throw new HttpError(403, "Not your key.");
      await admin.from("genie_api_token").update({ revoked_at: new Date().toISOString(), revoked_by: u.email }).eq("id", k.id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
