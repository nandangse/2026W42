import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/sales/plan — the My Sales Plan app as ONE self-contained HTML
// document, loaded by the Sales Genie workspace iframe. Gated exactly like the
// playbook: auth + the explicit sales grant, checked server-side, so neither
// the app shell nor the seed data (products, industries — commercially
// sensitive) is ever publicly reachable.
//
// Assembly: shell.html + inlined styles.css + supabase-js UMD + one classic
// script of seed-data.js → app.js → boot.js (in that order — app.js reads
// SEED, boot.js calls startApp). The source files live in src/sales-plan/;
// they are the standalone app minus its login screen and Team tab.

const DIR = path.join(process.cwd(), "src", "sales-plan");
const UMD = path.join(
  process.cwd(),
  "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js",
);

// assembled once per server instance — the sources only change on deploy
let cached: string | null = null;

async function assemble(): Promise<string> {
  if (cached) return cached;
  const [shell, styles, umd, seed, app, boot] = await Promise.all([
    fs.readFile(path.join(DIR, "shell.html"), "utf8"),
    fs.readFile(path.join(DIR, "styles.css"), "utf8"),
    fs.readFile(UMD, "utf8"),
    fs.readFile(path.join(DIR, "seed-data.js"), "utf8"),
    fs.readFile(path.join(DIR, "app.js"), "utf8"),
    fs.readFile(path.join(DIR, "boot.js"), "utf8"),
  ]);
  cached = shell
    .replace("<!--__STYLES__-->", `<style>\n${styles}\n</style>`)
    .replace(
      "<!--__SCRIPTS__-->",
      `<script>\n${umd}\n</script>\n<script>\n${seed}\n;\n${app}\n;\n${boot}\n</script>`,
    );
  return cached;
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = adminClient();
    if (!(await resolveSalesAccess(admin, user.id, user.isOwner)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    return new NextResponse(await assemble(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        // frameable by our own origin only (the workspace iframe)
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
