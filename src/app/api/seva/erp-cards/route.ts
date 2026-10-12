import { NextResponse } from "next/server";
import { errJson } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { erpServiceCards } from "@/lib/seva-erp-cards";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/seva/erp-cards[?fresh=1] — the ERP's "Nandan Service" dashboard cards, asked of the ERP live (12 Oct 2026). */
export async function GET(req: Request) {
  try {
    await requireSeva();
    return NextResponse.json({ ok: true, ...(await erpServiceCards(new URL(req.url).searchParams.get("fresh") === "1")) });
  } catch (e) { return errJson(e); }
}
