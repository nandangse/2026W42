// scripts/seed-quotes.ts — load a quotes workbook into the `quotes` table.
//   npm run seed:quotes -- "C:/path/to/Project_Time_Life_Quotes_600.xlsx"
// Idempotent: quotes already present (same text) are skipped.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { parseQuotes, ORIGINAL_AUTHOR } from "../src/lib/parse-quotes";

const DEFAULT_FILE = "C:/Users/guptama/Desktop/Project_Time_Life_Quotes_600.xlsx";

async function main() {
  const file = process.argv[2] || DEFAULT_FILE;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log("Reading", file);
  const wb = XLSX.readFile(file);
  const parsed = parseQuotes(wb);
  const originals = parsed.filter((q) => q.original).length;
  console.log(`Parsed ${parsed.length} quotes — ${originals} original (credited to ${ORIGINAL_AUTHOR}), ${parsed.length - originals} attributed to their stated authors.`);
  if (!parsed.length) process.exit(1);

  const { count: before } = await admin.from("quotes").select("id", { count: "exact", head: true });
  const base = before ?? 0;
  const rows = parsed.map((q, i) => ({ ...q, seq: base + i }));

  // chunk the insert so a large workbook doesn't hit payload limits
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin
      .from("quotes")
      .upsert(chunk, { onConflict: "md5(body)", ignoreDuplicates: true });
    if (error) {
      console.error("  ! insert failed:", error.message);
      process.exit(1);
    }
    process.stdout.write(`  …${Math.min(i + 200, rows.length)}/${rows.length}\r`);
  }

  const { count: after } = await admin.from("quotes").select("id", { count: "exact", head: true });
  console.log(`\nDone. Added ${(after ?? 0) - base}, skipped ${parsed.length - ((after ?? 0) - base)} already present. Collection now ${after} quotes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
