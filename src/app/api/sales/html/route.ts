import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUser, requireAdmin, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The playbook ships with the repo as the original, byte-identical artifact.
// The DATABASE copy (sales_content, latest row) wins once one exists — that is
// what "Import backup" writes to — and this file is the fallback of last
// resort, so the tab can never render empty.
const BUNDLED = path.join(process.cwd(), "src", "sales-regrow", "Sales_Regrow.html");

// GET /api/sales/html — the playbook document itself, loaded by the workspace
// iframe. Auth + explicit sales grant, checked server-side; the HTML is never
// publicly reachable.
export async function GET() {
  try {
    const user = await requireUser();
    const admin = adminClient();
    if (!(await resolveSalesAccess(admin, user.id, user.isOwner)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    let html: string | null = null;
    try {
      const { data } = await admin
        .from("sales_content")
        .select("html")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      html = data?.html ?? null;
    } catch {
      /* table missing → bundled fallback below */
    }
    if (!html) html = await fs.readFile(BUNDLED, "utf8");

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        // The global security headers deny ALL framing; this route must instead
        // allow framing by our own origin only (the workspace iframe) while
        // still refusing everyone else's.
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}

// POST /api/sales/html (multipart) — "Import backup": replace the served
// playbook with an uploaded HTML file. Admin only. A new row is added and old
// rows are kept, so every previous version remains recoverable.
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const admin = adminClient();
    if (!(await resolveSalesAccess(admin, user.id, user.isOwner)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

    const html = await file.text();
    if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html))
      return NextResponse.json(
        { error: "That doesn't look like a complete HTML document" },
        { status: 422 },
      );

    const { error } = await admin.from("sales_content").insert({
      filename: file.name,
      html,
      uploaded_by: user.email,
    });
    if (error) {
      if (/sales_content|schema cache|does not exist/i.test(error.message))
        return NextResponse.json(
          { error: "Run migration 0013 first — the sales tables don't exist yet" },
          { status: 400 },
        );
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, bytes: html.length, filename: file.name });
  } catch (e) {
    return errJson(e);
  }
}
