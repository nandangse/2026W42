import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { requireSaamaan } from "@/lib/saamaan";
import { mayTouchErp, ERP_HANDS_REFUSAL } from "@/lib/erp-hands";
import { pullPhase } from "@/lib/saamaan-pull";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/saamaan/erp-items — one phase of the ERP pull, by hand. The walk
 * itself lives in lib/saamaan-pull, where the four-hourly cron runs the
 * same seven phases (3 Oct 2026). Nothing on the ERP is written, ever.
 */
export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    /* Dr Raghu, 26 Sep 2026: "this pull from ERP should be available from
       Mukesh and pankaj also." One list, in erp-hands, shared with the
       hourly refresh so the same question cannot get two answers. */
    if (!me.isOwner && !mayTouchErp(me.email)) throw new HttpError(403, ERP_HANDS_REFUSAL);
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const phase = String(body.phase || "items");
    return NextResponse.json(await pullPhase(phase, me.email));
  } catch (e) {
    return errJson(e);
  }
}
