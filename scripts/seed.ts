// scripts/seed.ts — idempotent seed. Run AFTER migrations 0001…0007.
//   npm run seed
// Seeds: users (via the service key), family templates (from templateFor),
// and the single settings row. Safe to run repeatedly.
import { config } from "dotenv";
config({ path: ".env.local" }); // Next.js reads .env.local automatically; tsx scripts don't
config(); // also pick up .env if present (no override)
import { createClient } from "@supabase/supabase-js";
import { templateFor, SEED_FAMILIES } from "../src/lib/templates";
import type { Role } from "../src/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PW = process.env.SEED_PASSWORD || (() => { throw new Error("SEED_PASSWORD must be set — no default password (audit S15)"); })();

// Spec §2 seeds: raghu + medhansh (admin), shweta (uploader). A planner is
// added for day-one boards + acceptance testing.
const USERS: { email: string; role: Role; initials: string; name: string }[] = [
  { email: "raghu@nandan.co.in", role: "admin", initials: "RG", name: "Dr Raghu" },
  { email: "medhansh@nandan.co.in", role: "admin", initials: "MG", name: "Medhansh" },
  { email: "priya@nandan.co.in", role: "planner", initials: "PR", name: "Priya" },
  { email: "shweta@nandan.co.in", role: "uploader", initials: "SH", name: "Shweta" },
];

async function findUserByEmail(email: string): Promise<string | null> {
  // paginate listUsers until we find the email
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function seedUsers() {
  for (const u of USERS) {
    const email = u.email.toLowerCase();
    let id = await findUserByEmail(email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PW,
        email_confirm: true,
        user_metadata: { role: u.role },
      });
      if (error) {
        console.error(`  ! ${email}: ${error.message}`);
        continue;
      }
      id = data.user!.id;
      console.log(`  + created ${email} (${u.role})`);
    } else {
      console.log(`  = ${email} exists`);
    }
    // ensure profile role/initials are correct (trigger inserts; we enforce here)
    const { error: pe } = await admin
      .from("profiles")
      .upsert(
        { id, email, role: u.role, disabled: false, initials: u.initials, display_name: u.name },
        { onConflict: "id" },
      );
    if (pe) console.error(`  ! profile ${email}: ${pe.message}`);
  }
}

async function seedTemplates() {
  for (const fam of SEED_FAMILIES) {
    const milestones = templateFor(fam === "Default" ? "" : fam).map((m) => ({
      name: m.name,
      days: m.days,
      preds: m.pred ? [m.pred] : [],
      crew: m.crew,
      shift: "D",
      offset: m.offset,
    }));
    const { error } = await admin
      .from("family_templates")
      .upsert({ family: fam, milestones }, { onConflict: "family" });
    if (error) console.error(`  ! template ${fam}: ${error.message}`);
    else console.log(`  = template ${fam} (${milestones.length} milestones)`);
  }
}

async function seedSettings() {
  const { error } = await admin
    .from("settings")
    .upsert({ id: 1, priority_order: [] }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.error(`  ! settings: ${error.message}`);
  else console.log("  = settings row ensured");
}

async function main() {
  console.log("Seeding users…");
  await seedUsers();
  console.log("Seeding family templates…");
  await seedTemplates();
  console.log("Seeding settings…");
  await seedSettings();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
