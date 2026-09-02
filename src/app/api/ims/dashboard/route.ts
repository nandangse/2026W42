import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireIms } from "@/ims/auth";
import { imsDb, notInstalled } from "@/ims/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ims/dashboard — the four cards.
 *
 * EVERY COUNT IS null WHEN THERE IS NOTHING TO COUNT, not 0. The two are
 * different facts: "no certificate expires in the next 90 days" and "we have
 * not entered any certificates" both show as zero on a careless dashboard,
 * and the second one is the dangerous one. The screen renders null as
 * "No data" (the Genie_Feed rule).
 */
export async function GET() {
  try {
    const me = await requireIms();
    const db = imsDb();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const in90 = new Date(Date.now() + 90 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const [certs, allCerts, tasks, docs, journey] = await Promise.all([
      db.from("ims_certificate").select("id, title, scheme, kind, expiry_date, renewal_owner_id")
        .not("expiry_date", "is", null).lte("expiry_date", in90).order("expiry_date").limit(50),
      db.from("ims_certificate").select("id", { count: "exact", head: true }),
      db.from("core_task").select("id, title, due_date, status, priority, source_type, owner_id")
        .in("status", ["open", "in_progress"]).order("due_date", { nullsFirst: false }).limit(200),
      db.from("ims_document").select("id, doc_no, title, status, department"),
      db.from("ims_certification").select("id, scheme, status"),
    ]);

    if (certs.error && notInstalled(certs.error.message))
      return NextResponse.json({ installed: false });

    const docRows = docs.data ?? [];
    const journeyRows = journey.data ?? [];
    const taskRows = (tasks.data ?? []).filter((t) => !me.profileId || t.owner_id === me.profileId || !t.owner_id);

    // "How many are there at all" decides data / no data; the filtered count
    // is then honest even when it is genuinely zero.
    const anyCerts = (allCerts.count ?? 0) > 0;

    return NextResponse.json({
      installed: true,
      today,
      expiring: {
        haveData: anyCerts,
        rows: certs.data ?? [],
        overdue: (certs.data ?? []).filter((c) => String(c.expiry_date) < today).length,
      },
      tasks: {
        haveData: (tasks.data ?? []).length > 0,
        mine: taskRows.length,
        overdue: taskRows.filter((t) => t.due_date && String(t.due_date) < today).length,
        rows: taskRows.slice(0, 12),
      },
      documents: {
        haveData: docRows.length > 0,
        total: docRows.length,
        inReview: docRows.filter((d) => d.status === "in_review").length,
        approved: docRows.filter((d) => d.status === "approved").length,
        draft: docRows.filter((d) => d.status === "draft").length,
      },
      journey: {
        haveData: journeyRows.length > 0,
        achieved: journeyRows.filter((c) => c.status === "achieved").length,
        inProgress: journeyRows.filter((c) => c.status === "in_progress").length,
        target: journeyRows.filter((c) => c.status === "target").length,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
