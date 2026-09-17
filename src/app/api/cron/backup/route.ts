import { NextResponse } from "next/server";
import { beat } from "@/lib/cron-beat";
import { runBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE NIGHTLY BACKUP.
 *
 * Both archives, every night, into his own Drive. It is the oldest must-have
 * on the register and the only one whose absence cannot be recovered from:
 * everything else in Genie can be rebuilt from the code and the data.
 *
 * A FAILURE IS RECORDED AS LOUDLY AS A SUCCESS. A backup that has been
 * failing quietly for a month is worse than no backup, because somebody is
 * relying on it. Each run writes its own row whether it worked or not, and
 * the heartbeat carries the size — a backup whose size nobody checks is a
 * backup nobody knows is empty.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret) { await beat("backup", "failed", { error: "CRON_SECRET is not set on Vercel" }); return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 }); }
  if (auth !== `Bearer ${secret}`) { await beat("backup", "failed", { error: "cron call did not carry the CRON_SECRET" }); return NextResponse.json({ error: "The cron, or nobody." }, { status: 401 }); }
  await beat("backup", "fired");
  try {
    const code = await runBackup("code", "cron@genie");
    const dbq = await runBackup("db", "cron@genie");
    const out = {
      code: { ok: code.ok, mb: code.bytes ? Math.round(Number(code.bytes) / 1048576 * 10) / 10 : 0, error: code.error ?? null },
      db: { ok: dbq.ok, mb: dbq.bytes ? Math.round(Number(dbq.bytes) / 1048576 * 10) / 10 : 0, error: dbq.error ?? null },
    };
    await beat("backup", code.ok && dbq.ok ? "done" : "failed", out);
    return NextResponse.json({ ok: code.ok && dbq.ok, ...out });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await beat("backup", "failed", { error: error.slice(0, 300) });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
