"use client";

/**
 * MRP — Material Resource Planning (Dr Raghu, 3 Sep 2026: "we will begin
 * MRP now — Material Resource Planning. make a new app inside after WIP").
 *
 * The door is open and the room is empty on purpose: what MRP plans, from
 * which RBOM, against which stock and which WIP, is his to say next. The
 * pieces it will stand on are already here — the Item mirror with closing
 * stock, the Real BOM per project, the WIP per live job, the warehouse
 * types in Masters.
 */

import { Screen, INK, MUTED, BORDER, NAVY_SOFT } from "@/components/ims/ui";

export default function Mrp() {
  return (
    <Screen title="MRP — Material Resource Planning" blurb="The next room. Say what it plans and it will be built on what is already here.">
      <div className="rounded-lg border p-5 text-sm" style={{ borderColor: BORDER, background: "#fff", color: "#5A6672", lineHeight: 1.8, maxWidth: 820 }}>
        <div className="font-bold mb-2" style={{ color: INK }}>What MRP will stand on</div>
        <ul className="list-disc pl-5">
          <li><b>Items</b> — every RM item, with closing stock from the Stock warehouses, live from the ERP.</li>
          <li><b>BOM</b> — the ERP&apos;s submitted BOM per project, and the <b>RBOM</b>, Genie&apos;s Real BOM, Released and Draft lines.</li>
          <li><b>WIP</b> — one warehouse per live job, with the job&apos;s value, throughput and kitting owner from the board.</li>
          <li><b>Masters</b> — which warehouses count as Stock, WIP or Vendor.</li>
        </ul>
        <div className="mt-3 rounded p-3 text-xs" style={{ background: NAVY_SOFT, color: MUTED }}>
          To build. The usual shape is: for each live job, the RBOM says what is needed; stock says what is there; the difference, by item, is what to buy or make, and by when the job&apos;s TDD says.
          Tell me how you want it cut — by job, by item, by supplier — and what the columns should be.
        </div>
      </div>
    </Screen>
  );
}
