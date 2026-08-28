import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireVishwakarma } from "@/lib/vishwakarma";

export const dynamic = "force-dynamic";

/**
 * Vishwakarma's registers (Dr Raghu, 28 Aug 2026) — one route, five ways of
 * thinking: references, ideas, problems (with their Five Whys), design plans
 * and the review bench. The Kuber register pattern, worn by design.
 */
const KINDS: Record<string, { table: string; fields: string[]; order: string; desc?: boolean }> = {
  reference: { table: "vishwa_reference", order: "at", desc: true, fields: ["title", "category", "link", "notes", "tags"] },
  idea: { table: "vishwa_idea", order: "at", desc: true, fields: ["title", "detail", "value_note", "status", "genie"] },
  problem: { table: "vishwa_problem", order: "at", desc: true, fields: ["title", "job", "machine", "description", "whys", "root_cause", "countermeasure", "status", "owner", "genie"] },
  plan: { table: "vishwa_plan", order: "target", fields: ["job", "deliverable", "owner", "target", "status", "note"] },
  review: { table: "vishwa_review", order: "at", desc: true, fields: ["source_kind", "source_id", "title", "question", "ai_review", "verdict", "verdict_by", "status"] },
};

const spec = (kind: string) => {
  const k = KINDS[kind];
  if (!k) throw new HttpError(400, "Unknown register.");
  return k;
};

/** GET ?kind=problem — the register; plans also carry the live jobs list. */
export async function GET(req: Request) {
  try {
    await requireVishwakarma();
    const admin = adminClient();
    const kind = String(new URL(req.url).searchParams.get("kind") || "");
    const k = spec(kind);
    const { data, error } = await admin
      .from(k.table).select("*")
      .order(k.order, { ascending: !k.desc, nullsFirst: false })
      .limit(1000);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    let jobs: { id: string; tag: string }[] = [];
    if (kind === "plan" || kind === "problem") {
      const { data: js } = await admin.from("jobs").select("id, tag").eq("active", true).order("id");
      jobs = (js || []).map((j) => ({ id: String(j.id).slice(-4), tag: String(j.tag || "") }));
    }
    return NextResponse.json({ installed: true, rows: data || [], jobs });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { kind, action: add|update|delete, id?, row? } */
export async function POST(req: Request) {
  try {
    const user = await requireVishwakarma();
    const body = await req.json();
    const k = spec(String(body.kind || ""));
    const admin = adminClient();

    if (body.action === "delete") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const row: Record<string, unknown> = {};
    for (const f of k.fields) {
      if (body.row && f in body.row) {
        const v = body.row[f];
        row[f] = v === "" && /target|source_id/.test(f) ? null : v;
      }
    }
    if (body.action === "add") {
      const { error } = await admin.from(k.table).insert({ ...row, by: user.email });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0084 first — Vishwakarma's tables don't exist yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (body.action === "update") {
      if (!body.id) throw new HttpError(400, "id required");
      const { error } = await admin.from(k.table).update(row).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
