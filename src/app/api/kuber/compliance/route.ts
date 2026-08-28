import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/**
 * The Compliance Calendar (Dr Raghu, 28 Aug 2026): compliances × the FY's
 * months. Each cell holds the done-date and the LINK to the proof — both
 * editable, the link openable — and the colour is JUDGED FROM THE DATE:
 * green when done by the due day, amber when late, red when a past month
 * stands empty. The judging happens on the client; this route serves and
 * saves the facts.
 *
 *   GET  ?fy=2026            — rows + entries for FY 2026-27 (Apr..Mar)
 *   POST { action: "entry", compliance_id, month, done_on, link, note }
 *   POST { action: "add" | "edit" | "remove", ... }   — the master rows
 */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const url = new URL(req.url);
    const fy = Number(url.searchParams.get("fy")) || (() => {
      const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return Number(t.slice(5, 7)) >= 4 ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
    })();
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const m = 4 + i;
      months.push(`${m <= 12 ? fy : fy + 1}-${String(m <= 12 ? m : m - 12).padStart(2, "0")}`);
    }
    const { data: rows, error } = await admin.from("kuber_compliance")
      .select("*").eq("active", true).order("sort_order", { nullsFirst: false }).order("name").limit(500);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ installed: false });
      throw new Error(error.message);
    }
    const { data: entries } = await admin.from("kuber_compliance_entry")
      .select("compliance_id, month, done_on, link, note").in("month", months).limit(5000);
    return NextResponse.json({ installed: true, fy, months, rows: rows || [], entries: entries || [] });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "entry") {
      const compliance_id = String(body.compliance_id || "");
      const month = String(body.month || "");
      if (!compliance_id || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "compliance_id and month (YYYY-MM) required");
      const done_on = String(body.done_on || "").slice(0, 10) || null;
      const link = String(body.link || "").trim();
      const note = String(body.note || "").trim();
      if (!done_on && !link && !note) {
        await admin.from("kuber_compliance_entry").delete().eq("compliance_id", compliance_id).eq("month", month);
        return NextResponse.json({ ok: true });
      }
      const { error } = await admin.from("kuber_compliance_entry")
        .upsert({ compliance_id, month, done_on, link, note, by: user.email, at: new Date().toISOString() }, { onConflict: "compliance_id,month" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0093 first — the calendar has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "add" || action === "edit") {
      const row = {
        name: String(body.name || "").trim(),
        grp: String(body.grp || "").trim(),
        frequency: String(body.frequency || "Monthly"),
        due_day: body.due_day === "" || body.due_day == null ? null : Math.max(1, Math.min(31, Number(body.due_day) || 1)),
        due_note: String(body.due_note || "").trim(),
        by: user.email,
      };
      if (!row.name) throw new HttpError(400, "name required");
      if (action === "add") {
        const { error } = await admin.from("kuber_compliance").insert(row);
        if (error) throw new Error(error.message);
      } else {
        if (!body.id) throw new HttpError(400, "id required");
        const { error } = await admin.from("kuber_compliance").update(row).eq("id", body.id);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      if (!body.id) throw new HttpError(400, "id required");
      // retire, never vanish — the entries stay under it
      const { error } = await admin.from("kuber_compliance").update({ active: false }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errJson(e);
  }
}
