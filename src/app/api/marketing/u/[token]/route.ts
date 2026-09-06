import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/** The unsubscribe link on every campaign mail: one click, on the list for good. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  let done = false;
  try {
    const token = String(params.token || "").replace(/[^a-f0-9]/gi, "").slice(0, 40);
    if (token && crmConfigured()) {
      const db = crmDb();
      const { data } = await db.from("mk_send").select("id, email, campaign_id").eq("token", token).maybeSingle();
      if (data) {
        await db.from("mk_unsubscribe").upsert({ email: String(data.email).toLowerCase(), reason: "request", campaign_id: data.campaign_id, note: "clicked the link" }, { onConflict: "email", ignoreDuplicates: true });
        await db.from("mk_send").update({ status: "unsubscribed" }).eq("id", data.id);
        done = true;
      }
    }
  } catch (e) { swallow("marketing/u", e); }
  const html = `<!doctype html><html><body style="font-family:system-ui;background:#F1EFE9;color:#22303C;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#fff;border-radius:10px;padding:28px 32px;max-width:420px;text-align:center;border-top:4px solid #E8600A"><div style="font-size:22px;font-weight:700">${done ? "You are unsubscribed." : "That link has expired."}</div><p style="color:#5A6672">${done ? "Nandan GSE will not mail this address again. Sorry for the trouble." : "Write to sales@nandan.co.in and we will take you off by hand."}</p></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
