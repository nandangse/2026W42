import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError, requireUser } from "@/lib/auth";
import { readBody } from "@/lib/validate";
import { ERP_DOCS, isOn } from "@/lib/erp-hourly";
import { ERP_HANDS_WITH_FILES } from "@/lib/erp-hands";

export const dynamic = "force-dynamic";

/**
 * WHICH DOCUMENTS COME DOWN EVERY HOUR — read and set.
 *
 * Dr Raghu, 16 Sep 2026: "tick the documents which will refresh here", and
 * "make this available to pankaj, mukesh and me".
 *
 * The same three hands as the Synchronize to ERP door itself. Named rather
 * than roled: it is three people, not a tier, and writing it down is more
 * honest than inventing a permission nobody asked for.
 */
const HANDS = ERP_HANDS_WITH_FILES;

async function hand() {
  const u = await requireUser();
  if (!HANDS.has(u.email.toLowerCase())) throw new HttpError(403, "Synchronize to ERP is Raghu, Pankaj and Mukesh.");
  return u;
}

/** Read the settings row, tolerating a database where 0168 has not run. */
async function read() {
  const db = adminClient();
  const r = await db.from("app_settings").select("erp_hourly, erp_winner").eq("id", true).maybeSingle();
  if (r.error) {
    if (/erp_hourly|erp_winner/i.test(r.error.message)) return { ready: false, on: {} as Record<string, unknown>, winner: "latest" };
    throw new Error(r.error.message);
  }
  return {
    ready: true,
    on: ((r.data?.erp_hourly ?? {}) as Record<string, unknown>),
    winner: String(r.data?.erp_winner || "latest"),
  };
}

export async function GET() {
  try {
    await hand();
    const s = await read();
    return NextResponse.json({
      ok: true,
      ready: s.ready,
      winner: s.winner,
      docs: ERP_DOCS.map((d) => ({ ...d, on: d.hourly ? isOn(s.on, d.key) : false })),
      note: s.ready ? undefined : "Run Genie migration 0168 — until then every document refreshes and nothing can be turned off.",
    });
  } catch (e) { return errJson(e); }
}

/** POST { key, on } — one tick at a time, so a half-saved form cannot happen. */
export async function POST(req: Request) {
  try {
    const u = await hand();
    const b = await readBody(req, { key: "string?" });
    const db = adminClient();

    if (b.action === "winner") {
      const w = String(b.winner || "latest");
      if (!["latest", "erp", "genie"].includes(w)) throw new HttpError(400, "latest, erp or genie.");
      const { error } = await db.from("app_settings").update({ erp_winner: w }).eq("id", true);
      if (error) throw new HttpError(error.message.includes("erp_winner") ? 503 : 500, error.message.includes("erp_winner") ? "Run Genie migration 0168 first." : error.message);
      return NextResponse.json({ ok: true, winner: w });
    }

    const key = String(b.key || "");
    const doc = ERP_DOCS.find((d) => d.key === key);
    if (!doc) throw new HttpError(400, "No such document.");
    if (!doc.hourly) throw new HttpError(400, `${doc.label} is not pulled on the hour yet — it is brought in by hand from Saamaan.`);

    const s = await read();
    if (!s.ready) throw new HttpError(503, "Run Genie migration 0168 first.");
    /* A grouped document cannot be turned off alone — see ERP_DOCS.group. */
    const family = doc.group ? ERP_DOCS.filter((d) => d.group === doc.group) : [doc];
    const next = { ...s.on };
    for (const d of family) next[d.key] = b.on !== false;
    void u;
    const { error } = await db.from("app_settings").update({ erp_hourly: next }).eq("id", true);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true, key, on: b.on !== false, alsoSet: family.filter((d) => d.key !== key).map((d) => d.label) });
  } catch (e) { return errJson(e); }
}
