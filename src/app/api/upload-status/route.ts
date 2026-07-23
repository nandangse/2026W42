import { NextResponse } from "next/server";
import { requireUploader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";
import { DEFAULT_SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

// GET /api/upload-status — the uploader's ONLY data view. Served with the
// service role so the uploader role reads no tables directly (spec §2, §3).
// Returns per-file "loaded today" ✓ status + the ERP/download links.
export async function GET() {
  try {
    await requireUploader();
    const admin = adminClient();
    const { data, error } = await admin
      .from("import_batches")
      .select("kind, uploaded_at, filename, row_count")
      .order("uploaded_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const t = today();
    // A "pre" upload counts as jobs+projects loaded for the morning.
    const latest: Record<string, { at: string; filename: string; rows: number }> = {};
    for (const b of data || []) {
      if (!latest[b.kind]) latest[b.kind] = { at: b.uploaded_at, filename: b.filename, rows: b.row_count };
    }
    const loadedToday = (kind: string) => {
      const l = latest[kind];
      if (l && l.at.slice(0, 10) === t) return l;
      if (kind !== "tasks") {
        const pre = latest["pre"];
        if (pre && pre.at.slice(0, 10) === t) return pre;
      }
      return null;
    };

    const status = DEFAULT_SOURCES.map((s) => {
      const l = loadedToday(s.key);
      return {
        key: s.key,
        nm: s.nm,
        desc: s.desc,
        erp: s.erp,
        gs: s.gs,
        loadedToday: !!l,
        at: l ? l.at : null,
        rows: l ? l.rows : null,
      };
    });

    return NextResponse.json({ date: t, status });
  } catch (e) {
    return errJson(e);
  }
}
