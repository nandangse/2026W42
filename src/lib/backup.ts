import { makeZip, type ZipEntry } from "@/lib/zip";
import { driveConfig, uploadToFolder } from "@/lib/drive";
import { adminClient } from "@/lib/supabase/admin";

/**
 * THE TWO BACKUPS, AND WHY EACH IS TAKEN THE WAY IT IS.
 *
 * THE CODE IS FETCHED FROM GITHUB, NOT READ OFF DISK. A deployed function
 * does not carry the source — it carries the built output, which cannot be
 * edited back into a codebase. GitHub will hand over a zip of any commit,
 * so that is the copy taken, and it is the same bytes anybody could clone.
 *
 * THE DATABASE IS READ THROUGH ITS OWN API, table by table, into JSON lines.
 * There is no pg_dump in a serverless function and no way to get one there.
 * What this produces is not a dump that can be replayed with one command —
 * it is every row, readable, in a form a person or a script can restore from.
 * SAYING SO IS PART OF THE BACKUP: a restore plan nobody has read is not a
 * plan, and believing you have a dump when you have a JSON export is exactly
 * the discovery nobody wants to make on the day.
 *
 * BOTH LAND IN HIS DRIVE. A backup living in the account it backs up is a
 * second copy of the same risk.
 */
export type Made = { name: string; bytes: Buffer; files: number; note: string };

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** The source, as GitHub would hand it to anybody cloning it. */
export async function buildCodeZip(): Promise<Made> {
  const repo = (process.env.GITHUB_REPO || "nandangse/nandan-planning-suite").trim();
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not set on Vercel. The deployed app does not carry its own source — it carries the built output — so the code is fetched from GitHub. " +
      "Make a fine-grained token with read access to " + repo + " and add it as GITHUB_TOKEN.",
    );
  }
  const url = `https://api.github.com/repos/${repo}/zipball/main`;
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "genie-backup" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`GitHub refused the archive (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  /* GitHub's zipball is already a zip. It is passed through untouched —
     repacking it would only make it bigger and could only introduce a fault. */
  return {
    name: `genie-code-${stamp()}.zip`,
    bytes: buf,
    files: 1,
    note: `the whole source at main, as GitHub packs it (${repo})`,
  };
}

/**
 * Every row of every table, as JSON lines, one file per table, zipped.
 *
 * Paged, because PostgREST answers at most a thousand rows and says nothing
 * about the rest — the mistake that nearly mailed people who had unsubscribed.
 */
export async function buildDbZip(which: "genie" | "crm", url: string, key: string): Promise<Made> {
  const H = { apikey: key, authorization: `Bearer ${key}` };

  /* The table list comes from PostgREST's own description of itself, so a
     table added next month is in the backup without anybody remembering. */
  const rootRes = await fetch(`${url}/rest/v1/`, { headers: H });
  if (!rootRes.ok) throw new Error(`Could not read the schema (${rootRes.status}).`);
  const root = await rootRes.json() as { paths?: Record<string, unknown> };
  const tables = Object.keys(root.paths || {})
    .filter((p) => p.startsWith("/") && p.length > 1 && !p.includes("{") && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .sort();

  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};
  const skipped: string[] = [];

  for (const t of tables) {
    const lines: string[] = [];
    let from = 0;
    try {
      for (;;) {
        const r = await fetch(`${url}/rest/v1/${t}?select=*`, { headers: { ...H, range: `${from}-${from + 999}` } });
        if (!r.ok) { skipped.push(`${t} (${r.status})`); break; }
        const rows = await r.json() as unknown[];
        for (const row of rows) lines.push(JSON.stringify(row));
        if (rows.length < 1000) break;
        from += 1000;
        if (from > 2_000_000) { skipped.push(`${t} (over two million rows)`); break; }
      }
    } catch { skipped.push(`${t} (unreadable)`); continue; }
    counts[t] = lines.length;
    if (lines.length) entries.push({ name: `${which}/${t}.jsonl`, data: lines.join("\n") + "\n" });
  }

  const readme = [
    `GENIE BACKUP — ${which} database`,
    `Taken ${new Date().toISOString()}`,
    "",
    "WHAT THIS IS",
    "Every row of every table, one file per table, as JSON lines (one JSON",
    "object per line). It is a complete copy of the data and it is readable",
    "by a person.",
    "",
    "WHAT THIS IS NOT",
    "It is not a pg_dump. It carries no schema, no indexes, no constraints,",
    "no functions and no row-level-security policies. Restoring means",
    "creating the schema first — the migration files in the repository are",
    "that schema, and they are in the code backup — and then loading these",
    "rows into it.",
    "",
    "Generated columns (person.full_name is one) are present in the export",
    "and must NOT be inserted on restore; the database computes them.",
    "",
    "TABLES",
    ...Object.entries(counts).sort().map(([t, n]) => `  ${t.padEnd(34)} ${String(n).padStart(9)} rows`),
    "",
    ...(skipped.length ? ["NOT READ", ...skipped.map((x) => "  " + x)] : []),
  ].join("\n");
  entries.unshift({ name: `${which}/READ-ME-FIRST.txt`, data: readme });

  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    name: `genie-${which}-db-${stamp()}.zip`,
    bytes: makeZip(entries),
    files: entries.length,
    note: `${entries.length - 1} tables, ${rows.toLocaleString()} rows — JSON lines, not a pg_dump (see READ-ME-FIRST)`,
  };
}

/** Put it in his folder and write down what happened, either way. */
export async function runBackup(kind: "code" | "db", byEmail: string): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const db = adminClient();
  const row: Record<string, unknown> = { kind, by_email: byEmail, ok: false };
  try {
    const { data: st } = await db.from("app_settings").select("backup_code_folder, backup_db_folder").eq("id", true).maybeSingle();
    const folder = String((kind === "code" ? st?.backup_code_folder : st?.backup_db_folder) || "").trim();
    if (!folder) throw new Error(`No Drive folder set for the ${kind === "code" ? "code" : "database"} backups. Paste the folder link in Admin → Backups.`);
    const cfg = driveConfig();
    if (!cfg) throw new Error("Google Drive is not configured on the deploy (GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY).");

    let made: Made;
    if (kind === "code") made = await buildCodeZip();
    else {
      /* Both databases in one archive: a restore needs the pair. */
      const genie = await buildDbZip("genie", String(process.env.NEXT_PUBLIC_SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY));
      const crm = process.env.CRM_SUPABASE_URL
        ? await buildDbZip("crm", String(process.env.CRM_SUPABASE_URL), String(process.env.CRM_SUPABASE_SERVICE_KEY))
        : null;
      made = crm
        ? { name: `genie-databases-${stamp()}.zip`, bytes: makeZip([{ name: "genie-db.zip", data: genie.bytes }, { name: "crm-db.zip", data: crm.bytes }]), files: genie.files + crm.files, note: `${genie.note} · CRM: ${crm.note}` }
        : genie;
    }

    const up = await uploadToFolder(cfg, folder, "", made.bytes.buffer.slice(made.bytes.byteOffset, made.bytes.byteOffset + made.bytes.byteLength) as ArrayBuffer, made.name, "application/zip");
    Object.assign(row, {
      ok: true, bytes: made.bytes.length, files: made.files,
      drive_id: up.id, drive_link: up.link, name: made.name, note: made.note,
      seconds: (Date.now() - t0) / 1000,
    });
  } catch (e) {
    Object.assign(row, { error: (e instanceof Error ? e.message : String(e)).slice(0, 600), seconds: (Date.now() - t0) / 1000 });
  }
  await db.from("genie_backup").insert(row).then(() => null, () => null);
  return row;
}
